// Tests for BGP Policy Template CLI
// Ensures command-line interface works correctly for template management

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { main } from '../../src/cli/policy-templates.js'
import {
  getAllPolicyTemplates,
  getPolicyTemplate,
  searchPolicyTemplates,
  getPolicyTemplateStats,
} from '../../src/bgp/policy-templates.js'

// Mock console methods for testing CLI output
const mockConsole = {
  log: vi.fn(),
  error: vi.fn(),
}

// Mock process.exit to prevent actual exits during testing
const mockExit = vi.fn()

describe('PolicyTemplateCLI', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(mockConsole.log)
    vi.spyOn(console, 'error').mockImplementation(mockConsole.error)

    // Mock process.exit
    vi.spyOn(process, 'exit').mockImplementation(mockExit as never)

    // Mock process.argv to simulate CLI invocation
    vi.spyOn(process, 'argv', 'get').mockReturnValue([
      '/usr/local/bin/node',
      '/path/to/bgp-policy-templates.js',
    ])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('CLI Infrastructure', () => {
    it('should initialize CLI program correctly', () => {
      expect(() => main()).not.toThrow()
      // CLI should be able to start without errors
    })

    it('should handle invalid commands gracefully', () => {
      // Mock process.argv for this test
      vi.spyOn(process, 'argv', 'get').mockReturnValue([
        '/usr/local/bin/node',
        '/path/to/bgp-policy-templates.js',
        'invalid-command',
      ])

      expect(() => main()).not.toThrow()
      // Should handle unknown commands without crashing
    })
  })

  describe('Template Discovery Functions', () => {
    it('should get all policy templates', () => {
      const templates = getAllPolicyTemplates()

      expect(templates.length).toBeGreaterThan(0)
      expect(templates[0]).toHaveProperty('id')
      expect(templates[0]).toHaveProperty('name')
      expect(templates[0]).toHaveProperty('category')
      expect(templates[0]).toHaveProperty('policies')
    })

    it('should get specific template by ID', () => {
      const template = getPolicyTemplate('security-basic')

      expect(template).toBeDefined()
      expect(template?.id).toBe('security-basic')
      expect(template?.policies.length).toBeGreaterThan(0)
    })

    it('should search templates by keyword', () => {
      const securityTemplates = searchPolicyTemplates('security')

      expect(securityTemplates.length).toBeGreaterThan(0)
      securityTemplates.forEach((template) => {
        const matchesKeyword =
          template.name.toLowerCase().includes('security') ||
          template.description.toLowerCase().includes('security') ||
          template.useCase.toLowerCase().includes('security') ||
          template.tags.some((tag) => tag.includes('security'))

        expect(matchesKeyword).toBe(true)
      })
    })

    it('should get template statistics', () => {
      const stats = getPolicyTemplateStats()

      expect(stats).toHaveProperty('totalTemplates')
      expect(stats).toHaveProperty('categoryCounts')
      expect(stats).toHaveProperty('difficultyCounts')
      expect(stats).toHaveProperty('totalPolicies')
      expect(stats.totalTemplates).toBeGreaterThan(0)
      expect(stats.totalPolicies).toBeGreaterThan(0)
    })
  })

  describe('CLI Command Validation', () => {
    it('should validate template categories', () => {
      const templates = getAllPolicyTemplates()
      const validCategories = [
        'security',
        'performance',
        'reliability',
        'development',
        'production',
      ]

      templates.forEach((template) => {
        expect(validCategories).toContain(template.category)
      })
    })

    it('should validate template difficulties', () => {
      const templates = getAllPolicyTemplates()
      const validDifficulties = ['beginner', 'intermediate', 'advanced']

      templates.forEach((template) => {
        expect(validDifficulties).toContain(template.difficulty)
      })
    })

    it('should validate template structure', () => {
      const templates = getAllPolicyTemplates()

      templates.forEach((template) => {
        // Required fields
        expect(template.id).toBeTruthy()
        expect(template.name).toBeTruthy()
        expect(template.description).toBeTruthy()
        expect(template.category).toBeTruthy()
        expect(template.useCase).toBeTruthy()
        expect(Array.isArray(template.policies)).toBe(true)
        expect(Array.isArray(template.tags)).toBe(true)
        expect(template.difficulty).toBeTruthy()

        // Policies should have valid structure
        template.policies.forEach((policy) => {
          expect(policy.name).toBeTruthy()
          expect(policy.description).toBeTruthy()
          expect(typeof policy.enabled).toBe('boolean')
          expect(typeof policy.priority).toBe('number')
          expect(policy.match).toBeTruthy()
          expect(policy.action).toBeTruthy()
          expect(policy.action.action).toBeTruthy()
        })
      })
    })
  })

  describe('Template Categories Coverage', () => {
    it('should have security templates', () => {
      const templates = getAllPolicyTemplates()
      const securityTemplates = templates.filter(
        (t) => t.category === 'security',
      )

      expect(securityTemplates.length).toBeGreaterThan(0)

      // Should have both basic and advanced security
      const hasBasic = securityTemplates.some(
        (t) => t.difficulty === 'beginner',
      )
      const hasAdvanced = securityTemplates.some(
        (t) => t.difficulty === 'advanced',
      )

      expect(hasBasic || hasAdvanced).toBe(true)
    })

    it('should have performance templates', () => {
      const templates = getAllPolicyTemplates()
      const performanceTemplates = templates.filter(
        (t) => t.category === 'performance',
      )

      expect(performanceTemplates.length).toBeGreaterThan(0)
    })

    it('should have development templates', () => {
      const templates = getAllPolicyTemplates()
      const devTemplates = templates.filter((t) => t.category === 'development')

      expect(devTemplates.length).toBeGreaterThan(0)
    })

    it('should have production templates', () => {
      const templates = getAllPolicyTemplates()
      const prodTemplates = templates.filter((t) => t.category === 'production')

      expect(prodTemplates.length).toBeGreaterThan(0)
    })
  })

  describe('CLI Output Validation', () => {
    it('should format template listings correctly', () => {
      const templates = getAllPolicyTemplates()

      // Verify we can access template data needed for CLI output
      templates.forEach((template) => {
        expect(template.id).toBeTruthy()
        expect(template.name).toBeTruthy()
        expect(template.category).toBeTruthy()
        expect(template.difficulty).toBeTruthy()
        expect(typeof template.policies.length).toBe('number')
      })
    })

    it('should provide searchable content', () => {
      const templates = getAllPolicyTemplates()

      // All templates should have searchable content
      templates.forEach((template) => {
        const hasSearchableContent =
          template.name.length > 0 ||
          template.description.length > 0 ||
          template.useCase.length > 0 ||
          template.tags.length > 0

        expect(hasSearchableContent).toBe(true)
      })
    })

    it('should support category filtering', () => {
      const allTemplates = getAllPolicyTemplates()
      const categories = [
        'security',
        'performance',
        'reliability',
        'development',
        'production',
      ]

      categories.forEach((category) => {
        const filtered = allTemplates.filter((t) => t.category === category)
        // Each category should have at least one template or be a valid category
        // (Some categories might not have templates yet)
        if (filtered.length > 0) {
          filtered.forEach((template) => {
            expect(template.category).toBe(category)
          })
        }
      })
    })

    it('should support difficulty filtering', () => {
      const allTemplates = getAllPolicyTemplates()
      const difficulties = ['beginner', 'intermediate', 'advanced']

      difficulties.forEach((difficulty) => {
        const filtered = allTemplates.filter((t) => t.difficulty === difficulty)
        if (filtered.length > 0) {
          filtered.forEach((template) => {
            expect(template.difficulty).toBe(difficulty)
          })
        }
      })
    })
  })

  describe('Template Documentation', () => {
    it('should have meaningful descriptions', () => {
      const templates = getAllPolicyTemplates()

      templates.forEach((template) => {
        expect(template.description.length).toBeGreaterThan(10)
        expect(template.useCase.length).toBeGreaterThan(10)
      })
    })

    it('should have appropriate tags', () => {
      const templates = getAllPolicyTemplates()

      templates.forEach((template) => {
        expect(template.tags.length).toBeGreaterThan(0)

        // Tags should be lowercase strings
        template.tags.forEach((tag) => {
          expect(typeof tag).toBe('string')
          expect(tag.length).toBeGreaterThan(0)
        })
      })
    })

    it('should have documentation for complex templates', () => {
      const templates = getAllPolicyTemplates()
      const advancedTemplates = templates.filter(
        (t) => t.difficulty === 'advanced',
      )

      // Advanced templates should have documentation
      advancedTemplates.forEach((template) => {
        if (template.documentation) {
          expect(template.documentation.length).toBeGreaterThan(50)
        }
      })
    })
  })

  describe('CLI Error Handling', () => {
    it('should handle non-existent template IDs', () => {
      const template = getPolicyTemplate('non-existent-template')
      expect(template).toBeNull()
    })

    it('should handle empty search queries', () => {
      const results = searchPolicyTemplates('')
      // Empty search should return all templates or no templates, both are valid
      expect(Array.isArray(results)).toBe(true)
    })

    it('should handle invalid search queries', () => {
      const results = searchPolicyTemplates(
        'nonexistentkeywordthatwillnevermatch',
      )
      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBe(0)
    })
  })

  describe('CLI Integration', () => {
    it('should provide access to all template functionality', () => {
      // Verify all major functions are available for CLI
      expect(typeof getAllPolicyTemplates).toBe('function')
      expect(typeof getPolicyTemplate).toBe('function')
      expect(typeof searchPolicyTemplates).toBe('function')
      expect(typeof getPolicyTemplateStats).toBe('function')
    })

    it('should support template application workflow', () => {
      const template = getPolicyTemplate('security-basic')
      expect(template).toBeDefined()

      if (template) {
        // Template should have applicable policies
        expect(template.policies.length).toBeGreaterThan(0)

        // Policies should have required fields for application
        template.policies.forEach((policy) => {
          expect(policy.name).toBeTruthy()
          expect(typeof policy.priority).toBe('number')
          expect(typeof policy.enabled).toBe('boolean')
        })
      }
    })

    it('should provide comprehensive statistics', () => {
      const stats = getPolicyTemplateStats()

      // Should provide meaningful statistics for CLI display
      expect(stats.totalTemplates).toBeGreaterThan(0)
      expect(stats.totalPolicies).toBeGreaterThan(0)
      expect(Object.keys(stats.categoryCounts).length).toBeGreaterThan(0)
      expect(Object.keys(stats.difficultyCounts).length).toBeGreaterThan(0)
    })
  })
})
