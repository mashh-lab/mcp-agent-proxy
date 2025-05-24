// Tests for BGP Route Reflection System

import { describe, test, expect, beforeEach, vi } from 'vitest'
import {
  BGPRouteReflector,
  RouteReflectorClusterManager,
  RouteReflectorConfig,
  RouteReflectionPolicy,
} from '../../src/bgp/route-reflection.js'
import { AgentRoute, AgentPeer } from '../../src/bgp/types.js'

interface MockRouteReflectedCall {
  targetPeer: AgentPeer
  route: AgentRoute
  sourceClient: unknown
}

describe('BGPRouteReflector', () => {
  let routeReflector: BGPRouteReflector
  let config: RouteReflectorConfig
  let mockPeer1: AgentPeer
  let mockPeer2: AgentPeer
  let mockPeer3: AgentPeer
  let mockRoute: AgentRoute

  beforeEach(() => {
    config = {
      reflectorId: 'rr-test',
      localASN: 65100,
      clusterId: 'cluster-1',
      isRouteReflector: true,
      maxReflectedRoutes: 1000,
      reflectionPolicies: [],
    }

    routeReflector = new BGPRouteReflector(config)

    mockPeer1 = {
      asn: 65101,
      address: 'http://peer1.example.com',
      status: 'established',
      lastUpdate: new Date(),
      routesReceived: 0,
      routesSent: 0,
    }

    mockPeer2 = {
      asn: 65102,
      address: 'http://peer2.example.com',
      status: 'established',
      lastUpdate: new Date(),
      routesReceived: 0,
      routesSent: 0,
    }

    mockPeer3 = {
      asn: 65103,
      address: 'http://peer3.example.com',
      status: 'established',
      lastUpdate: new Date(),
      routesReceived: 0,
      routesSent: 0,
    }

    mockRoute = {
      agentId: 'test-agent-1',
      capabilities: ['coding', 'analysis'],
      asPath: [65101, 65200],
      nextHop: 'http://next-hop.example.com',
      localPref: 100,
      med: 10,
      communities: ['test:route'],
      originTime: new Date(),
      pathAttributes: new Map([['source', 'test']]),
    }
  })

  describe('Initialization', () => {
    test('should initialize with correct configuration', () => {
      const stats = routeReflector.getReflectorStats()
      expect(stats.reflectorId).toBe('rr-test')
      expect(stats.clusterId).toBe('cluster-1')
      expect(stats.isRouteReflector).toBe(true)
      expect(stats.totalClients).toBe(0)
    })

    test('should initialize with default cluster ID', () => {
      const configWithoutCluster = { ...config, clusterId: undefined }
      const rr = new BGPRouteReflector(configWithoutCluster)
      const stats = rr.getReflectorStats()
      expect(stats.clusterId).toBeUndefined()
    })
  })

  describe('Client Management', () => {
    test('should add IBGP client', () => {
      routeReflector.addClient(mockPeer1, 'ibgp-client')

      const stats = routeReflector.getReflectorStats()
      expect(stats.totalClients).toBe(1)
      expect(stats.clientsByType['ibgp-client']).toBe(1)
      expect(stats.clients[0].clientId).toBe('65101:http://peer1.example.com')
    })

    test('should add EBGP client', () => {
      routeReflector.addClient(mockPeer1, 'ebgp')

      const stats = routeReflector.getReflectorStats()
      expect(stats.clientsByType.ebgp).toBe(1)
    })

    test('should add multiple clients of different types', () => {
      routeReflector.addClient(mockPeer1, 'ibgp-client')
      routeReflector.addClient(mockPeer2, 'ibgp-non-client')
      routeReflector.addClient(mockPeer3, 'ebgp')

      const stats = routeReflector.getReflectorStats()
      expect(stats.totalClients).toBe(3)
      expect(stats.clientsByType['ibgp-client']).toBe(1)
      expect(stats.clientsByType['ibgp-non-client']).toBe(1)
      expect(stats.clientsByType.ebgp).toBe(1)
    })

    test('should remove client and its routes', () => {
      routeReflector.addClient(mockPeer1, 'ibgp-client')
      routeReflector.processIncomingRoute(mockRoute, mockPeer1)

      expect(routeReflector.getReflectorStats().totalClients).toBe(1)

      routeReflector.removeClient(mockPeer1)

      const stats = routeReflector.getReflectorStats()
      expect(stats.totalClients).toBe(0)
    })

    test('should emit clientAdded event', () => {
      const spy = vi.fn()
      routeReflector.on('clientAdded', spy)

      routeReflector.addClient(mockPeer1, 'ibgp-client')

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          peer: mockPeer1,
          clientType: 'ibgp-client',
        }),
      )
    })

    test('should emit clientRemoved event', () => {
      const spy = vi.fn()
      routeReflector.on('clientRemoved', spy)

      routeReflector.addClient(mockPeer1, 'ibgp-client')
      routeReflector.removeClient(mockPeer1)

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          peer: mockPeer1,
          clientType: 'ibgp-client',
        }),
      )
    })

    test('should check if peer is client', () => {
      expect(routeReflector.isClient(mockPeer1)).toBe(false)

      routeReflector.addClient(mockPeer1, 'ibgp-client')

      expect(routeReflector.isClient(mockPeer1)).toBe(true)
    })
  })

  describe('Route Processing and Reflection', () => {
    beforeEach(() => {
      // Set up a typical scenario with multiple clients
      routeReflector.addClient(mockPeer1, 'ibgp-client')
      routeReflector.addClient(mockPeer2, 'ibgp-non-client')
      routeReflector.addClient(mockPeer3, 'ebgp')
    })

    test('should process route from EBGP client and reflect to IBGP clients', () => {
      const routeReflectedSpy = vi.fn()
      routeReflector.on('routeReflected', routeReflectedSpy)

      routeReflector.processIncomingRoute(mockRoute, mockPeer3) // EBGP client

      const stats = routeReflector.getReflectorStats()
      const ebgpClient = stats.clients.find((c) => c.clientType === 'ebgp')
      expect(ebgpClient?.routesReceived).toBe(1)

      // Should reflect to both IBGP client and non-client
      expect(routeReflectedSpy).toHaveBeenCalledTimes(2)
    })

    test('should process route from IBGP client and reflect to EBGP and IBGP non-clients', () => {
      const routeReflectedSpy = vi.fn()
      routeReflector.on('routeReflected', routeReflectedSpy)

      routeReflector.processIncomingRoute(mockRoute, mockPeer1) // IBGP client

      // Should reflect to EBGP and IBGP non-client (not to other IBGP clients)
      expect(routeReflectedSpy).toHaveBeenCalledTimes(2)

      const calls = routeReflectedSpy.mock.calls
      const targetPeers = calls.map(
        (call: unknown[]) => (call[0] as MockRouteReflectedCall).targetPeer.asn,
      )
      expect(targetPeers).toContain(65102) // IBGP non-client
      expect(targetPeers).toContain(65103) // EBGP client
    })

    test('should process route from IBGP non-client and reflect to IBGP clients only', () => {
      const routeReflectedSpy = vi.fn()
      routeReflector.on('routeReflected', routeReflectedSpy)

      routeReflector.processIncomingRoute(mockRoute, mockPeer2) // IBGP non-client

      // Should reflect only to IBGP clients
      expect(routeReflectedSpy).toHaveBeenCalledTimes(1)

      const targetPeer = routeReflectedSpy.mock.calls[0][0].targetPeer
      expect(targetPeer.asn).toBe(65101) // IBGP client
    })

    test('should not reflect back to source client', () => {
      const routeReflectedSpy = vi.fn()
      routeReflector.on('routeReflected', routeReflectedSpy)

      routeReflector.processIncomingRoute(mockRoute, mockPeer1)

      const calls = routeReflectedSpy.mock.calls
      const targetPeers = calls.map(
        (call: unknown[]) => (call[0] as MockRouteReflectedCall).targetPeer.asn,
      )
      expect(targetPeers).not.toContain(65101) // Source peer should not be in targets
    })

    test('should add route reflector attributes to reflected routes', () => {
      const routeReflectedSpy = vi.fn()
      routeReflector.on('routeReflected', routeReflectedSpy)

      routeReflector.processIncomingRoute(mockRoute, mockPeer3)

      const reflectedRoute = routeReflectedSpy.mock.calls[0][0].route
      expect(reflectedRoute.pathAttributes.get('clusterId')).toBe('cluster-1')
      expect(reflectedRoute.pathAttributes.get('originatorId')).toBe(
        'http://peer3.example.com',
      )
      expect(reflectedRoute.communities).toContain('rr:reflected')
    })

    test('should handle unknown client gracefully', () => {
      const unknownPeer: AgentPeer = {
        asn: 65999,
        address: 'http://unknown.example.com',
        status: 'established',
        lastUpdate: new Date(),
        routesReceived: 0,
        routesSent: 0,
      }

      // Should not throw error
      expect(() => {
        routeReflector.processIncomingRoute(mockRoute, unknownPeer)
      }).not.toThrow()
    })

    test('should emit routeProcessed event', () => {
      const routeProcessedSpy = vi.fn()
      routeReflector.on('routeProcessed', routeProcessedSpy)

      routeReflector.processIncomingRoute(mockRoute, mockPeer1)

      expect(routeProcessedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          originalRoute: mockRoute,
          sourceClient: expect.objectContaining({
            peer: mockPeer1,
            clientType: 'ibgp-client',
          }),
          reason: expect.any(String),
          timestamp: expect.any(Date),
        }),
      )
    })
  })

  describe('Route Reflection Policies', () => {
    test('should apply no-reflect policy', () => {
      const policy: RouteReflectionPolicy = {
        name: 'block-coding',
        capabilities: ['coding'],
        action: 'no-reflect',
      }

      routeReflector.updatePolicies([policy])
      routeReflector.addClient(mockPeer1, 'ibgp-client')
      routeReflector.addClient(mockPeer2, 'ebgp')

      const routeReflectedSpy = vi.fn()
      routeReflector.on('routeReflected', routeReflectedSpy)

      routeReflector.processIncomingRoute(mockRoute, mockPeer2) // Has 'coding' capability

      expect(routeReflectedSpy).not.toHaveBeenCalled()
    })

    test('should apply modify policy', () => {
      const policy: RouteReflectionPolicy = {
        name: 'boost-coding',
        capabilities: ['coding'],
        action: 'modify',
        modifications: {
          localPref: 200,
          communities: ['boosted:coding'],
        },
      }

      routeReflector.updatePolicies([policy])
      routeReflector.addClient(mockPeer1, 'ibgp-client')
      routeReflector.addClient(mockPeer2, 'ebgp')

      const routeReflectedSpy = vi.fn()
      routeReflector.on('routeReflected', routeReflectedSpy)

      routeReflector.processIncomingRoute(mockRoute, mockPeer2)

      const reflectedRoute = routeReflectedSpy.mock.calls[0][0].route
      expect(reflectedRoute.localPref).toBe(200)
      expect(reflectedRoute.communities).toContain('boosted:coding')
    })

    test('should apply ASN-based policy', () => {
      const policy: RouteReflectionPolicy = {
        name: 'block-asn',
        clientASNs: [65102],
        action: 'no-reflect',
      }

      routeReflector.updatePolicies([policy])
      routeReflector.addClient(mockPeer1, 'ibgp-client')
      routeReflector.addClient(mockPeer2, 'ebgp')

      const routeReflectedSpy = vi.fn()
      routeReflector.on('routeReflected', routeReflectedSpy)

      routeReflector.processIncomingRoute(mockRoute, mockPeer2) // ASN 65102

      expect(routeReflectedSpy).not.toHaveBeenCalled()
    })

    test('should emit policiesUpdated event', () => {
      const policiesUpdatedSpy = vi.fn()
      routeReflector.on('policiesUpdated', policiesUpdatedSpy)

      const policies = [{ name: 'test-policy', action: 'reflect' as const }]

      routeReflector.updatePolicies(policies)

      expect(policiesUpdatedSpy).toHaveBeenCalledWith(policies)
    })
  })

  describe('Statistics and Monitoring', () => {
    test('should track client statistics', () => {
      routeReflector.addClient(mockPeer1, 'ibgp-client')
      routeReflector.processIncomingRoute(mockRoute, mockPeer1)

      const stats = routeReflector.getReflectorStats()
      const client = stats.clients[0]

      expect(client.routesReceived).toBe(1)
      expect(client.lastUpdate).toBeInstanceOf(Date)
    })

    test('should provide recent reflection decisions', () => {
      routeReflector.addClient(mockPeer1, 'ibgp-client')
      routeReflector.addClient(mockPeer2, 'ebgp')

      routeReflector.processIncomingRoute(mockRoute, mockPeer1)

      const decisions = routeReflector.getRecentDecisions(10)
      expect(decisions).toHaveLength(1)
      expect(decisions[0]).toMatchObject({
        originalRoute: mockRoute,
        reason: expect.any(String),
        timestamp: expect.any(Date),
      })
    })

    test('should limit decision history', () => {
      routeReflector.addClient(mockPeer1, 'ibgp-client')
      routeReflector.addClient(mockPeer2, 'ebgp')

      // Process many routes to test limit
      for (let i = 0; i < 1050; i++) {
        const route = { ...mockRoute, agentId: `agent-${i}` }
        routeReflector.processIncomingRoute(route, mockPeer1)
      }

      const decisions = routeReflector.getRecentDecisions(2000)
      expect(decisions.length).toBeLessThanOrEqual(1000) // Should be limited to 1000
    })

    test('should return all clients', () => {
      routeReflector.addClient(mockPeer1, 'ibgp-client')
      routeReflector.addClient(mockPeer2, 'ebgp')

      const clients = routeReflector.getClients()
      expect(clients).toHaveLength(2)
      expect(clients[0].peer.asn).toBe(65101)
      expect(clients[1].peer.asn).toBe(65102)
    })
  })

  describe('Shutdown', () => {
    test('should shutdown cleanly', async () => {
      const shutdownSpy = vi.fn()
      routeReflector.on('shutdown', shutdownSpy)

      routeReflector.addClient(mockPeer1, 'ibgp-client')
      routeReflector.processIncomingRoute(mockRoute, mockPeer1)

      await routeReflector.shutdown()

      expect(shutdownSpy).toHaveBeenCalled()

      // Should not process routes after shutdown
      const stats = routeReflector.getReflectorStats()
      expect(stats.totalClients).toBe(0)
    })

    test('should handle multiple shutdown calls', async () => {
      await routeReflector.shutdown()
      await routeReflector.shutdown() // Should not throw
    })

    test('should not accept new clients after shutdown', async () => {
      await routeReflector.shutdown()

      routeReflector.addClient(mockPeer1, 'ibgp-client')

      const stats = routeReflector.getReflectorStats()
      expect(stats.totalClients).toBe(0)
    })
  })

  describe('Non-Route Reflector Mode', () => {
    test('should not reflect routes when not configured as route reflector', () => {
      const nonRRConfig = { ...config, isRouteReflector: false }
      const nonRR = new BGPRouteReflector(nonRRConfig)

      const routeReflectedSpy = vi.fn()
      nonRR.on('routeReflected', routeReflectedSpy)

      nonRR.addClient(mockPeer1, 'ibgp-client')
      nonRR.addClient(mockPeer2, 'ebgp')
      nonRR.processIncomingRoute(mockRoute, mockPeer2)

      expect(routeReflectedSpy).not.toHaveBeenCalled()
    })
  })
})

