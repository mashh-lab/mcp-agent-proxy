// BGP Policy Templates for Common Agent Routing Scenarios
// Provides ready-made policies for typical use cases

import { PolicyConfig } from './policy.js'

export interface PolicyTemplate {
  id: string
  name: string
  description: string
  category: PolicyTemplateCategory
  useCase: string
  policies: PolicyConfig[]
  tags: string[]
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  documentation?: string
}

export type PolicyTemplateCategory =
  | 'security'
  | 'performance'
  | 'reliability'
  | 'load-balancing'
  | 'development'
  | 'production'
  | 'monitoring'
  | 'compliance'

export interface PolicyTemplateCollection {
  [templateId: string]: PolicyTemplate
}

/**
 * Security-focused policy templates
 */
const SECURITY_TEMPLATES: PolicyTemplate[] = [
  {
    id: 'security-basic',
    name: 'Basic Security Policies',
    description:
      'Essential security policies to protect against unhealthy agents and limit route propagation',
    category: 'security',
    useCase: 'Prevent routing to compromised or unhealthy agents',
    difficulty: 'beginner',
    tags: ['security', 'health', 'basic'],
    policies: [
      {
        name: 'block-unhealthy-agents',
        description: 'Block all traffic to unhealthy agents',
        enabled: true,
        priority: 1000, // Highest priority
        match: {
          healthStatus: 'unhealthy',
        },
        action: {
          action: 'reject',
          logDecision: true,
          alertOnMatch: true,
          metricsTag: 'security-block',
        },
      },
      {
        name: 'limit-hop-count',
        description: 'Prevent routing loops by limiting AS path length',
        enabled: true,
        priority: 900,
        match: {
          maxASPathLength: 8, // More restrictive than default
        },
        action: {
          action: 'reject',
          logDecision: true,
          metricsTag: 'security-hops',
        },
      },
      {
        name: 'quarantine-degraded',
        description: 'Lower preference for degraded agents',
        enabled: true,
        priority: 800,
        match: {
          healthStatus: 'degraded',
        },
        action: {
          action: 'modify',
          setLocalPref: 25, // Very low preference
          addCommunity: ['quarantine:degraded'],
          logDecision: true,
        },
      },
    ],
    documentation: `
# Basic Security Policies

This template provides essential security protections for your agent network:

1. **Block Unhealthy Agents**: Completely blocks routing to agents marked as unhealthy
2. **Limit Hop Count**: Prevents routing loops by rejecting routes with too many AS hops
3. **Quarantine Degraded**: Lowers preference for degraded agents while still allowing access

## When to Use
- New deployments that need basic protection
- Development environments
- Networks with mixed agent reliability

## Customization
- Adjust hop count limit based on your network topology
- Modify local preference values based on your routing needs
    `,
  },
  {
    id: 'security-advanced',
    name: 'Advanced Security Policies',
    description:
      'Comprehensive security policies with time-based restrictions and capability filtering',
    category: 'security',
    useCase: 'Enterprise security with time-based access control',
    difficulty: 'advanced',
    tags: ['security', 'enterprise', 'time-based', 'capability'],
    policies: [
      {
        name: 'business-hours-only',
        description: 'Restrict sensitive capabilities to business hours',
        enabled: true,
        priority: 950,
        match: {
          capabilities: ['admin', 'database', 'financial'],
          timeOfDay: { start: '18:00', end: '08:00' }, // Outside business hours
        },
        action: {
          action: 'reject',
          logDecision: true,
          alertOnMatch: true,
          metricsTag: 'security-hours',
        },
      },
      {
        name: 'weekend-restrictions',
        description: 'Block high-risk operations on weekends',
        enabled: true,
        priority: 940,
        match: {
          capabilities: ['deployment', 'production'],
          dayOfWeek: ['saturday', 'sunday'],
        },
        action: {
          action: 'reject',
          logDecision: true,
          alertOnMatch: true,
          metricsTag: 'security-weekend',
        },
      },
      {
        name: 'trusted-asn-only',
        description: 'Only allow agents from trusted AS numbers',
        enabled: true,
        priority: 920,
        match: {
          asnRange: { min: 65100, max: 65199 }, // Trusted range
        },
        action: {
          action: 'modify',
          setLocalPref: 200, // High preference for trusted
          addCommunity: ['trusted:asn'],
        },
      },
      {
        name: 'untrusted-asn-block',
        description: 'Block known untrusted AS numbers',
        enabled: true,
        priority: 980,
        match: {
          asn: [64512, 64513, 64514], // Blocked ASNs
        },
        action: {
          action: 'reject',
          logDecision: true,
          alertOnMatch: true,
          metricsTag: 'security-untrusted',
        },
      },
    ],
    documentation: `
# Advanced Security Policies

Enterprise-grade security policies with time-based restrictions and capability filtering.

## Features
- **Business Hours Enforcement**: Blocks sensitive operations outside work hours
- **Weekend Restrictions**: Prevents high-risk operations on weekends
- **Trusted ASN Management**: Preferential treatment for trusted networks
- **Untrusted ASN Blocking**: Complete blocking of known bad actors

## Configuration Required
1. Update trusted ASN range to match your infrastructure
2. Adjust business hours for your timezone
3. Customize blocked ASN list based on threat intelligence
    `,
  },
]

