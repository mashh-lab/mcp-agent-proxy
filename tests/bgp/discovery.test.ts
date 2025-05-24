// Tests for Real-Time Agent Discovery System
// Ensures instant network-wide agent discovery and capability monitoring work correctly

import {
  RealTimeDiscoveryManager,
  DiscoveryConfig,
  NetworkAgent,
  DiscoveryEvent,
} from '../../src/bgp/discovery.js'
import {
  AgentAdvertisementManager,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  AgentCapabilities,
  AdvertisementConfig,
} from '../../src/bgp/advertisement.js'
import { BGPSession } from '../../src/bgp/session.js'
import { AgentRoute } from '../../src/bgp/types.js'

describe('RealTimeDiscoveryManager', () => {
  let bgpSession: BGPSession
  let advertisementManager: AgentAdvertisementManager
  let discoveryManager: RealTimeDiscoveryManager
  let config: DiscoveryConfig

  const localASN = 65000
  const routerId = 'test-router-65000'

  beforeEach(() => {
    bgpSession = new BGPSession(localASN, routerId)

    const advConfig: AdvertisementConfig = {
      localASN,
      routerId,
      hostname: 'localhost',
      port: 8080,
      advertisementInterval: 1000,
    }
    advertisementManager = new AgentAdvertisementManager(bgpSession, advConfig)

    config = {
      localASN,
      routerId,
      realTimeUpdates: true,
      discoveryInterval: 1000, // 1 second for testing
      healthThreshold: 'degraded',
      maxHops: 3,
      enableBroadcast: true,
    }
    discoveryManager = new RealTimeDiscoveryManager(
      bgpSession,
      advertisementManager,
      config,
    )
  })

  afterEach(async () => {
    await discoveryManager.shutdown()
    await advertisementManager.shutdown()
    await bgpSession.shutdown()
  })

  describe('Initialization', () => {
    it('should initialize with correct configuration', () => {
      const stats = discoveryManager.getDiscoveryStats()

      expect(stats.totalNetworkAgents).toBe(0)
      expect(stats.totalCapabilities).toBe(0)
      expect(stats.totalASNs).toBe(0)
      expect(stats.discoveryInterval).toBe(1000)
      expect(stats.realTimeUpdates).toBe(true)
      expect(stats.pendingRequests).toBe(0)
    })

    it('should start with empty network agents', () => {
      const networkAgents = discoveryManager.getNetworkAgents()
      expect(networkAgents.size).toBe(0)
    })

    it('should handle custom configuration', () => {
      const customConfig: DiscoveryConfig = {
        localASN: 65001,
        routerId: 'custom-router',
        realTimeUpdates: false,
        discoveryInterval: 5000,
        healthThreshold: 'healthy',
        maxHops: 10,
        enableBroadcast: false,
        capabilityFilters: ['coding', 'weather'],
      }

      const customManager = new RealTimeDiscoveryManager(
        bgpSession,
        advertisementManager,
        customConfig,
      )

      const stats = customManager.getDiscoveryStats()
      expect(stats.discoveryInterval).toBe(5000)
      expect(stats.realTimeUpdates).toBe(false)

      // Cleanup
      customManager.shutdown()
    })
  })

  describe('Agent Discovery', () => {
    it('should discover agents from BGP route updates', () => {
      const route: AgentRoute = {
        agentId: 'test-agent-1',
        capabilities: ['coding', 'javascript'],
        asPath: [65001],
        nextHop: 'http://localhost:4445',
        localPref: 100,
        med: 0,
        communities: ['capability:coding', 'health:healthy'],
        originTime: new Date(),
        pathAttributes: new Map([
          ['agent-version', '1.0.0'],
          ['agent-description', 'Test agent'],
        ]),
      }

      // Simulate BGP route update
      const update = {
        type: 'UPDATE' as const,
        timestamp: new Date(),
        senderASN: 65001,
        advertisedRoutes: [route],
      }

      let discoveredAgent: NetworkAgent | null = null
      discoveryManager.on('agentDiscovered', (agent: NetworkAgent) => {
        discoveredAgent = agent
      })

      // Trigger route update processing
      bgpSession.emit('routeUpdate', 65001, update)

      expect(discoveredAgent).toBeDefined()
      expect(discoveredAgent!.agent.agentId).toBe('test-agent-1')
      expect(discoveredAgent!.agent.capabilities).toEqual([
        'coding',
        'javascript',
      ])
      expect(discoveredAgent!.sourceASN).toBe(65001)
      expect(discoveredAgent!.asPath).toEqual([65001])
      expect(discoveredAgent!.agent.healthStatus).toBe('healthy')
    })

    it('should filter agents by health threshold', () => {
      const unhealthyRoute: AgentRoute = {
        agentId: 'unhealthy-agent',
        capabilities: ['coding'],
        asPath: [65001],
        nextHop: 'http://localhost:4445',
        localPref: 100,
        med: 0,
        communities: ['health:unhealthy'],
        originTime: new Date(),
        pathAttributes: new Map(),
      }

      const update = {
        type: 'UPDATE' as const,
        timestamp: new Date(),
        senderASN: 65001,
        advertisedRoutes: [unhealthyRoute],
      }

      let agentDiscovered = false
      discoveryManager.on('agentDiscovered', () => {
        agentDiscovered = true
      })

      bgpSession.emit('routeUpdate', 65001, update)

      // Should not discover unhealthy agent when threshold is 'degraded'
      expect(agentDiscovered).toBe(false)
    })

    it('should filter agents by capability filters', async () => {
      // Create manager with capability filters
      const filteredConfig: DiscoveryConfig = {
        ...config,
        capabilityFilters: ['weather'],
      }

      const filteredManager = new RealTimeDiscoveryManager(
        bgpSession,
        advertisementManager,
        filteredConfig,
      )

      const codingRoute: AgentRoute = {
        agentId: 'coding-agent',
        capabilities: ['coding', 'javascript'],
        asPath: [65001],
        nextHop: 'http://localhost:4445',
        localPref: 100,
        med: 0,
        communities: ['health:healthy'],
        originTime: new Date(),
        pathAttributes: new Map(),
      }

      const weatherRoute: AgentRoute = {
        agentId: 'weather-agent',
        capabilities: ['weather', 'forecasting'],
        asPath: [65001],
        nextHop: 'http://localhost:4445',
        localPref: 100,
        med: 0,
        communities: ['health:healthy'],
        originTime: new Date(),
        pathAttributes: new Map(),
      }

      let discoveredCount = 0
      filteredManager.on('agentDiscovered', () => {
        discoveredCount++
      })

      // Send both agents
      bgpSession.emit('routeUpdate', 65001, {
        type: 'UPDATE' as const,
        timestamp: new Date(),
        senderASN: 65001,
        advertisedRoutes: [codingRoute, weatherRoute],
      })

      // Should only discover weather agent
      expect(discoveredCount).toBe(1)

      await filteredManager.shutdown()
    })

    it('should skip agents from local ASN', () => {
      const localRoute: AgentRoute = {
        agentId: 'local-agent',
        capabilities: ['coding'],
        asPath: [localASN], // Same as our ASN
        nextHop: 'http://localhost:8080',
        localPref: 100,
        med: 0,
        communities: ['health:healthy'],
        originTime: new Date(),
        pathAttributes: new Map(),
      }

      let agentDiscovered = false
      discoveryManager.on('agentDiscovered', () => {
        agentDiscovered = true
      })

      bgpSession.emit('routeUpdate', 65001, {
        type: 'UPDATE' as const,
        timestamp: new Date(),
        senderASN: 65001,
        advertisedRoutes: [localRoute],
      })

      expect(agentDiscovered).toBe(false)
    })
  })

  describe('Agent Withdrawal', () => {
    it('should handle agent withdrawal', () => {
      // First add an agent
      const route: AgentRoute = {
        agentId: 'test-agent-1',
        capabilities: ['coding'],
        asPath: [65001],
        nextHop: 'http://localhost:4445',
        localPref: 100,
        med: 0,
        communities: ['health:healthy'],
        originTime: new Date(),
        pathAttributes: new Map(),
      }

      bgpSession.emit('routeUpdate', 65001, {
        type: 'UPDATE' as const,
        timestamp: new Date(),
        senderASN: 65001,
        advertisedRoutes: [route],
      })

      expect(discoveryManager.getNetworkAgents().size).toBe(1)

      let lostAgent: NetworkAgent | null = null
      discoveryManager.on('agentLost', (agent: NetworkAgent) => {
        lostAgent = agent
      })

      // Now withdraw the agent
      bgpSession.emit('routeUpdate', 65001, {
        type: 'UPDATE' as const,
        timestamp: new Date(),
        senderASN: 65001,
        withdrawnRoutes: ['test-agent-1'],
      })

      expect(discoveryManager.getNetworkAgents().size).toBe(0)
      expect(lostAgent).toBeDefined()
      expect(lostAgent!.agent.agentId).toBe('test-agent-1')
    })

    it('should only withdraw agents from correct ASN', () => {
      // Add agents from different ASNs with DIFFERENT agent IDs
      const route1: AgentRoute = {
        agentId: 'agent-from-as65001',
        capabilities: ['coding'],
        asPath: [65001],
        nextHop: 'http://localhost:4445',
        localPref: 100,
        med: 0,
        communities: ['health:healthy'],
        originTime: new Date(),
        pathAttributes: new Map(),
      }

      const route2: AgentRoute = {
        agentId: 'agent-from-as65002',
        capabilities: ['weather'],
        asPath: [65002],
        nextHop: 'http://localhost:4446',
        localPref: 100,
        med: 0,
        communities: ['health:healthy'],
        originTime: new Date(),
        pathAttributes: new Map(),
      }

      bgpSession.emit('routeUpdate', 65001, {
        type: 'UPDATE' as const,
        timestamp: new Date(),
        senderASN: 65001,
        advertisedRoutes: [route1],
      })

      bgpSession.emit('routeUpdate', 65002, {
        type: 'UPDATE' as const,
        timestamp: new Date(),
        senderASN: 65002,
        advertisedRoutes: [route2],
      })

      expect(discoveryManager.getNetworkAgents().size).toBe(2)

      // Withdraw from AS65001 only
      bgpSession.emit('routeUpdate', 65001, {
        type: 'UPDATE' as const,
        timestamp: new Date(),
        senderASN: 65001,
        withdrawnRoutes: ['agent-from-as65001'],
      })

      // Should still have the agent from AS65002
      expect(discoveryManager.getNetworkAgents().size).toBe(1)
      const remainingAgent = discoveryManager
        .getNetworkAgents()
        .get('agent-from-as65002')
      expect(remainingAgent!.sourceASN).toBe(65002)
    })
  })

  describe('Local Agent Integration', () => {
    it('should handle local agent registration', async () => {
      let localDiscoveryEvent: DiscoveryEvent | null = null
      discoveryManager.on('realTimeUpdate', (event: DiscoveryEvent) => {
        localDiscoveryEvent = event
      })

      await advertisementManager.registerAgent({
        agentId: 'local-agent-1',
        capabilities: ['coding', 'testing'],
      })

      expect(localDiscoveryEvent).toBeDefined()
      expect(localDiscoveryEvent!.type).toBe('agentDiscovered')
      expect(localDiscoveryEvent!.agent.agent.agentId).toBe('local-agent-1')
      expect(localDiscoveryEvent!.sourceASN).toBe(localASN)
    })

    it('should handle local agent updates', async () => {
      await advertisementManager.registerAgent({
        agentId: 'local-agent-1',
        capabilities: ['coding'],
      })

      let updateEvent: DiscoveryEvent | null = null
      discoveryManager.on('realTimeUpdate', (event: DiscoveryEvent) => {
        if (event.type === 'capabilityChanged') {
          updateEvent = event
        }
      })

      await advertisementManager.updateAgent('local-agent-1', {
        capabilities: ['coding', 'debugging', 'testing'],
        healthStatus: 'degraded',
      })

      expect(updateEvent).toBeDefined()
      expect(updateEvent!.type).toBe('capabilityChanged')
      expect(updateEvent!.agent.agent.capabilities).toContain('debugging')
    })

    it('should handle local agent unregistration', async () => {
      await advertisementManager.registerAgent({
        agentId: 'local-agent-1',
        capabilities: ['coding'],
      })

      let lostEvent: DiscoveryEvent | null = null
      discoveryManager.on('realTimeUpdate', (event: DiscoveryEvent) => {
        if (event.type === 'agentLost') {
          lostEvent = event
        }
      })

      await advertisementManager.unregisterAgent('local-agent-1')

      expect(lostEvent).toBeDefined()
      expect(lostEvent!.type).toBe('agentLost')
      expect(lostEvent!.agent.agent.agentId).toBe('local-agent-1')
    })
  })

  describe('Capability-Based Discovery', () => {
    beforeEach(() => {
      // Add some test agents
      const routes: AgentRoute[] = [
        {
          agentId: 'coding-agent-1',
          capabilities: ['coding', 'javascript'],
          asPath: [65001],
          nextHop: 'http://localhost:4445',
          localPref: 150,
          med: 10,
          communities: ['health:healthy'],
          originTime: new Date(),
          pathAttributes: new Map(),
        },
        {
          agentId: 'coding-agent-2',
          capabilities: ['coding', 'python'],
          asPath: [65002],
          nextHop: 'http://localhost:4446',
          localPref: 100,
          med: 20,
          communities: ['health:degraded'],
          originTime: new Date(),
          pathAttributes: new Map(),
        },
        {
          agentId: 'weather-agent',
          capabilities: ['weather', 'forecasting'],
          asPath: [65001],
          nextHop: 'http://localhost:4445',
          localPref: 120,
          med: 5,
          communities: ['health:healthy'],
          originTime: new Date(),
          pathAttributes: new Map(),
        },
      ]

      for (const route of routes) {
        bgpSession.emit('routeUpdate', route.asPath[0], {
          type: 'UPDATE' as const,
          timestamp: new Date(),
          senderASN: route.asPath[0],
          advertisedRoutes: [route],
        })
      }
    })

    it('should discover agents by capability', async () => {
      const codingAgents =
        await discoveryManager.discoverAgentsByCapability('coding')

      expect(codingAgents).toHaveLength(2)
      expect(codingAgents.map((a) => a.agent.agentId)).toContain(
        'coding-agent-1',
      )
      expect(codingAgents.map((a) => a.agent.agentId)).toContain(
        'coding-agent-2',
      )
    })

    it('should handle case-insensitive capability matching', async () => {
      const agents = await discoveryManager.discoverAgentsByCapability('CODING')
      expect(agents).toHaveLength(2)
    })

    it('should respect maxResults parameter', async () => {
      const agents = await discoveryManager.discoverAgentsByCapability(
        'coding',
        {
          maxResults: 1,
        },
      )

      expect(agents).toHaveLength(1)
    })

    it('should filter by health status', async () => {
      const healthyAgents = await discoveryManager.discoverAgentsByCapability(
        'coding',
        {
          healthFilter: 'healthy',
        },
      )

      expect(healthyAgents).toHaveLength(1)
      expect(healthyAgents[0].agent.agentId).toBe('coding-agent-1')
    })

    it('should sort agents by preference', async () => {
      const agents = await discoveryManager.discoverAgentsByCapability('coding')

      // Should be sorted by local preference (higher first)
      expect(agents[0].agent.agentId).toBe('coding-agent-1') // localPref: 150
      expect(agents[1].agent.agentId).toBe('coding-agent-2') // localPref: 100
    })

    it('should handle empty results', async () => {
      const agents =
        await discoveryManager.discoverAgentsByCapability('nonexistent')
      expect(agents).toHaveLength(0)
    })
  })

  describe('Peer Management', () => {
    it('should handle peer removal', () => {
      // Add agents from a peer
      const route: AgentRoute = {
        agentId: 'peer-agent',
        capabilities: ['coding'],
        asPath: [65001],
        nextHop: 'http://localhost:4445',
        localPref: 100,
        med: 0,
        communities: ['health:healthy'],
        originTime: new Date(),
        pathAttributes: new Map(),
      }

      bgpSession.emit('routeUpdate', 65001, {
        type: 'UPDATE' as const,
        timestamp: new Date(),
        senderASN: 65001,
        advertisedRoutes: [route],
      })

      expect(discoveryManager.getNetworkAgents().size).toBe(1)

      const lostAgents: NetworkAgent[] = []
      discoveryManager.on('agentLost', (agent: NetworkAgent) => {
        lostAgents.push(agent)
      })

      // Remove the peer
      bgpSession.emit('peerRemoved', 65001)

      expect(discoveryManager.getNetworkAgents().size).toBe(0)
      expect(lostAgents).toHaveLength(1)
      expect(lostAgents[0].agent.agentId).toBe('peer-agent')
    })

    it('should handle session establishment', async () => {
      let exchangeInitiated = false

      // Mock the discovery exchange
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const originalInitiate = discoveryManager['initiateDiscoveryExchange']
      discoveryManager['initiateDiscoveryExchange'] = async (
        peerASN: number,
      ) => {
        exchangeInitiated = true
        expect(peerASN).toBe(65001)
      }

      bgpSession.emit('sessionEstablished', 65001)

      expect(exchangeInitiated).toBe(true)
    })
  })

  describe('Statistics and Monitoring', () => {
    it('should provide accurate discovery statistics', () => {
      // Add some test agents
      const routes: AgentRoute[] = [
        {
          agentId: 'agent-1',
          capabilities: ['coding', 'javascript'],
          asPath: [65001],
          nextHop: 'http://localhost:4445',
          localPref: 100,
          med: 0,
          communities: ['health:healthy'],
          originTime: new Date(),
          pathAttributes: new Map(),
        },
        {
          agentId: 'agent-2',
          capabilities: ['weather'],
          asPath: [65002],
          nextHop: 'http://localhost:4446',
          localPref: 100,
          med: 0,
          communities: ['health:degraded'],
          originTime: new Date(),
          pathAttributes: new Map(),
        },
      ]

      for (const route of routes) {
        bgpSession.emit('routeUpdate', route.asPath[0], {
          type: 'UPDATE' as const,
          timestamp: new Date(),
          senderASN: route.asPath[0],
          advertisedRoutes: [route],
        })
      }

      const stats = discoveryManager.getDiscoveryStats()

      expect(stats.totalNetworkAgents).toBe(2)
      expect(stats.totalCapabilities).toBe(3) // coding, javascript, weather
      expect(stats.totalASNs).toBe(2) // 65001, 65002
      expect(stats.healthDistribution.healthy).toBe(1)
      expect(stats.healthDistribution.degraded).toBe(1)
      expect(stats.asPathLengths['1']).toBe(2) // Both have path length 1
    })

    it('should track agents by ASN', () => {
      const route: AgentRoute = {
        agentId: 'test-agent',
        capabilities: ['coding'],
        asPath: [65001],
        nextHop: 'http://localhost:4445',
        localPref: 100,
        med: 0,
        communities: ['health:healthy'],
        originTime: new Date(),
        pathAttributes: new Map(),
      }

      bgpSession.emit('routeUpdate', 65001, {
        type: 'UPDATE' as const,
        timestamp: new Date(),
        senderASN: 65001,
        advertisedRoutes: [route],
      })

      const agentsByASN = discoveryManager.getAgentsByASN(65001)
      expect(agentsByASN).toHaveLength(1)
      expect(agentsByASN[0].agent.agentId).toBe('test-agent')

      const emptyASN = discoveryManager.getAgentsByASN(65999)
      expect(emptyASN).toHaveLength(0)
    })
  })

  describe('Periodic Discovery', () => {
    it('should emit discovery sweeper completed event', async () => {
      // Use shorter interval for testing
      const testManager = new RealTimeDiscoveryManager(
        bgpSession,
        advertisementManager,
        {
          ...config,
          discoveryInterval: 100, // 100ms
        },
      )

      let sweeperEvent: {
        totalAgents: number
        staleAgentsRemoved: number
        timestamp: Date
      } | null = null
      testManager.on(
        'discoverySweeperCompleted',
        (event: {
          totalAgents: number
          staleAgentsRemoved: number
          timestamp: Date
        }) => {
          sweeperEvent = event
        },
      )

      // Wait for sweep
      await new Promise((resolve) => setTimeout(resolve, 150))

      expect(sweeperEvent).toBeDefined()
      expect(sweeperEvent!.totalAgents).toBeDefined()
      expect(sweeperEvent!.staleAgentsRemoved).toBeDefined()
      expect(sweeperEvent!.timestamp).toBeInstanceOf(Date)

      await testManager.shutdown()
    }, 10000)

    it('should clean up stale agents', async () => {
      // Add an agent and manually set old timestamp
      const route: AgentRoute = {
        agentId: 'stale-agent',
        capabilities: ['coding'],
        asPath: [65001],
        nextHop: 'http://localhost:4445',
        localPref: 100,
        med: 0,
        communities: ['health:healthy'],
        originTime: new Date(),
        pathAttributes: new Map(),
      }

      bgpSession.emit('routeUpdate', 65001, {
        type: 'UPDATE' as const,
        timestamp: new Date(),
        senderASN: 65001,
        advertisedRoutes: [route],
      })

      expect(discoveryManager.getNetworkAgents().size).toBe(1)

      // Manually set old timestamp to make it stale
      const agent = discoveryManager.getNetworkAgents().get('stale-agent')
      if (agent) {
        agent.lastUpdated = new Date(Date.now() - 10 * 60 * 1000) // 10 minutes ago
      }

      let staleAgentsRemoved = 0
      discoveryManager.on(
        'discoverySweeperCompleted',
        (event: {
          totalAgents: number
          staleAgentsRemoved: number
          timestamp: Date
        }) => {
          staleAgentsRemoved = event.staleAgentsRemoved
        },
      )

      // Trigger periodic discovery manually
      await discoveryManager['performPeriodicDiscovery']()

      expect(staleAgentsRemoved).toBe(1)
      expect(discoveryManager.getNetworkAgents().size).toBe(0)
    })
  })

  describe('Error Handling', () => {
    it('should handle discovery request failures gracefully', async () => {
      // This tests the timeout mechanism in broadcastDiscoveryRequest
      const agents = await discoveryManager.discoverAgentsByCapability(
        'nonexistent',
        {
          timeout: 100, // Very short timeout
        },
      )

      expect(agents).toHaveLength(0)
    })

    it('should handle malformed route updates', () => {
      // Test with missing required fields
      const malformedRoute: Partial<AgentRoute> = {
        agentId: 'malformed-agent',
        // Missing capabilities, asPath, etc.
      }

      expect(() => {
        bgpSession.emit('routeUpdate', 65001, {
          type: 'UPDATE' as const,
          timestamp: new Date(),
          senderASN: 65001,
          advertisedRoutes: [malformedRoute as AgentRoute],
        })
      }).not.toThrow()

      // Should not have added the malformed agent
      expect(discoveryManager.getNetworkAgents().size).toBe(0)
    })
  })

  describe('Shutdown', () => {
    it('should shutdown cleanly', async () => {
      // Add some agents first
      const route: AgentRoute = {
        agentId: 'test-agent',
        capabilities: ['coding'],
        asPath: [65001],
        nextHop: 'http://localhost:4445',
        localPref: 100,
        med: 0,
        communities: ['health:healthy'],
        originTime: new Date(),
        pathAttributes: new Map(),
      }

      bgpSession.emit('routeUpdate', 65001, {
        type: 'UPDATE' as const,
        timestamp: new Date(),
        senderASN: 65001,
        advertisedRoutes: [route],
      })

      expect(discoveryManager.getNetworkAgents().size).toBe(1)

      await expect(discoveryManager.shutdown()).resolves.not.toThrow()

      // All data should be cleared
      expect(discoveryManager.getNetworkAgents().size).toBe(0)
      const stats = discoveryManager.getDiscoveryStats()
      expect(stats.totalNetworkAgents).toBe(0)
      expect(stats.totalCapabilities).toBe(0)
      expect(stats.totalASNs).toBe(0)
    })

    it('should emit shutdown event', async () => {
      let shutdownReceived = false
      discoveryManager.on('shutdown', () => {
        shutdownReceived = true
      })

      await discoveryManager.shutdown()
      expect(shutdownReceived).toBe(true)
    })

    it('should stop discovery timer on shutdown', async () => {
      const testManager = new RealTimeDiscoveryManager(
        bgpSession,
        advertisementManager,
        {
          ...config,
          discoveryInterval: 100,
        },
      )

      await testManager.shutdown()

      // Timer should be stopped
      let sweeperAfterShutdown = false
      testManager.on('discoverySweeperCompleted', () => {
        sweeperAfterShutdown = true
      })

      await new Promise((resolve) => setTimeout(resolve, 200))
      expect(sweeperAfterShutdown).toBe(false)
    })
  })
})
