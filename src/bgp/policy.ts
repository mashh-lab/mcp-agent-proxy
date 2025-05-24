// BGP Policy Engine for Intelligent Agent Routing
// Enables sophisticated routing decisions based on configurable policies

import { AgentRoute } from './types.js'
import { logger } from '../config.js'

export interface PolicyConfig {
  name: string
  description?: string
  enabled: boolean
  priority: number // Higher priority = applied first
  match: PolicyMatch
  action: PolicyAction
}

export interface PolicyMatch {
  // Agent matching criteria
  agentId?: string | string[] // Specific agent IDs
  capabilities?: string[] // Required capabilities (AND logic)
  capabilitiesAny?: string[] // Any of these capabilities (OR logic)

  // Network matching criteria
  asn?: number | number[] // Specific AS numbers
  asnRange?: { min: number; max: number } // AS number range
  region?: string | string[] // Geographic regions

  // Health and performance matching
  healthStatus?:
    | 'healthy'
    | 'degraded'
    | 'unhealthy'
    | ('healthy' | 'degraded' | 'unhealthy')[]
  minLocalPref?: number // Minimum local preference
  maxMED?: number // Maximum MED value
  maxASPathLength?: number // Maximum AS path hops

  // Time-based matching
  timeOfDay?: { start: string; end: string } // HH:MM format
  dayOfWeek?: (
    | 'monday'
    | 'tuesday'
    | 'wednesday'
    | 'thursday'
    | 'friday'
    | 'saturday'
    | 'sunday'
  )[]

  // Custom metadata matching
  metadata?: Record<string, unknown>
}

export interface PolicyAction {
  // Basic actions
  action: 'accept' | 'reject' | 'modify'

  // Route modification actions (when action = 'modify')
  setLocalPref?: number // Override local preference
  addMED?: number // Add to MED value
  setMED?: number // Override MED value
  addCommunity?: string[] // Add BGP communities
  removeCommunity?: string[] // Remove BGP communities

  // Advanced routing actions
  preferASN?: number[] // Prefer these AS numbers (ordered by preference)
  avoidASN?: number[] // Avoid these AS numbers
  maxAlternatives?: number // Limit number of alternative routes

  // Load balancing and failover
  loadBalance?: {
    method: 'round_robin' | 'weighted' | 'least_connections' | 'health_based'
    weights?: Record<string, number> // ASN -> weight mapping
  }

  // Rate limiting and throttling
  rateLimit?: {
    requestsPerSecond: number
    burstSize?: number
    perASN?: boolean // Apply per ASN vs globally
  }

  // Logging and monitoring
  logDecision?: boolean
  alertOnMatch?: boolean
  metricsTag?: string
}

export interface PolicyDecision {
  policy: PolicyConfig
  action: 'accept' | 'reject' | 'modify'
  route: AgentRoute
  modifiedRoute?: AgentRoute
  reason: string
  timestamp: Date
}

export interface PolicyStats {
  totalPolicies: number
  enabledPolicies: number
  totalDecisions: number
  acceptDecisions: number
  rejectDecisions: number
  modifyDecisions: number
  decisionsByPolicy: Map<string, number>
  averageDecisionTime: number
  lastDecisionTime?: Date
}

/**
 * BGP Policy Engine for Intelligent Agent Routing
 * Applies sophisticated routing policies to agent route selection
 */
export class PolicyEngine {
  private policies: PolicyConfig[] = []
  private stats: PolicyStats
  private decisionHistory: PolicyDecision[] = []
  private maxHistorySize: number

  constructor(maxHistorySize: number = 1000) {
    this.maxHistorySize = maxHistorySize
    this.stats = {
      totalPolicies: 0,
      enabledPolicies: 0,
      totalDecisions: 0,
      acceptDecisions: 0,
      rejectDecisions: 0,
      modifyDecisions: 0,
      decisionsByPolicy: new Map(),
      averageDecisionTime: 0,
    }

    logger.log('BGP: Policy engine initialized')
  }

