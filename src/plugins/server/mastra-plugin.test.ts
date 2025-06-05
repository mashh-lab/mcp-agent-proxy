import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MastraPlugin } from './mastra-plugin.js'
import type { RetryConfig } from '../base-plugin.js'

// Mock the MastraClient
vi.mock('@mastra/client-js', () => ({
  MastraClient: vi.fn(),
}))

const mockMastraClient = vi.fn()
const { MastraClient } = await import('@mastra/client-js')
vi.mocked(MastraClient).mockImplementation(() => mockMastraClient())

describe('MastraPlugin', () => {
  let plugin: MastraPlugin
  let mockClient: any
  let retryConfig: RetryConfig

  beforeEach(() => {
    vi.clearAllMocks()
    plugin = new MastraPlugin()
    retryConfig = {
      retries: 3,
      backoffMs: 100,
      maxBackoffMs: 1000,
    }

    // Default mock client
    mockClient = {
      getAgents: vi.fn(),
      getAgent: vi.fn(),
    }

    vi.mocked(MastraClient).mockImplementation(() => mockClient)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('serverType', () => {
    it('should have correct server type', () => {
      expect(plugin.serverType).toBe('mastra')
    })
  })

  describe('detectServerType', () => {
    it('should return true for valid Mastra server', async () => {
      mockClient.getAgents.mockResolvedValue({
        agent1: { name: 'Agent 1' },
        agent2: { name: 'Agent 2' },
      })

      const result = await plugin.detectServerType('http://localhost:4111')

      expect(result).toBe(true)
      expect(MastraClient).toHaveBeenCalledWith({
        baseUrl: 'http://localhost:4111',
        retries: 1,
        backoffMs: 100,
        maxBackoffMs: 500,
      })
      expect(mockClient.getAgents).toHaveBeenCalled()
    })

    it('should return false for invalid server', async () => {
      mockClient.getAgents.mockRejectedValue(new Error('Connection failed'))

      const result = await plugin.detectServerType('http://invalid-server.com')

      expect(result).toBe(false)
    })

    it('should return false for non-Mastra server', async () => {
      mockClient.getAgents.mockRejectedValue(new Error('Not found'))

      const result = await plugin.detectServerType('http://non-mastra.com')

      expect(result).toBe(false)
    })

    it('should handle network errors gracefully', async () => {
      mockClient.getAgents.mockRejectedValue(new Error('ECONNREFUSED'))

      const result = await plugin.detectServerType('http://offline-server.com')

      expect(result).toBe(false)
    })

    it('should handle timeout errors', async () => {
      mockClient.getAgents.mockRejectedValue(new Error('ETIMEDOUT'))

      const result = await plugin.detectServerType('http://slow-server.com')

      expect(result).toBe(false)
    })
  })

  describe('getAgents', () => {
    it('should return agents from Mastra server', async () => {
      const mockAgentsData = {
        agent1: { name: 'Agent One' },
        agent2: { name: 'Agent Two' },
        agent3: { name: 'Agent Three' },
      }

      mockClient.getAgents.mockResolvedValue(mockAgentsData)

      const result = await plugin.getAgents(
        'http://localhost:4111',
        retryConfig,
      )

      expect(result).toHaveLength(3)
      expect(result[0]).toEqual({
        id: 'agent1',
        name: 'Agent One',
        description: undefined,
        fullyQualifiedId: 'localhost:4111:agent1',
      })
      expect(result[1]).toEqual({
        id: 'agent2',
        name: 'Agent Two',
        description: undefined,
        fullyQualifiedId: 'localhost:4111:agent2',
      })
      expect(result[2]).toEqual({
        id: 'agent3',
        name: 'Agent Three',
        description: undefined,
        fullyQualifiedId: 'localhost:4111:agent3',
      })

      expect(MastraClient).toHaveBeenCalledWith({
        baseUrl: 'http://localhost:4111',
        retries: retryConfig.retries,
        backoffMs: retryConfig.backoffMs,
        maxBackoffMs: retryConfig.maxBackoffMs,
      })
    })

    it('should handle agents without names', async () => {
      const mockAgentsData = {
        agent1: {},
        agent2: { name: null },
        agent3: { name: undefined },
      }

      mockClient.getAgents.mockResolvedValue(mockAgentsData)

      const result = await plugin.getAgents(
        'http://localhost:4111',
        retryConfig,
      )

      expect(result).toHaveLength(3)
      expect(result[0]).toEqual({
        id: 'agent1',
        name: 'agent1',
        description: undefined,
        fullyQualifiedId: 'localhost:4111:agent1',
      })
      expect(result[1]).toEqual({
        id: 'agent2',
        name: 'agent2',
        description: undefined,
        fullyQualifiedId: 'localhost:4111:agent2',
      })
      expect(result[2]).toEqual({
        id: 'agent3',
        name: 'agent3',
        description: undefined,
        fullyQualifiedId: 'localhost:4111:agent3',
      })
    })

    it('should handle empty agents response', async () => {
      mockClient.getAgents.mockResolvedValue({})

      const result = await plugin.getAgents(
        'http://localhost:4111',
        retryConfig,
      )

      expect(result).toHaveLength(0)
    })

    it('should handle server errors', async () => {
      mockClient.getAgents.mockRejectedValue(new Error('Server error'))

      await expect(
        plugin.getAgents('http://localhost:4111', retryConfig),
      ).rejects.toThrow('Server error')
    })

    it('should use correct retry configuration', async () => {
      const customRetryConfig: RetryConfig = {
        retries: 5,
        backoffMs: 200,
        maxBackoffMs: 2000,
      }

      mockClient.getAgents.mockResolvedValue({})

      await plugin.getAgents('http://localhost:4111', customRetryConfig)

      expect(MastraClient).toHaveBeenCalledWith({
        baseUrl: 'http://localhost:4111',
        retries: 5,
        backoffMs: 200,
        maxBackoffMs: 2000,
      })
    })

    it('should handle different server URLs', async () => {
      const serverUrls = [
        'http://localhost:4111',
        'https://mastra.example.com',
        'http://192.168.1.100:8080',
      ]

      mockClient.getAgents.mockResolvedValue({ agent1: { name: 'Agent' } })

      for (const serverUrl of serverUrls) {
        await plugin.getAgents(serverUrl, retryConfig)
        expect(MastraClient).toHaveBeenCalledWith(
          expect.objectContaining({
            baseUrl: serverUrl,
          }),
        )
      }
    })
  })

  describe('getAgentDescription', () => {
    it('should return agent description', async () => {
      const mockAgentsData = {
        testAgent: { name: 'Test Agent' },
      }

      mockClient.getAgents.mockResolvedValue(mockAgentsData)

      const result = await plugin.getAgentDescription(
        'http://localhost:4111',
        'testAgent',
        retryConfig,
      )

      expect(result).toEqual({
        id: 'testAgent',
        name: 'Test Agent',
        description: undefined,
        fullyQualifiedId: 'localhost:4111:testAgent',
      })

      expect(MastraClient).toHaveBeenCalledWith({
        baseUrl: 'http://localhost:4111',
        retries: retryConfig.retries,
        backoffMs: retryConfig.backoffMs,
        maxBackoffMs: retryConfig.maxBackoffMs,
      })
    })

    it('should handle agent without name', async () => {
      const mockAgentsData = {
        testAgent: {},
      }

      mockClient.getAgents.mockResolvedValue(mockAgentsData)

      const result = await plugin.getAgentDescription(
        'http://localhost:4111',
        'testAgent',
        retryConfig,
      )

      expect(result).toEqual({
        id: 'testAgent',
        name: 'testAgent',
        description: undefined,
        fullyQualifiedId: 'localhost:4111:testAgent',
      })
    })

    it('should throw error for non-existent agent', async () => {
      const mockAgentsData = {
        otherAgent: { name: 'Other Agent' },
      }

      mockClient.getAgents.mockResolvedValue(mockAgentsData)

      await expect(
        plugin.getAgentDescription(
          'http://localhost:4111',
          'nonExistentAgent',
          retryConfig,
        ),
      ).rejects.toThrow("Agent 'nonExistentAgent' not found")
    })

    it('should handle server errors', async () => {
      mockClient.getAgents.mockRejectedValue(new Error('Server error'))

      await expect(
        plugin.getAgentDescription(
          'http://localhost:4111',
          'testAgent',
          retryConfig,
        ),
      ).rejects.toThrow('Server error')
    })

    it('should handle null agents response', async () => {
      mockClient.getAgents.mockResolvedValue(null)

      await expect(
        plugin.getAgentDescription(
          'http://localhost:4111',
          'testAgent',
          retryConfig,
        ),
      ).rejects.toThrow()
    })
  })

  describe('callAgent', () => {
    let mockAgent: any

    beforeEach(() => {
      mockAgent = {
        generate: vi.fn(),
        stream: vi.fn(),
      }
      mockClient.getAgent.mockReturnValue(mockAgent)
    })

    describe('generate interaction', () => {
      it('should call agent with generate interaction', async () => {
        const mockResponse = { message: 'Hello, world!' }
        mockAgent.generate.mockResolvedValue(mockResponse)

        const params = {
          agentId: 'testAgent',
          interactionType: 'generate' as const,
          messages: [{ role: 'user' as const, content: 'Hello' }],
        }

        const result = await plugin.callAgent(
          'http://localhost:4111',
          params,
          retryConfig,
        )

        expect(result).toEqual(mockResponse)
        expect(mockClient.getAgent).toHaveBeenCalledWith('testAgent')
        expect(mockAgent.generate).toHaveBeenCalledWith({
          messages: params.messages,
        })
      })

      it('should include optional parameters', async () => {
        const mockResponse = { message: 'Hello with options!' }
        mockAgent.generate.mockResolvedValue(mockResponse)

        const params = {
          agentId: 'testAgent',
          interactionType: 'generate' as const,
          messages: [{ role: 'user' as const, content: 'Hello' }],
          threadId: 'thread123',
          resourceId: 'resource456',
          agentOptions: { temperature: 0.7 },
        }

        const result = await plugin.callAgent(
          'http://localhost:4111',
          params,
          retryConfig,
        )

        expect(result).toEqual(mockResponse)
        expect(mockAgent.generate).toHaveBeenCalledWith({
          messages: params.messages,
          threadId: 'thread123',
          resourceId: 'resource456',
          temperature: 0.7,
        })
      })

      it('should handle generate errors', async () => {
        mockAgent.generate.mockRejectedValue(new Error('Generate failed'))

        const params = {
          agentId: 'testAgent',
          interactionType: 'generate' as const,
          messages: [{ role: 'user' as const, content: 'Hello' }],
        }

        await expect(
          plugin.callAgent('http://localhost:4111', params, retryConfig),
        ).rejects.toThrow('Generate failed')
      })
    })

    describe('stream interaction', () => {
      it('should handle successful streaming', async () => {
        const mockStreamResponse = {
          processDataStream: vi.fn(),
        }
        mockAgent.stream.mockResolvedValue(mockStreamResponse)

        // Mock the processDataStream to simulate streaming
        mockStreamResponse.processDataStream.mockImplementation(
          async (handlers: any) => {
            handlers.onTextPart('Hello ')
            handlers.onTextPart('world!')
            handlers.onDataPart({ type: 'metadata', value: 'test' })
          },
        )

        const params = {
          agentId: 'testAgent',
          interactionType: 'stream' as const,
          messages: [{ role: 'user' as const, content: 'Hello' }],
        }

        const result = await plugin.callAgent(
          'http://localhost:4111',
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
            expect.objectContaining({
              content: { type: 'metadata', value: 'test' },
              timestamp: expect.any(String),
              index: 2,
            }),
          ]),
          summary: expect.objectContaining({
            totalChunks: 3,
            startTime: expect.any(String),
            endTime: expect.any(String),
            durationMs: expect.any(Number),
            note: expect.stringContaining('real-time'),
          }),
        })

        expect(mockAgent.stream).toHaveBeenCalledWith({
          messages: params.messages,
        })
      })

      it('should handle streaming with error parts', async () => {
        const mockStreamResponse = {
          processDataStream: vi.fn(),
        }
        mockAgent.stream.mockResolvedValue(mockStreamResponse)

        mockStreamResponse.processDataStream.mockImplementation(
          async (handlers: any) => {
            handlers.onTextPart('Hello')
            handlers.onErrorPart('Something went wrong')
            handlers.onTextPart(' world!')
          },
        )

        const params = {
          agentId: 'testAgent',
          interactionType: 'stream' as const,
          messages: [{ role: 'user' as const, content: 'Hello' }],
        }

        const result = await plugin.callAgent(
          'http://localhost:4111',
          params,
          retryConfig,
        )

        expect(result).toMatchObject({
          type: 'collected_stream',
          chunks: expect.arrayContaining([
            expect.objectContaining({ content: 'Hello' }),
            expect.objectContaining({
              content: { error: 'Something went wrong' },
            }),
            expect.objectContaining({ content: ' world!' }),
          ]),
        })
      })

      it('should handle streaming errors', async () => {
        const mockStreamResponse = {
          processDataStream: vi.fn(),
        }
        mockAgent.stream.mockResolvedValue(mockStreamResponse)

        mockStreamResponse.processDataStream.mockImplementation(
          async (handlers: any) => {
            handlers.onTextPart('Hello')
            throw new Error('Stream processing failed')
          },
        )

        const params = {
          agentId: 'testAgent',
          interactionType: 'stream' as const,
          messages: [{ role: 'user' as const, content: 'Hello' }],
        }

        const result = await plugin.callAgent(
          'http://localhost:4111',
          params,
          retryConfig,
        )

        expect(result).toMatchObject({
          type: 'partial_stream',
          chunks: expect.arrayContaining([
            expect.objectContaining({ content: 'Hello' }),
          ]),
          summary: expect.objectContaining({
            error: 'Stream processing failed',
            note: expect.stringContaining('partially collected'),
          }),
        })
      })

      it('should handle stream creation errors', async () => {
        mockAgent.stream.mockRejectedValue(new Error('Stream creation failed'))

        const params = {
          agentId: 'testAgent',
          interactionType: 'stream' as const,
          messages: [{ role: 'user' as const, content: 'Hello' }],
        }

        const result = await plugin.callAgent(
          'http://localhost:4111',
          params,
          retryConfig,
        )

        expect(result).toMatchObject({
          type: 'partial_stream',
          chunks: [],
          summary: expect.objectContaining({
            error: 'Stream creation failed',
            totalChunks: 0,
          }),
        })
      })

      it('should handle non-Error streaming exceptions', async () => {
        const mockStreamResponse = {
          processDataStream: vi.fn(),
        }
        mockAgent.stream.mockResolvedValue(mockStreamResponse)

        mockStreamResponse.processDataStream.mockImplementation(async () => {
          throw 'String error'
        })

        const params = {
          agentId: 'testAgent',
          interactionType: 'stream' as const,
          messages: [{ role: 'user' as const, content: 'Hello' }],
        }

        const result = await plugin.callAgent(
          'http://localhost:4111',
          params,
          retryConfig,
        )

        expect(result).toMatchObject({
          type: 'partial_stream',
          summary: expect.objectContaining({
            error: 'Unknown streaming error',
          }),
        })
      })

      it('should include optional parameters in stream call', async () => {
        const mockStreamResponse = {
          processDataStream: vi.fn().mockResolvedValue(undefined),
        }
        mockAgent.stream.mockResolvedValue(mockStreamResponse)

        const params = {
          agentId: 'testAgent',
          interactionType: 'stream' as const,
          messages: [{ role: 'user' as const, content: 'Hello' }],
          threadId: 'thread123',
          resourceId: 'resource456',
          agentOptions: { temperature: 0.8 },
        }

        await plugin.callAgent('http://localhost:4111', params, retryConfig)

        expect(mockAgent.stream).toHaveBeenCalledWith({
          messages: params.messages,
          threadId: 'thread123',
          resourceId: 'resource456',
          temperature: 0.8,
        })
      })
    })

    it('should throw error for invalid interaction type', async () => {
      const params = {
        agentId: 'testAgent',
        interactionType: 'invalid' as any,
        messages: [{ role: 'user' as const, content: 'Hello' }],
      }

      await expect(
        plugin.callAgent('http://localhost:4111', params, retryConfig),
      ).rejects.toThrow('Invalid interaction type: invalid')
    })

    it('should use correct retry configuration', async () => {
      const customRetryConfig: RetryConfig = {
        retries: 5,
        backoffMs: 200,
        maxBackoffMs: 2000,
      }

      mockAgent.generate.mockResolvedValue({ message: 'Success' })

      const params = {
        agentId: 'testAgent',
        interactionType: 'generate' as const,
        messages: [{ role: 'user' as const, content: 'Hello' }],
      }

      await plugin.callAgent('http://localhost:4111', params, customRetryConfig)

      expect(MastraClient).toHaveBeenCalledWith({
        baseUrl: 'http://localhost:4111',
        retries: 5,
        backoffMs: 200,
        maxBackoffMs: 2000,
      })
    })
  })

  describe('validateConnection', () => {
    it('should return true for valid connection', async () => {
      mockClient.getAgents.mockResolvedValue({
        agent1: { name: 'Agent 1' },
      })

      const result = await plugin.validateConnection('http://localhost:4111')

      expect(result).toBe(true)
      expect(MastraClient).toHaveBeenCalledWith({
        baseUrl: 'http://localhost:4111',
        retries: 1,
        backoffMs: 100,
        maxBackoffMs: 500,
      })
    })

    it('should return false for invalid connection', async () => {
      mockClient.getAgents.mockRejectedValue(new Error('Connection failed'))

      const result = await plugin.validateConnection(
        'http://invalid-server.com',
      )

      expect(result).toBe(false)
    })

    it('should return false for timeout', async () => {
      mockClient.getAgents.mockRejectedValue(new Error('ETIMEDOUT'))

      const result = await plugin.validateConnection('http://slow-server.com')

      expect(result).toBe(false)
    })

    it('should return false for network errors', async () => {
      mockClient.getAgents.mockRejectedValue(new Error('ECONNREFUSED'))

      const result = await plugin.validateConnection(
        'http://offline-server.com',
      )

      expect(result).toBe(false)
    })
  })

  describe('getServerName helper', () => {
    it('should extract server name from URL', async () => {
      // Test the private method indirectly through getAgents
      mockClient.getAgents.mockResolvedValue({
        agent1: { name: 'Agent 1' },
      })

      const result = await plugin.getAgents(
        'http://example.com:8080',
        retryConfig,
      )

      expect(result[0].fullyQualifiedId).toBe('example.com:8080:agent1')
    })

    it('should handle URLs without port', async () => {
      mockClient.getAgents.mockResolvedValue({
        agent1: { name: 'Agent 1' },
      })

      const result = await plugin.getAgents('http://example.com', retryConfig)

      expect(result[0].fullyQualifiedId).toBe('example.com:80:agent1')
    })

    it('should handle HTTPS URLs', async () => {
      mockClient.getAgents.mockResolvedValue({
        agent1: { name: 'Agent 1' },
      })

      const result = await plugin.getAgents(
        'https://secure.example.com',
        retryConfig,
      )

      expect(result[0].fullyQualifiedId).toBe('secure.example.com:443:agent1')
    })

    it('should handle invalid URLs', async () => {
      mockClient.getAgents.mockResolvedValue({
        agent1: { name: 'Agent 1' },
      })

      const result = await plugin.getAgents('invalid-url', retryConfig)

      expect(result[0].fullyQualifiedId).toBe('unknown:agent1')
    })

    it('should handle localhost URLs', async () => {
      mockClient.getAgents.mockResolvedValue({
        agent1: { name: 'Agent 1' },
      })

      const result = await plugin.getAgents(
        'http://localhost:4111',
        retryConfig,
      )

      expect(result[0].fullyQualifiedId).toBe('localhost:4111:agent1')
    })
  })

  describe('edge cases', () => {
    it('should handle very large agent responses', async () => {
      const largeAgentsData: Record<string, any> = {}
      for (let i = 0; i < 1000; i++) {
        largeAgentsData[`agent${i}`] = { name: `Agent ${i}` }
      }

      mockClient.getAgents.mockResolvedValue(largeAgentsData)

      const result = await plugin.getAgents(
        'http://localhost:4111',
        retryConfig,
      )

      expect(result).toHaveLength(1000)
      expect(result[0].id).toBe('agent0')
      expect(result[999].id).toBe('agent999')
    })

    it('should handle agents with special characters in IDs', async () => {
      const mockAgentsData = {
        'agent-with-dashes': { name: 'Dashed Agent' },
        agent_with_underscores: { name: 'Underscore Agent' },
        'agent.with.dots': { name: 'Dotted Agent' },
        'agent@with@symbols': { name: 'Symbol Agent' },
      }

      mockClient.getAgents.mockResolvedValue(mockAgentsData)

      const result = await plugin.getAgents(
        'http://localhost:4111',
        retryConfig,
      )

      expect(result).toHaveLength(4)
      expect(result.map((a) => a.id)).toEqual([
        'agent-with-dashes',
        'agent_with_underscores',
        'agent.with.dots',
        'agent@with@symbols',
      ])
    })

    it('should handle empty string agent IDs', async () => {
      const mockAgentsData = {
        '': { name: 'Empty ID Agent' },
        ' ': { name: 'Space ID Agent' },
      }

      mockClient.getAgents.mockResolvedValue(mockAgentsData)

      const result = await plugin.getAgents(
        'http://localhost:4111',
        retryConfig,
      )

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('')
      expect(result[1].id).toBe(' ')
    })

    it('should handle null agent data', async () => {
      const mockAgentsData = {
        agent1: null,
        agent2: undefined,
        agent3: { name: 'Valid Agent' },
      }

      mockClient.getAgents.mockResolvedValue(mockAgentsData)

      const result = await plugin.getAgents(
        'http://localhost:4111',
        retryConfig,
      )

      expect(result).toHaveLength(3)
      expect(result[0]).toEqual({
        id: 'agent1',
        name: 'agent1',
        description: undefined,
        fullyQualifiedId: 'localhost:4111:agent1',
      })
      expect(result[1]).toEqual({
        id: 'agent2',
        name: 'agent2',
        description: undefined,
        fullyQualifiedId: 'localhost:4111:agent2',
      })
      expect(result[2]).toEqual({
        id: 'agent3',
        name: 'Valid Agent',
        description: undefined,
        fullyQualifiedId: 'localhost:4111:agent3',
      })
    })
  })
})
