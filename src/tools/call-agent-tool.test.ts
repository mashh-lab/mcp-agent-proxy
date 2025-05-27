import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { callAgent } from './call-agent-tool.js'
import * as config from '../config.js'
import { PluginManager } from '../plugins/index.js'

// Mock the dependencies
vi.mock('../config.js')
vi.mock('../plugins/index.js')

const mockConfig = vi.mocked(config)
const mockPluginManager = vi.mocked(PluginManager)

// Define types for better type safety
type CallAgentInput = {
  targetAgentId: string
  interactionType: 'generate' | 'stream'
  messages: Array<{
    role: 'user' | 'assistant' | 'system'
    content: string
  }>
  serverUrl?: string
  threadId?: string
  resourceId?: string
  agentOptions?: Record<string, any>
}

type CallAgentOutput = {
  success: true
  responseData: any
  interactionType: string
  serverUsed: string
  agentIdUsed: string
  fullyQualifiedId: string
  resolutionMethod: string
  serverType: string
}

describe('call-agent-tool', () => {
  let mockPluginManagerInstance: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock implementations
    mockConfig.loadServerMappings.mockReturnValue(
      new Map([
        ['server0', 'http://localhost:4111'],
        ['server1', 'http://localhost:4222'],
      ]),
    )

    mockConfig.getRetryConfig.mockReturnValue({
      discovery: { retries: 1, backoffMs: 100, maxBackoffMs: 500 },
      listing: { retries: 2, backoffMs: 100, maxBackoffMs: 1000 },
      interaction: { retries: 3, backoffMs: 300, maxBackoffMs: 5000 },
    })

    mockConfig.logger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      forceError: vi.fn(),
    }

    // Mock PluginManager instance
    mockPluginManagerInstance = {
      getAgents: vi.fn(),
      callAgent: vi.fn(),
      getPlugin: vi.fn(),
    }

    mockPluginManager.mockImplementation(() => mockPluginManagerInstance)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('tool configuration', () => {
    it('should have correct tool configuration', () => {
      expect(callAgent.id).toBe('callAgent')
      expect(callAgent.description).toContain(
        'Proxies requests to a target Mastra agent',
      )
      expect(callAgent.description).toContain('AUTONOMOUS BEHAVIOR')
      expect(callAgent.inputSchema).toBeDefined()
      expect(callAgent.outputSchema).toBeDefined()
    })

    it('should validate input schema with custom error messages', () => {
      // Test the custom errorMap for interactionType
      const invalidInput = {
        targetAgentId: 'testAgent',
        interactionType: 'invalid',
        messages: [{ role: 'user', content: 'Hello' }],
      }

      const result = callAgent.inputSchema.safeParse(invalidInput)
      expect(result.success).toBe(false)
      if (!result.success) {
        const interactionTypeError = result.error.issues.find((issue) =>
          issue.path.includes('interactionType'),
        )
        expect(interactionTypeError?.message).toBe(
          "interactionType must be 'generate' or 'stream'.",
        )
      }
    })
  })

  describe('agent resolution', () => {
    it('should handle fully qualified agent ID (server:agentId)', async () => {
      const mockResponse = { result: 'test response' }

      mockPluginManagerInstance.callAgent.mockResolvedValue(mockResponse)
      mockPluginManagerInstance.getPlugin.mockResolvedValue({
        serverType: 'mastra',
      })

      const input: CallAgentInput = {
        targetAgentId: 'server0:testAgent',
        interactionType: 'generate',
        messages: [{ role: 'user', content: 'Hello' }],
      }

      const mockContext = {
        context: input,
      }

      const result = (await callAgent.execute(
        mockContext as any,
      )) as CallAgentOutput

      expect(result.success).toBe(true)
      expect(result.agentIdUsed).toBe('testAgent')
      expect(result.fullyQualifiedId).toBe('server0:testAgent')
      expect(result.resolutionMethod).toBe('explicit_qualification')
      expect(result.serverUsed).toBe('http://localhost:4111')
      expect(result.serverType).toBe('mastra')
      expect(mockPluginManagerInstance.callAgent).toHaveBeenCalledWith(
        'http://localhost:4111',
        {
          agentId: 'testAgent',
          interactionType: 'generate',
          messages: input.messages,
          threadId: undefined,
          resourceId: undefined,
          agentOptions: undefined,
        },
        expect.any(Object),
      )
    })

    it('should handle explicit server URL override', async () => {
      const mockResponse = { result: 'test response' }

      mockPluginManagerInstance.callAgent.mockResolvedValue(mockResponse)
      mockPluginManagerInstance.getPlugin.mockResolvedValue({
        serverType: 'langgraph',
      })

      const input: CallAgentInput = {
        targetAgentId: 'testAgent',
        interactionType: 'generate',
        messages: [{ role: 'user', content: 'Hello' }],
        serverUrl: 'http://custom.server.com',
      }

      const mockContext = {
        context: input,
      }

      const result = (await callAgent.execute(
        mockContext as any,
      )) as CallAgentOutput

      expect(result.success).toBe(true)
      expect(result.agentIdUsed).toBe('testAgent')
      expect(result.resolutionMethod).toBe('explicit_url_override')
      expect(result.serverUsed).toBe('http://custom.server.com')
      expect(result.serverType).toBe('langgraph')
    })

    it('should handle unique auto-resolution when agent found on one server', async () => {
      // Mock agent discovery - agent found only on server1
      mockPluginManagerInstance.getAgents
        .mockResolvedValueOnce([{ id: 'otherAgent', name: 'Other Agent' }]) // server0
        .mockResolvedValueOnce([{ id: 'testAgent', name: 'Test Agent' }]) // server1

      const mockResponse = { result: 'test response' }
      mockPluginManagerInstance.callAgent.mockResolvedValue(mockResponse)
      mockPluginManagerInstance.getPlugin.mockResolvedValue({
        serverType: 'mastra',
      })

      const input: CallAgentInput = {
        targetAgentId: 'testAgent',
        interactionType: 'generate',
        messages: [{ role: 'user', content: 'Hello' }],
      }

      const mockContext = {
        context: input,
      }

      const result = (await callAgent.execute(
        mockContext as any,
      )) as CallAgentOutput

      expect(result.success).toBe(true)
      expect(result.agentIdUsed).toBe('testAgent')
      expect(result.fullyQualifiedId).toBe('server1:testAgent')
      expect(result.resolutionMethod).toBe('unique_auto_resolution')
      expect(result.serverUsed).toBe('http://localhost:4222')
    })

    it('should handle conflict resolution using default server (server0)', async () => {
      // Mock agent discovery - agent found on both servers
      mockPluginManagerInstance.getAgents
        .mockResolvedValueOnce([
          { id: 'testAgent', name: 'Test Agent on Server 0' },
        ]) // server0
        .mockResolvedValueOnce([
          { id: 'testAgent', name: 'Test Agent on Server 1' },
        ]) // server1

      const mockResponse = { result: 'test response' }
      mockPluginManagerInstance.callAgent.mockResolvedValue(mockResponse)
      mockPluginManagerInstance.getPlugin.mockResolvedValue({
        serverType: 'mastra',
      })

      const input: CallAgentInput = {
        targetAgentId: 'testAgent',
        interactionType: 'generate',
        messages: [{ role: 'user', content: 'Hello' }],
      }

      const mockContext = {
        context: input,
      }

      const result = (await callAgent.execute(
        mockContext as any,
      )) as CallAgentOutput

      expect(result.success).toBe(true)
      expect(result.agentIdUsed).toBe('testAgent')
      expect(result.fullyQualifiedId).toBe('server0:testAgent')
      expect(result.resolutionMethod).toBe('conflict_default_server')
      expect(result.serverUsed).toBe('http://localhost:4111')
    })

    it('should handle conflict resolution using first available server when default not available', async () => {
      // Mock server mappings without server0
      mockConfig.loadServerMappings.mockReturnValue(
        new Map([
          ['server1', 'http://localhost:4222'],
          ['server2', 'http://localhost:4333'],
        ]),
      )

      // Mock agent discovery - agent found on both servers
      mockPluginManagerInstance.getAgents
        .mockResolvedValueOnce([
          { id: 'testAgent', name: 'Test Agent on Server 1' },
        ]) // server1
        .mockResolvedValueOnce([
          { id: 'testAgent', name: 'Test Agent on Server 2' },
        ]) // server2

      const mockResponse = { result: 'test response' }
      mockPluginManagerInstance.callAgent.mockResolvedValue(mockResponse)
      mockPluginManagerInstance.getPlugin.mockResolvedValue({
        serverType: 'mastra',
      })

      const input: CallAgentInput = {
        targetAgentId: 'testAgent',
        interactionType: 'generate',
        messages: [{ role: 'user', content: 'Hello' }],
      }

      const mockContext = {
        context: input,
      }

      const result = (await callAgent.execute(
        mockContext as any,
      )) as CallAgentOutput

      expect(result.success).toBe(true)
      expect(result.agentIdUsed).toBe('testAgent')
      expect(result.fullyQualifiedId).toBe('server1:testAgent')
      expect(result.resolutionMethod).toBe('conflict_first_available')
      expect(result.serverUsed).toBe('http://localhost:4222')
    })

    it('should throw error when agent not found on any server', async () => {
      // Mock agent discovery - agent not found on any server
      mockPluginManagerInstance.getAgents.mockResolvedValue([
        { id: 'otherAgent', name: 'Other Agent' },
      ])

      const input: CallAgentInput = {
        targetAgentId: 'nonExistentAgent',
        interactionType: 'generate',
        messages: [{ role: 'user', content: 'Hello' }],
      }

      const mockContext = {
        context: input,
      }

      await expect(callAgent.execute(mockContext as any)).rejects.toThrow(
        "Agent 'nonExistentAgent' not found on any configured server",
      )
    })

    it('should throw error for unknown server in fully qualified ID', async () => {
      const input: CallAgentInput = {
        targetAgentId: 'unknownServer:testAgent',
        interactionType: 'generate',
        messages: [{ role: 'user', content: 'Hello' }],
      }

      const mockContext = {
        context: input,
      }

      await expect(callAgent.execute(mockContext as any)).rejects.toThrow(
        "Unknown server 'unknownServer'",
      )
    })

    it('should handle unknown server with serverUrl override', async () => {
      const mockResponse = { result: 'test response' }

      mockPluginManagerInstance.callAgent.mockResolvedValue(mockResponse)
      mockPluginManagerInstance.getPlugin.mockResolvedValue({
        serverType: 'mastra',
      })

      const input: CallAgentInput = {
        targetAgentId: 'unknownServer:testAgent',
        interactionType: 'generate',
        messages: [{ role: 'user', content: 'Hello' }],
        serverUrl: 'http://custom.server.com',
      }

      const mockContext = {
        context: input,
      }

      const result = (await callAgent.execute(
        mockContext as any,
      )) as CallAgentOutput

      expect(result.success).toBe(true)
      expect(result.agentIdUsed).toBe('testAgent')
      expect(result.fullyQualifiedId).toBe('unknownServer:testAgent')
      expect(result.resolutionMethod).toBe('explicit_url_override')
      expect(result.serverUsed).toBe('http://custom.server.com')
    })

    it('should handle plain agent ID with serverUrl that does not match any configured server', async () => {
      const mockResponse = { result: 'test response' }

      mockPluginManagerInstance.callAgent.mockResolvedValue(mockResponse)
      mockPluginManagerInstance.getPlugin.mockResolvedValue({
        serverType: 'mastra',
      })

      // Ensure the serverUrl doesn't match any in the default SERVER_MAP
      const input: CallAgentInput = {
        targetAgentId: 'testAgent',
        interactionType: 'generate',
        messages: [{ role: 'user', content: 'Hello' }],
        serverUrl: 'http://completely-unknown.server.com', // This URL is not in SERVER_MAP
      }

      const mockContext = {
        context: input,
      }

      const result = (await callAgent.execute(
        mockContext as any,
      )) as CallAgentOutput

      expect(result.success).toBe(true)
      expect(result.agentIdUsed).toBe('testAgent')
      expect(result.fullyQualifiedId).toBe('custom:testAgent') // Should use 'custom' fallback
      expect(result.resolutionMethod).toBe('explicit_url_override')
      expect(result.serverUsed).toBe('http://completely-unknown.server.com')
    })
  })

  describe('interaction types', () => {
    it('should handle generate interaction type', async () => {
      const mockResponse = { result: 'Generated response', data: 'test' }

      mockPluginManagerInstance.callAgent.mockResolvedValue(mockResponse)
      mockPluginManagerInstance.getPlugin.mockResolvedValue({
        serverType: 'mastra',
      })

      const input: CallAgentInput = {
        targetAgentId: 'server0:testAgent',
        interactionType: 'generate',
        messages: [{ role: 'user', content: 'Hello' }],
        threadId: 'thread123',
        resourceId: 'resource456',
        agentOptions: { temperature: 0.7 },
      }

      const mockContext = {
        context: input,
      }

      const result = (await callAgent.execute(
        mockContext as any,
      )) as CallAgentOutput

      expect(result.success).toBe(true)
      expect(result.responseData).toEqual(mockResponse)
      expect(result.interactionType).toBe('generate')
      expect(mockPluginManagerInstance.callAgent).toHaveBeenCalledWith(
        'http://localhost:4111',
        {
          agentId: 'testAgent',
          interactionType: 'generate',
          messages: input.messages,
          threadId: 'thread123',
          resourceId: 'resource456',
          agentOptions: { temperature: 0.7 },
        },
        expect.any(Object),
      )
    })

    it('should handle stream interaction type with successful streaming', async () => {
      const mockStreamResponse = {
        chunks: [
          { type: 'text', content: 'Hello ' },
          { type: 'text', content: 'world!' },
          { type: 'data', content: { type: 'metadata', value: 'test' } },
        ],
      }

      mockPluginManagerInstance.callAgent.mockResolvedValue(mockStreamResponse)
      mockPluginManagerInstance.getPlugin.mockResolvedValue({
        serverType: 'mastra',
      })

      const input: CallAgentInput = {
        targetAgentId: 'server0:testAgent',
        interactionType: 'stream',
        messages: [{ role: 'user', content: 'Hello' }],
      }

      const mockContext = {
        context: input,
      }

      const result = (await callAgent.execute(
        mockContext as any,
      )) as CallAgentOutput

      expect(result.success).toBe(true)
      expect(result.responseData).toEqual(mockStreamResponse)
      expect(result.interactionType).toBe('stream')
    })

    it('should handle stream interaction type with error handling', async () => {
      mockPluginManagerInstance.callAgent.mockRejectedValue(
        new Error('Stream error'),
      )
      mockPluginManagerInstance.getPlugin.mockResolvedValue({
        serverType: 'mastra',
      })

      const input: CallAgentInput = {
        targetAgentId: 'server0:testAgent',
        interactionType: 'stream',
        messages: [{ role: 'user', content: 'Hello' }],
      }

      const mockContext = {
        context: input,
      }

      await expect(callAgent.execute(mockContext as any)).rejects.toThrow(
        "Failed to interact with Mastra agent 'server0:testAgent': Stream error",
      )
    })

    it('should handle stream interaction type with streaming failure', async () => {
      mockPluginManagerInstance.callAgent.mockRejectedValue(
        new Error('Streaming failed'),
      )
      mockPluginManagerInstance.getPlugin.mockResolvedValue({
        serverType: 'mastra',
      })

      const input: CallAgentInput = {
        targetAgentId: 'server0:testAgent',
        interactionType: 'stream',
        messages: [{ role: 'user', content: 'Hello' }],
      }

      const mockContext = {
        context: input,
      }

      await expect(callAgent.execute(mockContext as any)).rejects.toThrow(
        "Failed to interact with Mastra agent 'server0:testAgent': Streaming failed",
      )
    })

    it('should throw error for invalid interaction type', async () => {
      // This test should fail at the schema validation level, not reach the plugin manager
      const input = {
        targetAgentId: 'server0:testAgent',
        interactionType: 'invalid',
        messages: [{ role: 'user', content: 'Hello' }],
      }

      // The schema validation should catch this before it reaches the plugin manager
      const parseResult = callAgent.inputSchema.safeParse(input)
      expect(parseResult.success).toBe(false)
    })
  })

  describe('retry configuration', () => {
    it('should use correct retry configuration for interactions', async () => {
      const mockResponse = { result: 'test response' }

      mockPluginManagerInstance.callAgent.mockResolvedValue(mockResponse)
      mockPluginManagerInstance.getPlugin.mockResolvedValue({
        serverType: 'mastra',
      })

      const input: CallAgentInput = {
        targetAgentId: 'server0:testAgent',
        interactionType: 'generate',
        messages: [{ role: 'user', content: 'Hello' }],
      }

      const mockContext = {
        context: input,
      }

      await callAgent.execute(mockContext as any)

      expect(mockPluginManagerInstance.callAgent).toHaveBeenCalledWith(
        'http://localhost:4111',
        expect.any(Object),
        { retries: 3, backoffMs: 300, maxBackoffMs: 5000 },
      )
    })

    it('should use correct retry configuration for discovery', async () => {
      // Mock agent discovery
      mockPluginManagerInstance.getAgents.mockResolvedValue([
        { id: 'testAgent', name: 'Test Agent' },
      ])

      const mockResponse = { result: 'test response' }
      mockPluginManagerInstance.callAgent.mockResolvedValue(mockResponse)
      mockPluginManagerInstance.getPlugin.mockResolvedValue({
        serverType: 'mastra',
      })

      const input: CallAgentInput = {
        targetAgentId: 'testAgent', // Plain agent ID to trigger discovery
        interactionType: 'generate',
        messages: [{ role: 'user', content: 'Hello' }],
      }

      const mockContext = {
        context: input,
      }

      await callAgent.execute(mockContext as any)

      expect(mockPluginManagerInstance.getAgents).toHaveBeenCalledWith(
        expect.any(String),
        { retries: 1, backoffMs: 100, maxBackoffMs: 500 },
      )
    })
  })

  describe('error handling', () => {
    it('should handle agent execution errors', async () => {
      mockPluginManagerInstance.callAgent.mockRejectedValue(
        new Error('Agent execution failed'),
      )
      mockPluginManagerInstance.getPlugin.mockResolvedValue({
        serverType: 'mastra',
      })

      const input: CallAgentInput = {
        targetAgentId: 'server0:testAgent',
        interactionType: 'generate',
        messages: [{ role: 'user', content: 'Hello' }],
      }

      const mockContext = {
        context: input,
      }

      await expect(callAgent.execute(mockContext as any)).rejects.toThrow(
        "Failed to interact with Mastra agent 'server0:testAgent': Agent execution failed",
      )
    })

    it('should handle non-Error exceptions', async () => {
      mockPluginManagerInstance.callAgent.mockRejectedValue('Unknown error')
      mockPluginManagerInstance.getPlugin.mockResolvedValue({
        serverType: 'mastra',
      })

      const input: CallAgentInput = {
        targetAgentId: 'server0:testAgent',
        interactionType: 'generate',
        messages: [{ role: 'user', content: 'Hello' }],
      }

      const mockContext = {
        context: input,
      }

      await expect(callAgent.execute(mockContext as any)).rejects.toThrow(
        "Failed to interact with Mastra agent 'server0:testAgent': Unknown error",
      )
    })
  })

  describe('parameter handling', () => {
    it('should handle optional parameters correctly', async () => {
      const mockResponse = { result: 'test response' }

      mockPluginManagerInstance.callAgent.mockResolvedValue(mockResponse)
      mockPluginManagerInstance.getPlugin.mockResolvedValue({
        serverType: 'mastra',
      })

      const input: CallAgentInput = {
        targetAgentId: 'server0:testAgent',
        interactionType: 'generate',
        messages: [{ role: 'user', content: 'Hello' }],
        threadId: 'thread123',
        resourceId: 'resource456',
      }

      const mockContext = {
        context: input,
      }

      await callAgent.execute(mockContext as any)

      expect(mockPluginManagerInstance.callAgent).toHaveBeenCalledWith(
        'http://localhost:4111',
        {
          agentId: 'testAgent',
          interactionType: 'generate',
          messages: input.messages,
          threadId: 'thread123',
          resourceId: 'resource456',
          agentOptions: undefined,
        },
        expect.any(Object),
      )
    })

    it('should handle all optional parameters', async () => {
      const mockResponse = { result: 'test response' }

      mockPluginManagerInstance.callAgent.mockResolvedValue(mockResponse)
      mockPluginManagerInstance.getPlugin.mockResolvedValue({
        serverType: 'mastra',
      })

      const input: CallAgentInput = {
        targetAgentId: 'server0:testAgent',
        interactionType: 'generate',
        messages: [{ role: 'user', content: 'Hello' }],
        threadId: 'thread123',
        resourceId: 'resource456',
        agentOptions: { temperature: 0.7, maxTokens: 100 },
      }

      const mockContext = {
        context: input,
      }

      await callAgent.execute(mockContext as any)

      expect(mockPluginManagerInstance.callAgent).toHaveBeenCalledWith(
        'http://localhost:4111',
        {
          agentId: 'testAgent',
          interactionType: 'generate',
          messages: input.messages,
          threadId: 'thread123',
          resourceId: 'resource456',
          agentOptions: { temperature: 0.7, maxTokens: 100 },
        },
        expect.any(Object),
      )
    })
  })

  describe('edge cases', () => {
    it('should handle malformed fully qualified ID', async () => {
      const mockResponse = { result: 'test response' }

      mockPluginManagerInstance.callAgent.mockResolvedValue(mockResponse)
      mockPluginManagerInstance.getPlugin.mockResolvedValue({
        serverType: 'mastra',
      })

      const input: CallAgentInput = {
        targetAgentId: 'server0:agent:extra:parts',
        interactionType: 'generate',
        messages: [{ role: 'user', content: 'Hello' }],
      }

      const mockContext = {
        context: input,
      }

      const result = (await callAgent.execute(
        mockContext as any,
      )) as CallAgentOutput

      expect(result.success).toBe(true)
      expect(result.agentIdUsed).toBe('agent:extra:parts') // Everything after first colon
      expect(result.fullyQualifiedId).toBe('server0:agent:extra:parts')
    })

    it('should handle stream interaction with non-Error streaming exception', async () => {
      mockPluginManagerInstance.callAgent.mockRejectedValue('Stream failed')
      mockPluginManagerInstance.getPlugin.mockResolvedValue({
        serverType: 'mastra',
      })

      const input: CallAgentInput = {
        targetAgentId: 'server0:testAgent',
        interactionType: 'stream',
        messages: [{ role: 'user', content: 'Hello' }],
      }

      const mockContext = {
        context: input,
      }

      await expect(callAgent.execute(mockContext as any)).rejects.toThrow(
        "Failed to interact with Mastra agent 'server0:testAgent': Unknown error",
      )
    })
  })
})
