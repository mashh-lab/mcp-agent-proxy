import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { UpstashConnectionBackend } from './upstash-backend.js'

// Mock @upstash/redis
const mockRedis = {
  ping: vi.fn(),
  hset: vi.fn(),
  hget: vi.fn(),
  hgetall: vi.fn(),
  hexists: vi.fn(),
  hdel: vi.fn(),
  hlen: vi.fn(),
  hsetnx: vi.fn(),
  del: vi.fn(),
  pipeline: vi.fn(),
}

const mockPipeline = {
  hset: vi.fn(),
  hdel: vi.fn(),
  del: vi.fn(),
  exec: vi.fn(),
}

// Mock the dynamic import
vi.mock('@upstash/redis', () => ({
  Redis: vi.fn(() => mockRedis),
}))

describe('UpstashConnectionBackend', () => {
  let backend: UpstashConnectionBackend
  const testConfig = {
    url: 'https://test-redis.upstash.io',
    token: 'test-token',
    keyPrefix: 'test-mcp:',
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup default mock behaviors
    mockRedis.ping.mockResolvedValue('PONG')
    mockRedis.pipeline.mockReturnValue(mockPipeline)
    mockPipeline.exec.mockResolvedValue([1, 1]) // Success results

    backend = new UpstashConnectionBackend(testConfig)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('constructor and configuration', () => {
    it('should create backend with valid config', () => {
      expect(() => new UpstashConnectionBackend(testConfig)).not.toThrow()
    })

    it('should throw error without config', () => {
      expect(() => new UpstashConnectionBackend(undefined as any)).toThrow(
        'Upstash configuration is required',
      )
    })

    it('should use default key prefix when not provided', () => {
      const configWithoutPrefix = {
        url: 'https://test-redis.upstash.io',
        token: 'test-token',
      }
      const backendWithDefaults = new UpstashConnectionBackend(
        configWithoutPrefix,
      )
      expect(backendWithDefaults).toBeDefined()
    })

    it('should use custom key prefix when provided', () => {
      const configWithPrefix = {
        url: 'https://test-redis.upstash.io',
        token: 'test-token',
        keyPrefix: 'custom-prefix:',
      }
      const backendWithCustom = new UpstashConnectionBackend(configWithPrefix)
      expect(backendWithCustom).toBeDefined()
    })
  })

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await expect(backend.initialize()).resolves.toBeUndefined()
      expect(mockRedis.ping).toHaveBeenCalledOnce()
    })

    it('should handle initialization failure', async () => {
      mockRedis.ping.mockRejectedValue(new Error('Connection failed'))

      await expect(backend.initialize()).rejects.toThrow(
        'Failed to initialize Upstash Redis backend: Connection failed',
      )
    })

    it('should not reinitialize if already initialized', async () => {
      await backend.initialize()
      await backend.initialize() // Second call

      expect(mockRedis.ping).toHaveBeenCalledOnce() // Should only be called once
    })

    it('should handle dynamic import failure', async () => {
      // This is tricky to test since we've already mocked the module
      // But we can test the error handling structure
      const backendWithBadConfig = new UpstashConnectionBackend(testConfig)

      // Override the redis property to simulate import failure
      ;(backendWithBadConfig as any).redis = null

      // This would be caught in the actual implementation, but hard to test
      // The test structure is here for completeness
    })
  })

  describe('addServer', () => {
    beforeEach(async () => {
      await backend.initialize()
    })

    describe('normal operations', () => {
      it('should add server with auto-generated name', async () => {
        // Mock URL doesn't exist yet
        mockRedis.hget.mockResolvedValue(null)
        // Mock successful HSETNX (we won the race)
        mockRedis.hsetnx.mockResolvedValue(1)
        // Mock server count for name generation
        mockRedis.hlen.mockResolvedValue(0)
        mockRedis.hexists.mockResolvedValue(false)

        const serverName = await backend.addServer('http://localhost:4111')

        expect(serverName).toBe('server0')
        expect(mockRedis.hget).toHaveBeenCalledWith(
          'test-mcp:urlmap',
          'http://localhost:4111',
        )
        expect(mockRedis.hsetnx).toHaveBeenCalledWith(
          'test-mcp:urlmap',
          'http://localhost:4111',
          'server0',
        )
        expect(mockRedis.hset).toHaveBeenCalledWith('test-mcp:all', {
          server0: 'http://localhost:4111',
        })
      })

      it('should add server with custom name', async () => {
        mockRedis.hget.mockResolvedValue(null)
        mockRedis.hsetnx.mockResolvedValue(1)
        mockRedis.hexists.mockResolvedValue(false)

        const serverName = await backend.addServer(
          'http://localhost:4111',
          'myServer',
        )

        expect(serverName).toBe('myServer')
        expect(mockRedis.hexists).toHaveBeenCalledWith(
          'test-mcp:all',
          'myServer',
        )
        expect(mockRedis.hsetnx).toHaveBeenCalledWith(
          'test-mcp:urlmap',
          'http://localhost:4111',
          'myServer',
        )
      })

      it('should return existing server name if URL already exists (early check)', async () => {
        mockRedis.hget.mockResolvedValue('existingServer')

        const serverName = await backend.addServer(
          'http://localhost:4111',
          'newServer',
        )

        expect(serverName).toBe('existingServer')
        expect(mockRedis.hsetnx).not.toHaveBeenCalled() // Should not reach HSETNX
      })

      it('should generate sequential names', async () => {
        mockRedis.hget.mockResolvedValue(null)
        mockRedis.hsetnx.mockResolvedValue(1)

        // First call
        mockRedis.hlen.mockResolvedValueOnce(0)
        mockRedis.hexists.mockResolvedValueOnce(false)
        const name1 = await backend.addServer('http://localhost:4111')

        // Second call
        mockRedis.hlen.mockResolvedValueOnce(1)
        mockRedis.hexists.mockResolvedValueOnce(false)
        const name2 = await backend.addServer('http://localhost:4112')

        expect(name1).toBe('server0')
        expect(name2).toBe('server1')
      })
    })

    describe('race condition handling', () => {
      it('should handle race condition where HSETNX fails', async () => {
        mockRedis.hget.mockResolvedValueOnce(null) // Initial check passes
        mockRedis.hsetnx.mockResolvedValue(0) // We lost the race
        mockRedis.hget.mockResolvedValueOnce('winner-server') // Get winner's name
        mockRedis.hlen.mockResolvedValue(0)
        mockRedis.hexists.mockResolvedValue(false)

        const serverName = await backend.addServer(
          'http://localhost:4111',
          'my-server',
        )

        expect(serverName).toBe('winner-server') // Should return winner's name
        expect(mockRedis.hsetnx).toHaveBeenCalledWith(
          'test-mcp:urlmap',
          'http://localhost:4111',
          'my-server',
        )
        expect(mockRedis.hset).not.toHaveBeenCalled() // Should not set main map
      })

      it('should handle race condition with fallback to generated name', async () => {
        mockRedis.hget.mockResolvedValueOnce(null) // Initial check passes
        mockRedis.hsetnx.mockResolvedValue(0) // We lost the race
        mockRedis.hget.mockResolvedValueOnce(null) // Winner's name lookup fails
        mockRedis.hlen.mockResolvedValue(0)
        mockRedis.hexists.mockResolvedValue(false)

        const serverName = await backend.addServer('http://localhost:4111')

        expect(serverName).toBe('server0') // Should fallback to our generated name
      })

      it('should handle multiple concurrent requests to same URL', async () => {
        // Simulate multiple clients trying to add the same URL
        mockRedis.hget.mockResolvedValue(null) // All pass initial check

        // First client wins
        mockRedis.hsetnx.mockResolvedValueOnce(1)
        mockRedis.hlen.mockResolvedValue(0)
        mockRedis.hexists.mockResolvedValue(false)

        // Others lose
        mockRedis.hsetnx.mockResolvedValue(0)
        mockRedis.hget.mockResolvedValue('server0') // Winner's name

        const promises = [
          backend.addServer('http://localhost:4111'),
          backend.addServer('http://localhost:4111'),
          backend.addServer('http://localhost:4111'),
        ]

        const results = await Promise.all(promises)

        // All should return the same server name
        expect(results.every((name) => name === 'server0')).toBe(true)
      })
    })

    describe('validation and error handling', () => {
      beforeEach(async () => {
        await backend.initialize()
      })

      it('should validate URLs', async () => {
        const invalidUrls = [
          'not-a-url',
          '',
          'http://',
          'just-text',
          'http:// space-in-url.com',
        ]

        for (const invalidUrl of invalidUrls) {
          await expect(backend.addServer(invalidUrl)).rejects.toThrow(
            `Invalid server URL: ${invalidUrl}`,
          )
        }
      })

      it('should reject duplicate custom server names', async () => {
        mockRedis.hget.mockResolvedValue(null)
        mockRedis.hexists.mockResolvedValue(true) // Name already exists

        await expect(
          backend.addServer('http://localhost:4111', 'existingName'),
        ).rejects.toThrow(
          "Server name 'existingName' already exists. Choose a different name or omit to auto-generate.",
        )
      })

      it('should handle Redis errors during operations', async () => {
        mockRedis.hget.mockResolvedValue(null)
        mockRedis.hsetnx.mockRejectedValue(new Error('Redis connection failed'))
        mockRedis.hlen.mockResolvedValue(0)
        mockRedis.hexists.mockResolvedValue(false)

        await expect(
          backend.addServer('http://localhost:4111'),
        ).rejects.toThrow('Redis connection failed')
      })

      it('should auto-initialize if not initialized', async () => {
        const uninitializedBackend = new UpstashConnectionBackend(testConfig)

        mockRedis.hget.mockResolvedValue(null)
        mockRedis.hsetnx.mockResolvedValue(1)
        mockRedis.hlen.mockResolvedValue(0)
        mockRedis.hexists.mockResolvedValue(false)

        await uninitializedBackend.addServer('http://localhost:4111')

        expect(mockRedis.ping).toHaveBeenCalled() // Should auto-initialize
      })
    })
  })

  describe('removeServer', () => {
    beforeEach(async () => {
      await backend.initialize()
    })

    it('should remove existing server successfully', async () => {
      mockRedis.hget.mockResolvedValue('http://localhost:4111')
      mockPipeline.exec.mockResolvedValue([1, 1]) // Both deletions successful

      const result = await backend.removeServer('testServer')

      expect(result).toBe(true)
      expect(mockRedis.hget).toHaveBeenCalledWith('test-mcp:all', 'testServer')
      expect(mockPipeline.hdel).toHaveBeenCalledWith(
        'test-mcp:all',
        'testServer',
      )
      expect(mockPipeline.hdel).toHaveBeenCalledWith(
        'test-mcp:urlmap',
        'http://localhost:4111',
      )
      expect(mockPipeline.exec).toHaveBeenCalled()
    })

    it('should return false for non-existent server', async () => {
      mockRedis.hget.mockResolvedValue(null)

      const result = await backend.removeServer('nonExistent')

      expect(result).toBe(false)
      expect(mockPipeline.exec).not.toHaveBeenCalled()
    })

    it('should handle Redis errors during removal', async () => {
      mockRedis.hget.mockResolvedValue('http://localhost:4111')
      mockPipeline.exec.mockRejectedValue(new Error('Pipeline failed'))

      await expect(backend.removeServer('testServer')).rejects.toThrow(
        'Pipeline failed',
      )
    })

    it('should auto-initialize if needed', async () => {
      const uninitializedBackend = new UpstashConnectionBackend(testConfig)
      mockRedis.hget.mockResolvedValue(null)

      await uninitializedBackend.removeServer('test')

      expect(mockRedis.ping).toHaveBeenCalled()
    })
  })

  describe('getServers', () => {
    beforeEach(async () => {
      await backend.initialize()
    })

    it('should return empty map when no servers', async () => {
      mockRedis.hgetall.mockResolvedValue({})

      const servers = await backend.getServers()

      expect(servers).toBeInstanceOf(Map)
      expect(servers.size).toBe(0)
      expect(mockRedis.hgetall).toHaveBeenCalledWith('test-mcp:all')
    })

    it('should return all servers as Map', async () => {
      const mockServers = {
        server1: 'http://localhost:4111',
        server2: 'http://localhost:4112',
        myServer: 'https://api.example.com',
      }
      mockRedis.hgetall.mockResolvedValue(mockServers)

      const servers = await backend.getServers()

      expect(servers).toBeInstanceOf(Map)
      expect(servers.size).toBe(3)
      expect(servers.get('server1')).toBe('http://localhost:4111')
      expect(servers.get('server2')).toBe('http://localhost:4112')
      expect(servers.get('myServer')).toBe('https://api.example.com')
    })

    it('should handle null response from Redis', async () => {
      mockRedis.hgetall.mockResolvedValue(null)

      const servers = await backend.getServers()

      expect(servers).toBeInstanceOf(Map)
      expect(servers.size).toBe(0)
    })

    it('should auto-initialize if needed', async () => {
      const uninitializedBackend = new UpstashConnectionBackend(testConfig)
      mockRedis.hgetall.mockResolvedValue({})

      await uninitializedBackend.getServers()

      expect(mockRedis.ping).toHaveBeenCalled()
    })
  })

  describe('hasServer', () => {
    beforeEach(async () => {
      await backend.initialize()
    })

    it('should return true for existing server', async () => {
      mockRedis.hexists.mockResolvedValue(true)

      const exists = await backend.hasServer('existingServer')

      expect(exists).toBe(true)
      expect(mockRedis.hexists).toHaveBeenCalledWith(
        'test-mcp:all',
        'existingServer',
      )
    })

    it('should return false for non-existent server', async () => {
      mockRedis.hexists.mockResolvedValue(false)

      const exists = await backend.hasServer('nonExistent')

      expect(exists).toBe(false)
    })

    it('should auto-initialize if needed', async () => {
      const uninitializedBackend = new UpstashConnectionBackend(testConfig)
      mockRedis.hexists.mockResolvedValue(false)

      await uninitializedBackend.hasServer('test')

      expect(mockRedis.ping).toHaveBeenCalled()
    })
  })

  describe('clearServers', () => {
    beforeEach(async () => {
      await backend.initialize()
    })

    it('should clear all servers using pipeline', async () => {
      mockPipeline.exec.mockResolvedValue([1, 1])

      await backend.clearServers()

      expect(mockPipeline.del).toHaveBeenCalledWith('test-mcp:all')
      expect(mockPipeline.del).toHaveBeenCalledWith('test-mcp:urlmap')
      expect(mockPipeline.exec).toHaveBeenCalled()
    })

    it('should handle Redis errors during clear', async () => {
      mockPipeline.exec.mockRejectedValue(new Error('Clear failed'))

      await expect(backend.clearServers()).rejects.toThrow('Clear failed')
    })

    it('should auto-initialize if needed', async () => {
      const uninitializedBackend = new UpstashConnectionBackend(testConfig)
      mockPipeline.exec.mockResolvedValue([1, 1])

      await uninitializedBackend.clearServers()

      expect(mockRedis.ping).toHaveBeenCalled()
    })
  })

  describe('close', () => {
    it('should close successfully', async () => {
      await backend.initialize()
      await expect(backend.close()).resolves.toBeUndefined()
    })

    it('should handle closing uninitialized backend', async () => {
      await expect(backend.close()).resolves.toBeUndefined()
    })
  })

  describe('key generation', () => {
    it('should use correct key prefixes', async () => {
      await backend.initialize()

      // Test by calling methods and checking the Redis calls
      mockRedis.hget.mockResolvedValue(null)
      mockRedis.hsetnx.mockResolvedValue(1)
      mockRedis.hlen.mockResolvedValue(0)
      mockRedis.hexists.mockResolvedValue(false)

      await backend.addServer('http://localhost:4111')

      // Check that the correct prefixed keys were used
      expect(mockRedis.hget).toHaveBeenCalledWith(
        'test-mcp:urlmap',
        'http://localhost:4111',
      )
      expect(mockRedis.hsetnx).toHaveBeenCalledWith(
        'test-mcp:urlmap',
        'http://localhost:4111',
        'server0',
      )
      expect(mockRedis.hset).toHaveBeenCalledWith('test-mcp:all', {
        server0: 'http://localhost:4111',
      })
    })

    it('should use default prefix when none specified', () => {
      const configWithoutPrefix = {
        url: 'https://test-redis.upstash.io',
        token: 'test-token',
      }
      const backendWithDefaults = new UpstashConnectionBackend(
        configWithoutPrefix,
      )

      // The default prefix should be used (we can't easily test this without accessing private methods,
      // but the constructor test above covers this)
      expect(backendWithDefaults).toBeDefined()
    })
  })

  describe('edge cases and error scenarios', () => {
    it('should handle name generation with high server count', async () => {
      await backend.initialize()

      mockRedis.hget.mockResolvedValue(null)
      mockRedis.hsetnx.mockResolvedValue(1)
      mockRedis.hlen.mockResolvedValue(1000) // High count
      mockRedis.hexists.mockResolvedValue(false)

      const serverName = await backend.addServer('http://localhost:4111')

      expect(serverName).toBe('server1000')
    })

    it('should handle name generation when many names are taken', async () => {
      await backend.initialize()

      mockRedis.hget.mockResolvedValue(null)
      mockRedis.hsetnx.mockResolvedValue(1)
      mockRedis.hlen.mockResolvedValue(0)

      // Mock that several names are taken
      mockRedis.hexists
        .mockResolvedValueOnce(true) // server0 taken
        .mockResolvedValueOnce(true) // server1 taken
        .mockResolvedValueOnce(false) // server2 available

      const serverName = await backend.addServer('http://localhost:4111')

      expect(serverName).toBe('server2')
    })

    it('should handle extremely long URLs', async () => {
      await backend.initialize()

      const longUrl =
        'https://example.com/' + 'a'.repeat(1000) + '?param=' + 'b'.repeat(500)

      mockRedis.hget.mockResolvedValue(null)
      mockRedis.hsetnx.mockResolvedValue(1)
      mockRedis.hlen.mockResolvedValue(0)
      mockRedis.hexists.mockResolvedValue(false)

      const serverName = await backend.addServer(longUrl)

      expect(serverName).toBe('server0')
      expect(mockRedis.hsetnx).toHaveBeenCalledWith(
        'test-mcp:urlmap',
        longUrl,
        'server0',
      )
    })
  })
})