  /**
   * Load policies from configuration
   */
  loadPolicies(policies: PolicyConfig[]): void {
    // Validate and sort policies by priority
    const validPolicies = policies
      .filter((policy) => this.validatePolicy(policy))
      .sort((a, b) => b.priority - a.priority) // Higher priority first

    this.policies = validPolicies
    this.updateStats()

    logger.log(`BGP: Loaded ${validPolicies.length} routing policies`)
    for (const policy of validPolicies) {
      logger.log(
        `BGP: Policy "${policy.name}" (priority: ${policy.priority}, enabled: ${policy.enabled})`,
      )
    }
  }

  /**
   * Apply policies to route selection
   * Returns filtered and modified routes based on policy decisions
   */
  applyPolicies(routes: AgentRoute[]): AgentRoute[] {
    const startTime = Date.now()
    const acceptedRoutes: AgentRoute[] = []
    const decisions: PolicyDecision[] = []

    for (const route of routes) {
      const decision = this.evaluateRoute(route)
      decisions.push(decision)

      if (decision.action === 'accept') {
        acceptedRoutes.push(decision.modifiedRoute || route)
      } else if (decision.action === 'modify' && decision.modifiedRoute) {
        acceptedRoutes.push(decision.modifiedRoute)
      }
      // 'reject' routes are not included
    }

    // Update statistics
    const decisionTime = Date.now() - startTime
    this.updateDecisionStats(decisions, decisionTime)

    // Store decision history
    this.storeDecisionHistory(decisions)

    logger.log(
      `BGP: Applied policies to ${routes.length} routes, accepted ${acceptedRoutes.length} (${decisionTime}ms)`,
    )

    return acceptedRoutes
  }

  /**
   * Evaluate a single route against all policies
   */
  private evaluateRoute(route: AgentRoute): PolicyDecision {
    // Apply enabled policies in priority order
    for (const policy of this.policies) {
      if (!policy.enabled) continue

      if (this.routeMatchesPolicy(route, policy)) {
        const decision: PolicyDecision = {
          policy,
          action: policy.action.action,
          route,
          reason: `Matched policy "${policy.name}"`,
          timestamp: new Date(),
        }

        // Apply modifications if needed
        if (policy.action.action === 'modify') {
          decision.modifiedRoute = this.applyRouteModifications(
            route,
            policy.action,
          )
          decision.action = 'accept' // Modified routes are accepted
        }

        if (policy.action.logDecision) {
          logger.log(
            `BGP: Policy decision - ${decision.action} route ${route.agentId} via policy "${policy.name}"`,
          )
        }

        return decision
      }
    }

    // Default: accept if no policies match
    return {
      policy: {
        name: 'default',
        description: 'Default accept',
        enabled: true,
        priority: 0,
        match: {},
        action: { action: 'accept' },
      },
      action: 'accept',
      route,
      reason: 'No matching policies, default accept',
      timestamp: new Date(),
    }
  }

  /**
   * Check if a route matches a policy
   */
  private routeMatchesPolicy(route: AgentRoute, policy: PolicyConfig): boolean {
    const match = policy.match

    // Agent ID matching
    if (match.agentId) {
      const agentIds = Array.isArray(match.agentId)
        ? match.agentId
        : [match.agentId]
      if (!agentIds.includes(route.agentId)) return false
    }

    // Capability matching (AND logic)
    if (match.capabilities && match.capabilities.length > 0) {
      const hasAllCapabilities = match.capabilities.every((cap) =>
        route.capabilities.some((routeCap) =>
          routeCap.toLowerCase().includes(cap.toLowerCase()),
        ),
      )
      if (!hasAllCapabilities) return false
    }

    // Capability matching (OR logic)
    if (match.capabilitiesAny && match.capabilitiesAny.length > 0) {
      const hasAnyCapability = match.capabilitiesAny.some((cap) =>
        route.capabilities.some((routeCap) =>
          routeCap.toLowerCase().includes(cap.toLowerCase()),
        ),
      )
      if (!hasAnyCapability) return false
    }

    // ASN matching
    if (match.asn) {
      const targetASNs = Array.isArray(match.asn) ? match.asn : [match.asn]
      const routeASNs = route.asPath
      const hasMatchingASN = targetASNs.some((asn) => routeASNs.includes(asn))
      if (!hasMatchingASN) return false
    }

    // ASN range matching
    if (match.asnRange) {
      const hasASNInRange = route.asPath.some(
        (asn) => asn >= match.asnRange!.min && asn <= match.asnRange!.max,
      )
      if (!hasASNInRange) return false
    }

    // Health status matching
    if (match.healthStatus) {
      const routeHealth = this.extractHealthFromCommunities(route.communities)
      const targetHealth = Array.isArray(match.healthStatus)
        ? match.healthStatus
        : [match.healthStatus]
      if (!targetHealth.includes(routeHealth)) return false
    }

    // Performance criteria
    if (match.minLocalPref && route.localPref < match.minLocalPref) return false
    if (match.maxMED && route.med > match.maxMED) return false
    if (match.maxASPathLength && route.asPath.length > match.maxASPathLength)
      return false

    // Time-based matching
    if (!this.matchesTimeConstraints(match)) return false

    // All criteria matched
    return true
  }

