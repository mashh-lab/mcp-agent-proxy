import { describe, it, expect } from 'vitest'
import {
  AgentInfoSchema,
  ServerStatusSchema,
  AgentCallParamsSchema,
  AgentCallResponseSchema,
  BaseServerPlugin,
  type AgentInfo,
  type ServerStatus,
  type AgentCallParams,
  type AgentCallResponse,
  type RetryConfig,
} from './base-plugin.js'

describe('base-plugin schemas', () => {
  describe('AgentInfoSchema', () => {
    it('should validate valid agent info', () => {
      const validAgentInfo = {
        id: 'test-agent',
        name: 'Test Agent',
        description: 'A test agent',
        fullyQualifiedId: 'server:test-agent',
      }

      const result = AgentInfoSchema.safeParse(validAgentInfo)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual(validAgentInfo)
      }
    })

    it('should validate agent info with minimal required fields', () => {
      const minimalAgentInfo = {
        id: 'minimal-agent',
        fullyQualifiedId: 'server:minimal-agent',
      }

      const result = AgentInfoSchema.safeParse(minimalAgentInfo)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.id).toBe('minimal-agent')
        expect(result.data.fullyQualifiedId).toBe('server:minimal-agent')
        expect(result.data.name).toBeUndefined()
        expect(result.data.description).toBeUndefined()
      }
    })

    it('should reject agent info without required fields', () => {
      const invalidAgentInfo = {
        name: 'Test Agent',
        description: 'A test agent',
      }

      const result = AgentInfoSchema.safeParse(invalidAgentInfo)
      expect(result.success).toBe(false)
    })

    it('should accept agent info with empty id', () => {
      const agentInfo = {
        id: '',
        fullyQualifiedId: 'server:',
      }

      const result = AgentInfoSchema.safeParse(agentInfo)
      expect(result.success).toBe(true)
    })

    it('should accept agent info with empty fullyQualifiedId', () => {
      const agentInfo = {
        id: 'test-agent',
        fullyQualifiedId: '',
      }

      const result = AgentInfoSchema.safeParse(agentInfo)
      expect(result.success).toBe(true)
    })

    it('should reject null values for optional fields', () => {
      const agentInfoWithNulls = {
        id: 'test-agent',
        name: null,
        description: undefined,
        fullyQualifiedId: 'server:test-agent',
      }

      const result = AgentInfoSchema.safeParse(agentInfoWithNulls)
      expect(result.success).toBe(false)
    })
  })

  describe('ServerStatusSchema', () => {
    it('should validate valid server status', () => {
      const validServerStatus = {
        serverName: 'test-server',
        serverUrl: 'http://localhost:4111',
        serverType: 'mastra',
        serverDescription: 'Test server',
        agents: [
          {
            id: 'agent1',
            name: 'Agent 1',
            description: 'First agent',
            fullyQualifiedId: 'test-server:agent1',
          },
        ],
        status: 'online' as const,
        isDynamic: false,
      }

      const result = ServerStatusSchema.safeParse(validServerStatus)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual(validServerStatus)
      }
    })

    it('should validate server status with error', () => {
      const errorServerStatus = {
        serverName: 'error-server',
        serverUrl: 'http://localhost:4222',
        serverType: 'unknown',
        agents: [],
        status: 'error' as const,
        error: 'Connection failed',
        isDynamic: true,
      }

      const result = ServerStatusSchema.safeParse(errorServerStatus)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.status).toBe('error')
        expect(result.data.error).toBe('Connection failed')
        expect(result.data.isDynamic).toBe(true)
      }
    })

    it('should validate server status with offline status', () => {
      const offlineServerStatus = {
        serverName: 'offline-server',
        serverUrl: 'http://localhost:4333',
        serverType: 'langgraph',
        agents: [],
        status: 'offline' as const,
        isDynamic: false,
      }

      const result = ServerStatusSchema.safeParse(offlineServerStatus)
      expect(result.success).toBe(true)
    })

    it('should reject invalid status values', () => {
      const invalidServerStatus = {
        serverName: 'test-server',
        serverUrl: 'http://localhost:4111',
        serverType: 'mastra',
        agents: [],
        status: 'invalid-status',
        isDynamic: false,
      }

      const result = ServerStatusSchema.safeParse(invalidServerStatus)
      expect(result.success).toBe(false)
    })

    it('should reject server status without required fields', () => {
      const invalidServerStatus = {
        serverName: 'test-server',
        // Missing required fields
      }

      const result = ServerStatusSchema.safeParse(invalidServerStatus)
      expect(result.success).toBe(false)
    })

    it('should handle empty agents array', () => {
      const serverStatusWithNoAgents = {
        serverName: 'empty-server',
        serverUrl: 'http://localhost:4444',
        serverType: 'mastra',
        agents: [],
        status: 'online' as const,
        isDynamic: false,
      }

      const result = ServerStatusSchema.safeParse(serverStatusWithNoAgents)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.agents).toEqual([])
      }
    })
  })

  describe('AgentCallParamsSchema', () => {
    it('should validate valid agent call params', () => {
      const validParams = {
        agentId: 'test-agent',
        interactionType: 'generate' as const,
        messages: [
          {
            role: 'user' as const,
            content: 'Hello, world!',
          },
        ],
        threadId: 'thread-123',
        resourceId: 'resource-456',
        agentOptions: {
          temperature: 0.7,
          maxTokens: 100,
        },
      }

      const result = AgentCallParamsSchema.safeParse(validParams)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual(validParams)
      }
    })

    it('should validate minimal agent call params', () => {
      const minimalParams = {
        agentId: 'test-agent',
        interactionType: 'stream' as const,
        messages: [
          {
            role: 'system' as const,
            content: 'You are a helpful assistant.',
          },
        ],
      }

      const result = AgentCallParamsSchema.safeParse(minimalParams)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.threadId).toBeUndefined()
        expect(result.data.resourceId).toBeUndefined()
        expect(result.data.agentOptions).toBeUndefined()
      }
    })

    it('should validate all message roles', () => {
      const paramsWithAllRoles = {
        agentId: 'test-agent',
        interactionType: 'generate' as const,
        messages: [
          { role: 'system' as const, content: 'System message' },
          { role: 'user' as const, content: 'User message' },
          { role: 'assistant' as const, content: 'Assistant message' },
        ],
      }

      const result = AgentCallParamsSchema.safeParse(paramsWithAllRoles)
      expect(result.success).toBe(true)
    })

    it('should reject invalid interaction types', () => {
      const invalidParams = {
        agentId: 'test-agent',
        interactionType: 'invalid-type',
        messages: [{ role: 'user', content: 'Hello' }],
      }

      const result = AgentCallParamsSchema.safeParse(invalidParams)
      expect(result.success).toBe(false)
    })

    it('should reject invalid message roles', () => {
      const invalidParams = {
        agentId: 'test-agent',
        interactionType: 'generate',
        messages: [{ role: 'invalid-role', content: 'Hello' }],
      }

      const result = AgentCallParamsSchema.safeParse(invalidParams)
      expect(result.success).toBe(false)
    })

    it('should accept empty messages array', () => {
      const params = {
        agentId: 'test-agent',
        interactionType: 'generate',
        messages: [],
      }

      const result = AgentCallParamsSchema.safeParse(params)
      expect(result.success).toBe(true)
    })

    it('should accept empty agentId', () => {
      const params = {
        agentId: '',
        interactionType: 'generate',
        messages: [{ role: 'user', content: 'Hello' }],
      }

      const result = AgentCallParamsSchema.safeParse(params)
      expect(result.success).toBe(true)
    })

    it('should handle complex agentOptions', () => {
      const paramsWithComplexOptions = {
        agentId: 'test-agent',
        interactionType: 'generate' as const,
        messages: [{ role: 'user' as const, content: 'Hello' }],
        agentOptions: {
          temperature: 0.8,
          maxTokens: 200,
          stopSequences: ['END', 'STOP'],
          metadata: {
            userId: 'user123',
            sessionId: 'session456',
          },
          tools: [
            {
              name: 'calculator',
              description: 'Perform calculations',
            },
          ],
        },
      }

      const result = AgentCallParamsSchema.safeParse(paramsWithComplexOptions)
      expect(result.success).toBe(true)
    })
  })

  describe('AgentCallResponseSchema', () => {
    it('should validate valid agent call response', () => {
      const validResponse = {
        success: true as const,
        responseData: { message: 'Hello, world!' },
        interactionType: 'generate',
        serverUsed: 'http://localhost:4111',
        agentIdUsed: 'test-agent',
        fullyQualifiedId: 'server:test-agent',
        resolutionMethod: 'explicit_qualification',
        serverType: 'mastra',
      }

      const result = AgentCallResponseSchema.safeParse(validResponse)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual(validResponse)
      }
    })

    it('should validate response with complex responseData', () => {
      const complexResponse = {
        success: true as const,
        responseData: {
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
        },
        interactionType: 'stream',
        serverUsed: 'http://localhost:4111',
        agentIdUsed: 'streaming-agent',
        fullyQualifiedId: 'server:streaming-agent',
        resolutionMethod: 'unique_auto_resolution',
        serverType: 'langgraph',
      }

      const result = AgentCallResponseSchema.safeParse(complexResponse)
      expect(result.success).toBe(true)
    })

    it('should reject response with success !== true', () => {
      const invalidResponse = {
        success: false,
        responseData: { error: 'Failed' },
        interactionType: 'generate',
        serverUsed: 'http://localhost:4111',
        agentIdUsed: 'test-agent',
        fullyQualifiedId: 'server:test-agent',
        resolutionMethod: 'explicit_qualification',
        serverType: 'mastra',
      }

      const result = AgentCallResponseSchema.safeParse(invalidResponse)
      expect(result.success).toBe(false)
    })

    it('should reject response without required fields', () => {
      const invalidResponse = {
        success: true,
        responseData: { message: 'Hello' },
        // Missing required fields
      }

      const result = AgentCallResponseSchema.safeParse(invalidResponse)
      expect(result.success).toBe(false)
    })

    it('should handle null and undefined responseData', () => {
      const responseWithNullData = {
        success: true as const,
        responseData: null,
        interactionType: 'generate',
        serverUsed: 'http://localhost:4111',
        agentIdUsed: 'test-agent',
        fullyQualifiedId: 'server:test-agent',
        resolutionMethod: 'explicit_qualification',
        serverType: 'mastra',
      }

      const result = AgentCallResponseSchema.safeParse(responseWithNullData)
      expect(result.success).toBe(true)
    })
  })
})

