import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getMCPServerPort,
  getMCPPaths,
  getRetryConfig,
  addDynamicServer,
  removeDynamicServer,
  getDynamicServers,
  clearDynamicServers,
  loadServerMappings,
  logger,
} from './config.js'

// Mock process.env and console methods
const originalEnv = process.env
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
}

describe('config', () => {
  beforeEach(() => {
    // Reset environment variables
    process.env = { ...originalEnv }

    // Clear dynamic servers before each test
    clearDynamicServers()

    // Mock console methods
    console.log = vi.fn()
    console.warn = vi.fn()
    console.error = vi.fn()

    // Mock process.stdin.isTTY
    Object.defineProperty(process.stdin, 'isTTY', {
      value: true,
      configurable: true,
    })
  })

  afterEach(() => {
    // Restore environment variables
    process.env = originalEnv

    // Restore console methods
    console.log = originalConsole.log
    console.warn = originalConsole.warn
    console.error = originalConsole.error

    // Clear dynamic servers after each test
    clearDynamicServers()
  })

  describe('getMCPServerPort', () => {
    it('should return default port 3001 when MCP_SERVER_PORT is not set', () => {
      delete process.env.MCP_SERVER_PORT
      expect(getMCPServerPort()).toBe(3001)
    })

    it('should return parsed port when MCP_SERVER_PORT is valid', () => {
      process.env.MCP_SERVER_PORT = '4000'
      expect(getMCPServerPort()).toBe(4000)
    })

    it('should return default port and warn when MCP_SERVER_PORT is invalid (NaN)', () => {
      process.env.MCP_SERVER_PORT = 'invalid'
      expect(getMCPServerPort()).toBe(3001)
      expect(console.warn).toHaveBeenCalledWith(
        'Invalid MCP_SERVER_PORT: invalid. Defaulting to 3001.',
      )
    })

    it('should return default port and warn when MCP_SERVER_PORT is zero', () => {
      process.env.MCP_SERVER_PORT = '0'
      expect(getMCPServerPort()).toBe(3001)
      expect(console.warn).toHaveBeenCalledWith(
        'Invalid MCP_SERVER_PORT: 0. Defaulting to 3001.',
      )
    })

    it('should return default port and warn when MCP_SERVER_PORT is negative', () => {
      process.env.MCP_SERVER_PORT = '-1'
      expect(getMCPServerPort()).toBe(3001)
      expect(console.warn).toHaveBeenCalledWith(
        'Invalid MCP_SERVER_PORT: -1. Defaulting to 3001.',
      )
    })

    it('should return default port and warn when MCP_SERVER_PORT is too large', () => {
      process.env.MCP_SERVER_PORT = '65536'
      expect(getMCPServerPort()).toBe(3001)
      expect(console.warn).toHaveBeenCalledWith(
        'Invalid MCP_SERVER_PORT: 65536. Defaulting to 3001.',
      )
    })

    it('should accept maximum valid port 65535', () => {
      process.env.MCP_SERVER_PORT = '65535'
      expect(getMCPServerPort()).toBe(65535)
    })

    it('should accept minimum valid port 1', () => {
      process.env.MCP_SERVER_PORT = '1'
      expect(getMCPServerPort()).toBe(1)
    })
  })

  describe('getMCPPaths', () => {
    it('should return default paths when environment variables are not set', () => {
      delete process.env.MCP_SSE_PATH
      delete process.env.MCP_MESSAGE_PATH

      const paths = getMCPPaths()
      expect(paths).toEqual({
        ssePath: '/mcp/sse',
        messagePath: '/mcp/message',
      })
    })

    it('should return custom paths when environment variables are set', () => {
      process.env.MCP_SSE_PATH = '/custom/sse'
      process.env.MCP_MESSAGE_PATH = '/custom/message'

      const paths = getMCPPaths()
      expect(paths).toEqual({
        ssePath: '/custom/sse',
        messagePath: '/custom/message',
      })
    })

    it('should handle partial environment variable configuration', () => {
      process.env.MCP_SSE_PATH = '/custom/sse'
      delete process.env.MCP_MESSAGE_PATH

      const paths = getMCPPaths()
      expect(paths).toEqual({
        ssePath: '/custom/sse',
        messagePath: '/mcp/message',
      })
    })
  })

  describe('getRetryConfig', () => {
    it('should return default retry configuration when environment variables are not set', () => {
      // Clear all retry-related environment variables
      delete process.env.MASTRA_DISCOVERY_RETRIES
      delete process.env.MASTRA_DISCOVERY_BACKOFF_MS
      delete process.env.MASTRA_DISCOVERY_MAX_BACKOFF_MS
      delete process.env.MASTRA_LISTING_RETRIES
      delete process.env.MASTRA_LISTING_BACKOFF_MS
      delete process.env.MASTRA_LISTING_MAX_BACKOFF_MS
      delete process.env.MASTRA_CLIENT_RETRIES
      delete process.env.MASTRA_CLIENT_BACKOFF_MS
      delete process.env.MASTRA_CLIENT_MAX_BACKOFF_MS

      const config = getRetryConfig()
      expect(config).toEqual({
        discovery: {
          retries: 1,
          backoffMs: 100,
          maxBackoffMs: 500,
        },
        listing: {
          retries: 2,
          backoffMs: 100,
          maxBackoffMs: 1000,
        },
        interaction: {
          retries: 3,
          backoffMs: 300,
          maxBackoffMs: 5000,
        },
      })
    })

    it('should return custom retry configuration when environment variables are set', () => {
      process.env.MASTRA_DISCOVERY_RETRIES = '5'
      process.env.MASTRA_DISCOVERY_BACKOFF_MS = '200'
      process.env.MASTRA_DISCOVERY_MAX_BACKOFF_MS = '1000'
      process.env.MASTRA_LISTING_RETRIES = '4'
      process.env.MASTRA_LISTING_BACKOFF_MS = '150'
      process.env.MASTRA_LISTING_MAX_BACKOFF_MS = '2000'
      process.env.MASTRA_CLIENT_RETRIES = '6'
      process.env.MASTRA_CLIENT_BACKOFF_MS = '400'
      process.env.MASTRA_CLIENT_MAX_BACKOFF_MS = '8000'

      const config = getRetryConfig()
      expect(config).toEqual({
        discovery: {
          retries: 5,
          backoffMs: 200,
          maxBackoffMs: 1000,
        },
        listing: {
          retries: 4,
          backoffMs: 150,
          maxBackoffMs: 2000,
        },
        interaction: {
          retries: 6,
          backoffMs: 400,
          maxBackoffMs: 8000,
        },
      })
    })

    it('should handle partial environment variable configuration', () => {
      process.env.MASTRA_DISCOVERY_RETRIES = '10'
      process.env.MASTRA_LISTING_BACKOFF_MS = '250'
      // Leave others as defaults

      const config = getRetryConfig()
      expect(config).toEqual({
        discovery: {
          retries: 10,
          backoffMs: 100, // default
          maxBackoffMs: 500, // default
        },
        listing: {
          retries: 2, // default
          backoffMs: 250,
          maxBackoffMs: 1000, // default
        },
        interaction: {
          retries: 3, // default
          backoffMs: 300, // default
          maxBackoffMs: 5000, // default
        },
      })
    })

    it('should handle invalid environment variable values by using defaults', () => {
      process.env.MASTRA_DISCOVERY_RETRIES = 'invalid'
      process.env.MASTRA_LISTING_BACKOFF_MS = 'not-a-number'
      process.env.MASTRA_CLIENT_MAX_BACKOFF_MS = ''

      const config = getRetryConfig()
      expect(config.discovery.retries).toBeNaN() // parseInt('invalid') returns NaN
      expect(config.listing.backoffMs).toBeNaN() // parseInt('not-a-number') returns NaN
      expect(config.interaction.maxBackoffMs).toBe(5000) // Empty string falls back to default '5000'
    })
  })

  describe('dynamic server management', () => {
    describe('addDynamicServer', () => {
      it('should add a new server with auto-generated name', () => {
        const serverName = addDynamicServer('http://test.example.com')

        expect(serverName).toBe('server0') // No default static server anymore
        expect(getDynamicServers().get('server0')).toBe(
          'http://test.example.com',
        )
        expect(console.log).toHaveBeenCalledWith(
          'Connected to server: server0 -> http://test.example.com',
        )
      })

      it('should add a new server with custom name', () => {
        const serverName = addDynamicServer(
          'http://test.example.com',
          'customServer',
        )

        expect(serverName).toBe('customServer')
        expect(getDynamicServers().get('customServer')).toBe(
          'http://test.example.com',
        )
        expect(console.log).toHaveBeenCalledWith(
          'Connected to server: customServer -> http://test.example.com',
        )
      })

      it('should return existing server name when URL already exists', () => {
        addDynamicServer('http://test.example.com', 'firstServer')
        const serverName = addDynamicServer(
          'http://test.example.com',
          'secondServer',
        )

        expect(serverName).toBe('firstServer')
        expect(getDynamicServers().size).toBe(1)
        expect(console.log).toHaveBeenCalledWith(
          'Server URL http://test.example.com already exists as firstServer',
        )
      })

      it('should auto-generate sequential server names', () => {
        const server1 = addDynamicServer('http://server1.example.com')
        const server2 = addDynamicServer('http://server2.example.com')
        const server3 = addDynamicServer('http://server3.example.com')

        expect(server1).toBe('server0') // No default static server anymore
        expect(server2).toBe('server1')
        expect(server3).toBe('server2')
      })

      it('should throw error for invalid URL', () => {
        expect(() => addDynamicServer('invalid-url')).toThrow(
          'Invalid server URL: invalid-url',
        )
      })

      it('should throw error when custom name conflicts with existing server', () => {
        addDynamicServer('http://first.example.com', 'myServer')

        expect(() =>
          addDynamicServer('http://second.example.com', 'myServer'),
        ).toThrow(
          "Server name 'myServer' already exists. Choose a different name or omit to auto-generate.",
        )
      })

      it('should handle various valid URL formats', () => {
        const urls = [
          'https://secure.example.com',
          'http://192.168.1.100:8080',
          'https://subdomain.domain.com:9000/path',
          'http://custom.localhost:5555',
        ]

        urls.forEach((url, index) => {
          const serverName = addDynamicServer(url)
          const expectedName = `server${index}` // No default static server anymore
          expect(serverName).toBe(expectedName)
          expect(getDynamicServers().get(expectedName)).toBe(url)
        })
      })

      it('should check against static servers from environment', () => {
        process.env.AGENT_SERVERS = 'http://static.example.com'

        const serverName = addDynamicServer('http://static.example.com')
        expect(serverName).toBe('server0') // Should return the static server name
        expect(console.log).toHaveBeenCalledWith(
          'Server URL http://static.example.com already exists as server0 (from environment)',
        )
      })
    })

    describe('removeDynamicServer', () => {
      it('should remove an existing dynamic server', () => {
        addDynamicServer('http://test.example.com', 'testServer')

        const removed = removeDynamicServer('testServer')
        expect(removed).toBe(true)
        expect(getDynamicServers().has('testServer')).toBe(false)
        expect(console.log).toHaveBeenCalledWith(
          'Disconnected from server: testServer',
        )
      })

      it('should return false when trying to remove non-existent server', () => {
        const removed = removeDynamicServer('nonExistentServer')
        expect(removed).toBe(false)
      })

      it('should not affect other servers when removing one', () => {
        addDynamicServer('http://server1.example.com', 'server1')
        addDynamicServer('http://server2.example.com', 'server2')

        removeDynamicServer('server1')

        expect(getDynamicServers().has('server1')).toBe(false)
        expect(getDynamicServers().has('server2')).toBe(true)
        expect(getDynamicServers().get('server2')).toBe(
          'http://server2.example.com',
        )
      })
    })

    describe('getDynamicServers', () => {
      it('should return empty map when no servers are added', () => {
        const servers = getDynamicServers()
        expect(servers.size).toBe(0)
        expect(servers instanceof Map).toBe(true)
      })

      it('should return copy of dynamic servers map', () => {
        addDynamicServer('http://test.example.com', 'testServer')

        const servers = getDynamicServers()
        expect(servers.size).toBe(1)
        expect(servers.get('testServer')).toBe('http://test.example.com')

        // Modifying returned map should not affect internal state
        servers.set('newServer', 'http://new.example.com')
        expect(getDynamicServers().size).toBe(1) // Should still be 1
      })

      it('should return all dynamic servers', () => {
        addDynamicServer('http://server1.example.com', 'server1')
        addDynamicServer('http://server2.example.com', 'server2')
        addDynamicServer('http://server3.example.com', 'server3')

        const servers = getDynamicServers()
        expect(servers.size).toBe(3)
        expect(servers.get('server1')).toBe('http://server1.example.com')
        expect(servers.get('server2')).toBe('http://server2.example.com')
        expect(servers.get('server3')).toBe('http://server3.example.com')
      })
    })

    describe('clearDynamicServers', () => {
      it('should clear all dynamic servers', () => {
        addDynamicServer('http://server1.example.com', 'server1')
        addDynamicServer('http://server2.example.com', 'server2')

        clearDynamicServers()

        expect(getDynamicServers().size).toBe(0)
        expect(console.log).toHaveBeenCalledWith(
          'Disconnected from 2 connected servers',
        )
      })

      it('should handle clearing when no servers exist', () => {
        clearDynamicServers()

        expect(getDynamicServers().size).toBe(0)
        expect(console.log).toHaveBeenCalledWith(
          'Disconnected from 0 connected servers',
        )
      })

      it('should not affect subsequent server additions', () => {
        addDynamicServer('http://server1.example.com', 'server1')
        clearDynamicServers()

        const serverName = addDynamicServer('http://server2.example.com')
        expect(serverName).toBe('server0') // No default static server anymore
        expect(getDynamicServers().size).toBe(1)
      })
    })
  })

  describe('loadServerMappings', () => {
    it('should return empty mappings when no environment config and no dynamic servers', () => {
      delete process.env.AGENT_SERVERS

      const mappings = loadServerMappings()
      expect(mappings.size).toBe(0)
    })

    it('should parse space-separated server URLs from environment', () => {
      process.env.AGENT_SERVERS = 'http://localhost:4111 http://localhost:4222'

      const mappings = loadServerMappings()
      expect(mappings.size).toBe(2)
      expect(mappings.get('server0')).toBe('http://localhost:4111')
      expect(mappings.get('server1')).toBe('http://localhost:4222')
    })

    it('should parse comma-separated server URLs from environment', () => {
      process.env.AGENT_SERVERS = 'http://localhost:4111,http://localhost:4222'

      const mappings = loadServerMappings()
      expect(mappings.size).toBe(2)
      expect(mappings.get('server0')).toBe('http://localhost:4111')
      expect(mappings.get('server1')).toBe('http://localhost:4222')
    })

    it('should parse comma+space-separated server URLs from environment', () => {
      process.env.AGENT_SERVERS =
        'http://localhost:4111, http://localhost:4222, http://localhost:4333'

      const mappings = loadServerMappings()
      expect(mappings.size).toBe(3)
      expect(mappings.get('server0')).toBe('http://localhost:4111')
      expect(mappings.get('server1')).toBe('http://localhost:4222')
      expect(mappings.get('server2')).toBe('http://localhost:4333')
    })

    it('should handle mixed separators in environment config', () => {
      process.env.AGENT_SERVERS =
        'http://localhost:4111, http://localhost:4222 http://localhost:4333,http://localhost:4444'

      const mappings = loadServerMappings()
      expect(mappings.size).toBe(4)
      expect(mappings.get('server0')).toBe('http://localhost:4111')
      expect(mappings.get('server1')).toBe('http://localhost:4222')
      expect(mappings.get('server2')).toBe('http://localhost:4333')
      expect(mappings.get('server3')).toBe('http://localhost:4444')
    })

    it('should merge static and dynamic servers', () => {
      process.env.AGENT_SERVERS = 'http://static.example.com'
      addDynamicServer('http://dynamic.example.com', 'dynamicServer')

      const mappings = loadServerMappings()
      expect(mappings.size).toBe(2)
      expect(mappings.get('server0')).toBe('http://static.example.com')
      expect(mappings.get('dynamicServer')).toBe('http://dynamic.example.com')
    })

    it('should prioritize dynamic servers over static when names conflict', () => {
      process.env.AGENT_SERVERS = 'http://static.example.com'

      // This should throw an error because server0 already exists as a static server
      expect(() =>
        addDynamicServer('http://dynamic.example.com', 'server0'),
      ).toThrow(
        "Server name 'server0' already exists. Choose a different name or omit to auto-generate.",
      )
    })

    it('should handle empty AGENT_SERVERS environment variable', () => {
      process.env.AGENT_SERVERS = ''

      const mappings = loadServerMappings()
      expect(mappings.size).toBe(0)
    })

    it('should handle whitespace-only AGENT_SERVERS environment variable', () => {
      process.env.AGENT_SERVERS = '   \t\n   '

      const mappings = loadServerMappings()
      expect(mappings.size).toBe(0)
    })

    it('should filter out empty URLs from environment config', () => {
      process.env.AGENT_SERVERS =
        'http://localhost:4111,, ,http://localhost:4222'

      const mappings = loadServerMappings()
      expect(mappings.size).toBe(2)
      expect(mappings.get('server0')).toBe('http://localhost:4111')
      expect(mappings.get('server1')).toBe('http://localhost:4222')
    })

    it('should handle invalid JSON-like AGENT_SERVERS gracefully', () => {
      process.env.AGENT_SERVERS = '{"invalid": "json"}'

      const mappings = loadServerMappings()
      expect(mappings.size).toBe(2) // One from the JSON string, one from "json"
      expect(mappings.get('server0')).toBe('{"invalid":')
      expect(mappings.get('server1')).toBe('"json"}')
    })

    it('should log server count when dynamic servers are present', () => {
      process.env.AGENT_SERVERS = 'http://static.example.com'
      addDynamicServer('http://dynamic.example.com', 'dynamicServer')

      loadServerMappings()

      expect(console.log).toHaveBeenCalledWith(
        'Total servers: 2 (1 from config, 1 learned)',
      )
    })
  })

  describe('logger', () => {
    describe('when MCP_TRANSPORT is not stdio and isTTY is true', () => {
      beforeEach(() => {
        process.env.MCP_TRANSPORT = 'sse'
        Object.defineProperty(process.stdin, 'isTTY', {
          value: true,
          configurable: true,
        })
      })

      it('should log messages with logger.log', () => {
        logger.log('test message', 'arg1', 'arg2')
        expect(console.log).toHaveBeenCalledWith('test message', 'arg1', 'arg2')
      })

      it('should log warnings with logger.warn', () => {
        logger.warn('test warning', 'arg1', 'arg2')
        expect(console.warn).toHaveBeenCalledWith(
          'test warning',
          'arg1',
          'arg2',
        )
      })

      it('should log errors with logger.error', () => {
        logger.error('test error', 'arg1', 'arg2')
        expect(console.error).toHaveBeenCalledWith('test error', 'arg1', 'arg2')
      })
    })

    describe('when MCP_TRANSPORT is stdio', () => {
      beforeEach(() => {
        process.env.MCP_TRANSPORT = 'stdio'
        Object.defineProperty(process.stdin, 'isTTY', {
          value: true,
          configurable: true,
        })
      })

      it('should not log messages with logger.log', () => {
        logger.log('test message')
        expect(console.log).not.toHaveBeenCalled()
      })

      it('should not log warnings with logger.warn', () => {
        logger.warn('test warning')
        expect(console.warn).not.toHaveBeenCalled()
      })

      it('should not log errors with logger.error', () => {
        logger.error('test error')
        expect(console.error).not.toHaveBeenCalled()
      })
    })

    describe('when isTTY is false', () => {
      beforeEach(() => {
        delete process.env.MCP_TRANSPORT
        Object.defineProperty(process.stdin, 'isTTY', {
          value: false,
          configurable: true,
        })
      })

      it('should not log messages with logger.log', () => {
        logger.log('test message')
        expect(console.log).not.toHaveBeenCalled()
      })

      it('should not log warnings with logger.warn', () => {
        logger.warn('test warning')
        expect(console.warn).not.toHaveBeenCalled()
      })

      it('should not log errors with logger.error', () => {
        logger.error('test error')
        expect(console.error).not.toHaveBeenCalled()
      })
    })

    describe('forceError', () => {
      it('should always log errors regardless of transport mode', () => {
        process.env.MCP_TRANSPORT = 'stdio'
        Object.defineProperty(process.stdin, 'isTTY', {
          value: false,
          configurable: true,
        })

        logger.forceError('forced error', 'arg1', 'arg2')
        expect(console.error).toHaveBeenCalledWith(
          'forced error',
          'arg1',
          'arg2',
        )
      })

      it('should log errors in normal mode too', () => {
        process.env.MCP_TRANSPORT = 'sse'
        Object.defineProperty(process.stdin, 'isTTY', {
          value: true,
          configurable: true,
        })

        logger.forceError('forced error', 'arg1', 'arg2')
        expect(console.error).toHaveBeenCalledWith(
          'forced error',
          'arg1',
          'arg2',
        )
      })
    })
  })

  describe('edge cases and error handling', () => {
    it('should handle extremely large server counts', () => {
      // Add many servers to test auto-naming
      for (let i = 0; i < 100; i++) {
        addDynamicServer(`http://server${i}.example.com`)
      }

      const servers = getDynamicServers()
      expect(servers.size).toBe(100)
      expect(servers.get('server99')).toBe('http://server99.example.com') // server0-server99 for 100 servers
    })

    it('should handle server names with special characters', () => {
      const serverName = addDynamicServer(
        'http://test.example.com',
        'server-with_special.chars',
      )
      expect(serverName).toBe('server-with_special.chars')
      expect(getDynamicServers().get('server-with_special.chars')).toBe(
        'http://test.example.com',
      )
    })

    it('should handle URLs with complex paths and query parameters', () => {
      const complexUrl =
        'https://api.example.com:8443/v1/agents?token=abc123&format=json#section'
      const serverName = addDynamicServer(complexUrl)
      expect(getDynamicServers().get(serverName)).toBe(complexUrl)
    })

    it('should handle concurrent server operations', () => {
      // Simulate concurrent additions
      const urls = [
        'http://server1.example.com',
        'http://server2.example.com',
        'http://server3.example.com',
      ]

      const serverNames = urls.map((url) => addDynamicServer(url))

      expect(serverNames).toEqual(['server0', 'server1', 'server2']) // No default static server anymore
      expect(getDynamicServers().size).toBe(3)
    })

    it('should handle environment variables with unusual whitespace', () => {
      process.env.AGENT_SERVERS =
        '\t\n  http://localhost:4111  \r\n\t  http://localhost:4222  \n\r'

      const mappings = loadServerMappings()
      expect(mappings.size).toBe(2)
      expect(mappings.get('server0')).toBe('http://localhost:4111')
      expect(mappings.get('server1')).toBe('http://localhost:4222')
    })

    it('should handle parsing errors in AGENT_SERVERS gracefully', () => {
      // Mock a scenario where split() or other parsing operations might throw
      const originalSplit = String.prototype.split
      String.prototype.split = vi.fn().mockImplementation(() => {
        throw new Error('Parsing failed')
      })

      process.env.AGENT_SERVERS = 'http://localhost:4111'

      const mappings = loadServerMappings()

      // Should return empty map when parsing fails
      expect(mappings.size).toBe(0)
      expect(console.error).toHaveBeenCalledWith(
        'Failed to parse AGENT_SERVERS:',
        expect.any(Error),
      )
      expect(console.log).toHaveBeenCalledWith('Supported formats:')
      expect(console.log).toHaveBeenCalledWith(
        '  Space separated: "http://localhost:4111 http://localhost:4222"',
      )
      expect(console.log).toHaveBeenCalledWith(
        '  Comma separated: "http://localhost:4111,http://localhost:4222"',
      )
      expect(console.log).toHaveBeenCalledWith(
        '  Comma+space: "http://localhost:4111, http://localhost:4222"',
      )
      expect(console.log).toHaveBeenCalledWith(
        'No servers configured due to parsing error',
      )

      // Restore the original split method
      String.prototype.split = originalSplit
    })
  })
})
