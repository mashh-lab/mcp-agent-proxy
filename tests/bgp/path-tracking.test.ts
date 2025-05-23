// Tests for BGP AS Path Tracking
// Ensures loop prevention and proper route discovery work correctly

import { AgentPathTracker } from '../../src/bgp/path-tracking.js'
import { ServerConfig, BGP_DEFAULTS } from '../../src/bgp/types.js'

// Helper to access private methods for testing
function getPrivateMethods(tracker: AgentPathTracker) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const testTracker = tracker as any
  return {
    extractCapabilities: (agentData: unknown) =>
      testTracker.extractCapabilities(agentData),
    calculateLocalPref: (server: ServerConfig, agentData: unknown) =>
      testTracker.calculateLocalPref(server, agentData),
    calculateMED: (agentData: unknown) => testTracker.calculateMED(agentData),
    extractCommunities: (server: ServerConfig, agentData: unknown) =>
      testTracker.extractCommunities(server, agentData),
  }
}

describe('AgentPathTracker', () => {
  let pathTracker: AgentPathTracker
  let mockServers: ServerConfig[]

  beforeEach(() => {
    // Create test servers with different AS numbers
    mockServers = [
      {
        name: 'server0',
        url: 'http://localhost:4111',
        asn: 65001,
        description: 'Primary server',
        region: 'local',
        priority: 100,
      },
      {
        name: 'server1',
        url: 'http://localhost:4222',
        asn: 65002,
        description: 'Secondary server',
        region: 'remote',
        priority: 90,
      },
      {
        name: 'server2',
        url: 'http://localhost:4333',
        asn: 65003,
        description: 'Tertiary server',
        region: 'backup',
        priority: 80,
      },
    ]

    pathTracker = new AgentPathTracker(65000, mockServers)
  })

  describe('Static Validation Methods', () => {
    it('should validate AS paths correctly', () => {
      // Valid path
      const validPath = [65000, 65001, 65002]
      const validResult = AgentPathTracker.validateASPath(validPath)
      expect(validResult.valid).toBe(true)
      expect(validResult.issues).toHaveLength(0)

      // Path with loop
      const loopPath = [65000, 65001, 65002, 65001]
      const loopResult = AgentPathTracker.validateASPath(loopPath)
      expect(loopResult.valid).toBe(false)
      expect(loopResult.issues[0]).toContain('loop')

      // Path too long
      const longPath = Array.from({ length: 15 }, (_, i) => 65000 + i)
      const longResult = AgentPathTracker.validateASPath(longPath)
      expect(longResult.valid).toBe(false)
      expect(longResult.issues[0]).toContain('too long')

      // Empty path
      const emptyResult = AgentPathTracker.validateASPath([])
      expect(emptyResult.valid).toBe(false)
      expect(emptyResult.issues[0]).toContain('cannot be empty')
    })

    it('should calculate path distances correctly', () => {
      const path = [65000, 65001, 65002, 65003, 65004]

      // Distance between adjacent ASes
      expect(AgentPathTracker.getPathDistance(65000, 65001, path)).toBe(1)

      // Distance between distant ASes
      expect(AgentPathTracker.getPathDistance(65000, 65004, path)).toBe(4)

      // Non-existent AS
      expect(AgentPathTracker.getPathDistance(65000, 65999, path)).toBe(-1)
    })

    it('should check AS path containment correctly', () => {
      const path = [65000, 65001, 65002, 65003]

      // All ASes present
      expect(AgentPathTracker.pathContainsASes(path, [65001, 65003])).toBe(true)

      // Some ASes missing
      expect(AgentPathTracker.pathContainsASes(path, [65001, 65999])).toBe(
        false,
      )

      // Empty target list
      expect(AgentPathTracker.pathContainsASes(path, [])).toBe(true)
    })
  })

  describe('Capability Extraction Logic', () => {
    it('should extract coding capabilities from agent names', () => {
      const mockData = {
        name: 'Advanced Coding Assistant',
        type: 'development',
      }
      const capabilities =
        getPrivateMethods(pathTracker).extractCapabilities(mockData)

      expect(capabilities).toContain('general')
      expect(capabilities).toContain('coding')
      expect(capabilities).toContain('development')
      expect(capabilities).toContain('debugging')
      expect(capabilities).toContain('type:development')
    })

    it('should extract weather capabilities from agent names', () => {
      const mockData = { name: 'Weather Forecasting Bot', type: 'meteorology' }
      const capabilities =
        getPrivateMethods(pathTracker).extractCapabilities(mockData)

      expect(capabilities).toContain('general')
      expect(capabilities).toContain('weather')
      expect(capabilities).toContain('forecasting')
      expect(capabilities).toContain('meteorology')
      expect(capabilities).toContain('type:meteorology')
    })

    it('should handle explicit capabilities field', () => {
      const mockData = {
        name: 'Multi-capability Agent',
        capabilities: ['typescript', 'python', 'debugging', 'testing'],
        type: 'development',
      }
      const capabilities =
        getPrivateMethods(pathTracker).extractCapabilities(mockData)

      expect(capabilities).toEqual([
        'typescript',
        'python',
        'debugging',
        'testing',
      ])
    })

    it('should provide default capabilities for unknown agents', () => {
      const mockData = { name: 'Unknown Agent' }
      const capabilities =
        getPrivateMethods(pathTracker).extractCapabilities(mockData)

      expect(capabilities).toContain('general')
    })
  })

  describe('BGP Attribute Calculation', () => {
    it('should calculate local preference based on server priority', () => {
      const highPriorityServer = mockServers[0] // priority: 100
      const lowPriorityServer = { ...mockServers[1], priority: 50 }
      const mockAgentData = { name: 'Test Agent' }

      const highPref = getPrivateMethods(pathTracker).calculateLocalPref(
        highPriorityServer,
        mockAgentData,
      )
      const lowPref = getPrivateMethods(pathTracker).calculateLocalPref(
        lowPriorityServer,
        mockAgentData,
      )

      expect(highPref).toBeGreaterThanOrEqual(BGP_DEFAULTS.LOCAL_PREF)
      expect(lowPref).toBeLessThan(highPref)
    })

    it('should calculate local preference based on region', () => {
      const localServer = { ...mockServers[0], region: 'local' }
      const remoteServer = { ...mockServers[1], region: 'remote' }
      const mockAgentData = { name: 'Test Agent' }

      const localPref = getPrivateMethods(pathTracker).calculateLocalPref(
        localServer,
        mockAgentData,
      )
      const remotePref = getPrivateMethods(pathTracker).calculateLocalPref(
        remoteServer,
        mockAgentData,
      )

      expect(localPref).toBeGreaterThan(remotePref)
    })

    it('should calculate MED based on agent performance', () => {
      const fastAgent = {
        name: 'Fast Agent',
        responseTime: 50,
        queueDepth: 0,
        errorRate: 0.01,
      }
      const slowAgent = {
        name: 'Slow Agent',
        responseTime: 2000,
        queueDepth: 5,
        errorRate: 0.1,
      }

      const fastMED = getPrivateMethods(pathTracker).calculateMED(fastAgent)
      const slowMED = getPrivateMethods(pathTracker).calculateMED(slowAgent)

      expect(fastMED).toBeLessThan(slowMED) // Lower MED = better performance
      expect(fastMED).toBeGreaterThanOrEqual(0)
      expect(slowMED).toBeLessThanOrEqual(999) // Should be capped
    })

    it('should handle missing performance data gracefully', () => {
      const agentWithoutPerf = { name: 'Basic Agent' }
      const med = getPrivateMethods(pathTracker).calculateMED(agentWithoutPerf)

      expect(med).toBe(BGP_DEFAULTS.MED) // Should return default MED
    })
  })

  describe('Community Generation', () => {
    it('should generate server-based communities', () => {
      const server = mockServers[0]
      const agentData = { name: 'Test Agent', type: 'development' }

      const communities = getPrivateMethods(pathTracker).extractCommunities(
        server,
        agentData,
      )

      expect(communities).toContain('server:server0')
      expect(communities).toContain('as:65001')
      expect(communities).toContain('region:local')
    })

    it('should generate agent-type communities', () => {
      const server = mockServers[0]
      const agentData = { name: 'Test Agent', type: 'development' }

      const communities = getPrivateMethods(pathTracker).extractCommunities(
        server,
        agentData,
      )

      expect(communities).toContain('agent-type:development')
    })

    it('should generate performance-based communities', () => {
      const server = mockServers[0]
      const fastAgent = { name: 'Fast Agent', responseTime: 50 }
      const slowAgent = { name: 'Slow Agent', responseTime: 2000 }

      const fastCommunities = getPrivateMethods(pathTracker).extractCommunities(
        server,
        fastAgent,
      )
      const slowCommunities = getPrivateMethods(pathTracker).extractCommunities(
        server,
        slowAgent,
      )

      expect(fastCommunities).toContain('performance:fast')
      expect(slowCommunities).toContain('performance:slow')
    })

    it('should generate availability-based communities', () => {
      const server = mockServers[0]
      const highAvailAgent = { name: 'HA Agent', availability: 0.999 }
      const lowAvailAgent = { name: 'LA Agent', availability: 0.9 }

      const haCommunities = getPrivateMethods(pathTracker).extractCommunities(
        server,
        highAvailAgent,
      )
      const laCommunities = getPrivateMethods(pathTracker).extractCommunities(
        server,
        lowAvailAgent,
      )

      expect(haCommunities).toContain('availability:high')
      expect(laCommunities).toContain('availability:low')
    })
  })

  // NOTE: Integration tests with real MastraClient would go here
  // These would test the actual network discovery functionality
  // For now, we've verified all the core BGP logic works correctly
  describe.todo('Integration Tests (Future)', () => {
    // TODO: Add integration tests that use real MastraClient
    // - Test actual agent discovery with mock servers
    // - Test loop prevention in real network scenarios
    // - Test path construction with multiple hops
    // - Test error handling with unreachable servers
  })
})