describe('BaseServerPlugin', () => {
  // Create a concrete implementation for testing
  class TestServerPlugin extends BaseServerPlugin {
    readonly serverType = 'test'

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async detectServerType(_serverUrl: string): Promise<boolean> {
      return true
    }

    async getAgents(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _serverUrl: string,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _retryConfig: RetryConfig,
    ): Promise<AgentInfo[]> {
      return [
        {
          id: 'test-agent',
          name: 'Test Agent',
          description: 'A test agent',
          fullyQualifiedId: 'test:test-agent',
        },
      ]
    }

    async getAgentDescription(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _serverUrl: string,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _agentId: string,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _retryConfig: RetryConfig,
    ): Promise<AgentInfo> {
      return {
        id: 'test-agent',
        name: 'Test Agent',
        description: 'A test agent',
        fullyQualifiedId: 'test:test-agent',
      }
    }

    async callAgent(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _serverUrl: string,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _params: AgentCallParams,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _retryConfig: RetryConfig,
    ): Promise<unknown> {
      return { message: 'Test response' }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async validateConnection(_serverUrl: string): Promise<boolean> {
      return true
    }
  }

  describe('abstract class implementation', () => {
    it('should create a concrete implementation', () => {
      const plugin = new TestServerPlugin()
      expect(plugin.serverType).toBe('test')
    })

    it('should implement detectServerType', async () => {
      const plugin = new TestServerPlugin()
      const result = await plugin.detectServerType('http://test.com')
      expect(result).toBe(true)
    })

    it('should implement getAgents', async () => {
      const plugin = new TestServerPlugin()
      const retryConfig: RetryConfig = {
        retries: 3,
        backoffMs: 100,
        maxBackoffMs: 1000,
      }
      const agents = await plugin.getAgents('http://test.com', retryConfig)
      expect(agents).toHaveLength(1)
      expect(agents[0].id).toBe('test-agent')
    })

    it('should implement getAgentDescription', async () => {
      const plugin = new TestServerPlugin()
      const retryConfig: RetryConfig = {
        retries: 3,
        backoffMs: 100,
        maxBackoffMs: 1000,
      }
      const agent = await plugin.getAgentDescription(
        'http://test.com',
        'test-agent',
        retryConfig,
      )
      expect(agent.id).toBe('test-agent')
      expect(agent.name).toBe('Test Agent')
    })

    it('should implement callAgent', async () => {
      const plugin = new TestServerPlugin()
      const retryConfig: RetryConfig = {
        retries: 3,
        backoffMs: 100,
        maxBackoffMs: 1000,
      }
      const params: AgentCallParams = {
        agentId: 'test-agent',
        interactionType: 'generate',
        messages: [{ role: 'user', content: 'Hello' }],
      }
      const response = await plugin.callAgent(
        'http://test.com',
        params,
        retryConfig,
      )
      expect(response).toEqual({ message: 'Test response' })
    })

    it('should implement validateConnection', async () => {
      const plugin = new TestServerPlugin()
      const result = await plugin.validateConnection('http://test.com')
      expect(result).toBe(true)
    })
  })

  describe('RetryConfig interface', () => {
    it('should accept valid retry config', () => {
      const retryConfig: RetryConfig = {
        retries: 5,
        backoffMs: 200,
        maxBackoffMs: 2000,
      }

      expect(retryConfig.retries).toBe(5)
      expect(retryConfig.backoffMs).toBe(200)
      expect(retryConfig.maxBackoffMs).toBe(2000)
    })

    it('should handle zero retries', () => {
      const retryConfig: RetryConfig = {
        retries: 0,
        backoffMs: 100,
        maxBackoffMs: 1000,
      }

      expect(retryConfig.retries).toBe(0)
    })

    it('should handle edge case values', () => {
      const retryConfig: RetryConfig = {
        retries: 1,
        backoffMs: 1,
        maxBackoffMs: 1,
      }

      expect(retryConfig.retries).toBe(1)
      expect(retryConfig.backoffMs).toBe(1)
      expect(retryConfig.maxBackoffMs).toBe(1)
    })
  })
})

describe('type exports', () => {
  it('should export all required types', () => {
    // This test ensures all types are properly exported
    const agentInfo: AgentInfo = {
      id: 'test',
      fullyQualifiedId: 'server:test',
    }

    const serverStatus: ServerStatus = {
      serverName: 'test',
      serverUrl: 'http://test.com',
      serverType: 'test',
      agents: [],
      status: 'online',
      isDynamic: false,
    }

    const agentCallParams: AgentCallParams = {
      agentId: 'test',
      interactionType: 'generate',
      messages: [{ role: 'user', content: 'test' }],
    }

    const agentCallResponse: AgentCallResponse = {
      success: true,
      responseData: {},
      interactionType: 'generate',
      serverUsed: 'http://test.com',
      agentIdUsed: 'test',
      fullyQualifiedId: 'server:test',
      resolutionMethod: 'test',
      serverType: 'test',
    }

    const retryConfig: RetryConfig = {
      retries: 3,
      backoffMs: 100,
      maxBackoffMs: 1000,
    }

    expect(agentInfo).toBeDefined()
    expect(serverStatus).toBeDefined()
    expect(agentCallParams).toBeDefined()
    expect(agentCallResponse).toBeDefined()
    expect(retryConfig).toBeDefined()
  })
})
