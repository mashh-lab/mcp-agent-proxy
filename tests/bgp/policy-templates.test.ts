// Tests for BGP Policy Templates
// Ensures policy templates work correctly for common scenarios

import {
  getAllPolicyTemplates,
  getPolicyTemplatesByCategory,
  getPolicyTemplatesByDifficulty,
  getPolicyTemplatesByTag,
  getPolicyTemplate,
  searchPolicyTemplates,
  getPolicyTemplateCategories,
  applyPolicyTemplate,
  getPolicyTemplateStats,
} from '../../src/bgp/policy-templates.js'
import { PolicyEngine } from '../../src/bgp/policy.js'
import { AgentRoute } from '../../src/bgp/types.js'
import {
  BGPServer,
  BGPServerConfig,
  BGPEndpointRequest,
} from '../../src/bgp/server.js'

describe('PolicyTemplates', () => {
  describe('Template Discovery', () => {
    it('should get all policy templates', () => {
      const templates = getAllPolicyTemplates()
      expect(templates.length).toBeGreaterThan(0)

      // Check template structure
      for (const template of templates) {
        expect(template).toHaveProperty('id')
        expect(template).toHaveProperty('name')
        expect(template).toHaveProperty('description')
        expect(template).toHaveProperty('category')
        expect(template).toHaveProperty('useCase')
        expect(template).toHaveProperty('policies')
        expect(template).toHaveProperty('tags')
        expect(template).toHaveProperty('difficulty')
        expect(Array.isArray(template.policies)).toBe(true)
        expect(Array.isArray(template.tags)).toBe(true)
      }
    })

    it('should get templates by category', () => {
      const securityTemplates = getPolicyTemplatesByCategory('security')
      expect(securityTemplates.length).toBeGreaterThan(0)

      for (const template of securityTemplates) {
        expect(template.category).toBe('security')
      }

      const performanceTemplates = getPolicyTemplatesByCategory('performance')
      expect(performanceTemplates.length).toBeGreaterThan(0)

      for (const template of performanceTemplates) {
        expect(template.category).toBe('performance')
      }
    })

    it('should get templates by difficulty', () => {
      const beginnerTemplates = getPolicyTemplatesByDifficulty('beginner')
      const advancedTemplates = getPolicyTemplatesByDifficulty('advanced')

      expect(beginnerTemplates.length).toBeGreaterThan(0)
      expect(advancedTemplates.length).toBeGreaterThan(0)

      for (const template of beginnerTemplates) {
        expect(template.difficulty).toBe('beginner')
      }

      for (const template of advancedTemplates) {
        expect(template.difficulty).toBe('advanced')
      }
    })

    it('should get templates by tag', () => {
      const securityTagged = getPolicyTemplatesByTag('security')
      expect(securityTagged.length).toBeGreaterThan(0)

      for (const template of securityTagged) {
        expect(template.tags).toContain('security')
      }
    })

    it('should get specific template by ID', () => {
      const template = getPolicyTemplate('security-basic')
      expect(template).toBeDefined()
      expect(template?.id).toBe('security-basic')
      expect(template?.name).toContain('Basic Security')
      expect(template?.policies.length).toBeGreaterThan(0)

      const nonExistent = getPolicyTemplate('non-existent')
      expect(nonExistent).toBeNull()
    })

    it('should search templates by keyword', () => {
      const securityResults = searchPolicyTemplates('security')
      expect(securityResults.length).toBeGreaterThan(0)

      const performanceResults = searchPolicyTemplates('performance')
      expect(performanceResults.length).toBeGreaterThan(0)

      const emptyResults = searchPolicyTemplates('nonexistentkeyword')
      expect(emptyResults.length).toBe(0)
    })

    it('should get all template categories', () => {
      const categories = getPolicyTemplateCategories()
      expect(categories.length).toBeGreaterThan(0)
      expect(categories).toContain('security')
      expect(categories).toContain('performance')
      expect(categories).toContain('reliability')
      expect(categories).toContain('development')
      expect(categories).toContain('production')
    })
  })

  describe('Template Application', () => {
    it('should apply template and get policies', () => {
      const policies = applyPolicyTemplate('security-basic')
      expect(policies.length).toBeGreaterThan(0)

      // Check that all policies have required fields
      for (const policy of policies) {
        expect(policy).toHaveProperty('name')
        expect(policy).toHaveProperty('description')
        expect(policy).toHaveProperty('enabled')
        expect(policy).toHaveProperty('priority')
        expect(policy).toHaveProperty('match')
        expect(policy).toHaveProperty('action')
      }
    })

    it('should apply template with customization', () => {
      const policies = applyPolicyTemplate('security-basic', {
        enabledOnly: true,
        priorityOffset: 100,
        namePrefix: 'custom-',
      })

      expect(policies.length).toBeGreaterThan(0)

      // Check customizations were applied
      for (const policy of policies) {
        expect(policy.enabled).toBe(true) // enabledOnly filter
        expect(policy.priority).toBeGreaterThan(800) // original + offset
        expect(policy.name.startsWith('custom-')).toBe(true) // name prefix
      }
    })

    it('should handle non-existent template', () => {
      expect(() => {
        applyPolicyTemplate('non-existent')
      }).toThrow("Policy template 'non-existent' not found")
    })

    it('should filter enabled policies only', () => {
      // Get template with mixed enabled/disabled policies
      const template = getPolicyTemplate('development-friendly')
      expect(template).toBeDefined()

      const allPolicies = applyPolicyTemplate('development-friendly')
      const enabledOnly = applyPolicyTemplate('development-friendly', {
        enabledOnly: true,
      })

      expect(enabledOnly.length).toBeLessThanOrEqual(allPolicies.length)

      for (const policy of enabledOnly) {
        expect(policy.enabled).toBe(true)
      }
    })
  })

  describe('Template Statistics', () => {
    it('should get template statistics', () => {
      const stats = getPolicyTemplateStats()

      expect(stats).toHaveProperty('totalTemplates')
      expect(stats).toHaveProperty('categoryCounts')
      expect(stats).toHaveProperty('difficultyCounts')
      expect(stats).toHaveProperty('totalPolicies')

      expect(stats.totalTemplates).toBeGreaterThan(0)
      expect(stats.totalPolicies).toBeGreaterThan(0)

      // Check category counts
      expect(stats.categoryCounts.security).toBeGreaterThan(0)
      expect(stats.categoryCounts.performance).toBeGreaterThan(0)

      // Check difficulty counts
      expect(stats.difficultyCounts.beginner).toBeGreaterThan(0)
      expect(stats.difficultyCounts.advanced).toBeGreaterThan(0)
    })
  })

  describe('Template Integration with PolicyEngine', () => {
    let policyEngine: PolicyEngine

    beforeEach(() => {
      policyEngine = new PolicyEngine(1000)
    })

    it('should apply template to policy engine', () => {
      const policies = applyPolicyTemplate('security-basic')

      for (const policy of policies) {
        const success = policyEngine.addPolicy(policy)
        expect(success).toBe(true)
      }

      const engineStats = policyEngine.getStats()
      expect(engineStats.totalPolicies).toBe(policies.length)
    })

    it('should test template policies against routes', () => {
      // Apply security template
      const policies = applyPolicyTemplate('security-basic')
      for (const policy of policies) {
        policyEngine.addPolicy(policy)
      }

      // Create test routes
      const testRoutes: AgentRoute[] = [
        {
          agentId: 'healthy-agent',
          capabilities: ['coding'],
          asPath: [65001],
          nextHop: 'http://localhost:4111',
          localPref: 100,
          med: 0,
          communities: ['health:healthy'],
          originTime: new Date(),
          pathAttributes: new Map(),
        },
        {
          agentId: 'unhealthy-agent',
          capabilities: ['coding'],
          asPath: [65002],
          nextHop: 'http://localhost:4222',
          localPref: 100,
          med: 0,
          communities: ['health:unhealthy'],
          originTime: new Date(),
          pathAttributes: new Map(),
        },
        {
          agentId: 'long-path-agent',
          capabilities: ['coding'],
          asPath: [
            65003, 65004, 65005, 65006, 65007, 65008, 65009, 65010, 65011,
          ],
          nextHop: 'http://localhost:4333',
          localPref: 100,
          med: 0,
          communities: ['health:healthy'],
          originTime: new Date(),
          pathAttributes: new Map(),
        },
      ]

      const acceptedRoutes = policyEngine.applyPolicies(testRoutes)

      // Security template should reject unhealthy and long-path agents
      const acceptedAgentIds = acceptedRoutes.map((route) => route.agentId)
      expect(acceptedRoutes.length).toBe(1)
      expect(acceptedAgentIds).toContain('healthy-agent')
      expect(acceptedAgentIds).not.toContain('unhealthy-agent')
      expect(acceptedAgentIds).not.toContain('long-path-agent')
    })
  })

  describe('Template Content Validation', () => {
    it('should have valid security templates', () => {
      const basicSecurity = getPolicyTemplate('security-basic')
      expect(basicSecurity).toBeDefined()
      expect(basicSecurity!.category).toBe('security')
      expect(basicSecurity!.policies.length).toBeGreaterThan(0)

      // Should have policy to block unhealthy agents
      const blockPolicy = basicSecurity!.policies.find(
        (p) => p.name.includes('unhealthy') && p.action.action === 'reject',
      )
      expect(blockPolicy).toBeDefined()

      const advancedSecurity = getPolicyTemplate('security-advanced')
      expect(advancedSecurity).toBeDefined()
      expect(advancedSecurity!.difficulty).toBe('advanced')
      expect(advancedSecurity!.policies.length).toBeGreaterThan(0)
    })

    it('should have valid performance templates', () => {
      const performance = getPolicyTemplate('performance-optimization')
      expect(performance).toBeDefined()
      expect(performance!.category).toBe('performance')
      expect(performance!.policies.length).toBeGreaterThan(0)

      // Should have policy to prefer local agents
      const localPolicy = performance!.policies.find(
        (p) => p.name.includes('local') && p.action.action === 'modify',
      )
      expect(localPolicy).toBeDefined()
    })

    it('should have valid development templates', () => {
      const development = getPolicyTemplate('development-friendly')
      expect(development).toBeDefined()
      expect(development!.category).toBe('development')
      expect(development!.difficulty).toBe('beginner')
      expect(development!.policies.length).toBeGreaterThan(0)
    })

    it('should have valid production templates', () => {
      const production = getPolicyTemplate('production-hardened')
      expect(production).toBeDefined()
      expect(production!.category).toBe('production')
      expect(production!.difficulty).toBe('advanced')
      expect(production!.policies.length).toBeGreaterThan(0)
    })

    it('should have documentation for templates', () => {
      const templates = getAllPolicyTemplates()

      for (const template of templates) {
        if (template.documentation) {
          expect(template.documentation.length).toBeGreaterThan(0)
          expect(template.documentation).toContain('#') // Should be markdown
        }
      }
    })
  })
})