/**
 * Performance-focused policy templates
 */
const PERFORMANCE_TEMPLATES: PolicyTemplate[] = [
  {
    id: 'performance-optimization',
    name: 'Performance Optimization Policies',
    description:
      'Optimize agent routing for best performance and response times',
    category: 'performance',
    useCase: 'Maximize throughput and minimize latency',
    difficulty: 'intermediate',
    tags: ['performance', 'latency', 'optimization'],
    policies: [
      {
        name: 'prefer-local-agents',
        description: 'Strongly prefer agents in local AS',
        enabled: true,
        priority: 700,
        match: {
          maxASPathLength: 1, // Direct connection only
        },
        action: {
          action: 'modify',
          setLocalPref: 300, // Very high preference
          addCommunity: ['performance:local'],
          metricsTag: 'perf-local',
        },
      },
      {
        name: 'penalize-distant-agents',
        description: 'Lower preference for distant agents',
        enabled: true,
        priority: 650,
        match: {
          minLocalPref: 1, // Any agent
        },
        action: {
          action: 'modify',
          addMED: 10, // Add 10 per hop
          metricsTag: 'perf-distance',
        },
      },
      {
        name: 'fast-response-preference',
        description: 'Prefer agents with low MED (fast response)',
        enabled: true,
        priority: 600,
        match: {
          maxMED: 20, // Fast agents only
        },
        action: {
          action: 'modify',
          setLocalPref: 180,
          addCommunity: ['performance:fast'],
        },
      },
      {
        name: 'load-balance-coding',
        description: 'Load balance coding requests across multiple agents',
        enabled: true,
        priority: 550,
        match: {
          capabilities: ['coding', 'development'],
        },
        action: {
          action: 'modify',
          loadBalance: {
            method: 'round_robin',
          },
          maxAlternatives: 3,
          metricsTag: 'perf-coding-lb',
        },
      },
    ],
    documentation: `
# Performance Optimization Policies

Maximize agent routing performance and minimize response times.

## Optimization Strategies
1. **Local Preference**: Strongly favor local agents to reduce latency
2. **Distance Penalty**: Increase MED for each AS hop to discourage long paths
3. **Fast Response Priority**: Prefer agents with historically low response times
4. **Load Balancing**: Distribute load across multiple capable agents

## Tuning Parameters
- Adjust local preference values based on your latency requirements
- Modify MED penalties based on your network topology
- Customize load balancing methods for different capability types
    `,
  },
]

/**
 * Reliability-focused policy templates
 */
const RELIABILITY_TEMPLATES: PolicyTemplate[] = [
  {
    id: 'high-availability',
    name: 'High Availability Policies',
    description: 'Ensure maximum uptime with failover and redundancy policies',
    category: 'reliability',
    useCase: 'Mission-critical applications requiring 99.99% uptime',
    difficulty: 'advanced',
    tags: ['reliability', 'failover', 'redundancy', 'sla'],
    policies: [
      {
        name: 'primary-secondary-failover',
        description: 'Establish primary and secondary agent preferences',
        enabled: true,
        priority: 800,
        match: {
          healthStatus: 'healthy',
          minLocalPref: 150, // Primary tier
        },
        action: {
          action: 'modify',
          setLocalPref: 250,
          addCommunity: ['reliability:primary'],
          maxAlternatives: 2, // Keep backup routes
          metricsTag: 'reliability-primary',
        },
      },
      {
        name: 'multi-path-redundancy',
        description: 'Maintain multiple paths for critical capabilities',
        enabled: true,
        priority: 750,
        match: {
          capabilities: ['critical', 'production'],
        },
        action: {
          action: 'modify',
          maxAlternatives: 5, // Keep many alternatives
          loadBalance: {
            method: 'health_based',
          },
          addCommunity: ['reliability:redundant'],
        },
      },
      {
        name: 'graceful-degradation',
        description: 'Allow degraded agents for critical capabilities',
        enabled: true,
        priority: 700,
        match: {
          capabilities: ['critical'],
          healthStatus: 'degraded',
        },
        action: {
          action: 'modify',
          setLocalPref: 75, // Lower but acceptable
          addCommunity: ['reliability:degraded-allowed'],
          rateLimit: {
            requestsPerSecond: 10, // Limit load on degraded agents
            perASN: true,
          },
        },
      },
    ],
    documentation: `
# High Availability Policies

Designed for mission-critical applications requiring maximum uptime.

## Availability Features
- **Primary/Secondary Failover**: Automatic failover to backup agents
- **Multi-Path Redundancy**: Multiple routes for critical capabilities
- **Graceful Degradation**: Controlled use of degraded agents when necessary

## SLA Targets
- 99.99% uptime for critical capabilities
- Sub-second failover times
- Automatic load balancing and rate limiting
    `,
  },
]

