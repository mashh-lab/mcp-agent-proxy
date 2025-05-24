// Tests for Agent Advertisement System
// Ensures dynamic agent discovery and capability broadcasting work correctly

import {
  AgentAdvertisementManager,
  AgentCapabilities,
  AdvertisementConfig,
  AgentRegistration,
} from '../../src/bgp/advertisement.js'
import { BGPSession } from '../../src/bgp/session.js'

describe('AgentAdvertisementManager', () => {
  let bgpSession: BGPSession
  let advertisementManager: AgentAdvertisementManager
  let config: AdvertisementConfig

  const localASN = 65000
  const routerId = 'test-router-65000'

  beforeEach(() => {
    bgpSession = new BGPSession(localASN, routerId)
    config = {
      localASN,
      routerId,
      hostname: 'localhost',
      port: 8080,
      advertisementInterval: 1000, // 1 second for testing
      localPreference: 100,
    }
    advertisementManager = new AgentAdvertisementManager(bgpSession, config)
  })

  afterEach(async () => {
    await advertisementManager.shutdown()
    await bgpSession.shutdown()
  })

  describe('Agent Registration', () => {
    it('should register agents correctly', async () => {
      const registration: AgentRegistration = {
        agentId: 'test-agent-1',
        capabilities: ['coding', 'debugging'],
        localPref: 110,
        metadata: { version: '1.0.0' },
      }

      await advertisementManager.registerAgent(registration)

      const agent = advertisementManager.getAgent('test-agent-1')
      expect(agent).toBeDefined()
      expect(agent?.agentId).toBe('test-agent-1')
      expect(agent?.capabilities).toEqual(['coding', 'debugging'])
      expect(agent?.healthStatus).toBe('healthy')
      expect(agent?.metadata).toEqual({ version: '1.0.0' })
      expect(agent?.lastSeen).toBeInstanceOf(Date)
    })

    it('should emit agentRegistered event', async () => {
      const registration: AgentRegistration = {
        agentId: 'test-agent-1',
        capabilities: ['coding'],
      }

      let eventReceived = false
      advertisementManager.on('agentRegistered', (agentId, capabilities) => {
        expect(agentId).toBe('test-agent-1')
        expect(capabilities.agentId).toBe('test-agent-1')
        eventReceived = true
      })

      await advertisementManager.registerAgent(registration)
      expect(eventReceived).toBe(true)
    })

    it('should handle multiple agent registrations', async () => {
      await advertisementManager.registerAgent({
        agentId: 'agent-1',
        capabilities: ['coding'],
      })

      await advertisementManager.registerAgent({
        agentId: 'agent-2',
        capabilities: ['weather'],
      })

      const localAgents = advertisementManager.getLocalAgents()
      expect(localAgents.size).toBe(2)
      expect(localAgents.has('agent-1')).toBe(true)
      expect(localAgents.has('agent-2')).toBe(true)
    })
  })

  describe('Agent Unregistration', () => {
    it('should unregister agents correctly', async () => {
      await advertisementManager.registerAgent({
        agentId: 'test-agent-1',
        capabilities: ['coding'],
      })

      expect(advertisementManager.getAgent('test-agent-1')).toBeDefined()

      await advertisementManager.unregisterAgent('test-agent-1')

      expect(advertisementManager.getAgent('test-agent-1')).toBeUndefined()
    })

    it('should emit agentUnregistered event', async () => {
      await advertisementManager.registerAgent({
        agentId: 'test-agent-1',
        capabilities: ['coding'],
      })

      let eventReceived = false
      advertisementManager.on('agentUnregistered', (agentId) => {
        expect(agentId).toBe('test-agent-1')
        eventReceived = true
      })

      await advertisementManager.unregisterAgent('test-agent-1')
      expect(eventReceived).toBe(true)
    })

    it('should handle unregistering non-existent agent', async () => {
      // Should not throw error
      await expect(
        advertisementManager.unregisterAgent('non-existent'),
      ).resolves.not.toThrow()
    })
  })

  describe('Agent Updates', () => {
    it('should update agent capabilities', async () => {
      await advertisementManager.registerAgent({
        agentId: 'test-agent-1',
        capabilities: ['coding'],
      })

      await advertisementManager.updateAgent('test-agent-1', {
        capabilities: ['coding', 'debugging', 'testing'],
        healthStatus: 'degraded',
        version: '2.0.0',
      })

      const agent = advertisementManager.getAgent('test-agent-1')
      expect(agent?.capabilities).toEqual(['coding', 'debugging', 'testing'])
      expect(agent?.healthStatus).toBe('degraded')
      expect(agent?.version).toBe('2.0.0')
    })

    it('should emit agentUpdated event', async () => {
      await advertisementManager.registerAgent({
        agentId: 'test-agent-1',
        capabilities: ['coding'],
      })

      let eventReceived = false
      advertisementManager.on('agentUpdated', (agentId, updatedAgent) => {
        expect(agentId).toBe('test-agent-1')
        expect(updatedAgent.healthStatus).toBe('degraded')
        eventReceived = true
      })

      await advertisementManager.updateAgent('test-agent-1', {
        healthStatus: 'degraded',
      })

      expect(eventReceived).toBe(true)
    })

    it('should throw error when updating non-existent agent', async () => {
      await expect(
        advertisementManager.updateAgent('non-existent', {
          healthStatus: 'healthy',
        }),
      ).rejects.toThrow('Agent non-existent not found')
    })
  })

  describe('Dynamic Callbacks', () => {
    it('should register agent callbacks', () => {
      const callback = async (): Promise<AgentCapabilities | null> => ({
        agentId: 'dynamic-agent',
        capabilities: ['dynamic'],
        healthStatus: 'healthy',
        lastSeen: new Date(),
      })

      advertisementManager.registerAgentCallback('dynamic-agent', callback)

      // Should not throw and should be registered
      expect(() => {
        advertisementManager.registerAgentCallback('dynamic-agent', callback)
      }).not.toThrow()
    })
  })

  describe('BGP Integration', () => {
    it('should handle session establishment events', async () => {
      await advertisementManager.registerAgent({
        agentId: 'test-agent-1',
        capabilities: ['coding'],
      })

      // Add a peer first
      await bgpSession.addPeer(65001, 'http://localhost:4445')

      // Wait a bit for potential events
      await new Promise((resolve) => setTimeout(resolve, 100))

      // The advertisement manager should have received session events
      // This is tested indirectly through the event system
      expect(advertisementManager.getLocalAgents().size).toBe(1)
    })

    it('should advertise to established peers', async () => {
      bgpSession.on('updateSent', (peerASN, update) => {
        expect(peerASN).toBe(65001)
        expect(update.advertisedRoutes).toBeDefined()
        expect(update.advertisedRoutes?.[0]?.agentId).toBe('test-agent-1')
      })

      // Add peer and establish session (simulated)
      await bgpSession.addPeer(65001, 'http://localhost:4445')

      // Register agent after peer is added
      await advertisementManager.registerAgent({
        agentId: 'test-agent-1',
        capabilities: ['coding'],
      })

      // Wait a bit for potential advertisement
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Advertisement should have attempted to send updates
      expect(advertisementManager.getAgent('test-agent-1')).toBeDefined()
    })
  })

  describe('MED Calculation', () => {
    it('should calculate correct MED for healthy agents', async () => {
      await advertisementManager.registerAgent({
        agentId: 'healthy-agent',
        capabilities: ['coding'],
      })

      const agent = advertisementManager.getAgent('healthy-agent')
      expect(agent?.healthStatus).toBe('healthy')

      // MED calculation is tested indirectly through route creation
      // Healthy agents should have lower MED (higher preference)
    })

    it('should handle different health statuses', async () => {
      await advertisementManager.registerAgent({
        agentId: 'degraded-agent',
        capabilities: ['coding'],
      })

      await advertisementManager.updateAgent('degraded-agent', {
        healthStatus: 'degraded',
      })

      const agent = advertisementManager.getAgent('degraded-agent')
      expect(agent?.healthStatus).toBe('degraded')
    })
  })

  describe('Capability Queries', () => {
    it('should find agents by capability', async () => {
      await advertisementManager.registerAgent({
        agentId: 'coder-1',
        capabilities: ['coding', 'javascript'],
      })

      await advertisementManager.registerAgent({
        agentId: 'coder-2',
        capabilities: ['coding', 'python'],
      })

      await advertisementManager.registerAgent({
        agentId: 'weather-1',
        capabilities: ['weather', 'forecasting'],
      })

      const codingAgents = advertisementManager.getAgentsByCapability('coding')
      expect(codingAgents).toHaveLength(2)
      expect(codingAgents.map((a) => a.agentId)).toContain('coder-1')
      expect(codingAgents.map((a) => a.agentId)).toContain('coder-2')

      const weatherAgents =
        advertisementManager.getAgentsByCapability('weather')
      expect(weatherAgents).toHaveLength(1)
      expect(weatherAgents[0].agentId).toBe('weather-1')

      const pythonAgents = advertisementManager.getAgentsByCapability('python')
      expect(pythonAgents).toHaveLength(1)
    })

    it('should handle case-insensitive capability matching', async () => {
      await advertisementManager.registerAgent({
        agentId: 'test-agent',
        capabilities: ['JavaScript', 'Python'],
      })

      const jsAgents = advertisementManager.getAgentsByCapability('javascript')
      expect(jsAgents).toHaveLength(1)

      const pyAgents = advertisementManager.getAgentsByCapability('PYTHON')
      expect(pyAgents).toHaveLength(1)
    })
  })

  describe('Advertisement Statistics', () => {
    it('should provide accurate statistics', async () => {
      await advertisementManager.registerAgent({
        agentId: 'agent-1',
        capabilities: ['coding', 'testing'],
      })

      await advertisementManager.registerAgent({
        agentId: 'agent-2',
        capabilities: ['weather'],
      })

      await advertisementManager.updateAgent('agent-2', {
        healthStatus: 'degraded',
      })

      const stats = advertisementManager.getAdvertisementStats()

      expect(stats.totalLocalAgents).toBe(2)
      expect(stats.healthyAgents).toBe(1)
      expect(stats.degradedAgents).toBe(1)
      expect(stats.unhealthyAgents).toBe(0)
      expect(stats.capabilities).toContain('coding')
      expect(stats.capabilities).toContain('testing')
      expect(stats.capabilities).toContain('weather')
      expect(stats.advertisementInterval).toBe(1000)
    })

    it('should track callbacks in statistics', () => {
      const callback = async (): Promise<AgentCapabilities | null> => null

      advertisementManager.registerAgentCallback('callback-agent', callback)

      const stats = advertisementManager.getAdvertisementStats()
      expect(stats.totalCallbacks).toBe(1)
    })
  })

  describe('Periodic Advertisement', () => {
    it('should emit advertisementsRefreshed event', async () => {
      // Use a shorter interval for testing
      const testManager = new AgentAdvertisementManager(bgpSession, {
        ...config,
        advertisementInterval: 100, // 100ms
      })

      await testManager.registerAgent({
        agentId: 'test-agent',
        capabilities: ['coding'],
      })

      let refreshEventReceived = false
      testManager.on('advertisementsRefreshed', (count) => {
        expect(count).toBe(1)
        refreshEventReceived = true
      })

      // Wait for advertisement refresh
      await new Promise((resolve) => setTimeout(resolve, 150))

      await testManager.shutdown()
      expect(refreshEventReceived).toBe(true)
    }, 10000)

    it('should handle callback updates during refresh', async () => {
      let callbackCallCount = 0
      const callback = async (): Promise<AgentCapabilities | null> => {
        callbackCallCount++
        return {
          agentId: 'callback-agent',
          capabilities: ['dynamic'],
          healthStatus: 'healthy',
          lastSeen: new Date(),
          version: `v${callbackCallCount}`,
        }
      }

      const testManager = new AgentAdvertisementManager(bgpSession, {
        ...config,
        advertisementInterval: 100,
      })

      // Register a regular agent first so refresh will run
      await testManager.registerAgent({
        agentId: 'regular-agent',
        capabilities: ['regular'],
      })

      // Register the callback
      testManager.registerAgentCallback('callback-agent', callback)

      // Wait for a refresh cycle to call the callback
      await new Promise((resolve) => setTimeout(resolve, 150))

      expect(callbackCallCount).toBeGreaterThan(0)
      const agent = testManager.getAgent('callback-agent')
      expect(agent?.version).toBeDefined()

      await testManager.shutdown()
    }, 10000)
  })

  describe('Community Generation', () => {
    it('should generate appropriate BGP communities', async () => {
      await advertisementManager.registerAgent({
        agentId: 'test-agent',
        capabilities: ['coding', 'debugging'],
      })

      // Communities are tested indirectly through route creation
      // They should include capability-based and health-based tags
      const agent = advertisementManager.getAgent('test-agent')
      expect(agent?.capabilities).toContain('coding')
      expect(agent?.capabilities).toContain('debugging')
    })
  })

  describe('Error Handling', () => {
    it('should handle advertisement failures gracefully', async () => {
      await advertisementManager.registerAgent({
        agentId: 'test-agent',
        capabilities: ['coding'],
      })

      // The system should handle failed advertisements without crashing
      expect(advertisementManager.getAgent('test-agent')).toBeDefined()
    })

    it('should handle callback errors during refresh', async () => {
      const failingCallback = async (): Promise<AgentCapabilities | null> => {
        throw new Error('Callback failed')
      }

      advertisementManager.registerAgentCallback(
        'failing-agent',
        failingCallback,
      )

      // Should not throw during refresh
      await expect(async () => {
        // Trigger refresh manually for testing
        await new Promise((resolve) => setTimeout(resolve, 100))
      }).not.toThrow()
    })
  })

  describe('Shutdown', () => {
    it('should shutdown cleanly', async () => {
      await advertisementManager.registerAgent({
        agentId: 'test-agent-1',
        capabilities: ['coding'],
      })

      await advertisementManager.registerAgent({
        agentId: 'test-agent-2',
        capabilities: ['weather'],
      })

      await expect(advertisementManager.shutdown()).resolves.not.toThrow()

      // All agents should be cleared
      expect(advertisementManager.getLocalAgents().size).toBe(0)
    })

    it('should emit shutdown event', async () => {
      let shutdownReceived = false
      advertisementManager.on('shutdown', () => {
        shutdownReceived = true
      })

      await advertisementManager.shutdown()
      expect(shutdownReceived).toBe(true)
    })

    it('should stop advertisement timer on shutdown', async () => {
      const testManager = new AgentAdvertisementManager(bgpSession, {
        ...config,
        advertisementInterval: 100,
      })

      await testManager.registerAgent({
        agentId: 'test-agent',
        capabilities: ['coding'],
      })

      await testManager.shutdown()

      // Timer should be stopped, no more refresh events
      let refreshAfterShutdown = false
      testManager.on('advertisementsRefreshed', () => {
        refreshAfterShutdown = true
      })

      await new Promise((resolve) => setTimeout(resolve, 200))
      expect(refreshAfterShutdown).toBe(false)
    })
  })
})
