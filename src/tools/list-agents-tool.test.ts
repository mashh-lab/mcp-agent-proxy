import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getAgentsInfo } from './list-agents-tool.js'
import * as config from '../config.js'
import { PluginManager } from '../plugins/index.js'

// Mock the dependencies
vi.mock('../config.js')
vi.mock('../plugins/index.js')

const mockConfig = vi.mocked(config)
const mockPluginManager = vi.mocked(PluginManager)

// Define types for better type safety
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type ServerAgent = {
  serverName: string
  serverUrl: string
  serverType: string
  serverDescription: string
  agents: Array<{
    id: string
    name: string
    description: string | undefined
    fullyQualifiedId: string
  }>
  status: 'online' | 'offline' | 'error'
  error?: string
  isDynamic: boolean
}

describe('list-agents-tool', () => {
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

    mockConfig.getDynamicServers.mockReturnValue(new Map())

    mockConfig.logger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      forceError: vi.fn(),
    }

    // Mock PluginManager instance
    mockPluginManagerInstance = {
      getServerStatus: vi.fn(),
    }

    mockPluginManager.mockImplementation(() => mockPluginManagerInstance)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getAgentsInfo', () => {
    it('should return agent information from all online servers', async () => {
      // Mock server status responses
      mockPluginManagerInstance.getServerStatus
        .mockResolvedValueOnce({
          serverName: 'server0',
          serverUrl: 'http://localhost:4111',
          serverType: 'mastra',
          serverDescription: 'Mastra Server (server0)',
          agents: [
            {
              id: 'agent1',
              name: 'Agent One',
              description: undefined,
              fullyQualifiedId: 'localhost:4111:agent1',
            },
            {
              id: 'agent2',
              name: 'Agent Two',
              description: undefined,
              fullyQualifiedId: 'localhost:4111:agent2',
            },
          ],
          status: 'online',
          isDynamic: false,
        })
        .mockResolvedValueOnce({
          serverName: 'server1',
          serverUrl: 'http://localhost:4222',
          serverType: 'langgraph',
          serverDescription: 'Langgraph Server (server1)',
          agents: [
            {
              id: 'agent3',
              name: 'Agent Three',
              description: undefined,
              fullyQualifiedId: 'localhost:4222:agent3',
            },
          ],
          status: 'online',
          isDynamic: false,
        })

      const result = await getAgentsInfo()

      expect(result.summary.totalAgents).toBe(3)
      expect(result.summary.totalServers).toBe(2)
      expect(result.summary.onlineServers).toBe(2)
      expect(result.serverAgents).toHaveLength(2)

      // Check first server
      const firstServer = result.serverAgents[0] as any
      expect(firstServer).toEqual({
        serverName: 'server0',
        serverUrl: 'http://localhost:4111',
        serverType: 'mastra',
        serverDescription: 'Mastra Server (server0)',
        agents: [
          {
            id: 'agent1',
            name: 'Agent One',
            description: undefined,
            fullyQualifiedId: 'localhost:4111:agent1',
          },
          {
            id: 'agent2',
            name: 'Agent Two',
            description: undefined,
            fullyQualifiedId: 'localhost:4111:agent2',
          },
        ],
        status: 'online',
        isDynamic: false,
      })

      // Check second server
      const secondServer = result.serverAgents[1] as any
      expect(secondServer).toEqual({
        serverName: 'server1',
        serverUrl: 'http://localhost:4222',
        serverType: 'langgraph',
        serverDescription: 'Langgraph Server (server1)',
        agents: [
          {
            id: 'agent3',
            name: 'Agent Three',
            description: undefined,
            fullyQualifiedId: 'localhost:4222:agent3',
          },
        ],
        status: 'online',
        isDynamic: false,
      })

      expect(mockPluginManagerInstance.getServerStatus).toHaveBeenCalledTimes(2)
      expect(mockPluginManagerInstance.getServerStatus).toHaveBeenCalledWith(
        'server0',
        'http://localhost:4111',
        { retries: 2, backoffMs: 100, maxBackoffMs: 1000 },
        false,
      )
      expect(mockPluginManagerInstance.getServerStatus).toHaveBeenCalledWith(
        'server1',
        'http://localhost:4222',
        { retries: 2, backoffMs: 100, maxBackoffMs: 1000 },
        false,
      )
    })

    it('should handle server errors gracefully', async () => {
      // Mock first server as online, second as error
      mockPluginManagerInstance.getServerStatus
        .mockResolvedValueOnce({
          serverName: 'server0',
          serverUrl: 'http://localhost:4111',
          serverType: 'mastra',
          serverDescription: 'Mastra Server (server0)',
          agents: [
            {
              id: 'agent1',
              name: 'Agent One',
              description: undefined,
              fullyQualifiedId: 'localhost:4111:agent1',
            },
          ],
          status: 'online',
          isDynamic: false,
        })
        .mockResolvedValueOnce({
          serverName: 'server1',
          serverUrl: 'http://localhost:4222',
          serverType: 'unknown',
          serverDescription: 'Unknown Server (server1)',
          agents: [],
          status: 'error',
          error: 'No compatible plugin found',
          isDynamic: false,
        })

      const result = await getAgentsInfo()

      expect(result.summary.totalAgents).toBe(1)
      expect(result.summary.totalServers).toBe(2)
      expect(result.summary.onlineServers).toBe(1)
      expect(result.serverAgents).toHaveLength(2)

      // First server should be online
      const firstServer = result.serverAgents[0] as any
      expect(firstServer.status).toBe('online')
      expect(firstServer.agents).toHaveLength(1)

      // Second server should have error status
      const secondServer = result.serverAgents[1] as any
      expect(secondServer).toEqual({
        serverName: 'server1',
        serverUrl: 'http://localhost:4222',
        serverType: 'unknown',
        serverDescription: 'Unknown Server (server1)',
        agents: [],
        status: 'error',
        error: 'No compatible plugin found',
        isDynamic: false,
      })
    })

    it('should handle empty server mappings', async () => {
      mockConfig.loadServerMappings.mockReturnValue(new Map())

      const result = await getAgentsInfo()

      expect(result.summary.totalAgents).toBe(0)
      expect(result.summary.totalServers).toBe(0)
      expect(result.summary.onlineServers).toBe(0)
      expect(result.serverAgents).toHaveLength(0)

      expect(mockPluginManagerInstance.getServerStatus).not.toHaveBeenCalled()
    })

    it('should handle agents without names', async () => {
      mockPluginManagerInstance.getServerStatus.mockResolvedValueOnce({
        serverName: 'server0',
        serverUrl: 'http://localhost:4111',
        serverType: 'mastra',
        serverDescription: 'Mastra Server (server0)',
        agents: [
          {
            id: 'agent1',
            name: 'agent1',
            description: undefined,
            fullyQualifiedId: 'localhost:4111:agent1',
          },
          {
            id: 'agent2',
            name: 'agent2',
            description: undefined,
            fullyQualifiedId: 'localhost:4111:agent2',
          },
          {
            id: 'agent3',
            name: 'agent3',
            description: undefined,
            fullyQualifiedId: 'localhost:4111:agent3',
          },
        ],
        status: 'online',
        isDynamic: false,
      })

      const result = await getAgentsInfo()

      expect(result.summary.totalAgents).toBe(3)

      const firstServer = result.serverAgents[0] as any
      expect(firstServer.agents).toEqual([
        {
          id: 'agent1',
          name: 'agent1',
          description: undefined,
          fullyQualifiedId: 'localhost:4111:agent1',
        },
        {
          id: 'agent2',
          name: 'agent2',
          description: undefined,
          fullyQualifiedId: 'localhost:4111:agent2',
        },
        {
          id: 'agent3',
          name: 'agent3',
          description: undefined,
          fullyQualifiedId: 'localhost:4111:agent3',
        },
      ])
    })

    it('should handle mixed server types', async () => {
      mockPluginManagerInstance.getServerStatus
        .mockResolvedValueOnce({
          serverName: 'server0',
          serverUrl: 'http://localhost:4111',
          serverType: 'mastra',
          serverDescription: 'Mastra Server (server0)',
          agents: [
            {
              id: 'mastraAgent',
              name: 'Mastra Agent',
              description: undefined,
              fullyQualifiedId: 'localhost:4111:mastraAgent',
            },
          ],
          status: 'online',
          isDynamic: false,
        })
        .mockResolvedValueOnce({
          serverName: 'server1',
          serverUrl: 'http://localhost:4222',
          serverType: 'langgraph',
          serverDescription: 'Langgraph Server (server1)',
          agents: [
            {
              id: 'langGraphAssistant',
              name: 'LangGraph Assistant',
              description: undefined,
              fullyQualifiedId: 'localhost:4222:langGraphAssistant',
            },
          ],
          status: 'online',
          isDynamic: false,
        })

      const result = await getAgentsInfo()

      expect(result.summary.totalAgents).toBe(2)
      expect(result.summary.totalServers).toBe(2)
      expect(result.summary.onlineServers).toBe(2)

      const mastraServer = result.serverAgents[0] as any
      expect(mastraServer.serverType).toBe('mastra')
      expect(mastraServer.agents[0].id).toBe('mastraAgent')

      const langGraphServer = result.serverAgents[1] as any
      expect(langGraphServer.serverType).toBe('langgraph')
      expect(langGraphServer.agents[0].id).toBe('langGraphAssistant')
    })

    it('should handle non-Error exceptions', async () => {
      mockPluginManagerInstance.getServerStatus.mockResolvedValueOnce({
        serverName: 'server0',
        serverUrl: 'http://localhost:4111',
        serverType: 'unknown',
        serverDescription: 'Unknown Server (server0)',
        agents: [],
        status: 'error',
        error: 'No compatible plugin found',
        isDynamic: false,
      })

      const result = await getAgentsInfo()

      expect(result.summary.totalAgents).toBe(0)
      expect(result.summary.onlineServers).toBe(0)

      const firstServer = result.serverAgents[0] as any
      expect(firstServer).toEqual({
        serverName: 'server0',
        serverUrl: 'http://localhost:4111',
        serverType: 'unknown',
        serverDescription: 'Unknown Server (server0)',
        agents: [],
        status: 'error',
        error: 'No compatible plugin found',
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

      mockPluginManagerInstance.getServerStatus.mockResolvedValue({
        serverName: 'server0',
        serverUrl: 'http://localhost:4111',
        serverType: 'mastra',
        serverDescription: 'Mastra Server (server0)',
        agents: [],
        status: 'online',
        isDynamic: false,
      })

      await getAgentsInfo()

      expect(mockPluginManagerInstance.getServerStatus).toHaveBeenCalledWith(
        'server0',
        'http://localhost:4111',
        { retries: 3, backoffMs: 150, maxBackoffMs: 2000 },
        false,
      )
    })

    it('should handle dynamic servers', async () => {
      // Mock loadServerMappings to include dynamic servers
      mockConfig.loadServerMappings.mockReturnValue(
        new Map([
          ['server0', 'http://localhost:4111'],
          ['dynamicServer', 'http://dynamic.example.com'],
        ]),
      )

      // Mock getDynamicServers to return the dynamic server
      mockConfig.getDynamicServers = vi
        .fn()
        .mockReturnValue(
          new Map([['dynamicServer', 'http://dynamic.example.com']]),
        )

      mockPluginManagerInstance.getServerStatus
        .mockResolvedValueOnce({
          serverName: 'server0',
          serverUrl: 'http://localhost:4111',
          serverType: 'mastra',
          serverDescription: 'Mastra Server (server0)',
          agents: [],
          status: 'online',
          isDynamic: false,
        })
        .mockResolvedValueOnce({
          serverName: 'dynamicServer',
          serverUrl: 'http://dynamic.example.com',
          serverType: 'langgraph',
          serverDescription: 'Langgraph Server (dynamicServer)',
          agents: [
            {
              id: 'dynamicAgent',
              name: 'Dynamic Agent',
              description: undefined,
              fullyQualifiedId: 'dynamic.example.com:dynamicAgent',
            },
          ],
          status: 'online',
          isDynamic: true,
        })

      const result = await getAgentsInfo()

      expect(result.summary.totalServers).toBe(2)
      expect(result.summary.totalAgents).toBe(1)

      const dynamicServer = result.serverAgents[1] as any
      expect(dynamicServer.isDynamic).toBe(true)
      expect(dynamicServer.serverName).toBe('dynamicServer')

      expect(mockPluginManagerInstance.getServerStatus).toHaveBeenCalledWith(
        'dynamicServer',
        'http://dynamic.example.com',
        expect.any(Object),
        true,
      )
    })
  })
})