describe('PolicyTemplateHTTPEndpoints', () => {
  let bgpServer: BGPServer
  let policyEngine: PolicyEngine

  const serverConfig: BGPServerConfig = {
    port: 4444,
    hostname: 'localhost',
    localASN: 65000,
    routerId: 'test-server-65000',
  }

  beforeEach(() => {
    bgpServer = new BGPServer(serverConfig)
    policyEngine = new PolicyEngine(1000)
    bgpServer.configurePolicyEngine(policyEngine)
  })

  afterEach(async () => {
    await bgpServer.shutdown()
  })

  describe('Template Discovery Endpoints', () => {
    it('GET /bgp/policy-templates - should list all templates', async () => {
      const request: BGPEndpointRequest = {
        method: 'GET',
        path: '/bgp/policy-templates',
        headers: {},
      }

      const response = await bgpServer.handleRequest(request)

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('localASN', 65000)
      expect(response.body).toHaveProperty('totalTemplates')
      expect(response.body).toHaveProperty('templates')
      const responseBody = response.body as {
        templates: unknown[]
        totalTemplates: number
      }
      expect(Array.isArray(responseBody.templates)).toBe(true)
      expect(responseBody.totalTemplates).toBeGreaterThan(0)
    })

    it('GET /bgp/policy-templates/categories - should list categories', async () => {
      const request: BGPEndpointRequest = {
        method: 'GET',
        path: '/bgp/policy-templates/categories',
        headers: {},
      }

      const response = await bgpServer.handleRequest(request)

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('totalCategories')
      expect(response.body).toHaveProperty('categories')
      const responseBody = response.body as {
        categories: string[]
      }
      expect(Array.isArray(responseBody.categories)).toBe(true)
      expect(responseBody.categories).toContain('security')
      expect(responseBody.categories).toContain('performance')
    })

    it('GET /bgp/policy-templates/search - should search templates', async () => {
      const request: BGPEndpointRequest = {
        method: 'GET',
        path: '/bgp/policy-templates/search',
        headers: {},
        query: { query: 'security' },
      }

      const response = await bgpServer.handleRequest(request)

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('query', 'security')
      expect(response.body).toHaveProperty('templates')
      const responseBody = response.body as {
        templates: unknown[]
        totalTemplates: number
      }
      expect(Array.isArray(responseBody.templates)).toBe(true)
      expect(responseBody.totalTemplates).toBeGreaterThan(0)
    })

    it('GET /bgp/policy-templates/:templateId - should get specific template', async () => {
      const request: BGPEndpointRequest = {
        method: 'GET',
        path: '/bgp/policy-templates/security-basic',
        headers: {},
      }

      const response = await bgpServer.handleRequest(request)

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('templateId', 'security-basic')
      expect(response.body).toHaveProperty('template')
      const responseBody = response.body as {
        template: { name: string; policies: unknown[] }
      }
      expect(responseBody.template).toHaveProperty('name')
      expect(responseBody.template).toHaveProperty('policies')
    })

    it('GET /bgp/policy-templates/:templateId - should handle not found', async () => {
      const request: BGPEndpointRequest = {
        method: 'GET',
        path: '/bgp/policy-templates/non-existent',
        headers: {},
      }

      const response = await bgpServer.handleRequest(request)

      expect(response.status).toBe(404)
      expect(response.body).toHaveProperty('error')
    })

    it('GET /bgp/policy-templates/stats - should get template statistics', async () => {
      const request: BGPEndpointRequest = {
        method: 'GET',
        path: '/bgp/policy-templates/stats',
        headers: {},
      }

      const response = await bgpServer.handleRequest(request)

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('templateStats')
      const responseBody = response.body as {
        templateStats: {
          totalTemplates: number
          categoryCounts: Record<string, number>
          totalPolicies: number
        }
      }
      expect(responseBody.templateStats).toHaveProperty('totalTemplates')
      expect(responseBody.templateStats).toHaveProperty('categoryCounts')
      expect(responseBody.templateStats).toHaveProperty('totalPolicies')
    })
  })

  describe('Template Application Endpoints', () => {
    it('POST /bgp/policy-templates/:templateId/apply - should apply template', async () => {
      const request: BGPEndpointRequest = {
        method: 'POST',
        path: '/bgp/policy-templates/security-basic/apply',
        headers: { 'Content-Type': 'application/json' },
        body: {
          enabledOnly: true,
          priorityOffset: 100,
        },
      }

      const response = await bgpServer.handleRequest(request)

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('templateId', 'security-basic')
      expect(response.body).toHaveProperty('appliedPolicies')
      expect(response.body).toHaveProperty('policies')
      const responseBody = response.body as {
        appliedPolicies: number
      }
      expect(responseBody.appliedPolicies).toBeGreaterThan(0)
    })

    it('POST /bgp/policy-templates/:templateId/apply - should test with routes', async () => {
      const testRoutes: AgentRoute[] = [
        {
          agentId: 'test-agent',
          capabilities: ['coding'],
          asPath: [65001],
          nextHop: 'http://localhost:4111',
          localPref: 100,
          med: 0,
          communities: ['health:healthy'],
          originTime: new Date(),
          pathAttributes: new Map(),
        },
      ]

      const request: BGPEndpointRequest = {
        method: 'POST',
        path: '/bgp/policy-templates/security-basic/apply',
        headers: { 'Content-Type': 'application/json' },
        body: {
          testRoutes,
        },
      }

      const response = await bgpServer.handleRequest(request)

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('testResults')
      const responseBody = response.body as {
        testResults: {
          totalRoutes: number
          acceptedRoutes: number
          rejectedRoutes: number
        }
      }
      expect(responseBody.testResults).toHaveProperty('totalRoutes', 1)
      expect(responseBody.testResults).toHaveProperty('acceptedRoutes')
      expect(responseBody.testResults).toHaveProperty('rejectedRoutes')
    })

    it('POST /bgp/policy-templates/:templateId/apply - should handle not found', async () => {
      const request: BGPEndpointRequest = {
        method: 'POST',
        path: '/bgp/policy-templates/non-existent/apply',
        headers: { 'Content-Type': 'application/json' },
        body: {},
      }

      const response = await bgpServer.handleRequest(request)

      expect(response.status).toBe(404)
      expect(response.body).toHaveProperty('error')
    })

    it('should handle policy engine not configured', async () => {
      // Create server without policy engine
      const serverWithoutPolicies = new BGPServer(serverConfig)

      const request: BGPEndpointRequest = {
        method: 'POST',
        path: '/bgp/policy-templates/security-basic/apply',
        headers: { 'Content-Type': 'application/json' },
        body: {},
      }

      const response = await serverWithoutPolicies.handleRequest(request)

      expect(response.status).toBe(503)
      expect(response.body).toHaveProperty(
        'error',
        'Policy engine not configured',
      )

      await serverWithoutPolicies.shutdown()
    })
  })
})