  /**
   * Apply route modifications based on policy action
   */
  private applyRouteModifications(
    route: AgentRoute,
    action: PolicyAction,
  ): AgentRoute {
    const modifiedRoute: AgentRoute = { ...route }

    // Modify routing preferences
    if (action.setLocalPref !== undefined) {
      modifiedRoute.localPref = action.setLocalPref
    }

    if (action.setMED !== undefined) {
      modifiedRoute.med = action.setMED
    } else if (action.addMED !== undefined) {
      modifiedRoute.med += action.addMED
    }

    // Modify communities
    if (action.addCommunity) {
      modifiedRoute.communities = [
        ...modifiedRoute.communities,
        ...action.addCommunity,
      ]
    }

    if (action.removeCommunity) {
      modifiedRoute.communities = modifiedRoute.communities.filter(
        (comm) => !action.removeCommunity!.includes(comm),
      )
    }

    return modifiedRoute
  }

  /**
   * Check time-based constraints
   */
  private matchesTimeConstraints(match: PolicyMatch): boolean {
    const now = new Date()

    // Time of day matching
    if (match.timeOfDay) {
      const currentTime = now.getHours() * 60 + now.getMinutes()
      const [startHour, startMin] = match.timeOfDay.start.split(':').map(Number)
      const [endHour, endMin] = match.timeOfDay.end.split(':').map(Number)
      const startTime = startHour * 60 + startMin
      const endTime = endHour * 60 + endMin

      if (startTime <= endTime) {
        // Same day range
        if (currentTime < startTime || currentTime > endTime) return false
      } else {
        // Overnight range
        if (currentTime < startTime && currentTime > endTime) return false
      }
    }

    // Day of week matching
    if (match.dayOfWeek) {
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
      if (!match.dayOfWeek.includes(currentDay)) return false
    }

    return true
  }

  /**
   * Extract health status from BGP communities
   */
  private extractHealthFromCommunities(
    communities: string[],
  ): 'healthy' | 'degraded' | 'unhealthy' {
    for (const community of communities) {
      if (community.startsWith('health:')) {
        const health = community.split(':')[1] as
          | 'healthy'
          | 'degraded'
          | 'unhealthy'
        return health
      }
    }
    return 'healthy' // Default assumption
  }

  /**
   * Validate policy configuration
   */
  private validatePolicy(policy: PolicyConfig): boolean {
    if (!policy.name || typeof policy.name !== 'string') {
      logger.log(`BGP: Invalid policy - missing or invalid name`)
      return false
    }

    if (typeof policy.priority !== 'number') {
      logger.log(
        `BGP: Invalid policy "${policy.name}" - priority must be a number`,
      )
      return false
    }

    if (!policy.action || !policy.action.action) {
      logger.log(`BGP: Invalid policy "${policy.name}" - missing action`)
      return false
    }

    if (!['accept', 'reject', 'modify'].includes(policy.action.action)) {
      logger.log(`BGP: Invalid policy "${policy.name}" - invalid action type`)
      return false
    }

    return true
  }