/**
 * Development-focused policy templates
 */
const DEVELOPMENT_TEMPLATES: PolicyTemplate[] = [
  {
    id: 'development-friendly',
    name: 'Development Environment Policies',
    description: 'Relaxed policies optimized for development and testing',
    category: 'development',
    useCase: 'Development and testing environments with flexible routing',
    difficulty: 'beginner',
    tags: ['development', 'testing', 'flexible', 'debugging'],
    policies: [
      {
        name: 'allow-all-health-states',
        description: 'Allow routing to all agents regardless of health',
        enabled: true,
        priority: 400,
        match: {
          healthStatus: ['healthy', 'degraded', 'unhealthy'],
        },
        action: {
          action: 'accept',
          logDecision: true, // Log for debugging
          metricsTag: 'dev-allow-all',
        },
      },
      {
        name: 'debug-logging',
        description: 'Enable detailed logging for all routing decisions',
        enabled: true,
        priority: 300,
        match: {
          minLocalPref: 1, // All agents
        },
        action: {
          action: 'modify',
          logDecision: true,
          metricsTag: 'dev-debug',
        },
      },
      {
        name: 'prefer-development-agents',
        description: 'Prefer agents tagged for development',
        enabled: true,
        priority: 500,
        match: {
          capabilities: ['development', 'testing', 'staging'],
        },
        action: {
          action: 'modify',
          setLocalPref: 200,
          addCommunity: ['env:development'],
        },
      },
    ],
    documentation: `
# Development Environment Policies

Optimized for development and testing environments.

## Development Features
- **Flexible Health Checks**: Allows routing to all agents for testing
- **Debug Logging**: Comprehensive logging for troubleshooting
- **Development Preference**: Prioritizes development-tagged agents

## Use Cases
- Local development environments
- CI/CD pipelines
- Integration testing
- Agent debugging and monitoring
    `,
  },
]

/**
 * Production-focused policy templates
 */
const PRODUCTION_TEMPLATES: PolicyTemplate[] = [
  {
    id: 'production-hardened',
    name: 'Production Hardened Policies',
    description: 'Strict policies for production environments',
    category: 'production',
    useCase: 'Production environments with strict reliability and security',
    difficulty: 'advanced',
    tags: ['production', 'strict', 'security', 'reliability'],
    policies: [
      {
        name: 'strict-health-enforcement',
        description: 'Only route to healthy agents in production',
        enabled: true,
        priority: 1000,
        match: {
          healthStatus: ['degraded', 'unhealthy'],
        },
        action: {
          action: 'reject',
          logDecision: true,
          alertOnMatch: true,
          metricsTag: 'prod-health-strict',
        },
      },
      {
        name: 'production-agents-only',
        description: 'Only route to production-tagged agents',
        enabled: true,
        priority: 950,
        match: {
          capabilities: ['production'],
        },
        action: {
          action: 'modify',
          setLocalPref: 300,
          addCommunity: ['env:production'],
        },
      },
      {
        name: 'reject-development-agents',
        description: 'Block development agents from production traffic',
        enabled: true,
        priority: 980,
        match: {
          capabilities: ['development', 'testing', 'staging'],
        },
        action: {
          action: 'reject',
          logDecision: true,
          alertOnMatch: true,
          metricsTag: 'prod-block-dev',
        },
      },
      {
        name: 'rate-limit-all',
        description: 'Apply rate limiting to all production agents',
        enabled: true,
        priority: 900,
        match: {
          minLocalPref: 1, // All agents
        },
        action: {
          action: 'modify',
          rateLimit: {
            requestsPerSecond: 100,
            burstSize: 200,
            perASN: true,
          },
          metricsTag: 'prod-rate-limit',
        },
      },
    ],
    documentation: `
# Production Hardened Policies

Strict policies designed for production environments.

## Production Standards
- **Strict Health Enforcement**: Only healthy agents allowed
- **Production Agent Isolation**: Only production-tagged agents
- **Development Agent Blocking**: Complete isolation from dev/test
- **Rate Limiting**: Protect against overload

## Security Features
- Comprehensive logging and alerting
- Automatic blocking of non-production traffic
- Rate limiting protection
    `,
  },
]

