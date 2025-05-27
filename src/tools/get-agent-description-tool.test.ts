import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { describeAgent } from './get-agent-description-tool.js'
import * as config from '../config.js'
import { PluginManager } from '../plugins/index.js'

// Mock the dependencies
vi.mock('../config.js')
vi.mock('../plugins/index.js')

const mockConfig = vi.mocked(config)
const mockPluginManager = vi.mocked(PluginManager)

// Define types for better type safety
type DescribeAgentInput = {
  agentId: string
  serverUrl?: string
}

describe('get-agent-description-tool', () => {
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
      getAgentDescription: vi.fn(),
      getPlugin: vi.fn(),
    }

    mockPluginManager.mockImplementation(() => mockPluginManagerInstance)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('tool configuration', () => {
    it('should have correct tool configuration', () => {
      expect(describeAgent.id).toBe('describeAgent')
      expect(describeAgent.description).toContain(
        'Gets detailed information about a specific',
      )
      expect(describeAgent.inputSchema).toBeDefined()
      expect(describeAgent.outputSchema).toBeDefined()
    })
  })

  describe('agent resolution', () => {
    it('should handle fully qualified agent ID (server:agentId)', async () => {
      const mockAgentDetails = {
        id: 'testAgent',
        name: 'Test Agent',
        description: 'A test agent',
        fullyQualifiedId: 'localhost:4111:testAgent',
      }

      mockPluginManagerInstance.getAgentDescription.mockResolvedValue(
        mockAgentDetails,
      )
      mockPluginManagerInstance.getPlugin.mockResolvedValue({
        serverType: 'mastra',
      })

      const input: DescribeAgentInput = {
        agentId: 'server0:testAgent',
      }

      const mockContext = {
        context: input,
      }

      const result = (await describeAgent.execute(mockContext as any)) as any

      expect(result.success).toBe(true)
      expect(result.agentDetails).toEqual(mockAgentDetails)
      expect(result.resolutionMethod).toBe('explicit_qualification')
      expect(result.serverUsed).toBe('http://localhost:4111')
      expect(result.fullyQualifiedId).toBe('server0:testAgent')
      expect(result.serverType).toBe('mastra')

      expect(
        mockPluginManagerInstance.getAgentDescription,
      ).toHaveBeenCalledWith(
        'http://localhost:4111',
        'testAgent',
        expect.any(Object),
      )
    })

    it('should handle explicit server URL override', async () => {
      const mockAgentDetails = {
        id: 'testAgent',
        name: 'Test Agent',
        description: 'A test agent',
        fullyQualifiedId: 'custom.server.com:testAgent',
      }

      mockPluginManagerInstance.getAgentDescription.mockResolvedValue(
        mockAgentDetails,
      )
      mockPluginManagerInstance.getPlugin.mockResolvedValue({
        serverType: 'langgraph',
      })

      const input: DescribeAgentInput = {
        agentId: 'testAgent',
        serverUrl: 'http://custom.server.com',
      }

      const mockContext = {
        context: input,
      }

      const result = (await describeAgent.execute(mockContext as any)) as any

      expect(result.success).toBe(true)
      expect(result.agentDetails).toEqual(mockAgentDetails)
      expect(result.resolutionMethod).toBe('explicit_url_override')
      expect(result.serverUsed).toBe('http://custom.server.com')
      expect(result.serverType).toBe('langgraph')
    })

    it('should handle unique auto-resolution when agent found on one server', async () => {
      // Mock agent discovery - agent found only on server1
      mockPluginManagerInstance.getAgents
        .mockResolvedValueOnce([{ id: 'otherAgent', name: 'Other Agent' }]) // server0
        .mockResolvedValueOnce([{ id: 'testAgent', name: 'Test Agent' }]) // server1

      const mockAgentDetails = {
        id: 'testAgent',
        name: 'Test Agent',
        description: undefined,
        fullyQualifiedId: 'localhost:4222:testAgent',
      }

      mockPluginManagerInstance.getAgentDescription.mockResolvedValue(
        mockAgentDetails,
      )
      mockPluginManagerInstance.getPlugin.mockResolvedValue({
        serverType: 'mastra',
      })

      const input: DescribeAgentInput = {
        agentId: 'testAgent',
      }

      const mockContext = {
        context: input,
      }

      const result = (await describeAgent.execute(mockContext as any)) as any

      expect(result.success).toBe(true)
      expect(result.resolutionMethod).toBe('unique_auto_resolution')
      expect(result.serverUsed).toBe('http://localhost:4222')
      expect(result.agentDetails).toEqual(mockAgentDetails)
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

      const mockAgentDetails = {
        id: 'testAgent',
        name: 'Test Agent on Server 0',
        description: undefined,
        fullyQualifiedId: 'localhost:4111:testAgent',
      }

      mockPluginManagerInstance.getAgentDescription.mockResolvedValue(
        mockAgentDetails,
      )
      mockPluginManagerInstance.getPlugin.mockResolvedValue({
        serverType: 'mastra',
      })

      const input: DescribeAgentInput = {
        agentId: 'testAgent',
      }

      const mockContext = {
        context: input,
      }

      const result = (await describeAgent.execute(mockContext as any)) as any

      expect(result.success).toBe(true)
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
      mockPluginManagerInstance.getAgents
        .mockResolvedValueOnce([
          { id: 'testAgent', name: 'Test Agent on Server 1' },
        ]) // server1
        .mockResolvedValueOnce([
          { id: 'testAgent', name: 'Test Agent on Server 2' },
        ]) // server2

      const mockAgentDetails = {
        id: 'testAgent',
        name: 'Test Agent on Server 1',
        description: undefined,
        fullyQualifiedId: 'localhost:4222:testAgent',
      }

      mockPluginManagerInstance.getAgentDescription.mockResolvedValue(
        mockAgentDetails,
      )
      mockPluginManagerInstance.getPlugin.mockResolvedValue({
        serverType: 'mastra',
      })

      const input: DescribeAgentInput = {
        agentId: 'testAgent',
      }

      const mockContext = {
        context: input,
      }

      const result = (await describeAgent.execute(mockContext as any)) as any

      expect(result.success).toBe(true)
      expect(result.resolutionMethod).toBe('conflict_first_available')
      expect(result.serverUsed).toBe('http://localhost:4222')
      expect(result.agentDetails).toEqual(mockAgentDetails)
    })

    it('should throw error when agent not found on any server', async () => {
      // Mock agent discovery - agent not found on any server
      mockPluginManagerInstance.getAgents.mockResolvedValue([
        { id: 'otherAgent', name: 'Other Agent' },
      ])

      const input: DescribeAgentInput = {
        agentId: 'nonExistentAgent',
      }

      const mockContext = {
        context: input,
      }

      await expect(describeAgent.execute(mockContext as any)).rejects.toThrow(
        "Agent 'nonExistentAgent' not found on any configured server",
      )
    })

    it('should throw error for unknown server in fully qualified ID', async () => {
      const input: DescribeAgentInput = {
        agentId: 'unknownServer:testAgent',
      }

      const mockContext = {
        context: input,
      }

      await expect(describeAgent.execute(mockContext as any)).rejects.toThrow(
        "Unknown server 'unknownServer'",
      )
    })

    it('should handle unknown server with serverUrl override', async () => {
      const mockAgentDetails = {
        id: 'testAgent',
        name: 'Test Agent',
        description: 'A test agent',
        fullyQualifiedId: 'custom.server.com:testAgent',
      }

      mockPluginManagerInstance.getAgentDescription.mockResolvedValue(
        mockAgentDetails,
      )
      mockPluginManagerInstance.getPlugin.mockResolvedValue({
        serverType: 'mastra',
      })

      const input: DescribeAgentInput = {
        agentId: 'unknownServer:testAgent',
        serverUrl: 'http://custom.server.com',
      }

      const mockContext = {
        context: input,
      }

      const result = (await describeAgent.execute(mockContext as any)) as any

      expect(result.success).toBe(true)
      expect(result.resolutionMethod).toBe('explicit_url_override')
      expect(result.serverUsed).toBe('http://custom.server.com')
      expect(result.fullyQualifiedId).toBe('unknownServer:testAgent')
    })

    it('should handle server URL override with known server mapping', async () => {
      const mockAgentDetails = {
        id: 'testAgent',
        name: 'Test Agent',
        description: 'A test agent',
        fullyQualifiedId: 'localhost:4111:testAgent',
      }

      mockPluginManagerInstance.getAgentDescription.mockResolvedValue(
        mockAgentDetails,
      )
      mockPluginManagerInstance.getPlugin.mockResolvedValue({
        serverType: 'mastra',
      })

      const input: DescribeAgentInput = {
        agentId: 'testAgent',
        serverUrl: 'http://localhost:4111',
      }

      const mockContext = {
        context: input,
      }

      const result = (await describeAgent.execute(mockContext as any)) as any

      expect(result.success).toBe(true)
      expect(result.resolutionMethod).toBe('explicit_url_override')
      expect(result.serverUsed).toBe('http://localhost:4111')
      expect(result.fullyQualifiedId).toBe('server0:testAgent')
    })
  })

  describe('agent details retrieval', () => {
    it('should retrieve comprehensive agent details', async () => {
      const mockAgentDetails = {
        id: 'comprehensiveAgent',
        name: 'Comprehensive Agent',
        description: 'A comprehensive test agent with all details',
        fullyQualifiedId: 'localhost:4111:comprehensiveAgent',
        capabilities: ['text-generation', 'analysis'],
        version: '1.0.0',
      }

      mockPluginManagerInstance.getAgentDescription.mockResolvedValue(
        mockAgentDetails,
      )
      mockPluginManagerInstance.getPlugin.mockResolvedValue({
        serverType: 'mastra',
      })

      const input: DescribeAgentInput = {
        agentId: 'server0:comprehensiveAgent',
      }

      const mockContext = {
        context: input,
      }

      const result = (await describeAgent.execute(mockContext as any)) as any

      expect(result.success).toBe(true)
      expect(result.agentDetails).toEqual(mockAgentDetails)
      expect(result.agentDetails.capabilities).toEqual([
        'text-generation',
        'analysis',
      ])
      expect(result.agentDetails.version).toBe('1.0.0')
    })

    it('should handle minimal agent details', async () => {
      const mockAgentDetails = {
        id: 'minimalAgent',
        name: 'Minimal Agent',
        description: undefined,
        fullyQualifiedId: 'localhost:4111:minimalAgent',
      }

      mockPluginManagerInstance.getAgentDescription.mockResolvedValue(
        mockAgentDetails,
      )
      mockPluginManagerInstance.getPlugin.mockResolvedValue({
        serverType: 'mastra',
      })

      const input: DescribeAgentInput = {
        agentId: 'server0:minimalAgent',
      }

      const mockContext = {
        context: input,
      }

      const result = (await describeAgent.execute(mockContext as any)) as any

      expect(result.success).toBe(true)
      expect(result.agentDetails).toEqual(mockAgentDetails)
      expect(result.agentDetails.description).toBeUndefined()
    })

    it('should handle empty agent details', async () => {
      const mockAgentDetails = {
        id: 'emptyAgent',
        name: 'emptyAgent',
        description: undefined,
        fullyQualifiedId: 'localhost:4111:emptyAgent',
      }

      mockPluginManagerInstance.getAgentDescription.mockResolvedValue(
        mockAgentDetails,
      )
      mockPluginManagerInstance.getPlugin.mockResolvedValue({
        serverType: 'mastra',
      })

      const input: DescribeAgentInput = {
        agentId: 'server0:emptyAgent',
      }

      const mockContext = {
        context: input,
      }

      const result = (await describeAgent.execute(mockContext as any)) as any

      expect(result.success).toBe(true)
      expect(result.agentDetails).toEqual(mockAgentDetails)
    })
  })

  describe('retry configuration', () => {
    it('should use correct retry configuration for interactions', async () => {
      const mockAgentDetails = {
        id: 'testAgent',
        name: 'Test Agent',
        description: undefined,
        fullyQualifiedId: 'localhost:4111:testAgent',
      }

      mockPluginManagerInstance.getAgentDescription.mockResolvedValue(
        mockAgentDetails,
      )
      mockPluginManagerInstance.getPlugin.mockResolvedValue({
        serverType: 'mastra',
      })

      const input: DescribeAgentInput = {
        agentId: 'server0:testAgent',
      }

      const mockContext = {
        context: input,
      }

      await describeAgent.execute(mockContext as any)

      expect(
        mockPluginManagerInstance.getAgentDescription,
      ).toHaveBeenCalledWith('http://localhost:4111', 'testAgent', {
        retries: 3,
        backoffMs: 300,
        maxBackoffMs: 5000,
      })
    })

    it('should use correct retry configuration for discovery', async () => {
      // Mock agent discovery
      mockPluginManagerInstance.getAgents.mockResolvedValue([
        { id: 'testAgent', name: 'Test Agent' },
      ])

      const mockAgentDetails = {
        id: 'testAgent',
        name: 'Test Agent',
        description: undefined,
        fullyQualifiedId: 'localhost:4111:testAgent',
      }

      mockPluginManagerInstance.getAgentDescription.mockResolvedValue(
        mockAgentDetails,
      )
      mockPluginManagerInstance.getPlugin.mockResolvedValue({
        serverType: 'mastra',
      })

      const input: DescribeAgentInput = {
        agentId: 'testAgent', // Plain agent ID to trigger discovery
      }

      const mockContext = {
        context: input,
      }

      await describeAgent.execute(mockContext as any)

      expect(mockPluginManagerInstance.getAgents).toHaveBeenCalledWith(
        expect.any(String),
        { retries: 1, backoffMs: 100, maxBackoffMs: 500 },
      )
    })
  })

  describe('error handling', () => {
    it('should handle agent details retrieval errors', async () => {
      mockPluginManagerInstance.getAgentDescription.mockRejectedValue(
        new Error('Details retrieval failed'),
      )
      mockPluginManagerInstance.getPlugin.mockResolvedValue({
        serverType: 'mastra',
      })

      const input: DescribeAgentInput = {
        agentId: 'server0:testAgent',
      }

      const mockContext = {
        context: input,
      }

      await expect(describeAgent.execute(mockContext as any)).rejects.toThrow(
        "Failed to get agent description for 'server0:testAgent': Details retrieval failed",
      )
    })

    it('should handle non-Error exceptions', async () => {
      mockPluginManagerInstance.getAgentDescription.mockRejectedValue(
        'Unknown error',
      )
      mockPluginManagerInstance.getPlugin.mockResolvedValue({
        serverType: 'mastra',
      })

      const input: DescribeAgentInput = {
        agentId: 'server0:testAgent',
      }

      const mockContext = {
        context: input,
      }

      await expect(describeAgent.execute(mockContext as any)).rejects.toThrow(
        "Failed to get agent description for 'server0:testAgent': Unknown error",
      )
    })

    it('should handle client creation errors', async () => {
      mockPluginManager.mockImplementation(() => {
        throw new Error('Client creation failed')
      })

      const input: DescribeAgentInput = {
        agentId: 'server0:testAgent',
      }

      const mockContext = {
        context: input,
      }

      await expect(describeAgent.execute(mockContext as any)).rejects.toThrow(
        "Failed to get agent description for 'server0:testAgent': Client creation failed",
      )
    })
  })

  describe('edge cases', () => {
    it('should handle malformed fully qualified ID', async () => {
      const mockAgentDetails = {
        id: 'agent:extra:parts',
        name: 'Complex Agent',
        description: undefined,
        fullyQualifiedId: 'localhost:4111:agent:extra:parts',
      }

      mockPluginManagerInstance.getAgentDescription.mockResolvedValue(
        mockAgentDetails,
      )
      mockPluginManagerInstance.getPlugin.mockResolvedValue({
        serverType: 'mastra',
      })

      const input: DescribeAgentInput = {
        agentId: 'server0:agent:extra:parts',
      }

      const mockContext = {
        context: input,
      }

      const result = (await describeAgent.execute(mockContext as any)) as any

      expect(result.success).toBe(true)
      expect(result.fullyQualifiedId).toBe('server0:agent:extra:parts')
      expect(
        mockPluginManagerInstance.getAgentDescription,
      ).toHaveBeenCalledWith(
        'http://localhost:4111',
        'agent:extra:parts',
        expect.any(Object),
      )
    })

    it('should handle agent details with null values', async () => {
      const mockAgentDetails = {
        id: 'nullAgent',
        name: null,
        description: null,
        fullyQualifiedId: 'localhost:4111:nullAgent',
      }

      mockPluginManagerInstance.getAgentDescription.mockResolvedValue(
        mockAgentDetails,
      )
      mockPluginManagerInstance.getPlugin.mockResolvedValue({
        serverType: 'mastra',
      })

      const input: DescribeAgentInput = {
        agentId: 'server0:nullAgent',
      }

      const mockContext = {
        context: input,
      }

      const result = (await describeAgent.execute(mockContext as any)) as any

      expect(result.success).toBe(true)
      expect(result.agentDetails).toEqual(mockAgentDetails)
    })

    it('should handle very large agent details', async () => {
      const largeDescription = 'A'.repeat(10000)
      const mockAgentDetails = {
        id: 'largeAgent',
        name: 'Large Agent',
        description: largeDescription,
        fullyQualifiedId: 'localhost:4111:largeAgent',
        metadata: {
          capabilities: Array.from({ length: 100 }, (_, i) => `capability${i}`),
          config: { setting: 'value'.repeat(1000) },
        },
      }

      mockPluginManagerInstance.getAgentDescription.mockResolvedValue(
        mockAgentDetails,
      )
      mockPluginManagerInstance.getPlugin.mockResolvedValue({
        serverType: 'mastra',
      })

      const input: DescribeAgentInput = {
        agentId: 'server0:largeAgent',
      }

      const mockContext = {
        context: input,
      }

      const result = (await describeAgent.execute(mockContext as any)) as any

      expect(result.success).toBe(true)
      expect(result.agentDetails.description).toBe(largeDescription)
      expect(result.agentDetails.metadata.capabilities).toHaveLength(100)
    })
  })
})