  /**
   * Update decision statistics
   */
  private updateDecisionStats(
    decisions: PolicyDecision[],
    decisionTime: number,
  ): void {
    this.stats.totalDecisions += decisions.length

    for (const decision of decisions) {
      switch (decision.action) {
        case 'accept':
          this.stats.acceptDecisions++
          break
        case 'reject':
          this.stats.rejectDecisions++
          break
        case 'modify':
          this.stats.modifyDecisions++
          break
      }

      // Update per-policy stats
      const policyName = decision.policy.name
      this.stats.decisionsByPolicy.set(
        policyName,
        (this.stats.decisionsByPolicy.get(policyName) || 0) + 1,
      )
    }

    // Update average decision time
    const totalTime =
      this.stats.averageDecisionTime *
        (this.stats.totalDecisions - decisions.length) +
      decisionTime
    this.stats.averageDecisionTime = totalTime / this.stats.totalDecisions

    this.stats.lastDecisionTime = new Date()
  }

  /**
   * Store decision history with size limit
   */
  private storeDecisionHistory(decisions: PolicyDecision[]): void {
    this.decisionHistory.push(...decisions)

    // Trim history if too large
    if (this.decisionHistory.length > this.maxHistorySize) {
      this.decisionHistory = this.decisionHistory.slice(-this.maxHistorySize)
    }
  }

  /**
   * Update general statistics
   */
  private updateStats(): void {
    this.stats.totalPolicies = this.policies.length
    this.stats.enabledPolicies = this.policies.filter((p) => p.enabled).length
  }

  /**
   * Get policy statistics
   */
  getStats(): PolicyStats {
    return {
      ...this.stats,
      decisionsByPolicy: new Map(this.stats.decisionsByPolicy),
    }
  }

  /**
   * Get decision history
   */
  getDecisionHistory(limit?: number): PolicyDecision[] {
    if (limit) {
      return this.decisionHistory.slice(-limit)
    }
    return [...this.decisionHistory]
  }

  /**
   * Get all loaded policies
   */
  getPolicies(): PolicyConfig[] {
    return [...this.policies]
  }

  /**
   * Add or update a policy
   */
  addPolicy(policy: PolicyConfig): boolean {
    if (!this.validatePolicy(policy)) {
      return false
    }

    // Remove existing policy with same name
    this.policies = this.policies.filter((p) => p.name !== policy.name)

    // Add new policy and re-sort
    this.policies.push(policy)
    this.policies.sort((a, b) => b.priority - a.priority)

    this.updateStats()
    logger.log(`BGP: Added/updated policy "${policy.name}"`)
    return true
  }

  /**
   * Remove a policy
   */
  removePolicy(name: string): boolean {
    const initialLength = this.policies.length
    this.policies = this.policies.filter((p) => p.name !== name)

    if (this.policies.length < initialLength) {
      this.updateStats()
      logger.log(`BGP: Removed policy "${name}"`)
      return true
    }

    return false
  }

  /**
   * Enable or disable a policy
   */
  togglePolicy(name: string, enabled: boolean): boolean {
    const policy = this.policies.find((p) => p.name === name)
    if (policy) {
      policy.enabled = enabled
      this.updateStats()
      logger.log(`BGP: ${enabled ? 'Enabled' : 'Disabled'} policy "${name}"`)
      return true
    }
    return false
  }

  /**
   * Clear all policies
   */
  clearPolicies(): void {
    this.policies = []
    this.updateStats()
    logger.log('BGP: Cleared all policies')
  }

  /**
   * Export policies to JSON
   */
  exportPolicies(): string {
    return JSON.stringify(this.policies, null, 2)
  }

  /**
   * Import policies from JSON
   */
  importPolicies(json: string): boolean {
    try {
      const policies = JSON.parse(json) as PolicyConfig[]
      this.loadPolicies(policies)
      return true
    } catch (error) {
      logger.log(
        `BGP: Failed to import policies: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
      return false
    }
  }
}
