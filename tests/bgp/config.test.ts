// Tests for BGP Configuration System
// Ensures AS number assignment and server configuration works correctly

import {
  loadServerMappings,
  loadServerMappingsLegacy,
  getBGPConfig,
  validateServerConfig,
  getServersFromConfig,
} from '../../src/config.js'
import { ServerConfig, PRIVATE_ASN_RANGES } from '../../src/bgp/types.js'

describe('BGP Configuration System', () => {
  // Store original env vars to restore after tests
  const originalEnv = process.env

  beforeEach(() => {
    // Reset environment for each test
    process.env = { ...originalEnv }
    delete process.env.MASTRA_SERVERS
    delete process.env.BGP_ASN
  })

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv
  })

  describe('loadServerMappings', () => {
    it('should return default configuration when no MASTRA_SERVERS is set', () => {
      const mappings = loadServerMappings()

      expect(mappings.size).toBe(1)
      expect(mappings.has('server0')).toBe(true)

      const server0 = mappings.get('server0')!
      expect(server0.name).toBe('server0')
      expect(server0.url).toBe('http://localhost:4111')
      expect(server0.asn).toBe(PRIVATE_ASN_RANGES.TWO_BYTE.min) // 64512
      expect(server0.description).toBe('Default Mastra Server')
      expect(server0.region).toBe('local')
    })

    it('should parse space-separated server URLs with auto-generated AS numbers', () => {
      process.env.MASTRA_SERVERS = 'http://localhost:4111 http://localhost:4222'

      const mappings = loadServerMappings()

      expect(mappings.size).toBe(2)

      const server0 = mappings.get('server0')!
      expect(server0.url).toBe('http://localhost:4111')
      expect(server0.asn).toBe(64512)

      const server1 = mappings.get('server1')!
      expect(server1.url).toBe('http://localhost:4222')
      expect(server1.asn).toBe(64513)
    })

    it('should parse comma-separated server URLs', () => {
      process.env.MASTRA_SERVERS = 'http://localhost:4111,http://localhost:4222'

      const mappings = loadServerMappings()

      expect(mappings.size).toBe(2)
      expect(mappings.get('server0')?.asn).toBe(64512)
      expect(mappings.get('server1')?.asn).toBe(64513)
    })

    it('should parse comma+space separated server URLs', () => {
      process.env.MASTRA_SERVERS =
        'http://localhost:4111, http://localhost:4222, http://localhost:4333'

      const mappings = loadServerMappings()

      expect(mappings.size).toBe(3)
      expect(mappings.get('server0')?.asn).toBe(64512)
      expect(mappings.get('server1')?.asn).toBe(64513)
      expect(mappings.get('server2')?.asn).toBe(64514)
    })

    it('should handle mixed URL formats', () => {
      process.env.MASTRA_SERVERS =
        'https://prod.example.com http://localhost:4111 https://staging.vercel.app'

      const mappings = loadServerMappings()

      expect(mappings.size).toBe(3)
      expect(mappings.get('server0')?.url).toBe('https://prod.example.com')
      expect(mappings.get('server1')?.url).toBe('http://localhost:4111')
      expect(mappings.get('server2')?.url).toBe('https://staging.vercel.app')
    })

    it('should assign sequential AS numbers starting from private range', () => {
      process.env.MASTRA_SERVERS =
        'http://s1 http://s2 http://s3 http://s4 http://s5'

      const mappings = loadServerMappings()

      expect(mappings.get('server0')?.asn).toBe(64512)
      expect(mappings.get('server1')?.asn).toBe(64513)
      expect(mappings.get('server2')?.asn).toBe(64514)
      expect(mappings.get('server3')?.asn).toBe(64515)
      expect(mappings.get('server4')?.asn).toBe(64516)
    })

    it('should include server metadata', () => {
      process.env.MASTRA_SERVERS = 'http://localhost:4111'

      const mappings = loadServerMappings()
      const server = mappings.get('server0')!

      expect(server.name).toBe('server0')
      expect(server.description).toBe('Mastra Server (server0)')
      expect(server.region).toBe('default')
      expect(server.priority).toBe(100)
    })

    it('should handle empty or invalid MASTRA_SERVERS', () => {
      process.env.MASTRA_SERVERS = '   ,  ,   '

      const mappings = loadServerMappings()

      // Should fall back to defaults
      expect(mappings.size).toBe(1)
      expect(mappings.has('server0')).toBe(true)
    })
  })

  describe('loadServerMappingsLegacy', () => {
    it('should provide backwards compatibility with URL-only mapping', () => {
      process.env.MASTRA_SERVERS = 'http://localhost:4111 http://localhost:4222'

      const legacyMappings = loadServerMappingsLegacy()

      expect(legacyMappings.size).toBe(2)
      expect(legacyMappings.get('server0')).toBe('http://localhost:4111')
      expect(legacyMappings.get('server1')).toBe('http://localhost:4222')
    })
  })

  describe('getBGPConfig', () => {
    it('should return default BGP configuration', () => {
      const config = getBGPConfig()

      expect(config.localASN).toBe(64512) // Dynamic AS for default port 3001
      expect(config.holdTime).toBe(90)
      expect(config.keepAliveInterval).toBe(30)
      expect(config.connectRetryTime).toBe(30)
      expect(config.routerId).toMatch(/mcp-agent-proxy:\d+/)
    })

    it('should use custom BGP_ASN when provided', () => {
      process.env.BGP_ASN = '64999'

      const config = getBGPConfig()

      expect(config.localASN).toBe(64999)
    })

    it('should use custom BGP timers when provided', () => {
      process.env.BGP_HOLD_TIME = '180'
      process.env.BGP_KEEPALIVE_INTERVAL = '60'
      process.env.BGP_CONNECT_RETRY_TIME = '45'

      const config = getBGPConfig()

      expect(config.holdTime).toBe(180)
      expect(config.keepAliveInterval).toBe(60)
      expect(config.connectRetryTime).toBe(45)
    })

    it('should generate router ID from hostname and port', () => {
      process.env.HOSTNAME = 'test-host'
      process.env.MCP_SERVER_PORT = '3002'

      const config = getBGPConfig()

      expect(config.routerId).toBe('test-host:3002')
    })
  })

  describe('validateServerConfig', () => {
    it('should pass validation for valid server config', () => {
      const config: ServerConfig = {
        name: 'test-server',
        url: 'http://localhost:4111',
        asn: 64512,
        description: 'Test server',
      }

      const issues = validateServerConfig(config)

      expect(issues).toHaveLength(0)
    })

    it('should detect invalid URLs', () => {
      const config: ServerConfig = {
        name: 'test-server',
        url: 'not-a-valid-url',
        asn: 64512,
      }

      const issues = validateServerConfig(config)

      expect(issues.some((issue) => issue.includes('Invalid URL'))).toBe(true)
    })

    it('should detect invalid AS numbers', () => {
      const config: ServerConfig = {
        name: 'test-server',
        url: 'http://localhost:4111',
        asn: -1, // Invalid
      }

      const issues = validateServerConfig(config)

      expect(issues.some((issue) => issue.includes('Invalid AS number'))).toBe(
        true,
      )
    })

    it('should warn about non-private AS numbers', () => {
      const config: ServerConfig = {
        name: 'test-server',
        url: 'http://localhost:4111',
        asn: 1234, // Public AS number
      }

      const issues = validateServerConfig(config)

      expect(
        issues.some((issue) => issue.includes('not in private range')),
      ).toBe(true)
    })

    it('should accept 4-byte private AS numbers', () => {
      const config: ServerConfig = {
        name: 'test-server',
        url: 'http://localhost:4111',
        asn: PRIVATE_ASN_RANGES.FOUR_BYTE.min, // 4200000000
      }

      const issues = validateServerConfig(config)

      expect(
        issues.filter((issue) => issue.includes('not in private range')),
      ).toHaveLength(0)
    })
  })

  describe('getServersFromConfig', () => {
    it('should return array of server configurations', () => {
      process.env.MASTRA_SERVERS = 'http://localhost:4111 http://localhost:4222'

      const servers = getServersFromConfig()

      expect(servers).toHaveLength(2)
      expect(servers[0].name).toBe('server0')
      expect(servers[1].name).toBe('server1')
      expect(servers[0].asn).toBe(64512)
      expect(servers[1].asn).toBe(64513)
    })
  })

  describe('AS Number Range Validation', () => {
    it('should warn when approaching private AS range limit', () => {
      // Create a configuration that would exceed the 2-byte private AS range
      // Private range is 64512-65534, so we need more than 1023 servers (65534-64512+1)
      const manyServers = Array.from(
        { length: 1025 },
        (_, i) => `http://server${i}:4111`,
      ).join(' ')
      process.env.MASTRA_SERVERS = manyServers

      // This should trigger a warning for servers beyond the private range
      const mappings = loadServerMappings()

      // Should still create all servers, but some will have AS numbers outside private range
      expect(mappings.size).toBe(1025)

      // Last server should have AS number beyond private 2-byte range
      const lastServer = mappings.get('server1024')!
      expect(lastServer.asn).toBeGreaterThan(PRIVATE_ASN_RANGES.TWO_BYTE.max)
    })
  })
})