describe('RouteReflectorClusterManager', () => {
  let clusterManager: RouteReflectorClusterManager
  let routeReflector1: BGPRouteReflector
  let routeReflector2: BGPRouteReflector

  beforeEach(() => {
    clusterManager = new RouteReflectorClusterManager('test-cluster')

    const config1: RouteReflectorConfig = {
      reflectorId: 'rr-1',
      localASN: 65100,
      clusterId: 'test-cluster',
      isRouteReflector: true,
    }

    const config2: RouteReflectorConfig = {
      reflectorId: 'rr-2',
      localASN: 65100,
      clusterId: 'test-cluster',
      isRouteReflector: true,
    }

    routeReflector1 = new BGPRouteReflector(config1)
    routeReflector2 = new BGPRouteReflector(config2)
  })

  describe('Cluster Management', () => {
    test('should add route reflectors to cluster', () => {
      clusterManager.addRouteReflector(routeReflector1)
      clusterManager.addRouteReflector(routeReflector2)

      const stats = clusterManager.getClusterStats()
      expect(stats.totalRouteReflectors).toBe(2)
      expect(stats.clusterId).toBe('test-cluster')
    })

    test('should forward route reflection events', () => {
      const routeReflectedSpy = vi.fn()
      clusterManager.on('routeReflected', routeReflectedSpy)

      clusterManager.addRouteReflector(routeReflector1)

      const mockPeer: AgentPeer = {
        asn: 65101,
        address: 'http://peer.example.com',
        status: 'established',
        lastUpdate: new Date(),
        routesReceived: 0,
        routesSent: 0,
      }

      const mockRoute: AgentRoute = {
        agentId: 'test-agent',
        capabilities: ['coding'],
        asPath: [65101],
        nextHop: 'http://next-hop.example.com',
        localPref: 100,
        med: 0,
        communities: [],
        originTime: new Date(),
        pathAttributes: new Map(),
      }

      routeReflector1.addClient(mockPeer, 'ebgp')
      routeReflector1.emit('routeReflected', {
        route: mockRoute,
        targetPeer: mockPeer,
      })

      expect(routeReflectedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          route: mockRoute,
          targetPeer: mockPeer,
          reflectorId: 'rr-1',
        }),
      )
    })

    test('should provide aggregate cluster statistics', () => {
      clusterManager.addRouteReflector(routeReflector1)
      clusterManager.addRouteReflector(routeReflector2)

      const mockPeer1: AgentPeer = {
        asn: 65101,
        address: 'http://peer1.example.com',
        status: 'established',
        lastUpdate: new Date(),
        routesReceived: 0,
        routesSent: 0,
      }

      const mockPeer2: AgentPeer = {
        asn: 65102,
        address: 'http://peer2.example.com',
        status: 'established',
        lastUpdate: new Date(),
        routesReceived: 0,
        routesSent: 0,
      }

      routeReflector1.addClient(mockPeer1, 'ibgp-client')
      routeReflector2.addClient(mockPeer2, 'ebgp')

      const stats = clusterManager.getClusterStats()
      expect(stats.aggregateStats.totalClients).toBe(2)
      expect(stats.reflectors).toHaveLength(2)
    })

    test('should shutdown all route reflectors', async () => {
      const shutdownSpy1 = vi.fn()
      const shutdownSpy2 = vi.fn()
      const clusterShutdownSpy = vi.fn()

      routeReflector1.on('shutdown', shutdownSpy1)
      routeReflector2.on('shutdown', shutdownSpy2)
      clusterManager.on('shutdown', clusterShutdownSpy)

      clusterManager.addRouteReflector(routeReflector1)
      clusterManager.addRouteReflector(routeReflector2)

      await clusterManager.shutdown()

      expect(shutdownSpy1).toHaveBeenCalled()
      expect(shutdownSpy2).toHaveBeenCalled()
      expect(clusterShutdownSpy).toHaveBeenCalled()

      const stats = clusterManager.getClusterStats()
      expect(stats.totalRouteReflectors).toBe(0)
    })
  })
})