/**
 * Compile all policy templates into a single collection
 */
export const POLICY_TEMPLATES: PolicyTemplateCollection = {}

// Add all template categories
const ALL_TEMPLATES = [
  ...SECURITY_TEMPLATES,
  ...PERFORMANCE_TEMPLATES,
  ...RELIABILITY_TEMPLATES,
  ...DEVELOPMENT_TEMPLATES,
  ...PRODUCTION_TEMPLATES,
]

// Index templates by ID
for (const template of ALL_TEMPLATES) {
  POLICY_TEMPLATES[template.id] = template
}

/**
 * Get all policy templates
 */
export function getAllPolicyTemplates(): PolicyTemplate[] {
  return ALL_TEMPLATES
}

/**
 * Get policy templates by category
 */
export function getPolicyTemplatesByCategory(
  category: PolicyTemplateCategory,
): PolicyTemplate[] {
  return ALL_TEMPLATES.filter((template) => template.category === category)
}

/**
 * Get policy templates by difficulty
 */
export function getPolicyTemplatesByDifficulty(
  difficulty: 'beginner' | 'intermediate' | 'advanced',
): PolicyTemplate[] {
  return ALL_TEMPLATES.filter((template) => template.difficulty === difficulty)
}

/**
 * Get policy templates by tag
 */
export function getPolicyTemplatesByTag(tag: string): PolicyTemplate[] {
  return ALL_TEMPLATES.filter((template) => template.tags.includes(tag))
}

/**
 * Get a specific policy template by ID
 */
export function getPolicyTemplate(templateId: string): PolicyTemplate | null {
  return POLICY_TEMPLATES[templateId] || null
}

/**
 * Search policy templates by keyword
 */
export function searchPolicyTemplates(keyword: string): PolicyTemplate[] {
  const lowerKeyword = keyword.toLowerCase()
  return ALL_TEMPLATES.filter(
    (template) =>
      template.name.toLowerCase().includes(lowerKeyword) ||
      template.description.toLowerCase().includes(lowerKeyword) ||
      template.useCase.toLowerCase().includes(lowerKeyword) ||
      template.tags.some((tag) => tag.includes(lowerKeyword)),
  )
}

/**
 * Get policy template categories
 */
export function getPolicyTemplateCategories(): PolicyTemplateCategory[] {
  return [
    'security',
    'performance',
    'reliability',
    'load-balancing',
    'development',
    'production',
    'monitoring',
    'compliance',
  ]
}

/**
 * Apply a policy template to a policy engine
 */
export function applyPolicyTemplate(
  templateId: string,
  customization?: {
    enabledOnly?: boolean
    priorityOffset?: number
    namePrefix?: string
  },
): PolicyConfig[] {
  const template = getPolicyTemplate(templateId)
  if (!template) {
    throw new Error(`Policy template '${templateId}' not found`)
  }

  const {
    enabledOnly = false,
    priorityOffset = 0,
    namePrefix = '',
  } = customization || {}

  let policies = [...template.policies]

  // Filter enabled policies if requested
  if (enabledOnly) {
    policies = policies.filter((policy) => policy.enabled)
  }

  // Apply customizations
  return policies.map((policy) => ({
    ...policy,
    name: namePrefix ? `${namePrefix}${policy.name}` : policy.name,
    priority: policy.priority + priorityOffset,
  }))
}

/**
 * Get template statistics
 */
export function getPolicyTemplateStats() {
  const stats = {
    totalTemplates: ALL_TEMPLATES.length,
    categoryCounts: {} as Record<string, number>,
    difficultyCounts: {} as Record<string, number>,
    totalPolicies: 0,
  }

  for (const template of ALL_TEMPLATES) {
    stats.categoryCounts[template.category] =
      (stats.categoryCounts[template.category] || 0) + 1
    stats.difficultyCounts[template.difficulty] =
      (stats.difficultyCounts[template.difficulty] || 0) + 1
    stats.totalPolicies += template.policies.length
  }

  return stats
}
