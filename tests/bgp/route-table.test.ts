// Tests for BGP Route Table Management
// Ensures our Agent Internet routing infrastructure works correctly

import { AgentRouteTable } from '../../src/bgp/route-table.js'
import { AgentRoute } from '../../src/bgp/types.js'

/**
 * Helper function to create test routes
 */
function createTestRoute(
  agentId: string,
  overrides: Partial<AgentRoute> = {},
): AgentRoute {
  return {
    agentId,
    capabilities: ['general'],
    asPath: [65001],
    nextHop: 'http://localhost:4111',
    localPref: 100,
    med: 0,
    communities: [],
    originTime: new Date(),
    pathAttributes: new Map(),
    ...overrides,
  }
}

describe('AgentRouteTable', () => {
  let routeTable: AgentRouteTable

  beforeEach(() => {
    routeTable = new AgentRouteTable()
  })

  describe('Basic Operations', () => {
    it('should store and retrieve routes correctly', () => {
      const route = createTestRoute('test-agent', {
        capabilities: ['coding'],
        asPath: [65001],
      })

      routeTable.addRouteFromPeer(65001, route)
      const routes = routeTable.getRoutesForAgent('test-agent')

      expect(routes).toHaveLength(1)
      expect(routes[0].agentId).toBe('test-agent')
      expect(routes[0].capabilities).toContain('coding')
      expect(routes[0].asPath).toEqual([65001])
    })

    it('should handle multiple routes for same agent from different peers', () => {
      const route1 = createTestRoute('popular-agent', {
        asPath: [65001],
        med: 10,
      })
      const route2 = createTestRoute('popular-agent', {
        asPath: [65002],
        med: 20,
      })

      routeTable.addRouteFromPeer(65001, route1)
      routeTable.addRouteFromPeer(65002, route2)

      const routes = routeTable.getRoutesForAgent('popular-agent')
      expect(routes).toHaveLength(2)
      expect(routes.map((r) => r.asPath[0])).toEqual(
        expect.arrayContaining([65001, 65002]),
      )
    })

    it('should remove routes correctly', () => {
      const route = createTestRoute('temp-agent')

      routeTable.addRouteFromPeer(65001, route)
      expect(routeTable.getRoutesForAgent('temp-agent')).toHaveLength(1)

      const removed = routeTable.removeRouteFromPeer(65001, 'temp-agent')
      expect(removed).toBe(true)
      expect(routeTable.getRoutesForAgent('temp-agent')).toHaveLength(0)
    })

    it('should handle removing non-existent routes', () => {
      const removed = routeTable.removeRouteFromPeer(65001, 'non-existent')
      expect(removed).toBe(false)
    })
  })

  describe('Loc-RIB Operations', () => {
    it('should install and retrieve best routes', () => {
      const route = createTestRoute('best-agent', {
        capabilities: ['weather'],
        localPref: 150,
      })

      routeTable.installBestRoute('best-agent', route)
      const bestRoute = routeTable.getBestRoute('best-agent')

      expect(bestRoute).toBeDefined()
      expect(bestRoute?.agentId).toBe('best-agent')
      expect(bestRoute?.localPref).toBe(150)
    })

    it('should return all known agents', () => {
      const routes = [
        createTestRoute('agent1'),
        createTestRoute('agent2'),
        createTestRoute('agent3'),
      ]

      routes.forEach((route) =>
        routeTable.installBestRoute(route.agentId, route),
      )

      const knownAgents = routeTable.getAllKnownAgents()
      expect(knownAgents).toHaveLength(3)
      expect(knownAgents).toEqual(
        expect.arrayContaining(['agent1', 'agent2', 'agent3']),
      )
    })

    it('should remove best routes', () => {
      const route = createTestRoute('temporary-best')

      routeTable.installBestRoute('temporary-best', route)
      expect(routeTable.getBestRoute('temporary-best')).toBeDefined()

      const removed = routeTable.removeBestRoute('temporary-best')
      expect(removed).toBe(true)
      expect(routeTable.getBestRoute('temporary-best')).toBeUndefined()
    })
  })

  describe('Peer Management', () => {
    it('should remove all routes from a peer', () => {
      const routes = [
        createTestRoute('agent1'),
        createTestRoute('agent2'),
        createTestRoute('agent3'),
      ]

      routes.forEach((route) => routeTable.addRouteFromPeer(65001, route))
      expect(routeTable.getRoutesFromPeer(65001).size).toBe(3)

      const removedCount = routeTable.removeAllRoutesFromPeer(65001)
      expect(removedCount).toBe(3)
      expect(routeTable.getRoutesFromPeer(65001).size).toBe(0)
    })

    it('should handle removing routes from non-existent peer', () => {
      const removedCount = routeTable.removeAllRoutesFromPeer(65999)
      expect(removedCount).toBe(0)
    })
  })

  describe('Capability-Based Querying', () => {
    beforeEach(() => {
      const routes = [
        createTestRoute('coding-agent', {
          capabilities: ['coding', 'typescript'],
        }),
        createTestRoute('weather-agent', {
          capabilities: ['weather', 'forecasting'],
        }),
        createTestRoute('multi-agent', {
          capabilities: ['coding', 'weather', 'analysis'],
        }),
      ]

      routes.forEach((route) =>
        routeTable.installBestRoute(route.agentId, route),
      )
    })

    it('should find agents by exact capability', () => {
      const codingAgents = routeTable.findAgentsByCapability('coding')
      expect(codingAgents).toHaveLength(2)
      expect(codingAgents.map((r) => r.agentId)).toEqual(
        expect.arrayContaining(['coding-agent', 'multi-agent']),
      )
    })

    it('should find agents by capability pattern', () => {
      const weatherAgents = routeTable.findAgentsByCapabilityPattern('weather*')
      expect(weatherAgents).toHaveLength(2)
      expect(weatherAgents.map((r) => r.agentId)).toEqual(
        expect.arrayContaining(['weather-agent', 'multi-agent']),
      )
    })

    it('should handle patterns with no matches', () => {
      const noMatches = routeTable.findAgentsByCapabilityPattern('nonexistent*')
      expect(noMatches).toHaveLength(0)
    })
  })

  describe('AS Path and Community Querying', () => {
    beforeEach(() => {
      const routes = [
        createTestRoute('local-agent', {
          asPath: [65001],
          communities: ['local', 'fast'],
        }),
        createTestRoute('remote-agent', {
          asPath: [65001, 65002],
          communities: ['remote', 'slow'],
        }),
        createTestRoute('far-agent', {
          asPath: [65001, 65002, 65003],
          communities: ['remote', 'backup'],
        }),
      ]

      routes.forEach((route) =>
        routeTable.installBestRoute(route.agentId, route),
      )
    })

    it('should find agents by AS path', () => {
      const throughAS65002 = routeTable.findAgentsByASPath([65002])
      expect(throughAS65002).toHaveLength(2)
      expect(throughAS65002.map((r) => r.agentId)).toEqual(
        expect.arrayContaining(['remote-agent', 'far-agent']),
      )
    })

    it('should find agents by community', () => {
      const remoteAgents = routeTable.findAgentsByCommunity('remote')
      expect(remoteAgents).toHaveLength(2)
      expect(remoteAgents.map((r) => r.agentId)).toEqual(
        expect.arrayContaining(['remote-agent', 'far-agent']),
      )
    })

    it('should find agents with multiple AS path criteria', () => {
      const throughBothASes = routeTable.findAgentsByASPath([65002, 65003])
      expect(throughBothASes).toHaveLength(1)
      expect(throughBothASes[0].agentId).toBe('far-agent')
    })
  })

  describe('Statistics and Monitoring', () => {
    beforeEach(() => {
      // Add some test data
      const routes = [
        createTestRoute('agent1'),
        createTestRoute('agent2'),
        createTestRoute('agent3'),
      ]

      routes.forEach((route) => {
        routeTable.addRouteFromPeer(65001, route)
        routeTable.addRouteFromPeer(65002, route)
        routeTable.installBestRoute(route.agentId, route)
        routeTable.addRouteForPeer(65003, route)
      })
    })

    it('should provide accurate statistics', () => {
      const stats = routeTable.getStatistics()

      expect(stats.adjRibIn.totalPeers).toBe(2)
      expect(stats.adjRibIn.totalRoutes).toBe(6) // 3 routes × 2 peers
      expect(stats.locRib.totalRoutes).toBe(3)
      expect(stats.adjRibOut.totalPeers).toBe(1)
      expect(stats.adjRibOut.totalRoutes).toBe(3)
    })

    it('should provide per-peer statistics', () => {
      const stats = routeTable.getStatistics()

      expect(stats.adjRibIn.routesPerPeer.get(65001)).toBe(3)
      expect(stats.adjRibIn.routesPerPeer.get(65002)).toBe(3)
      expect(stats.adjRibOut.routesPerPeer.get(65003)).toBe(3)
    })
  })

  describe('Route Details and Debugging', () => {
    it('should provide detailed route information', () => {
      const route = createTestRoute('detailed-agent')

      routeTable.addRouteFromPeer(65001, route)
      routeTable.addRouteFromPeer(65002, route)
      routeTable.installBestRoute('detailed-agent', route)
      routeTable.addRouteForPeer(65003, route)

      const details = routeTable.getRouteDetails('detailed-agent')

      expect(details.bestRoute).toBeDefined()
      expect(details.alternativeRoutes).toHaveLength(2)
      expect(details.advertisedToPeers).toEqual([65003])
    })

    it('should export routing table for analysis', () => {
      const route = createTestRoute('export-test')
      routeTable.installBestRoute('export-test', route)

      const exported = routeTable.exportRoutingTable()

      expect(exported.locRib).toHaveLength(1)
      expect(exported.locRib[0].agentId).toBe('export-test')
      expect(exported.locRib[0].route.pathAttributes).toBeInstanceOf(Array)
    })
  })

  describe('Validation', () => {
    it('should detect AS path loops', () => {
      const loopRoute = createTestRoute('loop-agent', {
        asPath: [65001, 65002, 65001], // Contains loop
      })

      routeTable.installBestRoute('loop-agent', loopRoute)

      const issues = routeTable.validate()
      expect(issues.some((issue) => issue.includes('AS path loop'))).toBe(true)
    })

    it('should detect long AS paths', () => {
      const longPathRoute = createTestRoute('long-path-agent', {
        asPath: [
          65001, 65002, 65003, 65004, 65005, 65006, 65007, 65008, 65009, 65010,
          65011,
        ],
      })

      routeTable.installBestRoute('long-path-agent', longPathRoute)

      const issues = routeTable.validate()
      expect(
        issues.some((issue) => issue.includes('suspiciously long AS path')),
      ).toBe(true)
    })

    it('should detect stale routes', () => {
      const staleRoute = createTestRoute('stale-agent', {
        originTime: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago
      })

      routeTable.installBestRoute('stale-agent', staleRoute)

      const issues = routeTable.validate()
      expect(issues.some((issue) => issue.includes('stale route'))).toBe(true)
    })

    it('should pass validation for healthy routes', () => {
      const healthyRoute = createTestRoute('healthy-agent', {
        asPath: [65001, 65002],
        originTime: new Date(),
      })

      routeTable.installBestRoute('healthy-agent', healthyRoute)

      const issues = routeTable.validate()
      expect(issues).toHaveLength(0)
    })
  })

  describe('Clear and Reset', () => {
    it('should clear all routing tables', () => {
      const route = createTestRoute('test-agent')

      routeTable.addRouteFromPeer(65001, route)
      routeTable.installBestRoute('test-agent', route)
      routeTable.addRouteForPeer(65002, route)

      routeTable.clear()

      expect(routeTable.getRoutesForAgent('test-agent')).toHaveLength(0)
      expect(routeTable.getBestRoute('test-agent')).toBeUndefined()
      expect(routeTable.getRoutesForPeer(65002).size).toBe(0)
    })
  })
})
