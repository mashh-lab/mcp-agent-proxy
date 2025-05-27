import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MastraClient } from '@mastra/client-js'
import { getMastraAgentsInfo, listAgents } from './list-agents-tool.js'
import * as config from '../config.js'

// Mock the dependencies
vi.mock('@mastra/client-js')
vi.mock('../config.js')

const mockMastraClient = vi.mocked(MastraClient)
const mockConfig = vi.mocked(config)

// Define types for better type safety
type ServerAgent = {
  serverName: string
  serverUrl: string
  serverDescription: string
  agents: Array<{
    id: string
    name: string
    fullyQualifiedId: string
  }>
  status: 'online' | 'offline' | 'error'
  error?: string
  isDynamic: boolean
}

type AgentsInfo = {
  serverAgents: ServerAgent[]
  summary: {
    totalServers: number
    staticServers: number
    dynamicServers: number
    onlineServers: number
    totalAgents: number
    agentConflicts: Array<{
      agentId: string
      servers: string[]
    }>
  }
}

describe('list-agents-tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock implementations
    mockConfig.loadServerMappings.mockReturnValue(
      new Map([
        ['server0', 'http://localhost:4111'],
        ['server1', 'http://localhost:4222'],
      ]),
    )

    mockConfig.getDynamicServers.mockReturnValue(new Map())

    mockConfig.getRetryConfig.mockReturnValue({
      discovery: { retries: 1, backoffMs: 100, maxBackoffMs: 500 },
      listing: { retries: 2, backoffMs: 100, maxBackoffMs: 1000 },
      interaction: { retries: 3, backoffMs: 300, maxBackoffMs: 5000 },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getMastraAgentsInfo', () => {
    it('should return agent information from all online servers', async () => {
      // Mock successful responses from both servers
      const mockGetAgents1 = vi.fn().mockResolvedValue({
        agent1: { name: 'Agent One' },
        agent2: { name: 'Agent Two' },
      })

      const mockGetAgents2 = vi.fn().mockResolvedValue({
        agent3: { name: 'Agent Three' },
      })

      mockMastraClient.mockImplementation((config) => {
        if (config.baseUrl === 'http://localhost:4111') {
          return { getAgents: mockGetAgents1 } as any
        } else if (config.baseUrl === 'http://localhost:4222') {
          return { getAgents: mockGetAgents2 } as any
        }
        throw new Error('Unexpected URL')
      })

      const result = (await getMastraAgentsInfo()) as AgentsInfo

      expect(result.serverAgents).toHaveLength(2)

      // Check first server
      const firstServer = result.serverAgents[0] as ServerAgent
      expect(firstServer).toEqual({
        serverName: 'server0',
        serverUrl: 'http://localhost:4111',
        serverDescription: 'Mastra Server (server0)',
        agents: [
          {
            id: 'agent1',
            name: 'Agent One',
            fullyQualifiedId: 'server0:agent1',
          },
          {
            id: 'agent2',
            name: 'Agent Two',
            fullyQualifiedId: 'server0:agent2',
          },
        ],
        status: 'online',
        isDynamic: false,
      })

      // Check second server
      const secondServer = result.serverAgents[1] as ServerAgent
      expect(secondServer).toEqual({
        serverName: 'server1',
        serverUrl: 'http://localhost:4222',
        serverDescription: 'Mastra Server (server1)',
        agents: [
          {
            id: 'agent3',
            name: 'Agent Three',
            fullyQualifiedId: 'server1:agent3',
          },
        ],
        status: 'online',
        isDynamic: false,
      })

      // Check summary
      expect(result.summary).toEqual({
        totalServers: 2,
        staticServers: 2,
        dynamicServers: 0,
        onlineServers: 2,
        totalAgents: 3,
        agentConflicts: [],
      })
    })

    it('should handle server errors gracefully', async () => {
      const mockGetAgents1 = vi.fn().mockResolvedValue({
        agent1: { name: 'Agent One' },
      })

      const mockGetAgents2 = vi
        .fn()
        .mockRejectedValue(new Error('Connection failed'))

      mockMastraClient.mockImplementation((config) => {
        if (config.baseUrl === 'http://localhost:4111') {
          return { getAgents: mockGetAgents1 } as any
        } else if (config.baseUrl === 'http://localhost:4222') {
          return { getAgents: mockGetAgents2 } as any
        }
        throw new Error('Unexpected URL')
      })

      const result = (await getMastraAgentsInfo()) as AgentsInfo

      expect(result.serverAgents).toHaveLength(2)

      // First server should be online
      const firstServer = result.serverAgents[0] as ServerAgent
      expect(firstServer.status).toBe('online')
      expect(firstServer.agents).toHaveLength(1)

      // Second server should have error status
      const secondServer = result.serverAgents[1] as ServerAgent
      expect(secondServer).toEqual({
        serverName: 'server1',
        serverUrl: 'http://localhost:4222',
        serverDescription: 'Mastra Server (server1)',
        agents: [],
        status: 'error',
        error: 'Connection failed',
        isDynamic: false,
      })

      expect(result.summary.onlineServers).toBe(1)
      expect(result.summary.totalAgents).toBe(1)
    })

    it('should detect agent conflicts across servers', async () => {
      // Both servers have an agent with the same ID
      const mockGetAgents1 = vi.fn().mockResolvedValue({
        conflictAgent: { name: 'Agent on Server 1' },
        uniqueAgent1: { name: 'Unique Agent 1' },
      })

      const mockGetAgents2 = vi.fn().mockResolvedValue({
        conflictAgent: { name: 'Agent on Server 2' },
        uniqueAgent2: { name: 'Unique Agent 2' },
      })

      mockMastraClient.mockImplementation((config) => {
        if (config.baseUrl === 'http://localhost:4111') {
          return { getAgents: mockGetAgents1 } as any
        } else if (config.baseUrl === 'http://localhost:4222') {
          return { getAgents: mockGetAgents2 } as any
        }
        throw new Error('Unexpected URL')
      })

      const result = (await getMastraAgentsInfo()) as AgentsInfo

      expect(result.summary.agentConflicts).toEqual([
        {
          agentId: 'conflictAgent',
          servers: ['server0', 'server1'],
        },
      ])
    })

    it('should handle agents without names', async () => {
      const mockGetAgents = vi.fn().mockResolvedValue({
        agent1: {}, // No name property
        agent2: { name: null }, // Null name
        agent3: { name: '' }, // Empty name
      })

      mockConfig.loadServerMappings.mockReturnValue(
        new Map([['server0', 'http://localhost:4111']]),
      )

      mockMastraClient.mockImplementation(
        () =>
          ({
            getAgents: mockGetAgents,
          }) as any,
      )

      const result = (await getMastraAgentsInfo()) as AgentsInfo

      const firstServer = result.serverAgents[0] as ServerAgent
      expect(firstServer.agents).toEqual([
        { id: 'agent1', name: 'agent1', fullyQualifiedId: 'server0:agent1' },
        { id: 'agent2', name: 'agent2', fullyQualifiedId: 'server0:agent2' },
        { id: 'agent3', name: 'agent3', fullyQualifiedId: 'server0:agent3' },
      ])
    })

    it('should distinguish between static and dynamic servers', async () => {
      // Mock dynamic servers
      mockConfig.getDynamicServers.mockReturnValue(
        new Map([['dynamicServer', 'http://dynamic.example.com']]),
      )

      mockConfig.loadServerMappings.mockReturnValue(
        new Map([
          ['server0', 'http://localhost:4111'], // Static
          ['dynamicServer', 'http://dynamic.example.com'], // Dynamic
        ]),
      )

      const mockGetAgents = vi.fn().mockResolvedValue({
        agent1: { name: 'Test Agent' },
      })

      mockMastraClient.mockImplementation(
        () =>
          ({
            getAgents: mockGetAgents,
          }) as any,
      )

      const result = (await getMastraAgentsInfo()) as AgentsInfo

      expect(result.serverAgents).toHaveLength(2)

      const firstServer = result.serverAgents[0] as ServerAgent
      const secondServer = result.serverAgents[1] as ServerAgent

      expect(firstServer.isDynamic).toBe(false)
      expect(secondServer.isDynamic).toBe(true)

      expect(result.summary.staticServers).toBe(1)
      expect(result.summary.dynamicServers).toBe(1)
    })

    it('should handle empty server list', async () => {
      mockConfig.loadServerMappings.mockReturnValue(new Map())

      const result = (await getMastraAgentsInfo()) as AgentsInfo

      expect(result.serverAgents).toHaveLength(0)
      expect(result.summary).toEqual({
        totalServers: 0,
        staticServers: 0,
        dynamicServers: 0,
        onlineServers: 0,
        totalAgents: 0,
        agentConflicts: [],
      })
    })

    it('should handle non-Error exceptions', async () => {
      const mockGetAgents = vi.fn().mockRejectedValue('String error')

      mockConfig.loadServerMappings.mockReturnValue(
        new Map([['server0', 'http://localhost:4111']]),
      )

      mockMastraClient.mockImplementation(
        () =>
          ({
            getAgents: mockGetAgents,
          }) as any,
      )

      const result = (await getMastraAgentsInfo()) as AgentsInfo

      const firstServer = result.serverAgents[0] as ServerAgent
      expect(firstServer).toEqual({
        serverName: 'server0',
        serverUrl: 'http://localhost:4111',
        serverDescription: 'Mastra Server (server0)',
        agents: [],
        status: 'error',
        error: 'Unknown error',
        isDynamic: false,
      })
    })

    it('should use correct retry configuration', async () => {
      const customRetryConfig = {
        discovery: { retries: 5, backoffMs: 200, maxBackoffMs: 1000 },
        listing: { retries: 3, backoffMs: 150, maxBackoffMs: 2000 },
        interaction: { retries: 4, backoffMs: 400, maxBackoffMs: 8000 },
      }

      mockConfig.getRetryConfig.mockReturnValue(customRetryConfig)
      mockConfig.loadServerMappings.mockReturnValue(
        new Map([['server0', 'http://localhost:4111']]),
      )

      const mockGetAgents = vi.fn().mockResolvedValue({})
      mockMastraClient.mockImplementation((clientConfig) => {
        // Verify the retry config is passed correctly
        expect(clientConfig).toEqual({
          baseUrl: 'http://localhost:4111',
          retries: customRetryConfig.listing.retries,
          backoffMs: customRetryConfig.listing.backoffMs,
          maxBackoffMs: customRetryConfig.listing.maxBackoffMs,
        })
        return { getAgents: mockGetAgents } as any
      })

      await getMastraAgentsInfo()

      expect(mockMastraClient).toHaveBeenCalledWith({
        baseUrl: 'http://localhost:4111',
        retries: 3,
        backoffMs: 150,
        maxBackoffMs: 2000,
      })
    })
  })

  describe('listAgents tool', () => {
    it('should have correct tool configuration', () => {
      expect(listAgents.id).toBe('listAgents')
      expect(listAgents.description).toContain(
        'Lists available agents on all configured Mastra servers',
      )
      expect(listAgents.inputSchema).toBeDefined()
      expect(listAgents.outputSchema).toBeDefined()
    })

    it('should execute and return agent information', async () => {
      const mockGetAgents = vi.fn().mockResolvedValue({
        agent1: { name: 'Test Agent' },
      })

      mockConfig.loadServerMappings.mockReturnValue(
        new Map([['server0', 'http://localhost:4111']]),
      )

      mockMastraClient.mockImplementation(
        () =>
          ({
            getAgents: mockGetAgents,
          }) as any,
      )

      // Mock the tool execution context
      const mockContext = {
        runtimeContext: {},
        context: {},
      }

      const result = (await listAgents.execute(
        mockContext as any,
      )) as AgentsInfo

      expect(result).toHaveProperty('serverAgents')
      expect(result).toHaveProperty('summary')
      expect(result.serverAgents).toHaveLength(1)
      expect(result.summary.totalAgents).toBe(1)
    })

    it('should validate output schema', async () => {
      const mockGetAgents = vi.fn().mockResolvedValue({
        agent1: { name: 'Test Agent' },
      })

      mockConfig.loadServerMappings.mockReturnValue(
        new Map([['server0', 'http://localhost:4111']]),
      )

      mockMastraClient.mockImplementation(
        () =>
          ({
            getAgents: mockGetAgents,
          }) as any,
      )

      // Mock the tool execution context
      const mockContext = {
        runtimeContext: {},
        context: {},
      }

      const result = (await listAgents.execute(
        mockContext as any,
      )) as AgentsInfo

      // Test that the result matches the expected schema structure
      expect(result).toMatchObject({
        serverAgents: expect.arrayContaining([
          expect.objectContaining({
            serverName: expect.any(String),
            serverUrl: expect.any(String),
            agents: expect.arrayContaining([
              expect.objectContaining({
                id: expect.any(String),
                fullyQualifiedId: expect.any(String),
              }),
            ]),
            status: expect.stringMatching(/^(online|offline|error)$/),
            isDynamic: expect.any(Boolean),
          }),
        ]),
        summary: expect.objectContaining({
          totalServers: expect.any(Number),
          staticServers: expect.any(Number),
          dynamicServers: expect.any(Number),
          onlineServers: expect.any(Number),
          totalAgents: expect.any(Number),
          agentConflicts: expect.any(Array),
        }),
      })
    })
  })

  describe('edge cases and error scenarios', () => {
    it('should handle multiple agent conflicts', async () => {
      const mockGetAgents1 = vi.fn().mockResolvedValue({
        agent1: { name: 'Agent 1 on Server 1' },
        agent2: { name: 'Agent 2 on Server 1' },
      })

      const mockGetAgents2 = vi.fn().mockResolvedValue({
        agent1: { name: 'Agent 1 on Server 2' },
        agent3: { name: 'Agent 3 on Server 2' },
      })

      const mockGetAgents3 = vi.fn().mockResolvedValue({
        agent1: { name: 'Agent 1 on Server 3' },
        agent2: { name: 'Agent 2 on Server 3' },
      })

      mockConfig.loadServerMappings.mockReturnValue(
        new Map([
          ['server0', 'http://localhost:4111'],
          ['server1', 'http://localhost:4222'],
          ['server2', 'http://localhost:4333'],
        ]),
      )

      mockMastraClient.mockImplementation((config) => {
        if (config.baseUrl === 'http://localhost:4111') {
          return { getAgents: mockGetAgents1 } as any
        } else if (config.baseUrl === 'http://localhost:4222') {
          return { getAgents: mockGetAgents2 } as any
        } else if (config.baseUrl === 'http://localhost:4333') {
          return { getAgents: mockGetAgents3 } as any
        }
        throw new Error('Unexpected URL')
      })

      const result = (await getMastraAgentsInfo()) as AgentsInfo

      expect(result.summary.agentConflicts).toHaveLength(2)
      expect(result.summary.agentConflicts).toContainEqual({
        agentId: 'agent1',
        servers: ['server0', 'server1', 'server2'],
      })
      expect(result.summary.agentConflicts).toContainEqual({
        agentId: 'agent2',
        servers: ['server0', 'server2'],
      })
    })

    it('should handle servers with no agents', async () => {
      const mockGetAgents = vi.fn().mockResolvedValue({})

      mockConfig.loadServerMappings.mockReturnValue(
        new Map([['server0', 'http://localhost:4111']]),
      )

      mockMastraClient.mockImplementation(
        () =>
          ({
            getAgents: mockGetAgents,
          }) as any,
      )

      const result = (await getMastraAgentsInfo()) as AgentsInfo

      const firstServer = result.serverAgents[0] as ServerAgent
      expect(firstServer.agents).toHaveLength(0)
      expect(result.summary.totalAgents).toBe(0)
      expect(result.summary.onlineServers).toBe(1)
    })

    it('should handle all servers being offline', async () => {
      const mockGetAgents = vi
        .fn()
        .mockRejectedValue(new Error('Server offline'))

      mockConfig.loadServerMappings.mockReturnValue(
        new Map([
          ['server0', 'http://localhost:4111'],
          ['server1', 'http://localhost:4222'],
        ]),
      )

      mockMastraClient.mockImplementation(
        () =>
          ({
            getAgents: mockGetAgents,
          }) as any,
      )

      const result = (await getMastraAgentsInfo()) as AgentsInfo

      expect(result.summary.onlineServers).toBe(0)
      expect(result.summary.totalAgents).toBe(0)
      expect(
        result.serverAgents.every(
          (server) => (server as ServerAgent).status === 'error',
        ),
      ).toBe(true)
    })
  })
})
