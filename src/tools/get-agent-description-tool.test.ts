import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MastraClient } from '@mastra/client-js'
import { getAgentDescription } from './get-agent-description-tool.js'
import * as config from '../config.js'

// Mock the dependencies
vi.mock('@mastra/client-js')
vi.mock('../config.js')

const mockMastraClient = vi.mocked(MastraClient)
const mockConfig = vi.mocked(config)

// Define types for better type safety
type GetAgentDescriptionInput = {
  agentId: string
  serverUrl?: string
}

type GetAgentDescriptionOutput = {
  success: true
  agentId: string
  fullyQualifiedId: string
  serverUsed: string
  serverName: string
  agentDetails: Record<string, any>
  resolutionMethod: string
}

describe('get-agent-description-tool', () => {
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
      expect(getAgentDescription.id).toBe('getAgentDescription')
      expect(getAgentDescription.description).toContain(
        'Gets detailed information about a specific Mastra agent',
      )
      expect(getAgentDescription.description).toContain(
        'agent-to-agent capability information',
      )
      expect(getAgentDescription.inputSchema).toBeDefined()
      expect(getAgentDescription.outputSchema).toBeDefined()
    })
  })

  describe('agent resolution', () => {
    it('should handle fully qualified agent ID (server:agentId)', async () => {
      const mockAgentDetails = {
        name: 'Test Agent',
        instructions: 'This is a test agent for unit testing',
        capabilities: ['text-generation', 'analysis'],
        version: '1.0.0',
      }

      const mockAgent = {
        details: vi.fn().mockResolvedValue(mockAgentDetails),
      }

      const mockClient = {
        getAgent: vi.fn().mockReturnValue(mockAgent),
      }

      mockMastraClient.mockReturnValue(mockClient as any)

      const input: GetAgentDescriptionInput = {
        agentId: 'server0:testAgent',
      }

      const mockContext = {
        context: input,
      }

      const result = (await getAgentDescription.execute(
        mockContext as any,
      )) as GetAgentDescriptionOutput

      expect(result.success).toBe(true)
      expect(result.agentId).toBe('testAgent')
      expect(result.fullyQualifiedId).toBe('server0:testAgent')
      expect(result.serverName).toBe('server0')
      expect(result.resolutionMethod).toBe('explicit_qualification')
      expect(result.serverUsed).toBe('http://localhost:4111')
      expect(result.agentDetails).toEqual(mockAgentDetails)
      expect(mockClient.getAgent).toHaveBeenCalledWith('testAgent')
      expect(mockAgent.details).toHaveBeenCalled()
    })

    it('should handle explicit server URL override', async () => {
      const mockAgentDetails = {
        name: 'Custom Server Agent',
        instructions: 'Agent on custom server',
      }

      const mockAgent = {
        details: vi.fn().mockResolvedValue(mockAgentDetails),
      }

      const mockClient = {
        getAgent: vi.fn().mockReturnValue(mockAgent),
      }

      mockMastraClient.mockReturnValue(mockClient as any)

      const input: GetAgentDescriptionInput = {
        agentId: 'testAgent',
        serverUrl: 'http://custom.server.com',
      }

      const mockContext = {
        context: input,
      }

      const result = (await getAgentDescription.execute(
        mockContext as any,
      )) as GetAgentDescriptionOutput

      expect(result.success).toBe(true)
      expect(result.agentId).toBe('testAgent')
      expect(result.resolutionMethod).toBe('explicit_url_override')
      expect(result.serverUsed).toBe('http://custom.server.com')
      expect(result.serverName).toBe('custom')
      expect(result.fullyQualifiedId).toBe('custom:testAgent')
      expect(result.agentDetails).toEqual(mockAgentDetails)
    })

    it('should handle unique auto-resolution when agent found on one server', async () => {
      // Mock agent discovery - agent found only on server1
      const mockGetAgents1 = vi.fn().mockResolvedValue({
        otherAgent: { name: 'Other Agent' },
      })

      const mockGetAgents2 = vi.fn().mockResolvedValue({
        testAgent: { name: 'Test Agent' },
      })

      const mockAgentDetails = {
        name: 'Test Agent',
        instructions: 'Found via auto-resolution',
      }

      const mockAgent = {
        details: vi.fn().mockResolvedValue(mockAgentDetails),
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

      const input: GetAgentDescriptionInput = {
        agentId: 'testAgent',
      }

      const mockContext = {
        context: input,
      }

      const result = (await getAgentDescription.execute(
        mockContext as any,
      )) as GetAgentDescriptionOutput

      expect(result.success).toBe(true)
      expect(result.agentId).toBe('testAgent')
      expect(result.fullyQualifiedId).toBe('server1:testAgent')
      expect(result.serverName).toBe('server1')
      expect(result.resolutionMethod).toBe('unique_auto_resolution')
      expect(result.serverUsed).toBe('http://localhost:4222')
      expect(result.agentDetails).toEqual(mockAgentDetails)
    })

    it('should handle conflict resolution using default server (server0)', async () => {
      // Mock agent discovery - agent found on both servers
      const mockGetAgents1 = vi.fn().mockResolvedValue({
        testAgent: { name: 'Test Agent on Server 0' },
      })

      const mockGetAgents2 = vi.fn().mockResolvedValue({
        testAgent: { name: 'Test Agent on Server 1' },
      })

      const mockAgentDetails = {
        name: 'Test Agent on Server 0',
        instructions: 'Default server resolution',
      }

      const mockAgent = {
        details: vi.fn().mockResolvedValue(mockAgentDetails),
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

      const input: GetAgentDescriptionInput = {
        agentId: 'testAgent',
      }

      const mockContext = {
        context: input,
      }

      const result = (await getAgentDescription.execute(
        mockContext as any,
      )) as GetAgentDescriptionOutput

      expect(result.success).toBe(true)
      expect(result.agentId).toBe('testAgent')
      expect(result.fullyQualifiedId).toBe('server0:testAgent')
      expect(result.serverName).toBe('server0')
      expect(result.resolutionMethod).toBe('conflict_default_server')
      expect(result.serverUsed).toBe('http://localhost:4111')
      expect(result.agentDetails).toEqual(mockAgentDetails)
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

      const mockAgentDetails = {
        name: 'Test Agent on Server 1',
        instructions: 'First available server resolution',
      }

      const mockAgent = {
        details: vi.fn().mockResolvedValue(mockAgentDetails),
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

      const input: GetAgentDescriptionInput = {
        agentId: 'testAgent',
      }

      const mockContext = {
        context: input,
      }

      const result = (await getAgentDescription.execute(
        mockContext as any,
      )) as GetAgentDescriptionOutput

      expect(result.success).toBe(true)
      expect(result.agentId).toBe('testAgent')
      expect(result.fullyQualifiedId).toBe('server1:testAgent')
      expect(result.serverName).toBe('server1')
      expect(result.resolutionMethod).toBe('conflict_first_available')
      expect(result.serverUsed).toBe('http://localhost:4222')
      expect(result.agentDetails).toEqual(mockAgentDetails)
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

      const input: GetAgentDescriptionInput = {
        agentId: 'nonExistentAgent',
      }

      const mockContext = {
        context: input,
      }

      await expect(
        getAgentDescription.execute(mockContext as any),
      ).rejects.toThrow(
        "Agent 'nonExistentAgent' not found on any configured server",
      )
    })

    it('should throw error for unknown server in fully qualified ID', async () => {
      const input: GetAgentDescriptionInput = {
        agentId: 'unknownServer:testAgent',
      }

      const mockContext = {
        context: input,
      }

      await expect(
        getAgentDescription.execute(mockContext as any),
      ).rejects.toThrow("Unknown server 'unknownServer'")
    })

    it('should handle unknown server with serverUrl override', async () => {
      const mockAgentDetails = {
        name: 'Agent on Unknown Server',
        instructions: 'Using URL override',
      }

      const mockAgent = {
        details: vi.fn().mockResolvedValue(mockAgentDetails),
      }

      const mockClient = {
        getAgent: vi.fn().mockReturnValue(mockAgent),
      }

      mockMastraClient.mockReturnValue(mockClient as any)

      const input: GetAgentDescriptionInput = {
        agentId: 'unknownServer:testAgent',
        serverUrl: 'http://custom.server.com',
      }

      const mockContext = {
        context: input,
      }

      const result = (await getAgentDescription.execute(
        mockContext as any,
      )) as GetAgentDescriptionOutput

      expect(result.success).toBe(true)
      expect(result.agentId).toBe('testAgent')
      expect(result.fullyQualifiedId).toBe('unknownServer:testAgent')
      expect(result.serverName).toBe('unknownServer')
      expect(result.resolutionMethod).toBe('explicit_url_override')
      expect(result.serverUsed).toBe('http://custom.server.com')
      expect(result.agentDetails).toEqual(mockAgentDetails)
    })

    it('should handle server URL override with known server mapping', async () => {
      const mockAgentDetails = {
        name: 'Agent with URL Override',
        instructions: 'Using explicit URL',
      }

      const mockAgent = {
        details: vi.fn().mockResolvedValue(mockAgentDetails),
      }

      const mockClient = {
        getAgent: vi.fn().mockReturnValue(mockAgent),
      }

      mockMastraClient.mockReturnValue(mockClient as any)

      const input: GetAgentDescriptionInput = {
        agentId: 'testAgent',
        serverUrl: 'http://localhost:4111', // This matches server0
      }

      const mockContext = {
        context: input,
      }

      const result = (await getAgentDescription.execute(
        mockContext as any,
      )) as GetAgentDescriptionOutput

      expect(result.success).toBe(true)
      expect(result.agentId).toBe('testAgent')
      expect(result.resolutionMethod).toBe('explicit_url_override')
      expect(result.serverUsed).toBe('http://localhost:4111')
      expect(result.serverName).toBe('server0') // Should find the matching server name
      expect(result.fullyQualifiedId).toBe('server0:testAgent')
      expect(result.agentDetails).toEqual(mockAgentDetails)
    })
  })

  describe('agent details retrieval', () => {
    it('should retrieve comprehensive agent details', async () => {
      const mockAgentDetails = {
        name: 'Comprehensive Agent',
        instructions: 'This agent provides comprehensive functionality',
        capabilities: ['text-generation', 'analysis', 'summarization'],
        version: '2.1.0',
        author: 'Test Team',
        description: 'A fully featured test agent',
        parameters: {
          temperature: 0.7,
          maxTokens: 2048,
        },
        metadata: {
          created: '2024-01-01',
          updated: '2024-01-15',
        },
      }

      const mockAgent = {
        details: vi.fn().mockResolvedValue(mockAgentDetails),
      }

      const mockClient = {
        getAgent: vi.fn().mockReturnValue(mockAgent),
      }

      mockMastraClient.mockReturnValue(mockClient as any)

      const input: GetAgentDescriptionInput = {
        agentId: 'server0:comprehensiveAgent',
      }

      const mockContext = {
        context: input,
      }

      const result = (await getAgentDescription.execute(
        mockContext as any,
      )) as GetAgentDescriptionOutput

      expect(result.success).toBe(true)
      expect(result.agentDetails).toEqual(mockAgentDetails)
      expect(result.agentDetails.name).toBe('Comprehensive Agent')
      expect(result.agentDetails.capabilities).toContain('text-generation')
      expect(result.agentDetails.parameters.temperature).toBe(0.7)
      expect(result.agentDetails.metadata.created).toBe('2024-01-01')
    })

    it('should handle minimal agent details', async () => {
      const mockAgentDetails = {
        name: 'Minimal Agent',
      }

      const mockAgent = {
        details: vi.fn().mockResolvedValue(mockAgentDetails),
      }

      const mockClient = {
        getAgent: vi.fn().mockReturnValue(mockAgent),
      }

      mockMastraClient.mockReturnValue(mockClient as any)

      const input: GetAgentDescriptionInput = {
        agentId: 'server0:minimalAgent',
      }

      const mockContext = {
        context: input,
      }

      const result = (await getAgentDescription.execute(
        mockContext as any,
      )) as GetAgentDescriptionOutput

      expect(result.success).toBe(true)
      expect(result.agentDetails).toEqual(mockAgentDetails)
      expect(result.agentDetails.name).toBe('Minimal Agent')
    })

    it('should handle empty agent details', async () => {
      const mockAgentDetails = {}

      const mockAgent = {
        details: vi.fn().mockResolvedValue(mockAgentDetails),
      }

      const mockClient = {
        getAgent: vi.fn().mockReturnValue(mockAgent),
      }

      mockMastraClient.mockReturnValue(mockClient as any)

      const input: GetAgentDescriptionInput = {
        agentId: 'server0:emptyAgent',
      }

      const mockContext = {
        context: input,
      }

      const result = (await getAgentDescription.execute(
        mockContext as any,
      )) as GetAgentDescriptionOutput

      expect(result.success).toBe(true)
      expect(result.agentDetails).toEqual({})
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
        details: vi.fn().mockResolvedValue({ name: 'Test Agent' }),
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

      const input: GetAgentDescriptionInput = {
        agentId: 'server0:testAgent',
      }

      const mockContext = {
        context: input,
      }

      await getAgentDescription.execute(mockContext as any)

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
        details: vi.fn().mockResolvedValue({ name: 'Test Agent' }),
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

      const input: GetAgentDescriptionInput = {
        agentId: 'testAgent', // Plain agent ID to trigger discovery
      }

      const mockContext = {
        context: input,
      }

      await getAgentDescription.execute(mockContext as any)

      expect(discoveryCallCount).toBeGreaterThan(0)
      expect(interactionCallCount).toBeGreaterThan(0)
    })
  })

  describe('error handling', () => {
    it('should handle agent details retrieval errors', async () => {
      const mockAgent = {
        details: vi
          .fn()
          .mockRejectedValue(new Error('Details retrieval failed')),
      }

      const mockClient = {
        getAgent: vi.fn().mockReturnValue(mockAgent),
      }

      mockMastraClient.mockReturnValue(mockClient as any)

      const input: GetAgentDescriptionInput = {
        agentId: 'server0:testAgent',
      }

      const mockContext = {
        context: input,
      }

      await expect(
        getAgentDescription.execute(mockContext as any),
      ).rejects.toThrow(
        "Failed to get agent description for 'server0:testAgent': Details retrieval failed",
      )

      expect(mockConfig.logger.error).toHaveBeenCalledWith(
        "Error getting agent description for 'server0:testAgent':",
        expect.any(Error),
      )
    })

    it('should handle non-Error exceptions', async () => {
      const mockAgent = {
        details: vi.fn().mockRejectedValue('String error'),
      }

      const mockClient = {
        getAgent: vi.fn().mockReturnValue(mockAgent),
      }

      mockMastraClient.mockReturnValue(mockClient as any)

      const input: GetAgentDescriptionInput = {
        agentId: 'server0:testAgent',
      }

      const mockContext = {
        context: input,
      }

      await expect(
        getAgentDescription.execute(mockContext as any),
      ).rejects.toThrow(
        "Failed to get agent description for 'server0:testAgent': Unknown error",
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
        details: vi.fn().mockResolvedValue({ name: 'Test Agent' }),
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

      const input: GetAgentDescriptionInput = {
        agentId: 'testAgent',
      }

      const mockContext = {
        context: input,
      }

      const result = (await getAgentDescription.execute(
        mockContext as any,
      )) as GetAgentDescriptionOutput

      expect(result.success).toBe(true)
      expect(result.fullyQualifiedId).toBe('server1:testAgent')
      expect(result.resolutionMethod).toBe('unique_auto_resolution')
    })

    it('should handle client creation errors', async () => {
      mockMastraClient.mockImplementation(() => {
        throw new Error('Client creation failed')
      })

      const input: GetAgentDescriptionInput = {
        agentId: 'server0:testAgent',
      }

      const mockContext = {
        context: input,
      }

      await expect(
        getAgentDescription.execute(mockContext as any),
      ).rejects.toThrow(
        "Failed to get agent description for 'server0:testAgent': Client creation failed",
      )
    })
  })

  describe('edge cases', () => {
    it('should handle empty server mappings', async () => {
      mockConfig.loadServerMappings.mockReturnValue(new Map())

      const input: GetAgentDescriptionInput = {
        agentId: 'testAgent',
      }

      const mockContext = {
        context: input,
      }

      await expect(
        getAgentDescription.execute(mockContext as any),
      ).rejects.toThrow("Agent 'testAgent' not found on any configured server")
    })

    it('should handle malformed fully qualified ID', async () => {
      const input: GetAgentDescriptionInput = {
        agentId: 'server0:agent:extra:parts',
      }

      const mockContext = {
        context: input,
      }

      // split(':', 2) only returns first 2 elements: ['server0', 'agent']
      const mockAgent = {
        details: vi.fn().mockResolvedValue({ name: 'Test Agent' }),
      }

      const mockClient = {
        getAgent: vi.fn().mockReturnValue(mockAgent),
      }

      mockMastraClient.mockReturnValue(mockClient as any)

      const result = (await getAgentDescription.execute(
        mockContext as any,
      )) as GetAgentDescriptionOutput

      expect(result.agentId).toBe('agent')
      expect(result.fullyQualifiedId).toBe('server0:agent:extra:parts')
      expect(result.serverName).toBe('server0')
      expect(mockClient.getAgent).toHaveBeenCalledWith('agent')
    })

    it('should handle agent details with null values', async () => {
      const mockAgentDetails = {
        name: 'Agent with Nulls',
        instructions: null,
        capabilities: null,
        metadata: {
          created: null,
          tags: null,
        },
      }

      const mockAgent = {
        details: vi.fn().mockResolvedValue(mockAgentDetails),
      }

      const mockClient = {
        getAgent: vi.fn().mockReturnValue(mockAgent),
      }

      mockMastraClient.mockReturnValue(mockClient as any)

      const input: GetAgentDescriptionInput = {
        agentId: 'server0:nullAgent',
      }

      const mockContext = {
        context: input,
      }

      const result = (await getAgentDescription.execute(
        mockContext as any,
      )) as GetAgentDescriptionOutput

      expect(result.success).toBe(true)
      expect(result.agentDetails).toEqual(mockAgentDetails)
      expect(result.agentDetails.instructions).toBeNull()
      expect(result.agentDetails.capabilities).toBeNull()
    })

    it('should handle very large agent details', async () => {
      const mockAgentDetails = {
        name: 'Large Agent',
        instructions: 'A'.repeat(10000), // Very long instructions
        capabilities: Array.from({ length: 100 }, (_, i) => `capability-${i}`),
        metadata: {
          largeData: Array.from({ length: 1000 }, (_, i) => ({
            id: i,
            value: `data-${i}`,
          })),
        },
      }

      const mockAgent = {
        details: vi.fn().mockResolvedValue(mockAgentDetails),
      }

      const mockClient = {
        getAgent: vi.fn().mockReturnValue(mockAgent),
      }

      mockMastraClient.mockReturnValue(mockClient as any)

      const input: GetAgentDescriptionInput = {
        agentId: 'server0:largeAgent',
      }

      const mockContext = {
        context: input,
      }

      const result = (await getAgentDescription.execute(
        mockContext as any,
      )) as GetAgentDescriptionOutput

      expect(result.success).toBe(true)
      expect(result.agentDetails).toEqual(mockAgentDetails)
      expect(result.agentDetails.instructions).toHaveLength(10000)
      expect(result.agentDetails.capabilities).toHaveLength(100)
      expect(result.agentDetails.metadata.largeData).toHaveLength(1000)
    })
  })
})
