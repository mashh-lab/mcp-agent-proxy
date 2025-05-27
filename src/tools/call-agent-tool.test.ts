import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MastraClient } from '@mastra/client-js'
import { callAgent } from './call-agent-tool.js'
import * as config from '../config.js'

// Mock the dependencies
vi.mock('@mastra/client-js')
vi.mock('../config.js')

const mockMastraClient = vi.mocked(MastraClient)
const mockConfig = vi.mocked(config)

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
}

describe('call-agent-tool', () => {
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
      const mockAgent = {
        generate: vi.fn().mockResolvedValue({ result: 'test response' }),
      }

      const mockClient = {
        getAgent: vi.fn().mockReturnValue(mockAgent),
      }

      mockMastraClient.mockReturnValue(mockClient as any)

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
      expect(mockClient.getAgent).toHaveBeenCalledWith('testAgent')
    })

    it('should handle explicit server URL override', async () => {
      const mockAgent = {
        generate: vi.fn().mockResolvedValue({ result: 'test response' }),
      }

      const mockClient = {
        getAgent: vi.fn().mockReturnValue(mockAgent),
      }

      mockMastraClient.mockReturnValue(mockClient as any)

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
    })

    it('should handle unique auto-resolution when agent found on one server', async () => {
      // Mock agent discovery - agent found only on server1
      const mockGetAgents1 = vi.fn().mockResolvedValue({
        otherAgent: { name: 'Other Agent' },
      })

      const mockGetAgents2 = vi.fn().mockResolvedValue({
        testAgent: { name: 'Test Agent' },
      })

      const mockAgent = {
        generate: vi.fn().mockResolvedValue({ result: 'test response' }),
      }

      const mockClient = {
        getAgents: vi.fn(),
        getAgent: vi.fn().mockReturnValue(mockAgent),
      }

      mockMastraClient.mockImplementation((config) => {
        if (config.baseUrl === 'http://localhost:4111') {
          return { ...mockClient, getAgents: mockGetAgents1 } as any
        } else if (config.baseUrl === 'http://localhost:4222') {
          return { ...mockClient, getAgents: mockGetAgents2 } as any
        }
        return mockClient as any
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
      const mockGetAgents1 = vi.fn().mockResolvedValue({
        testAgent: { name: 'Test Agent on Server 0' },
      })

      const mockGetAgents2 = vi.fn().mockResolvedValue({
        testAgent: { name: 'Test Agent on Server 1' },
      })

      const mockAgent = {
        generate: vi.fn().mockResolvedValue({ result: 'test response' }),
      }

      const mockClient = {
        getAgents: vi.fn(),
        getAgent: vi.fn().mockReturnValue(mockAgent),
      }

      mockMastraClient.mockImplementation((config) => {
        if (config.baseUrl === 'http://localhost:4111') {
          return { ...mockClient, getAgents: mockGetAgents1 } as any
        } else if (config.baseUrl === 'http://localhost:4222') {
          return { ...mockClient, getAgents: mockGetAgents2 } as any
        }
        return mockClient as any
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
      const mockGetAgents1 = vi.fn().mockResolvedValue({
        testAgent: { name: 'Test Agent on Server 1' },
      })

      const mockGetAgents2 = vi.fn().mockResolvedValue({
        testAgent: { name: 'Test Agent on Server 2' },
      })

      const mockAgent = {
        generate: vi.fn().mockResolvedValue({ result: 'test response' }),
      }

      const mockClient = {
        getAgents: vi.fn(),
        getAgent: vi.fn().mockReturnValue(mockAgent),
      }

      mockMastraClient.mockImplementation((config) => {
        if (config.baseUrl === 'http://localhost:4222') {
          return { ...mockClient, getAgents: mockGetAgents1 } as any
        } else if (config.baseUrl === 'http://localhost:4333') {
          return { ...mockClient, getAgents: mockGetAgents2 } as any
        }
        return mockClient as any
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
      const mockGetAgents = vi.fn().mockResolvedValue({
        otherAgent: { name: 'Other Agent' },
      })

      mockMastraClient.mockImplementation(
        () =>
          ({
            getAgents: mockGetAgents,
          }) as any,
      )

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
      const mockAgent = {
        generate: vi.fn().mockResolvedValue({ result: 'test response' }),
      }

      const mockClient = {
        getAgent: vi.fn().mockReturnValue(mockAgent),
      }

      mockMastraClient.mockReturnValue(mockClient as any)

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
      const mockAgent = {
        generate: vi.fn().mockResolvedValue({ result: 'test response' }),
      }

      const mockClient = {
        getAgent: vi.fn().mockReturnValue(mockAgent),
      }

      mockMastraClient.mockReturnValue(mockClient as any)

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
      const mockAgent = {
        generate: vi.fn().mockResolvedValue(mockResponse),
      }

      const mockClient = {
        getAgent: vi.fn().mockReturnValue(mockAgent),
      }

      mockMastraClient.mockReturnValue(mockClient as any)

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
      expect(mockAgent.generate).toHaveBeenCalledWith({
        messages: input.messages,
        threadId: 'thread123',
        resourceId: 'resource456',
        temperature: 0.7,
      })
    })

    it('should handle stream interaction type with successful streaming', async () => {
      const mockStreamResponse = {
        processDataStream: vi
          .fn()
          .mockImplementation(async ({ onTextPart, onDataPart }) => {
            // Simulate streaming chunks
            onTextPart('Hello ')
            onTextPart('world!')
            onDataPart({ type: 'metadata', value: 'test' })
          }),
      }

      const mockAgent = {
        stream: vi.fn().mockResolvedValue(mockStreamResponse),
      }

      const mockClient = {
        getAgent: vi.fn().mockReturnValue(mockAgent),
      }

      mockMastraClient.mockReturnValue(mockClient as any)

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
      expect(result.interactionType).toBe('stream')
      expect(result.responseData.type).toBe('collected_stream')
      expect(result.responseData.chunks).toHaveLength(3)
      expect(result.responseData.chunks[0]).toMatchObject({
        content: 'Hello ',
        index: 0,
        timestamp: expect.any(String),
      })
      expect(result.responseData.chunks[1]).toMatchObject({
        content: 'world!',
        index: 1,
        timestamp: expect.any(String),
      })
      expect(result.responseData.chunks[2]).toMatchObject({
        content: { type: 'metadata', value: 'test' },
        index: 2,
        timestamp: expect.any(String),
      })
      expect(result.responseData.summary).toMatchObject({
        totalChunks: 3,
        startTime: expect.any(String),
        endTime: expect.any(String),
        durationMs: expect.any(Number),
        note: expect.stringContaining('Stream was collected in real-time'),
      })
    })

    it('should handle stream interaction type with error handling', async () => {
      const mockStreamResponse = {
        processDataStream: vi
          .fn()
          .mockImplementation(async ({ onTextPart, onErrorPart }) => {
            // Simulate some chunks then an error
            onTextPart('Hello ')
            onErrorPart('Stream error occurred')
          }),
      }

      const mockAgent = {
        stream: vi.fn().mockResolvedValue(mockStreamResponse),
      }

      const mockClient = {
        getAgent: vi.fn().mockReturnValue(mockAgent),
      }

      mockMastraClient.mockReturnValue(mockClient as any)

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
      expect(result.responseData.type).toBe('collected_stream')
      expect(result.responseData.chunks).toHaveLength(2)
      expect(result.responseData.chunks[1]).toMatchObject({
        content: { error: 'Stream error occurred' },
        index: 1,
        timestamp: expect.any(String),
      })
    })

    it('should handle stream interaction type with streaming failure', async () => {
      const mockStreamResponse = {
        processDataStream: vi
          .fn()
          .mockRejectedValue(new Error('Streaming failed')),
      }

      const mockAgent = {
        stream: vi.fn().mockResolvedValue(mockStreamResponse),
      }

      const mockClient = {
        getAgent: vi.fn().mockReturnValue(mockAgent),
      }

      mockMastraClient.mockReturnValue(mockClient as any)

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
      expect(result.responseData.type).toBe('partial_stream')
      expect(result.responseData.summary.error).toBe('Streaming failed')
      expect(result.responseData.summary.note).toContain(
        'partially collected before encountering an error',
      )
    })

    it('should throw error for invalid interaction type', async () => {
      const mockAgent = {
        generate: vi.fn(),
      }

      const mockClient = {
        getAgent: vi.fn().mockReturnValue(mockAgent),
      }

      mockMastraClient.mockReturnValue(mockClient as any)

      const input = {
        targetAgentId: 'server0:testAgent',
        interactionType: 'invalid' as any,
        messages: [{ role: 'user', content: 'Hello' }],
      }

      const mockContext = {
        context: input,
      }

      await expect(callAgent.execute(mockContext as any)).rejects.toThrow(
        'Invalid interaction type: invalid',
      )
    })
  })

  describe('retry configuration', () => {
    it('should use correct retry configuration for interactions', async () => {
      const customRetryConfig = {
        discovery: { retries: 5, backoffMs: 200, maxBackoffMs: 1000 },
        listing: { retries: 3, backoffMs: 150, maxBackoffMs: 2000 },
        interaction: { retries: 4, backoffMs: 400, maxBackoffMs: 8000 },
      }

      mockConfig.getRetryConfig.mockReturnValue(customRetryConfig)

      const mockAgent = {
        generate: vi.fn().mockResolvedValue({ result: 'test' }),
      }

      const mockClient = {
        getAgent: vi.fn().mockReturnValue(mockAgent),
      }

      mockMastraClient.mockImplementation((clientConfig) => {
        // Verify the retry config is passed correctly for interactions
        expect(clientConfig).toEqual({
          baseUrl: 'http://localhost:4111',
          retries: customRetryConfig.interaction.retries,
          backoffMs: customRetryConfig.interaction.backoffMs,
          maxBackoffMs: customRetryConfig.interaction.maxBackoffMs,
        })
        return mockClient as any
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

      expect(mockMastraClient).toHaveBeenCalledWith({
        baseUrl: 'http://localhost:4111',
        retries: 4,
        backoffMs: 400,
        maxBackoffMs: 8000,
      })
    })

    it('should use correct retry configuration for discovery', async () => {
      const customRetryConfig = {
        discovery: { retries: 5, backoffMs: 200, maxBackoffMs: 1000 },
        listing: { retries: 3, backoffMs: 150, maxBackoffMs: 2000 },
        interaction: { retries: 4, backoffMs: 400, maxBackoffMs: 8000 },
      }

      mockConfig.getRetryConfig.mockReturnValue(customRetryConfig)

      // Mock agent discovery
      const mockGetAgents = vi.fn().mockResolvedValue({
        testAgent: { name: 'Test Agent' },
      })

      const mockAgent = {
        generate: vi.fn().mockResolvedValue({ result: 'test' }),
      }

      let discoveryCallCount = 0
      let interactionCallCount = 0

      mockMastraClient.mockImplementation((clientConfig) => {
        if (clientConfig.retries === customRetryConfig.discovery.retries) {
          discoveryCallCount++
          return { getAgents: mockGetAgents } as any
        } else if (
          clientConfig.retries === customRetryConfig.interaction.retries
        ) {
          interactionCallCount++
          return { getAgent: vi.fn().mockReturnValue(mockAgent) } as any
        }
        throw new Error('Unexpected config')
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

      expect(discoveryCallCount).toBeGreaterThan(0)
      expect(interactionCallCount).toBeGreaterThan(0)
    })
  })

  describe('error handling', () => {
    it('should handle agent execution errors', async () => {
      const mockAgent = {
        generate: vi
          .fn()
          .mockRejectedValue(new Error('Agent execution failed')),
      }

      const mockClient = {
        getAgent: vi.fn().mockReturnValue(mockAgent),
      }

      mockMastraClient.mockReturnValue(mockClient as any)

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

      expect(mockConfig.logger.error).toHaveBeenCalledWith(
        "Error interacting with Mastra agent 'server0:testAgent':",
        expect.any(Error),
      )
    })

    it('should handle non-Error exceptions', async () => {
      const mockAgent = {
        generate: vi.fn().mockRejectedValue('String error'),
      }

      const mockClient = {
        getAgent: vi.fn().mockReturnValue(mockAgent),
      }

      mockMastraClient.mockReturnValue(mockClient as any)

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

    it('should handle server discovery errors gracefully', async () => {
      // Mock server discovery with some servers failing
      const mockGetAgents1 = vi
        .fn()
        .mockRejectedValue(new Error('Server offline'))
      const mockGetAgents2 = vi.fn().mockResolvedValue({
        testAgent: { name: 'Test Agent' },
      })

      const mockAgent = {
        generate: vi.fn().mockResolvedValue({ result: 'test' }),
      }

      mockMastraClient.mockImplementation((config) => {
        if (config.baseUrl === 'http://localhost:4111') {
          return { getAgents: mockGetAgents1 } as any
        } else if (config.baseUrl === 'http://localhost:4222') {
          return {
            getAgents: mockGetAgents2,
            getAgent: vi.fn().mockReturnValue(mockAgent),
          } as any
        }
        return { getAgent: vi.fn().mockReturnValue(mockAgent) } as any
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
      expect(result.fullyQualifiedId).toBe('server1:testAgent')
      expect(result.resolutionMethod).toBe('unique_auto_resolution')
    })

    it('should handle server returning null agents data during discovery', async () => {
      // Mock server discovery with one server returning null
      const mockGetAgents1 = vi.fn().mockResolvedValue(null) // This should be skipped
      const mockGetAgents2 = vi.fn().mockResolvedValue({
        testAgent: { name: 'Test Agent' },
      })

      const mockAgent = {
        generate: vi.fn().mockResolvedValue({ result: 'test' }),
      }

      mockMastraClient.mockImplementation((config) => {
        if (config.baseUrl === 'http://localhost:4111') {
          return { getAgents: mockGetAgents1 } as any
        } else if (config.baseUrl === 'http://localhost:4222') {
          return {
            getAgents: mockGetAgents2,
            getAgent: vi.fn().mockReturnValue(mockAgent),
          } as any
        }
        return { getAgent: vi.fn().mockReturnValue(mockAgent) } as any
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
      expect(result.fullyQualifiedId).toBe('server1:testAgent')
      expect(result.resolutionMethod).toBe('unique_auto_resolution')
    })
  })

  describe('parameter handling', () => {
    it('should handle optional parameters correctly', async () => {
      const mockAgent = {
        generate: vi.fn().mockResolvedValue({ result: 'test' }),
      }

      const mockClient = {
        getAgent: vi.fn().mockReturnValue(mockAgent),
      }

      mockMastraClient.mockReturnValue(mockClient as any)

      const input: CallAgentInput = {
        targetAgentId: 'server0:testAgent',
        interactionType: 'generate',
        messages: [{ role: 'user', content: 'Hello' }],
        // No optional parameters
      }

      const mockContext = {
        context: input,
      }

      await callAgent.execute(mockContext as any)

      expect(mockAgent.generate).toHaveBeenCalledWith({
        messages: input.messages,
      })
    })

    it('should handle all optional parameters', async () => {
      const mockAgent = {
        generate: vi.fn().mockResolvedValue({ result: 'test' }),
      }

      const mockClient = {
        getAgent: vi.fn().mockReturnValue(mockAgent),
      }

      mockMastraClient.mockReturnValue(mockClient as any)

      const input: CallAgentInput = {
        targetAgentId: 'server0:testAgent',
        interactionType: 'generate',
        messages: [{ role: 'user', content: 'Hello' }],
        threadId: 'thread123',
        resourceId: 'resource456',
        agentOptions: {
          temperature: 0.7,
          maxTokens: 100,
          customParam: 'value',
        },
      }

      const mockContext = {
        context: input,
      }

      await callAgent.execute(mockContext as any)

      expect(mockAgent.generate).toHaveBeenCalledWith({
        messages: input.messages,
        threadId: 'thread123',
        resourceId: 'resource456',
        temperature: 0.7,
        maxTokens: 100,
        customParam: 'value',
      })
    })
  })

  describe('edge cases', () => {
    it('should handle empty server mappings', async () => {
      mockConfig.loadServerMappings.mockReturnValue(new Map())

      const input: CallAgentInput = {
        targetAgentId: 'testAgent',
        interactionType: 'generate',
        messages: [{ role: 'user', content: 'Hello' }],
      }

      const mockContext = {
        context: input,
      }

      await expect(callAgent.execute(mockContext as any)).rejects.toThrow(
        "Agent 'testAgent' not found on any configured server",
      )
    })

    it('should handle malformed fully qualified ID', async () => {
      const input: CallAgentInput = {
        targetAgentId: 'server0:agent:extra:parts',
        interactionType: 'generate',
        messages: [{ role: 'user', content: 'Hello' }],
      }

      const mockContext = {
        context: input,
      }

      // split(':', 2) only returns first 2 elements: ['server0', 'agent']
      const mockAgent = {
        generate: vi.fn().mockResolvedValue({ result: 'test' }),
      }

      const mockClient = {
        getAgent: vi.fn().mockReturnValue(mockAgent),
      }

      mockMastraClient.mockReturnValue(mockClient as any)

      const result = (await callAgent.execute(
        mockContext as any,
      )) as CallAgentOutput

      expect(result.agentIdUsed).toBe('agent')
      expect(result.fullyQualifiedId).toBe('server0:agent:extra:parts')
      expect(mockClient.getAgent).toHaveBeenCalledWith('agent')
    })

    it('should handle stream interaction with non-Error streaming exception', async () => {
      const mockStreamResponse = {
        processDataStream: vi.fn().mockRejectedValue('String streaming error'),
      }

      const mockAgent = {
        stream: vi.fn().mockResolvedValue(mockStreamResponse),
      }

      const mockClient = {
        getAgent: vi.fn().mockReturnValue(mockAgent),
      }

      mockMastraClient.mockReturnValue(mockClient as any)

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
      expect(result.responseData.type).toBe('partial_stream')
      expect(result.responseData.summary.error).toBe('Unknown streaming error')
      expect(result.responseData.summary.note).toContain(
        'partially collected before encountering an error',
      )
    })
  })
})
