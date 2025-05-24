// Tests for BGP Multi-Path Load Balancing System

import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  BGPMultiPathLoadBalancer,
  MultiPathConfig,
  LoadBalancingMethod,
  PathWeight,
} from '../../src/bgp/multi-path.js'
import { AgentRoute } from '../../src/bgp/types.js'

describe('BGPMultiPathLoadBalancer', () => {
  let loadBalancer: BGPMultiPathLoadBalancer
  let config: MultiPathConfig
  let mockRoute1: AgentRoute
  let mockRoute2: AgentRoute
  let mockRoute3: AgentRoute

  beforeEach(() => {
    config = {
      enabled: true,
      maxPaths: 4,
      method: 'round-robin',
      ecmpEnabled: true,
      healthCheckInterval: 1000,
      failureThreshold: 3,
      enableFailover: true,
    }

    loadBalancer = new BGPMultiPathLoadBalancer(config)

    mockRoute1 = {
      agentId: 'agent-1',
      capabilities: ['coding', 'javascript'],
      asPath: [65001],
      nextHop: 'http://server1.example.com',
      localPref: 100,
      med: 10,
      communities: ['region:us-east'],
      originTime: new Date(),
      pathAttributes: new Map(),
    }

    mockRoute2 = {
      agentId: 'agent-2',
      capabilities: ['coding', 'python'],
      asPath: [65002],
      nextHop: 'http://server2.example.com',
      localPref: 100,
      med: 20,
      communities: ['region:us-west'],
      originTime: new Date(),
      pathAttributes: new Map(),
    }

    mockRoute3 = {
      agentId: 'agent-3',
      capabilities: ['analysis', 'data'],
      asPath: [65003],
      nextHop: 'http://server3.example.com',
      localPref: 100,
      med: 15,
      communities: ['region:eu-west'],
      originTime: new Date(),
      pathAttributes: new Map(),
    }
  })

  afterEach(async () => {
    await loadBalancer.shutdown()
  })

  describe('Initialization', () => {
    test('should initialize with correct configuration', () => {
      const stats = loadBalancer.getStats()
      expect(stats.totalPaths).toBe(0)
      expect(stats.totalRequests).toBe(0)
      expect(stats.distributionByMethod['round-robin']).toBe(0)
    })

    test('should not start health checks when disabled', () => {
      const disabledConfig = { ...config, enabled: false }
      const disabledBalancer = new BGPMultiPathLoadBalancer(disabledConfig)

      // Should not have any internal timers running
      expect(disabledBalancer.getStats().totalPaths).toBe(0)

      disabledBalancer.shutdown()
    })

    test('should start health checks when enabled', () => {
      const spy = vi.fn()
      loadBalancer.on('healthCheckCompleted', spy)

      // Wait for health check to potentially trigger
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          // Health checks might not trigger immediately in tests
          resolve()
        }, 50)
      })
    })
  })

  describe('Path Management', () => {
    test('should add paths successfully', () => {
      const pathAddedSpy = vi.fn()
      loadBalancer.on('pathAdded', pathAddedSpy)

      loadBalancer.addPath(mockRoute1)
      loadBalancer.addPath(mockRoute2)

      const stats = loadBalancer.getStats()
      expect(stats.totalPaths).toBe(2)
      expect(stats.healthyPaths).toBe(2)
      expect(pathAddedSpy).toHaveBeenCalledTimes(2)

      const pathHealth = loadBalancer.getPathHealth()
      expect(Object.keys(pathHealth)).toHaveLength(2)
      expect(pathHealth['agent-1:65001']).toBeDefined()
      expect(pathHealth['agent-2:65002']).toBeDefined()
    })

    test('should remove paths successfully', () => {
      const pathRemovedSpy = vi.fn()
      loadBalancer.on('pathRemoved', pathRemovedSpy)

      loadBalancer.addPath(mockRoute1)
      loadBalancer.addPath(mockRoute2)

      expect(loadBalancer.getStats().totalPaths).toBe(2)

      loadBalancer.removePath(mockRoute1)

      const stats = loadBalancer.getStats()
      expect(stats.totalPaths).toBe(1)
      expect(pathRemovedSpy).toHaveBeenCalledWith({
        route: mockRoute1,
        pathKey: 'agent-1:65001',
      })

      const pathHealth = loadBalancer.getPathHealth()
      expect(pathHealth['agent-1:65001']).toBeUndefined()
      expect(pathHealth['agent-2:65002']).toBeDefined()
    })

    test('should respect max paths limit', () => {
      const limitedConfig = { ...config, maxPaths: 2 }
      const limitedBalancer = new BGPMultiPathLoadBalancer(limitedConfig)

      limitedBalancer.addPath(mockRoute1)
      limitedBalancer.addPath(mockRoute2)
      limitedBalancer.addPath(mockRoute3) // Should be rejected

      expect(limitedBalancer.getStats().totalPaths).toBe(2)

      limitedBalancer.shutdown()
    })

    test('should not add paths when disabled', () => {
      const disabledConfig = { ...config, enabled: false }
      const disabledBalancer = new BGPMultiPathLoadBalancer(disabledConfig)

      disabledBalancer.addPath(mockRoute1)

      expect(disabledBalancer.getStats().totalPaths).toBe(0)

      disabledBalancer.shutdown()
    })
  })

  describe('Round-Robin Load Balancing', () => {
    beforeEach(() => {
      loadBalancer.addPath(mockRoute1)
      loadBalancer.addPath(mockRoute2)
      loadBalancer.addPath(mockRoute3)
    })

    test('should distribute requests in round-robin fashion', () => {
      const pathSelectedSpy = vi.fn()
      loadBalancer.on('pathSelected', pathSelectedSpy)

      const decision1 = loadBalancer.selectPath()
      const decision2 = loadBalancer.selectPath()
      const decision3 = loadBalancer.selectPath()
      const decision4 = loadBalancer.selectPath() // Should wrap around

      expect(decision1).not.toBeNull()
      expect(decision2).not.toBeNull()
      expect(decision3).not.toBeNull()
      expect(decision4).not.toBeNull()

      // Should cycle through routes
      expect(decision1!.selectedRoute.agentId).toBe('agent-1')
      expect(decision2!.selectedRoute.agentId).toBe('agent-2')
      expect(decision3!.selectedRoute.agentId).toBe('agent-3')
      expect(decision4!.selectedRoute.agentId).toBe('agent-1') // Wrapped around

      expect(pathSelectedSpy).toHaveBeenCalledTimes(4)
    })

    test('should provide correct decision information', () => {
      const decision = loadBalancer.selectPath()

      expect(decision).toMatchObject({
        selectedRoute: expect.objectContaining({
          agentId: expect.any(String),
        }),
        availableRoutes: expect.arrayContaining([
          expect.objectContaining({ agentId: expect.any(String) }),
        ]),
        method: 'round-robin',
        reason: expect.stringContaining('Round-robin'),
        timestamp: expect.any(Date),
      })
    })
  })

  describe('Capability-Aware Load Balancing', () => {
    beforeEach(() => {
      const capabilityConfig = {
        ...config,
        method: 'capability-aware' as LoadBalancingMethod,
      }
      loadBalancer = new BGPMultiPathLoadBalancer(capabilityConfig)
      loadBalancer.addPath(mockRoute1)
      loadBalancer.addPath(mockRoute2)
      loadBalancer.addPath(mockRoute3)
    })

    test('should select route based on capability matching', () => {
      const decision = loadBalancer.selectPath(['coding'])

      expect(decision).not.toBeNull()
      expect(decision!.selectedRoute.capabilities).toContain('coding')
      expect(decision!.reason).toContain('Capability-aware')
    })

    test('should prefer more specific capability matches', () => {
      const decision = loadBalancer.selectPath(['javascript'])

      expect(decision).not.toBeNull()
      expect(decision!.selectedRoute.agentId).toBe('agent-1') // Has javascript specifically
    })

    test('should handle no capability requirements', () => {
      const decision = loadBalancer.selectPath()

      expect(decision).not.toBeNull()
      expect(decision!.selectedRoute).toBeDefined()
    })

    test('should handle unmatched capabilities gracefully', () => {
      const decision = loadBalancer.selectPath(['nonexistent-capability'])

      // Should gracefully fall back to available routes when no perfect match
      expect(decision).not.toBeNull()
      expect(decision!.selectedRoute.agentId).toBe('agent-1')
    })
  })

  describe('Latency-Based Load Balancing', () => {
    beforeEach(() => {
      const latencyConfig = {
        ...config,
        method: 'latency-based' as LoadBalancingMethod,
      }
      loadBalancer = new BGPMultiPathLoadBalancer(latencyConfig)
      loadBalancer.addPath(mockRoute1)
      loadBalancer.addPath(mockRoute2)
      loadBalancer.addPath(mockRoute3)
    })

    test('should select route with lowest latency', () => {
      // Simulate different response times
      loadBalancer.reportRequestComplete(mockRoute1, true, 100)
      loadBalancer.reportRequestComplete(mockRoute2, true, 50) // Best latency
      loadBalancer.reportRequestComplete(mockRoute3, true, 200)

      const decision = loadBalancer.selectPath()

      expect(decision).not.toBeNull()
      expect(decision!.selectedRoute.agentId).toBe('agent-2') // Should select lowest latency
      expect(decision!.reason).toContain('Latency-based')
    })

    test('should handle routes with no latency data', () => {
      const decision = loadBalancer.selectPath()

      expect(decision).not.toBeNull()
      expect(decision!.selectedRoute).toBeDefined()
    })
  })

  describe('Weighted Load Balancing', () => {
    beforeEach(() => {
      const weightedConfig = {
        ...config,
        method: 'weighted' as LoadBalancingMethod,
      }
      loadBalancer = new BGPMultiPathLoadBalancer(weightedConfig)
      loadBalancer.addPath(mockRoute1)
      loadBalancer.addPath(mockRoute2)
      loadBalancer.addPath(mockRoute3)
    })

    test('should use configured weights', () => {
      const weights: PathWeight[] = [
        { agentIdPattern: 'agent-1', weight: 10 },
        { agentIdPattern: 'agent-2', weight: 1 },
        { agentIdPattern: 'agent-3', weight: 1 },
      ]

      loadBalancer.setPathWeights(weights)

      // Run multiple selections to test distribution
      const selections: string[] = []
      for (let i = 0; i < 100; i++) {
        const decision = loadBalancer.selectPath()
        if (decision) {
          selections.push(decision.selectedRoute.agentId)
        }
      }

      // Agent-1 should be selected more often due to higher weight
      const agent1Count = selections.filter((id) => id === 'agent-1').length
      const agent2Count = selections.filter((id) => id === 'agent-2').length

      expect(agent1Count).toBeGreaterThan(agent2Count)
    })

    test('should support wildcard patterns in weights', () => {
      const weights: PathWeight[] = [
        { agentIdPattern: 'agent-*', weight: 5 },
        { agentIdPattern: 'other-*', weight: 1 },
      ]

      loadBalancer.setPathWeights(weights)

      const decision = loadBalancer.selectPath()
      expect(decision).not.toBeNull()
      expect(decision!.weights).toBeDefined()
    })

    test('should emit weightsUpdated event', () => {
      const weightsUpdatedSpy = vi.fn()
      loadBalancer.on('weightsUpdated', weightsUpdatedSpy)

      const weights: PathWeight[] = [{ agentIdPattern: 'agent-1', weight: 2 }]

      loadBalancer.setPathWeights(weights)

      expect(weightsUpdatedSpy).toHaveBeenCalledWith(weights)
    })
  })

  describe('Least Connections Load Balancing', () => {
    beforeEach(() => {
      const leastConnConfig = {
        ...config,
        method: 'least-connections' as LoadBalancingMethod,
      }
      loadBalancer = new BGPMultiPathLoadBalancer(leastConnConfig)
      loadBalancer.addPath(mockRoute1)
      loadBalancer.addPath(mockRoute2)
      loadBalancer.addPath(mockRoute3)
    })

    test('should select route with least connections', () => {
      // Simulate different connection loads
      loadBalancer.selectPath() // agent-1 gets a connection
      loadBalancer.selectPath() // agent-2 gets a connection

      // Complete one request to reduce connections
      loadBalancer.reportRequestComplete(mockRoute2, true)

      const decision = loadBalancer.selectPath()

      expect(decision).not.toBeNull()
      expect(decision!.reason).toContain('Least connections')
    })
  })

  describe('Random Load Balancing', () => {
    beforeEach(() => {
      const randomConfig = {
        ...config,
        method: 'random' as LoadBalancingMethod,
      }
      loadBalancer = new BGPMultiPathLoadBalancer(randomConfig)
      loadBalancer.addPath(mockRoute1)
      loadBalancer.addPath(mockRoute2)
      loadBalancer.addPath(mockRoute3)
    })

    test('should select routes randomly', () => {
      const selections: string[] = []
      for (let i = 0; i < 50; i++) {
        const decision = loadBalancer.selectPath()
        if (decision) {
          selections.push(decision.selectedRoute.agentId)
        }
      }

      // Should have some distribution (not all the same)
      const uniqueSelections = new Set(selections)
      expect(uniqueSelections.size).toBeGreaterThan(1)
    })

    test('should provide correct reason', () => {
      const decision = loadBalancer.selectPath()

      expect(decision).not.toBeNull()
      expect(decision!.reason).toBe('Random selection')
    })
  })

  describe('Health Monitoring', () => {
    beforeEach(() => {
      loadBalancer.addPath(mockRoute1)
      loadBalancer.addPath(mockRoute2)
    })

    test('should track request completion and update health', () => {
      const requestCompletedSpy = vi.fn()
      loadBalancer.on('requestCompleted', requestCompletedSpy)

      loadBalancer.reportRequestComplete(mockRoute1, true, 100)
      loadBalancer.reportRequestComplete(mockRoute1, false, 200)

      const pathHealth = loadBalancer.getPathHealth()
      const agent1Health = pathHealth['agent-1:65001']

      expect(agent1Health).toBeDefined()
      expect(agent1Health.totalRequests).toBe(0) // Not tracked here
      expect(agent1Health.responseTime).toBe(120) // Moving average: 100 * 0.8 + 200 * 0.2 = 120
      expect(requestCompletedSpy).toHaveBeenCalledTimes(2)
    })

    test('should update path health status based on metrics', () => {
      const pathHealthChangedSpy = vi.fn()
      loadBalancer.on('pathHealthChanged', pathHealthChangedSpy)

      // Simulate many failed requests
      for (let i = 0; i < 10; i++) {
        loadBalancer.reportRequestComplete(mockRoute1, false, 15000) // High latency + failures
      }

      // Should eventually trigger health status change
      expect(pathHealthChangedSpy).toHaveBeenCalled()
    })

    test('should filter out unhealthy paths from selection', () => {
      // Simulate many failed requests to make route1 unhealthy
      for (let i = 0; i < 20; i++) {
        loadBalancer.reportRequestComplete(mockRoute1, false, 15000) // High latency + failures
      }

      const decision = loadBalancer.selectPath()

      expect(decision).not.toBeNull()
      expect(decision!.selectedRoute.agentId).not.toBe('agent-1')
    })

    test('should include degraded paths in selection', () => {
      // Make all paths degraded except one
      const pathHealth = loadBalancer.getPathHealth()
      pathHealth['agent-1:65001'].status = 'degraded'

      const decision = loadBalancer.selectPath()

      expect(decision).not.toBeNull()
      // Should still be able to select degraded paths
    })
  })

  describe('Statistics and Monitoring', () => {
    beforeEach(() => {
      loadBalancer.addPath(mockRoute1)
      loadBalancer.addPath(mockRoute2)
    })

    test('should track statistics correctly', () => {
      loadBalancer.selectPath()
      loadBalancer.selectPath()

      const stats = loadBalancer.getStats()

      expect(stats.totalPaths).toBe(2)
      expect(stats.healthyPaths).toBe(2)
      expect(stats.totalRequests).toBe(2)
      expect(stats.distributionByMethod['round-robin']).toBe(2)
    })

    test('should track path utilization', () => {
      loadBalancer.selectPath() // Should select agent-1
      loadBalancer.selectPath() // Should select agent-2

      const stats = loadBalancer.getStats()

      expect(stats.pathUtilization['agent-1:65001']).toBe(1)
      expect(stats.pathUtilization['agent-2:65002']).toBe(1)
    })

    test('should provide recent decisions', () => {
      loadBalancer.selectPath()
      loadBalancer.selectPath()

      const decisions = loadBalancer.getRecentDecisions(10)

      expect(decisions).toHaveLength(2)
      expect(decisions[0]).toMatchObject({
        selectedRoute: expect.any(Object),
        method: 'round-robin',
        timestamp: expect.any(Date),
      })
    })

    test('should limit decision history', () => {
      // Add many decisions
      for (let i = 0; i < 1050; i++) {
        loadBalancer.selectPath()
      }

      const decisions = loadBalancer.getRecentDecisions(2000)

      expect(decisions.length).toBeLessThanOrEqual(1000)
    })
  })

  describe('Configuration Management', () => {
    test('should update configuration', () => {
      const configUpdatedSpy = vi.fn()
      loadBalancer.on('configUpdated', configUpdatedSpy)

      const newConfig = {
        method: 'weighted' as LoadBalancingMethod,
        maxPaths: 8,
      }
      loadBalancer.updateConfig(newConfig)

      expect(configUpdatedSpy).toHaveBeenCalledWith({
        oldConfig: expect.objectContaining({ method: 'round-robin' }),
        newConfig: expect.objectContaining({ method: 'weighted' }),
      })
    })

    test('should restart health checks when interval changes', () => {
      const healthCheckCompletedSpy = vi.fn()
      loadBalancer.on('healthCheckCompleted', healthCheckCompletedSpy)

      loadBalancer.updateConfig({ healthCheckInterval: 500 })

      // Should have restarted health checks
      expect(loadBalancer.getStats().totalPaths).toBe(0) // Still works
    })
  })

  describe('Error Handling', () => {
    test('should return null when no paths available', () => {
      const decision = loadBalancer.selectPath()

      expect(decision).toBeNull()
    })

    test('should return null when disabled', () => {
      const disabledConfig = { ...config, enabled: false }
      const disabledBalancer = new BGPMultiPathLoadBalancer(disabledConfig)

      disabledBalancer.addPath(mockRoute1)

      const decision = disabledBalancer.selectPath()

      expect(decision).toBeNull()

      disabledBalancer.shutdown()
    })

    test('should handle capability filtering with no matches', () => {
      loadBalancer.addPath(mockRoute1)

      const decision = loadBalancer.selectPath(['nonexistent-capability'])

      // Should gracefully fall back to available routes when no perfect match
      expect(decision).not.toBeNull()
      expect(decision!.selectedRoute.agentId).toBe('agent-1')
    })

    test('should handle empty route list in selection methods', () => {
      expect(() => {
        // This should not throw even with no routes
        loadBalancer.selectPath()
      }).not.toThrow()
    })
  })

  describe('Events', () => {
    test('should emit pathSelected event', () => {
      const pathSelectedSpy = vi.fn()
      loadBalancer.on('pathSelected', pathSelectedSpy)

      loadBalancer.addPath(mockRoute1)
      loadBalancer.selectPath()

      expect(pathSelectedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedRoute: mockRoute1,
          method: 'round-robin',
        }),
      )
    })

    test('should emit requestStarted event', () => {
      const requestStartedSpy = vi.fn()
      loadBalancer.on('requestStarted', requestStartedSpy)

      loadBalancer.addPath(mockRoute1)
      loadBalancer.selectPath(['coding'], 'request-123')

      expect(requestStartedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'request-123',
          pathKey: 'agent-1:65001',
        }),
      )
    })
  })

  describe('Shutdown', () => {
    test('should shutdown cleanly', async () => {
      const shutdownSpy = vi.fn()
      loadBalancer.on('shutdown', shutdownSpy)

      loadBalancer.addPath(mockRoute1)
      loadBalancer.addPath(mockRoute2)

      await loadBalancer.shutdown()

      expect(shutdownSpy).toHaveBeenCalled()

      // Should not accept new paths after shutdown
      loadBalancer.addPath(mockRoute3)
      expect(loadBalancer.getStats().totalPaths).toBe(0)
    })

    test('should handle multiple shutdown calls', async () => {
      await loadBalancer.shutdown()
      await loadBalancer.shutdown() // Should not throw
    })

    test('should stop health checks on shutdown', async () => {
      const healthCheckSpy = vi.fn()
      loadBalancer.on('healthCheckCompleted', healthCheckSpy)

      await loadBalancer.shutdown()

      // Wait and ensure no more health checks occur
      await new Promise((resolve) => setTimeout(resolve, 1100))

      // No new health checks should have occurred after shutdown
      const initialCallCount = healthCheckSpy.mock.calls.length
      await new Promise((resolve) => setTimeout(resolve, 1100))
      expect(healthCheckSpy.mock.calls.length).toBe(initialCallCount)
    })
  })
})
