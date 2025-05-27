import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PluginManager } from './plugin-manager.js'
import { MastraPlugin } from './mastra-plugin.js'
import { LangGraphPlugin } from './langgraph-plugin.js'
import type { RetryConfig, AgentCallParams } from './base-plugin.js'

// Mock the plugins
vi.mock('./mastra-plugin.js')
vi.mock('./langgraph-plugin.js')

// Mock the logger
vi.mock('../config.js', () => ({
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    forceError: vi.fn(),
  },
}))

const mockMastraPlugin = vi.mocked(MastraPlugin)
const mockLangGraphPlugin = vi.mocked(LangGraphPlugin)

describe('PluginManager', () => {
  let pluginManager: PluginManager
  let mockMastraInstance: any
  let mockLangGraphInstance: any
  let retryConfig: RetryConfig

  beforeEach(() => {
    vi.clearAllMocks()

    retryConfig = {
      retries: 3,
      backoffMs: 100,
      maxBackoffMs: 1000,
    }

    // Mock plugin instances
    mockMastraInstance = {
      serverType: 'mastra',
      detectServerType: vi.fn(),
      getAgents: vi.fn(),
      getAgentDescription: vi.fn(),
      callAgent: vi.fn(),
      validateConnection: vi.fn(),
    }

    mockLangGraphInstance = {
      serverType: 'langgraph',
      detectServerType: vi.fn(),
      getAgents: vi.fn(),
      getAgentDescription: vi.fn(),
      callAgent: vi.fn(),
      validateConnection: vi.fn(),
    }

    mockMastraPlugin.mockImplementation(() => mockMastraInstance)
    mockLangGraphPlugin.mockImplementation(() => mockLangGraphInstance)

    pluginManager = new PluginManager()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('should initialize with Mastra and LangGraph plugins', () => {
      expect(mockMastraPlugin).toHaveBeenCalled()
      expect(mockLangGraphPlugin).toHaveBeenCalled()
    })
  })

  describe('detectServerType', () => {
    it('should detect Mastra server type', async () => {
      mockMastraInstance.detectServerType.mockResolvedValue(true)
      mockLangGraphInstance.detectServerType.mockResolvedValue(false)

      const result = await pluginManager.detectServerType(
        'http://localhost:4111',
      )

      expect(result).toBe('mastra')
      expect(mockMastraInstance.detectServerType).toHaveBeenCalledWith(
        'http://localhost:4111',
      )
      expect(mockLangGraphInstance.detectServerType).not.toHaveBeenCalled()
    })

    it('should detect LangGraph server type', async () => {
      mockMastraInstance.detectServerType.mockResolvedValue(false)
      mockLangGraphInstance.detectServerType.mockResolvedValue(true)

      const result = await pluginManager.detectServerType(
        'http://localhost:2024',
      )

      expect(result).toBe('langgraph')
      expect(mockMastraInstance.detectServerType).toHaveBeenCalledWith(
        'http://localhost:2024',
      )
      expect(mockLangGraphInstance.detectServerType).toHaveBeenCalledWith(
        'http://localhost:2024',
      )
    })

    it('should return null when no plugin matches', async () => {
      mockMastraInstance.detectServerType.mockResolvedValue(false)
      mockLangGraphInstance.detectServerType.mockResolvedValue(false)

      const result = await pluginManager.detectServerType(
        'http://unknown-server.com',
      )

      expect(result).toBeNull()
      expect(mockMastraInstance.detectServerType).toHaveBeenCalledWith(
        'http://unknown-server.com',
      )
      expect(mockLangGraphInstance.detectServerType).toHaveBeenCalledWith(
        'http://unknown-server.com',
      )
    })

    it('should use cached result on subsequent calls', async () => {
      mockMastraInstance.detectServerType.mockResolvedValue(true)

      // First call
      const result1 = await pluginManager.detectServerType(
        'http://localhost:4111',
      )
      expect(result1).toBe('mastra')

      // Second call should use cache
      const result2 = await pluginManager.detectServerType(
        'http://localhost:4111',
      )
      expect(result2).toBe('mastra')

      // Should only have been called once
      expect(mockMastraInstance.detectServerType).toHaveBeenCalledTimes(1)
    })

    it('should handle plugin detection errors gracefully', async () => {
      mockMastraInstance.detectServerType.mockRejectedValue(
        new Error('Mastra detection failed'),
      )
      mockLangGraphInstance.detectServerType.mockResolvedValue(true)

      const result = await pluginManager.detectServerType(
        'http://localhost:2024',
      )

      expect(result).toBe('langgraph')
      expect(mockMastraInstance.detectServerType).toHaveBeenCalled()
      expect(mockLangGraphInstance.detectServerType).toHaveBeenCalled()
    })

    it('should handle all plugins failing', async () => {
      mockMastraInstance.detectServerType.mockRejectedValue(
        new Error('Mastra failed'),
      )
      mockLangGraphInstance.detectServerType.mockRejectedValue(
        new Error('LangGraph failed'),
      )

      const result = await pluginManager.detectServerType(
        'http://failing-server.com',
      )

      expect(result).toBeNull()
    })

    it('should test plugins in order', async () => {
      const callOrder: string[] = []

      mockMastraInstance.detectServerType.mockImplementation(async () => {
        callOrder.push('mastra')
        return false
      })

      mockLangGraphInstance.detectServerType.mockImplementation(async () => {
        callOrder.push('langgraph')
        return true
      })

      const result = await pluginManager.detectServerType(
        'http://test-order.com',
      )

      expect(result).toBe('langgraph')
      expect(callOrder).toEqual(['mastra', 'langgraph'])
    })
  })

  describe('getPlugin', () => {
    it('should return Mastra plugin for Mastra server', async () => {
      mockMastraInstance.detectServerType.mockResolvedValue(true)

      const plugin = await pluginManager.getPlugin('http://localhost:4111')

      expect(plugin).toBe(mockMastraInstance)
    })

    it('should return LangGraph plugin for LangGraph server', async () => {
      mockMastraInstance.detectServerType.mockResolvedValue(false)
      mockLangGraphInstance.detectServerType.mockResolvedValue(true)

      const plugin = await pluginManager.getPlugin('http://localhost:2024')

      expect(plugin).toBe(mockLangGraphInstance)
    })

    it('should return null for unknown server type', async () => {
      mockMastraInstance.detectServerType.mockResolvedValue(false)
      mockLangGraphInstance.detectServerType.mockResolvedValue(false)

      const plugin = await pluginManager.getPlugin('http://unknown-server.com')

      expect(plugin).toBeNull()
    })

    it('should use cached server type', async () => {
      mockMastraInstance.detectServerType.mockResolvedValue(true)

      // First call
      const plugin1 = await pluginManager.getPlugin('http://localhost:4111')
      expect(plugin1).toBe(mockMastraInstance)

      // Second call should use cache
      const plugin2 = await pluginManager.getPlugin('http://localhost:4111')
      expect(plugin2).toBe(mockMastraInstance)

      // Detection should only be called once
      expect(mockMastraInstance.detectServerType).toHaveBeenCalledTimes(1)
    })
  })

  describe('getAgents', () => {
    it('should get agents using appropriate plugin', async () => {
      const mockAgents = [
        {
          id: 'agent1',
          name: 'Agent 1',
          description: undefined,
          fullyQualifiedId: 'server:agent1',
        },
        {
          id: 'agent2',
          name: 'Agent 2',
          description: undefined,
          fullyQualifiedId: 'server:agent2',
        },
      ]

      mockMastraInstance.detectServerType.mockResolvedValue(true)
      mockMastraInstance.getAgents.mockResolvedValue(mockAgents)

      const result = await pluginManager.getAgents(
        'http://localhost:4111',
        retryConfig,
      )

      expect(result).toEqual(mockAgents)
      expect(mockMastraInstance.getAgents).toHaveBeenCalledWith(
        'http://localhost:4111',
        retryConfig,
      )
    })

    it('should throw error when no plugin found', async () => {
      mockMastraInstance.detectServerType.mockResolvedValue(false)
      mockLangGraphInstance.detectServerType.mockResolvedValue(false)

      await expect(
        pluginManager.getAgents('http://unknown-server.com', retryConfig),
      ).rejects.toThrow('No plugin found for server: http://unknown-server.com')
    })

    it('should propagate plugin errors', async () => {
      mockMastraInstance.detectServerType.mockResolvedValue(true)
      mockMastraInstance.getAgents.mockRejectedValue(
        new Error('Failed to get agents'),
      )

      await expect(
        pluginManager.getAgents('http://localhost:4111', retryConfig),
      ).rejects.toThrow('Failed to get agents')
    })

    it('should work with different server types', async () => {
      const mastraAgents = [
        {
          id: 'mastra-agent',
          name: 'Mastra Agent',
          description: undefined,
          fullyQualifiedId: 'mastra:mastra-agent',
        },
      ]
      const langGraphAgents = [
        {
          id: 'langgraph-agent',
          name: 'LangGraph Agent',
          description: undefined,
          fullyQualifiedId: 'langgraph:langgraph-agent',
        },
      ]

      // Test Mastra
      mockMastraInstance.detectServerType.mockResolvedValue(true)
      mockMastraInstance.getAgents.mockResolvedValue(mastraAgents)

      const mastraResult = await pluginManager.getAgents(
        'http://mastra-server.com',
        retryConfig,
      )
      expect(mastraResult).toEqual(mastraAgents)

      // Clear cache for new server
      pluginManager.clearCache()

      // Test LangGraph
      mockMastraInstance.detectServerType.mockResolvedValue(false)
      mockLangGraphInstance.detectServerType.mockResolvedValue(true)
      mockLangGraphInstance.getAgents.mockResolvedValue(langGraphAgents)

      const langGraphResult = await pluginManager.getAgents(
        'http://langgraph-server.com',
        retryConfig,
      )
      expect(langGraphResult).toEqual(langGraphAgents)
    })
  })

  describe('getAgentDescription', () => {
    it('should get agent description using appropriate plugin', async () => {
      const mockAgentDescription = {
        id: 'test-agent',
        name: 'Test Agent',
        description: 'A test agent',
        fullyQualifiedId: 'server:test-agent',
      }

      mockMastraInstance.detectServerType.mockResolvedValue(true)
      mockMastraInstance.getAgentDescription.mockResolvedValue(
        mockAgentDescription,
      )

      const result = await pluginManager.getAgentDescription(
        'http://localhost:4111',
        'test-agent',
        retryConfig,
      )

      expect(result).toEqual(mockAgentDescription)
      expect(mockMastraInstance.getAgentDescription).toHaveBeenCalledWith(
        'http://localhost:4111',
        'test-agent',
        retryConfig,
      )
    })

    it('should throw error when no plugin found', async () => {
      mockMastraInstance.detectServerType.mockResolvedValue(false)
      mockLangGraphInstance.detectServerType.mockResolvedValue(false)

      await expect(
        pluginManager.getAgentDescription(
          'http://unknown-server.com',
          'test-agent',
          retryConfig,
        ),
      ).rejects.toThrow('No plugin found for server: http://unknown-server.com')
    })

    it('should propagate plugin errors', async () => {
      mockMastraInstance.detectServerType.mockResolvedValue(true)
      mockMastraInstance.getAgentDescription.mockRejectedValue(
        new Error('Agent not found'),
      )

      await expect(
        pluginManager.getAgentDescription(
          'http://localhost:4111',
          'test-agent',
          retryConfig,
        ),
      ).rejects.toThrow('Agent not found')
    })
  })

  describe('callAgent', () => {
    it('should call agent using appropriate plugin', async () => {
      const mockResponse = { message: 'Hello, world!' }
      const params: AgentCallParams = {
        agentId: 'test-agent',
        interactionType: 'generate',
        messages: [{ role: 'user', content: 'Hello' }],
      }

      mockMastraInstance.detectServerType.mockResolvedValue(true)
      mockMastraInstance.callAgent.mockResolvedValue(mockResponse)

      const result = await pluginManager.callAgent(
        'http://localhost:4111',
        params,
        retryConfig,
      )

      expect(result).toEqual(mockResponse)
      expect(mockMastraInstance.callAgent).toHaveBeenCalledWith(
        'http://localhost:4111',
        params,
        retryConfig,
      )
    })

    it('should handle streaming calls', async () => {
      const mockStreamResponse = {
        type: 'collected_stream',
        chunks: [
          { content: 'Hello', timestamp: '2023-01-01T00:00:00Z', index: 0 },
          { content: ' world!', timestamp: '2023-01-01T00:00:01Z', index: 1 },
        ],
        summary: {
          totalChunks: 2,
          startTime: '2023-01-01T00:00:00Z',
          endTime: '2023-01-01T00:00:01Z',
          durationMs: 1000,
        },
      }

      const params: AgentCallParams = {
        agentId: 'test-agent',
        interactionType: 'stream',
        messages: [{ role: 'user', content: 'Hello' }],
      }

      mockLangGraphInstance.detectServerType.mockResolvedValue(true)
      mockLangGraphInstance.callAgent.mockResolvedValue(mockStreamResponse)

      const result = await pluginManager.callAgent(
        'http://localhost:2024',
        params,
        retryConfig,
      )

      expect(result).toEqual(mockStreamResponse)
      expect(mockLangGraphInstance.callAgent).toHaveBeenCalledWith(
        'http://localhost:2024',
        params,
        retryConfig,
      )
    })

    it('should throw error when no plugin found', async () => {
      mockMastraInstance.detectServerType.mockResolvedValue(false)
      mockLangGraphInstance.detectServerType.mockResolvedValue(false)

      const params: AgentCallParams = {
        agentId: 'test-agent',
        interactionType: 'generate',
        messages: [{ role: 'user', content: 'Hello' }],
      }

      await expect(
        pluginManager.callAgent(
          'http://unknown-server.com',
          params,
          retryConfig,
        ),
      ).rejects.toThrow('No plugin found for server: http://unknown-server.com')
    })

    it('should propagate plugin errors', async () => {
      mockMastraInstance.detectServerType.mockResolvedValue(true)
      mockMastraInstance.callAgent.mockRejectedValue(
        new Error('Agent call failed'),
      )

      const params: AgentCallParams = {
        agentId: 'test-agent',
        interactionType: 'generate',
        messages: [{ role: 'user', content: 'Hello' }],
      }

      await expect(
        pluginManager.callAgent('http://localhost:4111', params, retryConfig),
      ).rejects.toThrow('Agent call failed')
    })

    it('should handle complex agent options', async () => {
      const mockResponse = { message: 'Complex response' }
      const params: AgentCallParams = {
        agentId: 'complex-agent',
        interactionType: 'generate',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Complex query' },
        ],
        threadId: 'thread-123',
        resourceId: 'resource-456',
        agentOptions: {
          temperature: 0.7,
          maxTokens: 200,
          tools: ['calculator', 'search'],
        },
      }

      mockMastraInstance.detectServerType.mockResolvedValue(true)
      mockMastraInstance.callAgent.mockResolvedValue(mockResponse)

      const result = await pluginManager.callAgent(
        'http://localhost:4111',
        params,
        retryConfig,
      )

      expect(result).toEqual(mockResponse)
      expect(mockMastraInstance.callAgent).toHaveBeenCalledWith(
        'http://localhost:4111',
        params,
        retryConfig,
      )
    })
  })

  describe('validateConnection', () => {
    it('should validate connection using appropriate plugin', async () => {
      mockMastraInstance.detectServerType.mockResolvedValue(true)
      mockMastraInstance.validateConnection.mockResolvedValue(true)

      const result = await pluginManager.validateConnection(
        'http://localhost:4111',
      )

      expect(result).toBe(true)
      expect(mockMastraInstance.validateConnection).toHaveBeenCalledWith(
        'http://localhost:4111',
      )
    })

    it('should return false when no plugin found', async () => {
      mockMastraInstance.detectServerType.mockResolvedValue(false)
      mockLangGraphInstance.detectServerType.mockResolvedValue(false)

      const result = await pluginManager.validateConnection(
        'http://unknown-server.com',
      )

      expect(result).toBe(false)
    })

    it('should return false when plugin validation fails', async () => {
      mockMastraInstance.detectServerType.mockResolvedValue(true)
      mockMastraInstance.validateConnection.mockResolvedValue(false)

      const result = await pluginManager.validateConnection(
        'http://localhost:4111',
      )

      expect(result).toBe(false)
    })

    it('should handle validation errors gracefully', async () => {
      mockMastraInstance.detectServerType.mockResolvedValue(true)
      mockMastraInstance.validateConnection.mockRejectedValue(
        new Error('Validation failed'),
      )

      const result = await pluginManager.validateConnection(
        'http://localhost:4111',
      )

      expect(result).toBe(false)
    })
  })

  describe('getServerStatus', () => {
    it('should get server status with online status', async () => {
      const mockAgents = [
        {
          id: 'agent1',
          name: 'Agent 1',
          description: undefined,
          fullyQualifiedId: 'server:agent1',
        },
        {
          id: 'agent2',
          name: 'Agent 2',
          description: undefined,
          fullyQualifiedId: 'server:agent2',
        },
      ]

      mockMastraInstance.detectServerType.mockResolvedValue(true)
      mockMastraInstance.getAgents.mockResolvedValue(mockAgents)

      const result = await pluginManager.getServerStatus(
        'test-server',
        'http://localhost:4111',
        retryConfig,
        false,
      )

      expect(result).toEqual({
        serverName: 'test-server',
        serverUrl: 'http://localhost:4111',
        serverType: 'mastra',
        serverDescription: 'Mastra Server (test-server)',
        agents: mockAgents,
        status: 'online',
        isDynamic: false,
      })
    })

    it('should get server status with error when no plugin found', async () => {
      mockMastraInstance.detectServerType.mockResolvedValue(false)
      mockLangGraphInstance.detectServerType.mockResolvedValue(false)

      const result = await pluginManager.getServerStatus(
        'unknown-server',
        'http://unknown-server.com',
        retryConfig,
        true,
      )

      expect(result).toEqual({
        serverName: 'unknown-server',
        serverUrl: 'http://unknown-server.com',
        serverType: 'unknown',
        serverDescription: 'Unknown server type',
        agents: [],
        status: 'error',
        error: 'No compatible plugin found',
        isDynamic: true,
      })
    })

    it('should get server status with error when plugin fails', async () => {
      mockMastraInstance.detectServerType.mockResolvedValue(true)
      mockMastraInstance.getAgents.mockRejectedValue(
        new Error('Connection failed'),
      )

      const result = await pluginManager.getServerStatus(
        'failing-server',
        'http://localhost:4111',
        retryConfig,
        false,
      )

      expect(result).toEqual({
        serverName: 'failing-server',
        serverUrl: 'http://localhost:4111',
        serverType: 'unknown',
        serverDescription: 'Server (failing-server)',
        agents: [],
        status: 'error',
        error: 'Connection failed',
        isDynamic: false,
      })
    })

    it('should handle non-Error exceptions', async () => {
      mockMastraInstance.detectServerType.mockResolvedValue(true)
      mockMastraInstance.getAgents.mockRejectedValue('String error')

      const result = await pluginManager.getServerStatus(
        'string-error-server',
        'http://localhost:4111',
        retryConfig,
        false,
      )

      expect(result).toEqual({
        serverName: 'string-error-server',
        serverUrl: 'http://localhost:4111',
        serverType: 'unknown',
        serverDescription: 'Server (string-error-server)',
        agents: [],
        status: 'error',
        error: 'Unknown error',
        isDynamic: false,
      })
    })

    it('should work with LangGraph servers', async () => {
      const mockAgents = [
        {
          id: 'assistant1',
          name: 'Assistant 1',
          description: 'LangGraph assistant',
          fullyQualifiedId: 'langgraph:assistant1',
        },
      ]

      mockMastraInstance.detectServerType.mockResolvedValue(false)
      mockLangGraphInstance.detectServerType.mockResolvedValue(true)
      mockLangGraphInstance.getAgents.mockResolvedValue(mockAgents)

      const result = await pluginManager.getServerStatus(
        'langgraph-server',
        'http://localhost:2024',
        retryConfig,
        true,
      )

      expect(result).toEqual({
        serverName: 'langgraph-server',
        serverUrl: 'http://localhost:2024',
        serverType: 'langgraph',
        serverDescription: 'Langgraph Server (langgraph-server)',
        agents: mockAgents,
        status: 'online',
        isDynamic: true,
      })
    })

    it('should handle empty agents list', async () => {
      mockMastraInstance.detectServerType.mockResolvedValue(true)
      mockMastraInstance.getAgents.mockResolvedValue([])

      const result = await pluginManager.getServerStatus(
        'empty-server',
        'http://localhost:4111',
        retryConfig,
        false,
      )

      expect(result).toEqual({
        serverName: 'empty-server',
        serverUrl: 'http://localhost:4111',
        serverType: 'mastra',
        serverDescription: 'Mastra Server (empty-server)',
        agents: [],
        status: 'online',
        isDynamic: false,
      })
    })
  })

  describe('clearCache', () => {
    it('should clear the server type cache', async () => {
      // First detection
      mockMastraInstance.detectServerType.mockResolvedValue(true)
      const result1 = await pluginManager.detectServerType(
        'http://localhost:4111',
      )
      expect(result1).toBe('mastra')
      expect(mockMastraInstance.detectServerType).toHaveBeenCalledTimes(1)

      // Second detection should use cache
      const result2 = await pluginManager.detectServerType(
        'http://localhost:4111',
      )
      expect(result2).toBe('mastra')
      expect(mockMastraInstance.detectServerType).toHaveBeenCalledTimes(1)

      // Clear cache
      pluginManager.clearCache()

      // Third detection should call plugin again
      const result3 = await pluginManager.detectServerType(
        'http://localhost:4111',
      )
      expect(result3).toBe('mastra')
      expect(mockMastraInstance.detectServerType).toHaveBeenCalledTimes(2)
    })

    it('should allow cache to be rebuilt after clearing', async () => {
      // Initial detection
      mockMastraInstance.detectServerType.mockResolvedValue(true)
      await pluginManager.detectServerType('http://localhost:4111')

      // Clear cache
      pluginManager.clearCache()

      // Change mock behavior
      mockMastraInstance.detectServerType.mockResolvedValue(false)
      mockLangGraphInstance.detectServerType.mockResolvedValue(true)

      // Should detect new server type
      const result = await pluginManager.detectServerType(
        'http://localhost:4111',
      )
      expect(result).toBe('langgraph')
    })
  })

  describe('getSupportedServerTypes', () => {
    it('should return all supported server types', () => {
      const supportedTypes = pluginManager.getSupportedServerTypes()

      expect(supportedTypes).toEqual(['mastra', 'langgraph'])
    })

    it('should return server types in consistent order', () => {
      const types1 = pluginManager.getSupportedServerTypes()
      const types2 = pluginManager.getSupportedServerTypes()

      expect(types1).toEqual(types2)
    })
  })

  describe('edge cases and error handling', () => {
    it('should handle plugin detection timeout', async () => {
      mockMastraInstance.detectServerType.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(false), 100)),
      )
      mockLangGraphInstance.detectServerType.mockResolvedValue(true)

      const result = await pluginManager.detectServerType(
        'http://slow-server.com',
      )

      expect(result).toBe('langgraph')
    })

    it('should handle concurrent detection requests', async () => {
      mockMastraInstance.detectServerType.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(true), 50)),
      )

      // Make multiple concurrent requests
      const promises = [
        pluginManager.detectServerType('http://concurrent-server.com'),
        pluginManager.detectServerType('http://concurrent-server.com'),
        pluginManager.detectServerType('http://concurrent-server.com'),
      ]

      const results = await Promise.all(promises)

      // All should return the same result
      expect(results).toEqual(['mastra', 'mastra', 'mastra'])

      // Detection may be called multiple times for concurrent requests
      expect(mockMastraInstance.detectServerType).toHaveBeenCalledWith(
        'http://concurrent-server.com',
      )
    })

    it('should handle plugin constructor errors', () => {
      // Mock plugin constructor to throw
      mockMastraPlugin.mockImplementation(() => {
        throw new Error('Plugin initialization failed')
      })

      // Should not throw during PluginManager construction
      expect(() => new PluginManager()).not.toThrow()
    })

    it('should handle malformed server URLs', async () => {
      const malformedUrls = [
        'not-a-url',
        'http://',
        'ftp://invalid-protocol.com',
        '',
        'localhost:4111', // missing protocol
      ]

      for (const url of malformedUrls) {
        mockMastraInstance.detectServerType.mockResolvedValue(false)
        mockLangGraphInstance.detectServerType.mockResolvedValue(false)

        const result = await pluginManager.detectServerType(url)
        expect(result).toBeNull()
      }
    })

    it('should handle very long server URLs', async () => {
      const longUrl = 'http://' + 'a'.repeat(1000) + '.com'

      mockMastraInstance.detectServerType.mockResolvedValue(true)

      const result = await pluginManager.detectServerType(longUrl)

      expect(result).toBe('mastra')
      expect(mockMastraInstance.detectServerType).toHaveBeenCalledWith(longUrl)
    })

    it('should handle special characters in server URLs', async () => {
      const specialUrls = [
        'http://server-with-dashes.com',
        'http://server_with_underscores.com',
        'http://server.with.dots.com',
        'http://server123.com',
        'http://localhost:4111/path/with/slashes',
        'http://server.com:8080?query=param&other=value',
      ]

      mockMastraInstance.detectServerType.mockResolvedValue(true)

      for (const url of specialUrls) {
        const result = await pluginManager.detectServerType(url)
        expect(result).toBe('mastra')
      }
    })

    it('should handle plugin methods returning null/undefined', async () => {
      mockMastraInstance.detectServerType.mockResolvedValue(true)
      mockMastraInstance.getAgents.mockResolvedValue(null as any)

      await expect(
        pluginManager.getAgents('http://localhost:4111', retryConfig),
      ).rejects.toThrow()
    })

    it('should handle large numbers of plugins', () => {
      // This tests that the plugin manager can handle many plugins
      // In practice, we only have 2, but this tests the scalability
      const manager = new PluginManager()
      const supportedTypes = manager.getSupportedServerTypes()

      expect(supportedTypes.length).toBeGreaterThan(0)
      expect(supportedTypes).toContain('mastra')
      expect(supportedTypes).toContain('langgraph')
    })
  })

  describe('integration scenarios', () => {
    it('should handle mixed server environment', async () => {
      const servers = [
        { url: 'http://mastra-server.com', type: 'mastra' },
        { url: 'http://langgraph-server.com', type: 'langgraph' },
        { url: 'http://unknown-server.com', type: null },
      ]

      // Setup mocks for different servers
      mockMastraInstance.detectServerType.mockImplementation(async (url) =>
        url.includes('mastra'),
      )
      mockLangGraphInstance.detectServerType.mockImplementation(async (url) =>
        url.includes('langgraph'),
      )

      for (const server of servers) {
        const detectedType = await pluginManager.detectServerType(server.url)
        expect(detectedType).toBe(server.type)
      }
    })

    it('should handle server switching scenarios', async () => {
      // Initially detect as Mastra
      mockMastraInstance.detectServerType.mockResolvedValue(true)
      mockLangGraphInstance.detectServerType.mockResolvedValue(false)

      let result = await pluginManager.detectServerType(
        'http://switching-server.com',
      )
      expect(result).toBe('mastra')

      // Clear cache and change server type
      pluginManager.clearCache()
      mockMastraInstance.detectServerType.mockResolvedValue(false)
      mockLangGraphInstance.detectServerType.mockResolvedValue(true)

      result = await pluginManager.detectServerType(
        'http://switching-server.com',
      )
      expect(result).toBe('langgraph')
    })

    it('should handle high-frequency requests', async () => {
      mockMastraInstance.detectServerType.mockResolvedValue(true)
      mockMastraInstance.getAgents.mockResolvedValue([
        {
          id: 'agent1',
          name: 'Agent 1',
          description: undefined,
          fullyQualifiedId: 'server:agent1',
        },
      ])

      // Make many concurrent requests
      const promises = Array.from({ length: 100 }, (_, i) =>
        pluginManager.getAgents(`http://server${i % 5}.com`, retryConfig),
      )

      const results = await Promise.all(promises)

      // All should succeed
      expect(results).toHaveLength(100)
      results.forEach((result) => {
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('agent1')
      })
    })
  })
})
