import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PolicyEngine, PolicyConfig } from '../../src/bgp/policy.js'
import { AgentRoute } from '../../src/bgp/types.js'

// Override logger import for testing
vi.mock('../../src/config.js', () => ({
  logger: {
    log: () => {},
    error: () => {},
  },
}))

describe('PolicyEngine', () => {
  let policyEngine: PolicyEngine

  beforeEach(() => {
    policyEngine = new PolicyEngine(100) // Small history for testing
  })

  describe('Initialization', () => {
    it('should initialize with empty policies and zero stats', () => {
      const stats = policyEngine.getStats()
      expect(stats.totalPolicies).toBe(0)
      expect(stats.enabledPolicies).toBe(0)
      expect(stats.totalDecisions).toBe(0)
      expect(stats.acceptDecisions).toBe(0)
      expect(stats.rejectDecisions).toBe(0)
      expect(stats.modifyDecisions).toBe(0)
      expect(stats.averageDecisionTime).toBe(0)
    })

    it('should have empty policy list initially', () => {
      expect(policyEngine.getPolicies()).toEqual([])
    })

    it('should have empty decision history initially', () => {
      expect(policyEngine.getDecisionHistory()).toEqual([])
    })
  })

  describe('Policy Loading', () => {
    it('should load valid policies and sort by priority', () => {
      const policies: PolicyConfig[] = [
        {
          name: 'low-priority',
          enabled: true,
          priority: 10,
          match: { capabilities: ['test'] },
          action: { action: 'accept' },
        },
        {
          name: 'high-priority',
          enabled: true,
          priority: 100,
          match: { capabilities: ['critical'] },
          action: { action: 'reject' },
        },
      ]

      policyEngine.loadPolicies(policies)

      const loadedPolicies = policyEngine.getPolicies()
      expect(loadedPolicies).toHaveLength(2)
      expect(loadedPolicies[0].name).toBe('high-priority') // Higher priority first
      expect(loadedPolicies[1].name).toBe('low-priority')

      const stats = policyEngine.getStats()
      expect(stats.totalPolicies).toBe(2)
      expect(stats.enabledPolicies).toBe(2)
    })

    it('should filter out invalid policies', () => {
      const policies = [
        {
          name: 'valid-policy',
          enabled: true,
          priority: 50,
          match: {},
          action: { action: 'accept' },
        },
        {
          // Missing name
          enabled: true,
          priority: 50,
          match: {},
          action: { action: 'accept' },
        },
        {
          name: 'invalid-action',
          enabled: true,
          priority: 50,
          match: {},
          action: { action: 'invalid' }, // Invalid action type
        },
      ] as PolicyConfig[]

      policyEngine.loadPolicies(policies)

      const loadedPolicies = policyEngine.getPolicies()
      expect(loadedPolicies).toHaveLength(1)
      expect(loadedPolicies[0].name).toBe('valid-policy')
    })
  })

  describe('Route Matching', () => {
    const sampleRoute: AgentRoute = {
      agentId: 'test-agent',
      capabilities: ['coding', 'javascript', 'react'],
      asPath: [65001, 65002],
      nextHop: 'http://localhost:4445',
      localPref: 100,
      med: 50,
      communities: ['capability:coding', 'health:healthy', 'region:us-east'],
      originTime: new Date(),
      pathAttributes: new Map(),
    }

    it('should match agent ID exactly', () => {
      const policy: PolicyConfig = {
        name: 'agent-id-match',
        enabled: true,
        priority: 50,
        match: { agentId: 'test-agent' },
        action: { action: 'accept' },
      }

      policyEngine.loadPolicies([policy])
      const result = policyEngine.applyPolicies([sampleRoute])
      expect(result).toHaveLength(1)
      expect(result[0].agentId).toBe('test-agent')
    })

    it('should match agent ID from array', () => {
      const policy: PolicyConfig = {
        name: 'agent-id-array-match',
        enabled: true,
        priority: 50,
        match: { agentId: ['other-agent', 'test-agent', 'another-agent'] },
        action: { action: 'accept' },
      }

      policyEngine.loadPolicies([policy])
      const result = policyEngine.applyPolicies([sampleRoute])
      expect(result).toHaveLength(1)
    })

    it('should reject non-matching agent ID', () => {
      const policy: PolicyConfig = {
        name: 'agent-id-reject',
        enabled: true,
        priority: 50,
        match: { agentId: 'different-agent' },
        action: { action: 'reject' },
      }

      policyEngine.loadPolicies([policy])
      const result = policyEngine.applyPolicies([sampleRoute])
      expect(result).toHaveLength(1) // Default accept if no match
    })

    it('should match capabilities (AND logic)', () => {
      const policy: PolicyConfig = {
        name: 'capability-and-match',
        enabled: true,
        priority: 50,
        match: { capabilities: ['coding', 'javascript'] },
        action: { action: 'accept' },
      }

      policyEngine.loadPolicies([policy])
      const result = policyEngine.applyPolicies([sampleRoute])
      expect(result).toHaveLength(1)
    })

    it('should fail if any required capability is missing (AND logic)', () => {
      const policy: PolicyConfig = {
        name: 'capability-and-fail',
        enabled: true,
        priority: 50,
        match: { capabilities: ['coding', 'python'] }, // python missing
        action: { action: 'reject' },
      }

      policyEngine.loadPolicies([policy])
      const result = policyEngine.applyPolicies([sampleRoute])
      expect(result).toHaveLength(1) // Default accept since no match
    })

    it('should match capabilities (OR logic)', () => {
      const policy: PolicyConfig = {
        name: 'capability-or-match',
        enabled: true,
        priority: 50,
        match: { capabilitiesAny: ['python', 'javascript', 'go'] },
        action: { action: 'accept' },
      }

      policyEngine.loadPolicies([policy])
      const result = policyEngine.applyPolicies([sampleRoute])
      expect(result).toHaveLength(1)
    })

    it('should match ASN in path', () => {
      const policy: PolicyConfig = {
        name: 'asn-match',
        enabled: true,
        priority: 50,
        match: { asn: 65001 },
        action: { action: 'accept' },
      }

      policyEngine.loadPolicies([policy])
      const result = policyEngine.applyPolicies([sampleRoute])
      expect(result).toHaveLength(1)
    })

    it('should match ASN range', () => {
      const policy: PolicyConfig = {
        name: 'asn-range-match',
        enabled: true,
        priority: 50,
        match: { asnRange: { min: 65000, max: 65010 } },
        action: { action: 'accept' },
      }

      policyEngine.loadPolicies([policy])
      const result = policyEngine.applyPolicies([sampleRoute])
      expect(result).toHaveLength(1)
    })

    it('should match health status from communities', () => {
      const policy: PolicyConfig = {
        name: 'health-match',
        enabled: true,
        priority: 50,
        match: { healthStatus: 'healthy' },
        action: { action: 'accept' },
      }

      policyEngine.loadPolicies([policy])
      const result = policyEngine.applyPolicies([sampleRoute])
      expect(result).toHaveLength(1)
    })

    it('should match performance criteria', () => {
      const policy: PolicyConfig = {
        name: 'performance-match',
        enabled: true,
        priority: 50,
        match: {
          minLocalPref: 50, // Route has 100, so should match
          maxMED: 100, // Route has 50, so should match
          maxASPathLength: 3, // Route has 2 hops, so should match
        },
        action: { action: 'accept' },
      }

      policyEngine.loadPolicies([policy])
      const result = policyEngine.applyPolicies([sampleRoute])
      expect(result).toHaveLength(1)
    })

    it('should reject based on performance criteria', () => {
      const policy: PolicyConfig = {
        name: 'performance-reject',
        enabled: true,
        priority: 50,
        match: {
          minLocalPref: 200, // Route has 100, so should not match
        },
        action: { action: 'reject' },
      }

      policyEngine.loadPolicies([policy])
      const result = policyEngine.applyPolicies([sampleRoute])
      expect(result).toHaveLength(1) // Default accept since no match
    })
  })

  describe('Policy Actions', () => {
    const sampleRoute: AgentRoute = {
      agentId: 'test-agent',
      capabilities: ['coding'],
      asPath: [65001],
      nextHop: 'http://localhost:4445',
      localPref: 100,
      med: 50,
      communities: ['health:healthy'],
      originTime: new Date(),
      pathAttributes: new Map(),
    }

    it('should accept routes', () => {
      const policy: PolicyConfig = {
        name: 'accept-policy',
        enabled: true,
        priority: 50,
        match: { agentId: 'test-agent' },
        action: { action: 'accept' },
      }

      policyEngine.loadPolicies([policy])
      const result = policyEngine.applyPolicies([sampleRoute])
      expect(result).toHaveLength(1)
      expect(result[0].agentId).toBe('test-agent')
    })

    it('should reject routes', () => {
      const policy: PolicyConfig = {
        name: 'reject-policy',
        enabled: true,
        priority: 50,
        match: { agentId: 'test-agent' },
        action: { action: 'reject' },
      }

      policyEngine.loadPolicies([policy])
      const result = policyEngine.applyPolicies([sampleRoute])
      expect(result).toHaveLength(0) // Route should be rejected
    })

    it('should modify route preferences', () => {
      const policy: PolicyConfig = {
        name: 'modify-policy',
        enabled: true,
        priority: 50,
        match: { agentId: 'test-agent' },
        action: {
          action: 'modify',
          setLocalPref: 200,
          setMED: 25,
          addCommunity: ['priority:high'],
        },
      }

      policyEngine.loadPolicies([policy])
      const result = policyEngine.applyPolicies([sampleRoute])
      expect(result).toHaveLength(1)
      expect(result[0].localPref).toBe(200)
      expect(result[0].med).toBe(25)
      expect(result[0].communities).toContain('priority:high')
    })

    it('should add to MED value', () => {
      const policy: PolicyConfig = {
        name: 'modify-med-policy',
        enabled: true,
        priority: 50,
        match: { agentId: 'test-agent' },
        action: {
          action: 'modify',
          addMED: 10,
        },
      }

      policyEngine.loadPolicies([policy])
      const result = policyEngine.applyPolicies([sampleRoute])
      expect(result).toHaveLength(1)
      expect(result[0].med).toBe(60) // Original 50 + 10
    })

    it('should remove communities', () => {
      const testRoute = {
        ...sampleRoute,
        communities: ['health:healthy', 'priority:normal', 'region:us'],
      }

      const policy: PolicyConfig = {
        name: 'remove-community-policy',
        enabled: true,
        priority: 50,
        match: { agentId: 'test-agent' },
        action: {
          action: 'modify',
          removeCommunity: ['priority:normal'],
        },
      }

      policyEngine.loadPolicies([policy])
      const result = policyEngine.applyPolicies([testRoute])
      expect(result).toHaveLength(1)
      expect(result[0].communities).not.toContain('priority:normal')
      expect(result[0].communities).toContain('health:healthy')
      expect(result[0].communities).toContain('region:us')
    })
  })

  describe('Policy Priority', () => {
    const sampleRoute: AgentRoute = {
      agentId: 'test-agent',
      capabilities: ['coding'],
      asPath: [65001],
      nextHop: 'http://localhost:4445',
      localPref: 100,
      med: 50,
      communities: ['health:healthy'],
      originTime: new Date(),
      pathAttributes: new Map(),
    }

    it('should apply highest priority policy first', () => {
      const policies: PolicyConfig[] = [
        {
          name: 'low-priority-reject',
          enabled: true,
          priority: 10,
          match: { agentId: 'test-agent' },
          action: { action: 'reject' },
        },
        {
          name: 'high-priority-accept',
          enabled: true,
          priority: 100,
          match: { agentId: 'test-agent' },
          action: { action: 'accept', logDecision: true },
        },
      ]

      policyEngine.loadPolicies(policies)
      const result = policyEngine.applyPolicies([sampleRoute])

      // Should accept because high priority policy matches first
      expect(result).toHaveLength(1)

      // Check decision history to verify correct policy was applied
      const decisions = policyEngine.getDecisionHistory()
      expect(decisions).toHaveLength(1)
      expect(decisions[0].policy.name).toBe('high-priority-accept')
    })

    it('should skip disabled policies', () => {
      const policies: PolicyConfig[] = [
        {
          name: 'disabled-reject',
          enabled: false, // Disabled
          priority: 100,
          match: { agentId: 'test-agent' },
          action: { action: 'reject' },
        },
        {
          name: 'enabled-accept',
          enabled: true,
          priority: 50,
          match: { agentId: 'test-agent' },
          action: { action: 'accept' },
        },
      ]

      policyEngine.loadPolicies(policies)
      const result = policyEngine.applyPolicies([sampleRoute])

      expect(result).toHaveLength(1)

      const decisions = policyEngine.getDecisionHistory()
      expect(decisions[0].policy.name).toBe('enabled-accept')
    })
  })

  describe('Time-based Matching', () => {
    const sampleRoute: AgentRoute = {
      agentId: 'test-agent',
      capabilities: ['coding'],
      asPath: [65001],
      nextHop: 'http://localhost:4445',
      localPref: 100,
      med: 50,
      communities: ['health:healthy'],
      originTime: new Date(),
      pathAttributes: new Map(),
    }

    it('should handle day of week matching', () => {
      const now = new Date()
      const dayNames = [
        'sunday',
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
      ] as const
      const currentDay = dayNames[now.getDay()]

      const policy: PolicyConfig = {
        name: 'weekday-policy',
        enabled: true,
        priority: 50,
        match: {
          agentId: 'test-agent',
          dayOfWeek: [currentDay], // Should match current day
        },
        action: { action: 'accept' },
      }

      policyEngine.loadPolicies([policy])
      const result = policyEngine.applyPolicies([sampleRoute])
      expect(result).toHaveLength(1)
    })

    it('should reject on non-matching day of week', () => {
      const now = new Date()
      const dayNames = [
        'sunday',
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
      ] as const
      const currentDay = dayNames[now.getDay()]

      // Find a different day
      const differentDay = dayNames.find((day) => day !== currentDay)!

      const policy: PolicyConfig = {
        name: 'wrong-day-policy',
        enabled: true,
        priority: 50,
        match: {
          agentId: 'test-agent',
          dayOfWeek: [differentDay], // Should not match current day
        },
        action: { action: 'reject' },
      }

      policyEngine.loadPolicies([policy])
      const result = policyEngine.applyPolicies([sampleRoute])
      expect(result).toHaveLength(1) // Default accept since no match
    })
  })

  describe('Statistics and Monitoring', () => {
    const sampleRoute: AgentRoute = {
      agentId: 'test-agent',
      capabilities: ['coding'],
      asPath: [65001],
      nextHop: 'http://localhost:4445',
      localPref: 100,
      med: 50,
      communities: ['health:healthy'],
      originTime: new Date(),
      pathAttributes: new Map(),
    }

    it('should track decision statistics', () => {
      const policies: PolicyConfig[] = [
        {
          name: 'accept-policy',
          enabled: true,
          priority: 100,
          match: { agentId: 'test-agent' },
          action: { action: 'accept' },
        },
        {
          name: 'reject-policy',
          enabled: true,
          priority: 50,
          match: { agentId: 'other-agent' },
          action: { action: 'reject' },
        },
      ]

      const otherRoute: AgentRoute = { ...sampleRoute, agentId: 'other-agent' }

      policyEngine.loadPolicies(policies)
      policyEngine.applyPolicies([sampleRoute, otherRoute])

      const stats = policyEngine.getStats()
      expect(stats.totalDecisions).toBe(2)
      expect(stats.acceptDecisions).toBe(1) // test-agent accepted
      expect(stats.rejectDecisions).toBe(1) // other-agent rejected
      expect(stats.averageDecisionTime).toBeGreaterThanOrEqual(0) // Can be 0 for very fast operations
      expect(stats.lastDecisionTime).toBeInstanceOf(Date)
    })

    it('should track per-policy decision counts', () => {
      const policy: PolicyConfig = {
        name: 'test-policy',
        enabled: true,
        priority: 50,
        match: { agentId: 'test-agent' },
        action: { action: 'accept' },
      }

      policyEngine.loadPolicies([policy])
      policyEngine.applyPolicies([sampleRoute])
      policyEngine.applyPolicies([sampleRoute])

      const stats = policyEngine.getStats()
      expect(stats.decisionsByPolicy.get('test-policy')).toBe(2)
    })

    it('should maintain decision history', () => {
      const policy: PolicyConfig = {
        name: 'history-policy',
        enabled: true,
        priority: 50,
        match: { agentId: 'test-agent' },
        action: { action: 'accept' },
      }

      policyEngine.loadPolicies([policy])
      policyEngine.applyPolicies([sampleRoute])

      const history = policyEngine.getDecisionHistory()
      expect(history).toHaveLength(1)
      expect(history[0].policy.name).toBe('history-policy')
      expect(history[0].action).toBe('accept')
      expect(history[0].route.agentId).toBe('test-agent')
      expect(history[0].timestamp).toBeInstanceOf(Date)
    })

    it('should limit decision history size', () => {
      const smallEngine = new PolicyEngine(2) // Max 2 decisions
      const policy: PolicyConfig = {
        name: 'limit-policy',
        enabled: true,
        priority: 50,
        match: { agentId: 'test-agent' },
        action: { action: 'accept' },
      }

      smallEngine.loadPolicies([policy])

      // Apply policies 5 times
      for (let i = 0; i < 5; i++) {
        smallEngine.applyPolicies([sampleRoute])
      }

      const history = smallEngine.getDecisionHistory()
      expect(history).toHaveLength(2) // Should be limited to 2
    })
  })

  describe('Policy Management', () => {
    it('should add new policies', () => {
      const policy: PolicyConfig = {
        name: 'new-policy',
        enabled: true,
        priority: 50,
        match: { agentId: 'test' },
        action: { action: 'accept' },
      }

      const result = policyEngine.addPolicy(policy)
      expect(result).toBe(true)

      const policies = policyEngine.getPolicies()
      expect(policies).toHaveLength(1)
      expect(policies[0].name).toBe('new-policy')
    })

    it('should update existing policies', () => {
      const policy1: PolicyConfig = {
        name: 'update-policy',
        enabled: true,
        priority: 50,
        match: { agentId: 'test' },
        action: { action: 'accept' },
      }

      const policy2: PolicyConfig = {
        name: 'update-policy', // Same name
        enabled: false, // Different config
        priority: 100,
        match: { agentId: 'test2' },
        action: { action: 'reject' },
      }

      policyEngine.addPolicy(policy1)
      policyEngine.addPolicy(policy2)

      const policies = policyEngine.getPolicies()
      expect(policies).toHaveLength(1) // Should replace, not add
      expect(policies[0].enabled).toBe(false)
      expect(policies[0].priority).toBe(100)
    })

    it('should remove policies', () => {
      const policy: PolicyConfig = {
        name: 'remove-me',
        enabled: true,
        priority: 50,
        match: { agentId: 'test' },
        action: { action: 'accept' },
      }

      policyEngine.addPolicy(policy)
      expect(policyEngine.getPolicies()).toHaveLength(1)

      const result = policyEngine.removePolicy('remove-me')
      expect(result).toBe(true)
      expect(policyEngine.getPolicies()).toHaveLength(0)

      // Removing non-existent policy should return false
      const result2 = policyEngine.removePolicy('non-existent')
      expect(result2).toBe(false)
    })

    it('should toggle policy enabled state', () => {
      const policy: PolicyConfig = {
        name: 'toggle-policy',
        enabled: true,
        priority: 50,
        match: { agentId: 'test' },
        action: { action: 'accept' },
      }

      policyEngine.addPolicy(policy)

      // Disable
      const result1 = policyEngine.togglePolicy('toggle-policy', false)
      expect(result1).toBe(true)
      expect(policyEngine.getPolicies()[0].enabled).toBe(false)

      // Enable
      const result2 = policyEngine.togglePolicy('toggle-policy', true)
      expect(result2).toBe(true)
      expect(policyEngine.getPolicies()[0].enabled).toBe(true)

      // Non-existent policy
      const result3 = policyEngine.togglePolicy('non-existent', true)
      expect(result3).toBe(false)
    })

    it('should clear all policies', () => {
      const policies: PolicyConfig[] = [
        {
          name: 'policy-1',
          enabled: true,
          priority: 50,
          match: {},
          action: { action: 'accept' },
        },
        {
          name: 'policy-2',
          enabled: true,
          priority: 60,
          match: {},
          action: { action: 'accept' },
        },
      ]

      policyEngine.loadPolicies(policies)
      expect(policyEngine.getPolicies()).toHaveLength(2)

      policyEngine.clearPolicies()
      expect(policyEngine.getPolicies()).toHaveLength(0)

      const stats = policyEngine.getStats()
      expect(stats.totalPolicies).toBe(0)
      expect(stats.enabledPolicies).toBe(0)
    })
  })

  describe('Policy Import/Export', () => {
    it('should export policies to JSON', () => {
      const policy: PolicyConfig = {
        name: 'export-policy',
        enabled: true,
        priority: 50,
        match: { agentId: 'test' },
        action: { action: 'accept' },
      }

      policyEngine.addPolicy(policy)
      const exported = policyEngine.exportPolicies()

      const parsed = JSON.parse(exported)
      expect(parsed).toHaveLength(1)
      expect(parsed[0].name).toBe('export-policy')
    })

    it('should import policies from JSON', () => {
      const policies = [
        {
          name: 'import-policy-1',
          enabled: true,
          priority: 50,
          match: { agentId: 'test1' },
          action: { action: 'accept' },
        },
        {
          name: 'import-policy-2',
          enabled: false,
          priority: 100,
          match: { agentId: 'test2' },
          action: { action: 'reject' },
        },
      ]

      const json = JSON.stringify(policies)
      const result = policyEngine.importPolicies(json)

      expect(result).toBe(true)
      expect(policyEngine.getPolicies()).toHaveLength(2)
      expect(policyEngine.getPolicies()[0].name).toBe('import-policy-2') // Higher priority first
    })

    it('should handle invalid JSON on import', () => {
      const result = policyEngine.importPolicies('invalid json')
      expect(result).toBe(false)
      expect(policyEngine.getPolicies()).toHaveLength(0)
    })
  })

  describe('Default Behavior', () => {
    const sampleRoute: AgentRoute = {
      agentId: 'test-agent',
      capabilities: ['coding'],
      asPath: [65001],
      nextHop: 'http://localhost:4445',
      localPref: 100,
      med: 50,
      communities: ['health:healthy'],
      originTime: new Date(),
      pathAttributes: new Map(),
    }

    it('should accept routes by default when no policies match', () => {
      // No policies loaded
      const result = policyEngine.applyPolicies([sampleRoute])
      expect(result).toHaveLength(1)
      expect(result[0]).toBe(sampleRoute) // Should be unchanged

      const decisions = policyEngine.getDecisionHistory()
      expect(decisions).toHaveLength(1)
      expect(decisions[0].policy.name).toBe('default')
      expect(decisions[0].action).toBe('accept')
    })

    it('should accept routes when no enabled policies match', () => {
      const policy: PolicyConfig = {
        name: 'disabled-policy',
        enabled: false, // Disabled
        priority: 50,
        match: { agentId: 'test-agent' },
        action: { action: 'reject' },
      }

      policyEngine.loadPolicies([policy])
      const result = policyEngine.applyPolicies([sampleRoute])
      expect(result).toHaveLength(1)

      const decisions = policyEngine.getDecisionHistory()
      expect(decisions[0].policy.name).toBe('default')
    })
  })
})
