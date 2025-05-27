import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LangGraphPlugin } from './langgraph-plugin.js'
import type { RetryConfig } from './base-plugin.js'

// Mock the LangGraph SDK
vi.mock('@langchain/langgraph-sdk', () => ({
  Client: vi.fn(),
}))

const mockLangGraphClient = vi.fn()
const { Client } = await import('@langchain/langgraph-sdk')
vi.mocked(Client).mockImplementation(() => mockLangGraphClient())

describe('LangGraphPlugin', () => {
  let plugin: LangGraphPlugin
  let mockClient: any
  let retryConfig: RetryConfig

  beforeEach(() => {
    vi.clearAllMocks()
    plugin = new LangGraphPlugin()
    retryConfig = {
      retries: 3,
      backoffMs: 100,
      maxBackoffMs: 1000,
    }

    // Default mock client
    mockClient = {
      assistants: {
        search: vi.fn(),
        get: vi.fn(),
      },
      threads: {
        create: vi.fn(),
        getState: vi.fn(),
      },
      runs: {
        create: vi.fn(),
        get: vi.fn(),
        stream: vi.fn(),
      },
    }

    vi.mocked(Client).mockImplementation(() => mockClient)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('serverType', () => {
    it('should have correct server type', () => {
      expect(plugin.serverType).toBe('langgraph')
    })
  })

  describe('detectServerType', () => {
    it('should return true for valid LangGraph server', async () => {
      mockClient.assistants.search.mockResolvedValue([
        { assistant_id: 'assistant1', name: 'Assistant 1' },
      ])

      const result = await plugin.detectServerType('http://localhost:2024')

      expect(result).toBe(true)
      expect(Client).toHaveBeenCalledWith({ apiUrl: 'http://localhost:2024' })
      expect(mockClient.assistants.search).toHaveBeenCalledWith({ limit: 1 })
    })

    it('should return false for invalid server', async () => {
      mockClient.assistants.search.mockRejectedValue(
        new Error('Connection failed'),
      )

      const result = await plugin.detectServerType('http://invalid-server.com')

      expect(result).toBe(false)
    })

    it('should return false for non-LangGraph server', async () => {
      mockClient.assistants.search.mockRejectedValue(new Error('Not found'))

      const result = await plugin.detectServerType('http://non-langgraph.com')

      expect(result).toBe(false)
    })

    it('should handle network errors gracefully', async () => {
      mockClient.assistants.search.mockRejectedValue(new Error('ECONNREFUSED'))

      const result = await plugin.detectServerType('http://offline-server.com')

      expect(result).toBe(false)
    })

    it('should handle timeout errors', async () => {
      mockClient.assistants.search.mockRejectedValue(new Error('ETIMEDOUT'))

      const result = await plugin.detectServerType('http://slow-server.com')

      expect(result).toBe(false)
    })
  })

  describe('getAgents', () => {
    it('should return assistants from LangGraph server', async () => {
      const mockAssistants = [
        {
          assistant_id: 'assistant1',
          graph_id: 'graph1',
          name: 'Assistant One',
          metadata: { description: 'First assistant' },
        },
        {
          assistant_id: 'assistant2',
          graph_id: 'graph2',
          name: 'Assistant Two',
          metadata: { description: 'Second assistant' },
        },
        {
          assistant_id: 'assistant3',
          graph_id: 'graph3',
          name: 'Assistant Three',
          metadata: {},
        },
      ]

      mockClient.assistants.search.mockResolvedValue(mockAssistants)

      const result = await plugin.getAgents(
        'http://localhost:2024',
        retryConfig,
      )

      expect(result).toHaveLength(3)
      expect(result[0]).toEqual({
        id: 'graph1',
        name: 'Assistant One',
        description: 'First assistant',
        fullyQualifiedId: 'localhost:2024:graph1',
      })
      expect(result[1]).toEqual({
        id: 'graph2',
        name: 'Assistant Two',
        description: 'Second assistant',
        fullyQualifiedId: 'localhost:2024:graph2',
      })
      expect(result[2]).toEqual({
        id: 'graph3',
        name: 'Assistant Three',
        description: undefined,
        fullyQualifiedId: 'localhost:2024:graph3',
      })

      expect(Client).toHaveBeenCalledWith({ apiUrl: 'http://localhost:2024' })
      expect(mockClient.assistants.search).toHaveBeenCalledWith({
        limit: 100,
        offset: 0,
      })
    })

    it('should handle assistants without graph_id', async () => {
      const mockAssistants = [
        {
          assistant_id: 'assistant1',
          name: 'Assistant One',
          metadata: {},
        },
        {
          assistant_id: 'assistant2',
          graph_id: null,
          name: 'Assistant Two',
          metadata: {},
        },
      ]

      mockClient.assistants.search.mockResolvedValue(mockAssistants)

      const result = await plugin.getAgents(
        'http://localhost:2024',
        retryConfig,
      )

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        id: 'assistant1',
        name: 'Assistant One',
        description: undefined,
        fullyQualifiedId: 'localhost:2024:assistant1',
      })
      expect(result[1]).toEqual({
        id: 'assistant2',
        name: 'Assistant Two',
        description: undefined,
        fullyQualifiedId: 'localhost:2024:assistant2',
      })
    })

    it('should handle assistants without names', async () => {
      const mockAssistants = [
        {
          assistant_id: 'assistant1',
          graph_id: 'graph1',
          metadata: {},
        },
        {
          assistant_id: 'assistant2',
          graph_id: 'graph2',
          name: null,
          metadata: {},
        },
      ]

      mockClient.assistants.search.mockResolvedValue(mockAssistants)

      const result = await plugin.getAgents(
        'http://localhost:2024',
        retryConfig,
      )

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        id: 'graph1',
        name: 'graph1',
        description: undefined,
        fullyQualifiedId: 'localhost:2024:graph1',
      })
      expect(result[1]).toEqual({
        id: 'graph2',
        name: 'graph2',
        description: undefined,
        fullyQualifiedId: 'localhost:2024:graph2',
      })
    })

    it('should handle non-string descriptions', async () => {
      const mockAssistants = [
        {
          assistant_id: 'assistant1',
          graph_id: 'graph1',
          name: 'Assistant One',
          metadata: { description: 123 },
        },
        {
          assistant_id: 'assistant2',
          graph_id: 'graph2',
          name: 'Assistant Two',
          metadata: { description: { nested: 'object' } },
        },
        {
          assistant_id: 'assistant3',
          graph_id: 'graph3',
          name: 'Assistant Three',
          metadata: { description: null },
        },
      ]

      mockClient.assistants.search.mockResolvedValue(mockAssistants)

      const result = await plugin.getAgents(
        'http://localhost:2024',
        retryConfig,
      )

      expect(result).toHaveLength(3)
      expect(result[0].description).toBeUndefined()
      expect(result[1].description).toBeUndefined()
      expect(result[2].description).toBeUndefined()
    })

    it('should handle empty assistants response', async () => {
      mockClient.assistants.search.mockResolvedValue([])

      const result = await plugin.getAgents(
        'http://localhost:2024',
        retryConfig,
      )

      expect(result).toHaveLength(0)
    })

    it('should handle server errors', async () => {
      mockClient.assistants.search.mockRejectedValue(new Error('Server error'))

      await expect(
        plugin.getAgents('http://localhost:2024', retryConfig),
      ).rejects.toThrow('Server error')
    })

    it('should handle different server URLs', async () => {
      const serverUrls = [
        'http://localhost:2024',
        'https://langgraph.example.com',
        'http://192.168.1.100:8080',
      ]

      mockClient.assistants.search.mockResolvedValue([
        { assistant_id: 'assistant1', graph_id: 'graph1', name: 'Assistant' },
      ])

      for (const serverUrl of serverUrls) {
        await plugin.getAgents(serverUrl, retryConfig)
        expect(Client).toHaveBeenCalledWith({ apiUrl: serverUrl })
      }
    })
  })

  describe('getAgentDescription', () => {
    beforeEach(() => {
      // Mock findAssistantId helper
      mockClient.assistants.search.mockResolvedValue([
        {
          assistant_id: 'assistant1',
          graph_id: 'testAgent',
          name: 'Test Agent',
          metadata: { description: 'A test agent' },
        },
      ])
    })

    it('should return agent description', async () => {
      mockClient.assistants.get.mockResolvedValue({
        assistant_id: 'assistant1',
        name: 'Test Agent',
        metadata: { description: 'A test agent' },
      })

      const result = await plugin.getAgentDescription(
        'http://localhost:2024',
        'testAgent',
        retryConfig,
      )

      expect(result).toEqual({
        id: 'testAgent',
        name: 'Test Agent',
        description: 'A test agent',
        fullyQualifiedId: 'localhost:2024:testAgent',
      })

      expect(mockClient.assistants.search).toHaveBeenCalled()
      expect(mockClient.assistants.get).toHaveBeenCalledWith('assistant1')
    })

    it('should handle agent without description', async () => {
      mockClient.assistants.get.mockResolvedValue({
        assistant_id: 'assistant1',
        name: 'Test Agent',
        metadata: {},
      })

      const result = await plugin.getAgentDescription(
        'http://localhost:2024',
        'testAgent',
        retryConfig,
      )

      expect(result).toEqual({
        id: 'testAgent',
        name: 'Test Agent',
        description: undefined,
        fullyQualifiedId: 'localhost:2024:testAgent',
      })
    })

    it('should handle agent without name', async () => {
      mockClient.assistants.get.mockResolvedValue({
        assistant_id: 'assistant1',
        metadata: {},
      })

      const result = await plugin.getAgentDescription(
        'http://localhost:2024',
        'testAgent',
        retryConfig,
      )

      expect(result).toEqual({
        id: 'testAgent',
        name: 'testAgent',
        description: undefined,
        fullyQualifiedId: 'localhost:2024:testAgent',
      })
    })

    it('should throw error for non-existent agent', async () => {
      mockClient.assistants.search.mockResolvedValue([
        {
          assistant_id: 'assistant1',
          graph_id: 'otherAgent',
          name: 'Other Agent',
        },
      ])

      await expect(
        plugin.getAgentDescription(
          'http://localhost:2024',
          'nonExistentAgent',
          retryConfig,
        ),
      ).rejects.toThrow(
        "Agent 'nonExistentAgent' not found on LangGraph server",
      )
    })

    it('should handle search by assistant_id', async () => {
      mockClient.assistants.search.mockResolvedValue([
        {
          assistant_id: 'testAgent',
          graph_id: 'graph1',
          name: 'Test Agent',
          metadata: { description: 'A test agent' },
        },
      ])

      mockClient.assistants.get.mockResolvedValue({
        assistant_id: 'testAgent',
        name: 'Test Agent',
        metadata: { description: 'A test agent' },
      })

      const result = await plugin.getAgentDescription(
        'http://localhost:2024',
        'testAgent',
        retryConfig,
      )

      expect(result.id).toBe('testAgent')
      expect(mockClient.assistants.get).toHaveBeenCalledWith('testAgent')
    })

    it('should handle server errors', async () => {
      // Clear the beforeEach mock and set up the error scenario
      mockClient.assistants.search.mockReset()
      mockClient.assistants.search.mockRejectedValue(new Error('Server error'))

      await expect(
        plugin.getAgentDescription(
          'http://localhost:2024',
          'testAgent',
          retryConfig,
        ),
      ).rejects.toThrow('Server error')
    })
  })

  describe('callAgent', () => {
    beforeEach(() => {
      // Mock findAssistantId helper
      mockClient.assistants.search.mockResolvedValue([
        {
          assistant_id: 'assistant1',
          graph_id: 'testAgent',
          name: 'Test Agent',
        },
      ])
    })

    describe('generate interaction', () => {
      it('should call agent with generate interaction', async () => {
        const mockRun = { run_id: 'run123' }
        const mockRunResult = { status: 'success' }
        const mockThreadState = {
          values: {
            messages: [{ type: 'ai', content: 'Hello, world!' }],
          },
        }

        mockClient.runs.create.mockResolvedValue(mockRun)
        mockClient.runs.get.mockResolvedValue(mockRunResult)
        mockClient.threads.getState.mockResolvedValue(mockThreadState)
        mockClient.threads.create.mockResolvedValue({ thread_id: 'thread123' })

        const params = {
          agentId: 'testAgent',
          interactionType: 'generate' as const,
          messages: [{ role: 'user' as const, content: 'Hello' }],
        }

        const result = await plugin.callAgent(
          'http://localhost:2024',
          params,
          retryConfig,
        )

        expect(result).toBe('Hello, world!')
        expect(mockClient.threads.create).toHaveBeenCalled()
        expect(mockClient.runs.create).toHaveBeenCalledWith(
          'thread123',
          'assistant1',
          {
            input: {
              messages: [{ role: 'human', content: 'Hello' }],
            },
          },
        )
      })

      it('should use provided threadId', async () => {
        const mockRun = { run_id: 'run123' }
        const mockRunResult = { status: 'success' }
        const mockThreadState = {
          values: {
            messages: [{ type: 'ai', content: 'Response with thread' }],
          },
        }

        mockClient.runs.create.mockResolvedValue(mockRun)
        mockClient.runs.get.mockResolvedValue(mockRunResult)
        mockClient.threads.getState.mockResolvedValue(mockThreadState)

        const params = {
          agentId: 'testAgent',
          interactionType: 'generate' as const,
          messages: [{ role: 'user' as const, content: 'Hello' }],
          threadId: 'existing-thread',
        }

        const result = await plugin.callAgent(
          'http://localhost:2024',
          params,
          retryConfig,
        )

        expect(result).toBe('Response with thread')
        expect(mockClient.threads.create).not.toHaveBeenCalled()
        expect(mockClient.runs.create).toHaveBeenCalledWith(
          'existing-thread',
          'assistant1',
          expect.any(Object),
        )
      })

      it('should include agent options', async () => {
        const mockRun = { run_id: 'run123' }
        const mockRunResult = { status: 'success' }
        const mockThreadState = {
          values: {
            messages: [{ type: 'ai', content: 'Response with options' }],
          },
        }

        mockClient.runs.create.mockResolvedValue(mockRun)
        mockClient.runs.get.mockResolvedValue(mockRunResult)
        mockClient.threads.getState.mockResolvedValue(mockThreadState)
        mockClient.threads.create.mockResolvedValue({ thread_id: 'thread123' })

        const params = {
          agentId: 'testAgent',
          interactionType: 'generate' as const,
          messages: [{ role: 'user' as const, content: 'Hello' }],
          agentOptions: { temperature: 0.7, maxTokens: 100 },
        }

        await plugin.callAgent('http://localhost:2024', params, retryConfig)

        expect(mockClient.runs.create).toHaveBeenCalledWith(
          'thread123',
          'assistant1',
          {
            input: {
              messages: [{ role: 'human', content: 'Hello' }],
            },
            temperature: 0.7,
            maxTokens: 100,
          },
        )
      })

      it('should convert message roles correctly', async () => {
        const mockRun = { run_id: 'run123' }
        const mockRunResult = { status: 'success' }
        const mockThreadState = {
          values: {
            messages: [{ type: 'ai', content: 'Converted roles' }],
          },
        }

        mockClient.runs.create.mockResolvedValue(mockRun)
        mockClient.runs.get.mockResolvedValue(mockRunResult)
        mockClient.threads.getState.mockResolvedValue(mockThreadState)
        mockClient.threads.create.mockResolvedValue({ thread_id: 'thread123' })

        const params = {
          agentId: 'testAgent',
          interactionType: 'generate' as const,
          messages: [
            { role: 'system' as const, content: 'System message' },
            { role: 'user' as const, content: 'User message' },
            { role: 'assistant' as const, content: 'Assistant message' },
          ],
        }

        await plugin.callAgent('http://localhost:2024', params, retryConfig)

        expect(mockClient.runs.create).toHaveBeenCalledWith(
          'thread123',
          'assistant1',
          {
            input: {
              messages: [
                { role: 'system', content: 'System message' },
                { role: 'human', content: 'User message' },
                { role: 'ai', content: 'Assistant message' },
              ],
            },
          },
        )
      })

      it('should handle thread state with array values', async () => {
        const mockRun = { run_id: 'run123' }
        const mockRunResult = { status: 'success' }
        const mockThreadState = {
          values: [
            { type: 'human', content: 'User message' },
            { type: 'ai', content: 'AI response' },
          ],
        }

        mockClient.runs.create.mockResolvedValue(mockRun)
        mockClient.runs.get.mockResolvedValue(mockRunResult)
        mockClient.threads.getState.mockResolvedValue(mockThreadState)
        mockClient.threads.create.mockResolvedValue({ thread_id: 'thread123' })

        const params = {
          agentId: 'testAgent',
          interactionType: 'generate' as const,
          messages: [{ role: 'user' as const, content: 'Hello' }],
        }

        const result = await plugin.callAgent(
          'http://localhost:2024',
          params,
          retryConfig,
        )

        expect(result).toBe('AI response')
      })

      it('should handle run errors', async () => {
        const mockRun = { run_id: 'run123' }
        const mockRunResult = { status: 'error', error: 'Run failed' }

        mockClient.runs.create.mockResolvedValue(mockRun)
        mockClient.runs.get.mockResolvedValue(mockRunResult)
        mockClient.threads.create.mockResolvedValue({ thread_id: 'thread123' })

        const params = {
          agentId: 'testAgent',
          interactionType: 'generate' as const,
          messages: [{ role: 'user' as const, content: 'Hello' }],
        }

        await expect(
          plugin.callAgent('http://localhost:2024', params, retryConfig),
        ).rejects.toThrow('Run failed: Run failed')
      })

      it('should handle timeout', async () => {
        const mockRun = { run_id: 'run123' }
        const mockRunResult = { status: 'pending' }

        mockClient.runs.create.mockResolvedValue(mockRun)
        // Mock runs.get to return pending status for all 30 attempts
        let callCount = 0
        mockClient.runs.get.mockImplementation(() => {
          callCount++
          return Promise.resolve(mockRunResult)
        })
        mockClient.threads.create.mockResolvedValue({ thread_id: 'thread123' })

        // Mock setTimeout to resolve immediately to speed up the test
        const originalSetTimeout = setTimeout
        global.setTimeout = ((callback: () => void) => {
          setImmediate(callback)
          return 1 as any
        }) as any

        const params = {
          agentId: 'testAgent',
          interactionType: 'generate' as const,
          messages: [{ role: 'user' as const, content: 'Hello' }],
        }

        await expect(
          plugin.callAgent('http://localhost:2024', params, retryConfig),
        ).rejects.toThrow('Timeout waiting for response')

        // Verify it tried the maximum number of attempts
        expect(callCount).toBe(30)

        // Restore original setTimeout
        global.setTimeout = originalSetTimeout
      })

      it('should handle no response content', async () => {
        const mockRun = { run_id: 'run123' }
        const mockRunResult = { status: 'success' }
        const mockThreadState = {
          values: {
            messages: [{ type: 'human', content: 'User message' }],
          },
        }

        mockClient.runs.create.mockResolvedValue(mockRun)
        mockClient.runs.get.mockResolvedValue(mockRunResult)
        mockClient.threads.getState.mockResolvedValue(mockThreadState)
        mockClient.threads.create.mockResolvedValue({ thread_id: 'thread123' })

        const params = {
          agentId: 'testAgent',
          interactionType: 'generate' as const,
          messages: [{ role: 'user' as const, content: 'Hello' }],
        }

        const result = await plugin.callAgent(
          'http://localhost:2024',
          params,
          retryConfig,
        )

        expect(result).toBe('No response content found')
      })
    })

    describe('stream interaction', () => {
      it('should handle successful streaming', async () => {
        const mockStream = {
          async *[Symbol.asyncIterator]() {
            yield {
              event: 'values',
              data: {
                messages: [{ type: 'ai', content: 'Hello ' }],
              },
            }
            yield {
              event: 'values',
              data: {
                messages: [{ type: 'ai', content: 'Hello world!' }],
              },
            }
          },
        }

        mockClient.runs.stream.mockReturnValue(mockStream)
        mockClient.threads.create.mockResolvedValue({ thread_id: 'thread123' })

        const params = {
          agentId: 'testAgent',
          interactionType: 'stream' as const,
          messages: [{ role: 'user' as const, content: 'Hello' }],
        }

        const result = await plugin.callAgent(
          'http://localhost:2024',
          params,
          retryConfig,
        )

        expect(result).toMatchObject({
          type: 'collected_stream',
          chunks: expect.arrayContaining([
            expect.objectContaining({
              content: 'Hello ',
              timestamp: expect.any(String),
              index: 0,
            }),
            expect.objectContaining({
              content: 'world!',
              timestamp: expect.any(String),
              index: 1,
            }),
          ]),
          summary: expect.objectContaining({
            totalChunks: 2,
            startTime: expect.any(String),
            endTime: expect.any(String),
            durationMs: expect.any(Number),
            note: expect.stringContaining('real-time'),
          }),
        })

        expect(mockClient.runs.stream).toHaveBeenCalledWith(
          'thread123',
          'assistant1',
          {
            input: {
              messages: [{ role: 'human', content: 'Hello' }],
            },
            streamMode: 'values',
          },
        )
      })

      it('should handle streaming with array data', async () => {
        const mockStream = {
          async *[Symbol.asyncIterator]() {
            yield {
              event: 'values',
              data: [{ type: 'ai', content: 'Streaming response' }],
            }
          },
        }

        mockClient.runs.stream.mockReturnValue(mockStream)
        mockClient.threads.create.mockResolvedValue({ thread_id: 'thread123' })

        const params = {
          agentId: 'testAgent',
          interactionType: 'stream' as const,
          messages: [{ role: 'user' as const, content: 'Hello' }],
        }

        const result = await plugin.callAgent(
          'http://localhost:2024',
          params,
          retryConfig,
        )

        expect(result).toMatchObject({
          type: 'collected_stream',
          chunks: expect.arrayContaining([
            expect.objectContaining({
              content: 'Streaming response',
            }),
          ]),
        })
      })

      it('should handle streaming errors', async () => {
        const mockStream = {
          async *[Symbol.asyncIterator]() {
            yield {
              event: 'values',
              data: {
                messages: [{ type: 'ai', content: 'Hello' }],
              },
            }
            throw new Error('Stream error')
          },
        }

        mockClient.runs.stream.mockReturnValue(mockStream)
        mockClient.threads.create.mockResolvedValue({ thread_id: 'thread123' })

        const params = {
          agentId: 'testAgent',
          interactionType: 'stream' as const,
          messages: [{ role: 'user' as const, content: 'Hello' }],
        }

        const result = await plugin.callAgent(
          'http://localhost:2024',
          params,
          retryConfig,
        )

        expect(result).toMatchObject({
          type: 'partial_stream',
          chunks: expect.arrayContaining([
            expect.objectContaining({ content: 'Hello' }),
          ]),
          summary: expect.objectContaining({
            error: 'Stream error',
            note: expect.stringContaining('partially collected'),
          }),
        })
      })

      it('should include agent options in stream call', async () => {
        const mockStream = {
          async *[Symbol.asyncIterator]() {
            yield {
              event: 'values',
              data: {
                messages: [{ type: 'ai', content: 'Streaming with options' }],
              },
            }
          },
        }

        mockClient.runs.stream.mockReturnValue(mockStream)
        mockClient.threads.create.mockResolvedValue({ thread_id: 'thread123' })

        const params = {
          agentId: 'testAgent',
          interactionType: 'stream' as const,
          messages: [{ role: 'user' as const, content: 'Hello' }],
          agentOptions: { temperature: 0.8 },
        }

        await plugin.callAgent('http://localhost:2024', params, retryConfig)

        expect(mockClient.runs.stream).toHaveBeenCalledWith(
          'thread123',
          'assistant1',
          {
            input: {
              messages: [{ role: 'human', content: 'Hello' }],
            },
            streamMode: 'values',
            temperature: 0.8,
          },
        )
      })
    })

    it('should throw error for invalid interaction type', async () => {
      // Mock the assistant search to avoid the thread creation issue
      mockClient.assistants.search.mockResolvedValue([
        {
          assistant_id: 'assistant1',
          graph_id: 'testAgent',
          name: 'Test Agent',
        },
      ])

      const params = {
        agentId: 'testAgent',
        interactionType: 'invalid' as any,
        messages: [{ role: 'user' as const, content: 'Hello' }],
      }

      await expect(
        plugin.callAgent('http://localhost:2024', params, retryConfig),
      ).rejects.toThrow('Invalid interaction type: invalid')
    })

    it('should throw error for non-existent agent', async () => {
      mockClient.assistants.search.mockResolvedValue([])

      const params = {
        agentId: 'nonExistentAgent',
        interactionType: 'generate' as const,
        messages: [{ role: 'user' as const, content: 'Hello' }],
      }

      await expect(
        plugin.callAgent('http://localhost:2024', params, retryConfig),
      ).rejects.toThrow(
        "Agent 'nonExistentAgent' not found on LangGraph server",
      )
    })
  })

  describe('validateConnection', () => {
    it('should return true for valid connection', async () => {
      mockClient.assistants.search.mockResolvedValue([
        { assistant_id: 'assistant1', name: 'Assistant 1' },
      ])

      const result = await plugin.validateConnection('http://localhost:2024')

      expect(result).toBe(true)
      expect(Client).toHaveBeenCalledWith({ apiUrl: 'http://localhost:2024' })
      expect(mockClient.assistants.search).toHaveBeenCalledWith({ limit: 1 })
    })

    it('should return false for invalid connection', async () => {
      mockClient.assistants.search.mockRejectedValue(
        new Error('Connection failed'),
      )

      const result = await plugin.validateConnection(
        'http://invalid-server.com',
      )

      expect(result).toBe(false)
    })

    it('should return false for timeout', async () => {
      mockClient.assistants.search.mockRejectedValue(new Error('ETIMEDOUT'))

      const result = await plugin.validateConnection('http://slow-server.com')

      expect(result).toBe(false)
    })

    it('should return false for network errors', async () => {
      mockClient.assistants.search.mockRejectedValue(new Error('ECONNREFUSED'))

      const result = await plugin.validateConnection(
        'http://offline-server.com',
      )

      expect(result).toBe(false)
    })
  })

  describe('findAssistantId helper', () => {
    it('should find assistant by graph_id', async () => {
      mockClient.assistants.search.mockResolvedValue([
        {
          assistant_id: 'assistant1',
          graph_id: 'targetAgent',
          name: 'Target Agent',
        },
        {
          assistant_id: 'assistant2',
          graph_id: 'otherAgent',
          name: 'Other Agent',
        },
      ])

      mockClient.assistants.get.mockResolvedValue({
        assistant_id: 'assistant1',
        name: 'Target Agent',
        metadata: { description: 'A target agent' },
      })

      // Test indirectly through getAgentDescription
      const result = await plugin.getAgentDescription(
        'http://localhost:2024',
        'targetAgent',
        retryConfig,
      )

      expect(result.id).toBe('targetAgent')
      expect(mockClient.assistants.get).toHaveBeenCalledWith('assistant1')
    })

    it('should find assistant by assistant_id', async () => {
      mockClient.assistants.search.mockResolvedValue([
        {
          assistant_id: 'targetAgent',
          graph_id: 'graph1',
          name: 'Target Agent',
        },
      ])

      mockClient.assistants.get.mockResolvedValue({
        assistant_id: 'targetAgent',
        name: 'Target Agent',
        metadata: { description: 'A target agent' },
      })

      // Test indirectly through getAgentDescription
      const result = await plugin.getAgentDescription(
        'http://localhost:2024',
        'targetAgent',
        retryConfig,
      )

      expect(result.id).toBe('targetAgent')
      expect(mockClient.assistants.get).toHaveBeenCalledWith('targetAgent')
    })

    it('should return null for non-existent agent', async () => {
      mockClient.assistants.search.mockResolvedValue([
        {
          assistant_id: 'assistant1',
          graph_id: 'otherAgent',
          name: 'Other Agent',
        },
      ])

      await expect(
        plugin.getAgentDescription(
          'http://localhost:2024',
          'nonExistentAgent',
          retryConfig,
        ),
      ).rejects.toThrow(
        "Agent 'nonExistentAgent' not found on LangGraph server",
      )
    })

    it('should handle search errors', async () => {
      // Clear the beforeEach mock and set up the error scenario
      mockClient.assistants.search.mockReset()
      mockClient.assistants.search.mockRejectedValue(new Error('Search failed'))

      await expect(
        plugin.getAgentDescription(
          'http://localhost:2024',
          'testAgent',
          retryConfig,
        ),
      ).rejects.toThrow('Search failed')
    })
  })

  describe('getServerName helper', () => {
    it('should extract server name from URL', async () => {
      mockClient.assistants.search.mockResolvedValue([
        {
          assistant_id: 'assistant1',
          graph_id: 'agent1',
          name: 'Agent 1',
        },
      ])

      const result = await plugin.getAgents(
        'http://example.com:8080',
        retryConfig,
      )

      expect(result[0].fullyQualifiedId).toBe('example.com:8080:agent1')
    })

    it('should handle URLs without port', async () => {
      mockClient.assistants.search.mockResolvedValue([
        {
          assistant_id: 'assistant1',
          graph_id: 'agent1',
          name: 'Agent 1',
        },
      ])

      const result = await plugin.getAgents('http://example.com', retryConfig)

      expect(result[0].fullyQualifiedId).toBe('example.com:80:agent1')
    })

    it('should handle HTTPS URLs', async () => {
      mockClient.assistants.search.mockResolvedValue([
        {
          assistant_id: 'assistant1',
          graph_id: 'agent1',
          name: 'Agent 1',
        },
      ])

      const result = await plugin.getAgents(
        'https://secure.example.com',
        retryConfig,
      )

      expect(result[0].fullyQualifiedId).toBe('secure.example.com:80:agent1')
    })

    it('should handle invalid URLs', async () => {
      mockClient.assistants.search.mockResolvedValue([
        {
          assistant_id: 'assistant1',
          graph_id: 'agent1',
          name: 'Agent 1',
        },
      ])

      const result = await plugin.getAgents('invalid-url', retryConfig)

      expect(result[0].fullyQualifiedId).toBe('unknown:agent1')
    })
  })

  describe('edge cases', () => {
    it('should handle very large assistant responses', async () => {
      const largeAssistants: any[] = []
      for (let i = 0; i < 1000; i++) {
        largeAssistants.push({
          assistant_id: `assistant${i}`,
          graph_id: `graph${i}`,
          name: `Assistant ${i}`,
        })
      }

      mockClient.assistants.search.mockResolvedValue(largeAssistants)

      const result = await plugin.getAgents(
        'http://localhost:2024',
        retryConfig,
      )

      expect(result).toHaveLength(1000)
      expect(result[0].id).toBe('graph0')
      expect(result[999].id).toBe('graph999')
    })

    it('should handle assistants with special characters in IDs', async () => {
      const mockAssistants = [
        {
          assistant_id: 'assistant-with-dashes',
          graph_id: 'graph-with-dashes',
          name: 'Dashed Assistant',
        },
        {
          assistant_id: 'assistant_with_underscores',
          graph_id: 'graph_with_underscores',
          name: 'Underscore Assistant',
        },
        {
          assistant_id: 'assistant.with.dots',
          graph_id: 'graph.with.dots',
          name: 'Dotted Assistant',
        },
      ]

      mockClient.assistants.search.mockResolvedValue(mockAssistants)

      const result = await plugin.getAgents(
        'http://localhost:2024',
        retryConfig,
      )

      expect(result).toHaveLength(3)
      expect(result.map((a) => a.id)).toEqual([
        'graph-with-dashes',
        'graph_with_underscores',
        'graph.with.dots',
      ])
    })

    it('should handle null assistant data', async () => {
      const mockAssistants = [
        null,
        {
          assistant_id: 'assistant1',
          graph_id: 'graph1',
          name: 'Valid Assistant',
        },
        undefined,
      ]

      mockClient.assistants.search.mockResolvedValue(mockAssistants)

      // This should not crash, but may produce unexpected results
      // The actual behavior depends on how the LangGraph SDK handles null/undefined items
      await expect(
        plugin.getAgents('http://localhost:2024', retryConfig),
      ).resolves.toBeDefined()
    })

    it('should handle complex metadata structures', async () => {
      const mockAssistants = [
        {
          assistant_id: 'assistant1',
          graph_id: 'graph1',
          name: 'Complex Assistant',
          metadata: {
            description: 'Valid description',
            nested: {
              deep: {
                value: 'should not affect description',
              },
            },
            array: [1, 2, 3],
          },
        },
      ]

      mockClient.assistants.search.mockResolvedValue(mockAssistants)

      const result = await plugin.getAgents(
        'http://localhost:2024',
        retryConfig,
      )

      expect(result[0].description).toBe('Valid description')
    })
  })
})
