// BGP Multi-Path Load Balancing System
// Enables load balancing across equivalent agent paths for optimal performance

import { EventEmitter } from 'events'
import { AgentRoute } from './types.js'
import { logger } from '../config.js'

/**
 * Load Balancing Method
 */
export type LoadBalancingMethod =
  | 'round-robin'
  | 'capability-aware'
  | 'latency-based'
  | 'weighted'
  | 'least-connections'
  | 'random'

/**
 * Multi-Path Configuration
 */
export interface MultiPathConfig {
  /** Enable multi-path load balancing */
  enabled: boolean
  /** Maximum paths to use for load balancing */
  maxPaths: number
  /** Load balancing method */
  method: LoadBalancingMethod
  /** Enable ECMP (Equal Cost Multi-Path) */
  ecmpEnabled: boolean
  /** Health check interval for paths (ms) */
  healthCheckInterval?: number
  /** Path failure threshold */
  failureThreshold?: number
  /** Enable path failover */
  enableFailover: boolean
}

/**
 * Path Health Status
 */
export interface PathHealth {
  /** Route */
  route: AgentRoute
  /** Response time (ms) */
  responseTime: number
  /** Success rate (0.0-1.0) */
  successRate: number
  /** Current connections */
  currentConnections: number
  /** Total requests */
  totalRequests: number
  /** Failed requests */
  failedRequests: number
  /** Last health check */
  lastHealthCheck: Date
  /** Path status */
  status: 'healthy' | 'degraded' | 'unhealthy'
}

/**
 * Load Balancing Decision
 */
export interface LoadBalancingDecision {
  /** Selected route */
  selectedRoute: AgentRoute
  /** Available routes considered */
  availableRoutes: AgentRoute[]
  /** Method used for selection */
  method: LoadBalancingMethod
  /** Decision reason */
  reason: string
  /** Load balancing weights used */
  weights?: Record<string, number>
  /** Timestamp */
  timestamp: Date
}

/**
 * Path Weight Configuration
 */
export interface PathWeight {
  /** Agent ID pattern (supports wildcards) */
  agentIdPattern: string
  /** Weight value (higher = more traffic) */
  weight: number
  /** Capability requirements */
  requiredCapabilities?: string[]
}

/**
 * Multi-Path Statistics
 */
export interface MultiPathStats {
  /** Total paths managed */
  totalPaths: number
  /** Healthy paths */
  healthyPaths: number
  /** Active paths (receiving traffic) */
  activePaths: number
  /** Total requests distributed */
  totalRequests: number
  /** Distribution by method */
  distributionByMethod: Record<LoadBalancingMethod, number>
  /** Path utilization */
  pathUtilization: Record<string, number>
  /** Average response time */
  averageResponseTime: number
}

/**
 * BGP Multi-Path Load Balancer
 * Implements intelligent load balancing across equivalent agent paths
 */
export class BGPMultiPathLoadBalancer extends EventEmitter {
  private config: MultiPathConfig
  private availablePaths: Map<string, AgentRoute> = new Map()
  private pathHealth: Map<string, PathHealth> = new Map()
  private pathWeights: PathWeight[] = []
  private roundRobinIndex = 0
  private decisions: LoadBalancingDecision[] = []
  private stats: MultiPathStats
  private healthCheckTimer?: NodeJS.Timeout
  private isShutdown = false

  constructor(config: MultiPathConfig) {
    super()
    this.config = config
    this.stats = {
      totalPaths: 0,
      healthyPaths: 0,
      activePaths: 0,
      totalRequests: 0,
      distributionByMethod: {
        'round-robin': 0,
        'capability-aware': 0,
        'latency-based': 0,
        weighted: 0,
        'least-connections': 0,
        random: 0,
      },
      pathUtilization: {},
      averageResponseTime: 0,
    }

    if (config.enabled && config.healthCheckInterval) {
      this.startHealthChecks()
    }

    logger.log(
      `BGP Multi-Path: Initialized load balancer (method: ${config.method}, max paths: ${config.maxPaths})`,
    )
  }

  /**
   * Add a path for load balancing
   */
  addPath(route: AgentRoute): void {
    if (this.isShutdown || !this.config.enabled) return

    const pathKey = `${route.agentId}:${route.asPath.join(':')}`

    // Check if we're at max paths limit
    if (
      !this.availablePaths.has(pathKey) &&
      this.availablePaths.size >= this.config.maxPaths
    ) {
      logger.warn(
        `BGP Multi-Path: Cannot add path ${pathKey}, maximum paths (${this.config.maxPaths}) reached`,
      )
      return
    }

    this.availablePaths.set(pathKey, route)

    // Initialize path health
    if (!this.pathHealth.has(pathKey)) {
      this.pathHealth.set(pathKey, {
        route,
        responseTime: 0,
        successRate: 1.0,
        currentConnections: 0,
        totalRequests: 0,
        failedRequests: 0,
        lastHealthCheck: new Date(),
        status: 'healthy',
      })
    }

    this.updateStats()
    logger.log(`BGP Multi-Path: Added path ${pathKey}`)
    this.emit('pathAdded', { route, pathKey })
  }

  /**
   * Remove a path from load balancing
   */
  removePath(route: AgentRoute): void {
    const pathKey = `${route.agentId}:${route.asPath.join(':')}`

    if (this.availablePaths.has(pathKey)) {
      this.availablePaths.delete(pathKey)
      this.pathHealth.delete(pathKey)
      this.updateStats()

      logger.log(`BGP Multi-Path: Removed path ${pathKey}`)
      this.emit('pathRemoved', { route, pathKey })
    }
  }

  /**
   * Select the best path for a request using the configured load balancing method
   */
  selectPath(
    requiredCapabilities?: string[],
    requestId?: string,
  ): LoadBalancingDecision | null {
    if (!this.config.enabled || this.availablePaths.size === 0) {
      return null
    }

    const availableRoutes = Array.from(this.availablePaths.values())

    // Filter by capabilities if specified
    const eligibleRoutes = requiredCapabilities
      ? availableRoutes.filter((route) =>
          requiredCapabilities.every((reqCap) =>
            route.capabilities.some((cap) =>
              cap.toLowerCase().includes(reqCap.toLowerCase()),
            ),
          ),
        )
      : availableRoutes

    // If no routes match capabilities, fall back to all available routes
    const routesToConsider =
      eligibleRoutes.length > 0 ? eligibleRoutes : availableRoutes

    // Filter by health status
    const healthyRoutes = routesToConsider.filter((route) => {
      const pathKey = `${route.agentId}:${route.asPath.join(':')}`
      const health = this.pathHealth.get(pathKey)
      return health?.status === 'healthy' || health?.status === 'degraded'
    })

    if (healthyRoutes.length === 0) {
      logger.warn('BGP Multi-Path: No healthy paths available')
      return null
    }

    let selectedRoute: AgentRoute
    let reason: string
    let weights: Record<string, number> | undefined

    switch (this.config.method) {
      case 'round-robin':
        selectedRoute = this.selectRoundRobin(healthyRoutes)
        reason = `Round-robin selection (index: ${this.roundRobinIndex})`
        break

      case 'capability-aware':
        selectedRoute = this.selectCapabilityAware(
          healthyRoutes,
          requiredCapabilities || [],
        )
        reason = 'Capability-aware selection based on best match'
        break

      case 'latency-based':
        selectedRoute = this.selectLatencyBased(healthyRoutes)
        reason = 'Latency-based selection (lowest response time)'
        break

      case 'weighted':
        const weightedResult = this.selectWeighted(healthyRoutes)
        selectedRoute = weightedResult.route
        weights = weightedResult.weights
        reason = 'Weighted selection based on configured weights'
        break

      case 'least-connections':
        selectedRoute = this.selectLeastConnections(healthyRoutes)
        reason = 'Least connections selection'
        break

      case 'random':
        selectedRoute = this.selectRandom(healthyRoutes)
        reason = 'Random selection'
        break

      default:
        selectedRoute = healthyRoutes[0]
        reason = 'Default selection (first available)'
    }

    const decision: LoadBalancingDecision = {
      selectedRoute,
      availableRoutes: healthyRoutes,
      method: this.config.method,
      reason,
      weights,
      timestamp: new Date(),
    }

    // Update statistics
    this.recordDecision(decision, requestId)

    // Store decision for monitoring
    this.decisions.push(decision)
    if (this.decisions.length > 1000) {
      this.decisions.shift() // Keep last 1000 decisions
    }

    this.emit('pathSelected', decision)
    return decision
  }

  /**
   * Round-robin path selection
   */
  private selectRoundRobin(routes: AgentRoute[]): AgentRoute {
    if (routes.length === 0) throw new Error('No routes available')

    const route = routes[this.roundRobinIndex % routes.length]
    this.roundRobinIndex = (this.roundRobinIndex + 1) % routes.length
    return route
  }

  /**
   * Capability-aware path selection
   */
  private selectCapabilityAware(
    routes: AgentRoute[],
    requiredCapabilities: string[],
  ): AgentRoute {
    if (routes.length === 0) throw new Error('No routes available')
    if (requiredCapabilities.length === 0) return routes[0]

    // Score routes based on capability matching
    const scoredRoutes = routes.map((route) => {
      const matchCount = requiredCapabilities.filter((reqCap) =>
        route.capabilities.some((cap) =>
          cap.toLowerCase().includes(reqCap.toLowerCase()),
        ),
      ).length

      const completenessScore = matchCount / requiredCapabilities.length
      const specificityScore =
        route.capabilities.length > 0
          ? matchCount / route.capabilities.length
          : 0

      return {
        route,
        score: completenessScore * 0.7 + specificityScore * 0.3,
      }
    })

    // Sort by score (highest first) and return best match
    scoredRoutes.sort((a, b) => b.score - a.score)
    return scoredRoutes[0].route
  }

  /**
   * Latency-based path selection
   */
  private selectLatencyBased(routes: AgentRoute[]): AgentRoute {
    if (routes.length === 0) throw new Error('No routes available')

    let bestRoute = routes[0]
    let bestLatency = Infinity

    for (const route of routes) {
      const pathKey = `${route.agentId}:${route.asPath.join(':')}`
      const health = this.pathHealth.get(pathKey)

      if (health && health.responseTime < bestLatency) {
        bestLatency = health.responseTime
        bestRoute = route
      }
    }

    return bestRoute
  }

  /**
   * Weighted path selection
   */
  private selectWeighted(routes: AgentRoute[]): {
    route: AgentRoute
    weights: Record<string, number>
  } {
    if (routes.length === 0) throw new Error('No routes available')

    const weights: Record<string, number> = {}
    let totalWeight = 0

    // Calculate weights for each route
    for (const route of routes) {
      const pathKey = `${route.agentId}:${route.asPath.join(':')}`
      let weight = 1 // Default weight

      // Apply configured weights
      for (const pathWeight of this.pathWeights) {
        if (this.matchesPattern(route.agentId, pathWeight.agentIdPattern)) {
          if (
            !pathWeight.requiredCapabilities ||
            pathWeight.requiredCapabilities.every((reqCap) =>
              route.capabilities.some((cap) =>
                cap.toLowerCase().includes(reqCap.toLowerCase()),
              ),
            )
          ) {
            weight = pathWeight.weight
            break
          }
        }
      }

      // Adjust weight based on health
      const health = this.pathHealth.get(pathKey)
      if (health) {
        weight *= health.successRate
        if (health.status === 'degraded') weight *= 0.5
      }

      weights[pathKey] = weight
      totalWeight += weight
    }

    // Select route based on weighted random selection
    let random = Math.random() * totalWeight
    for (const route of routes) {
      const pathKey = `${route.agentId}:${route.asPath.join(':')}`
      random -= weights[pathKey]
      if (random <= 0) {
        return { route, weights }
      }
    }

    return { route: routes[routes.length - 1], weights }
  }

  /**
   * Least connections path selection
   */
  private selectLeastConnections(routes: AgentRoute[]): AgentRoute {
    if (routes.length === 0) throw new Error('No routes available')

    let bestRoute = routes[0]
    let minConnections = Infinity

    for (const route of routes) {
      const pathKey = `${route.agentId}:${route.asPath.join(':')}`
      const health = this.pathHealth.get(pathKey)

      if (health && health.currentConnections < minConnections) {
        minConnections = health.currentConnections
        bestRoute = route
      }
    }

    return bestRoute
  }

  /**
   * Random path selection
   */
  private selectRandom(routes: AgentRoute[]): AgentRoute {
    if (routes.length === 0) throw new Error('No routes available')
    return routes[Math.floor(Math.random() * routes.length)]
  }

  /**
   * Pattern matching for agent IDs (supports wildcards)
   */
  private matchesPattern(agentId: string, pattern: string): boolean {
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
      .replace(/\[([^\]]+)\]/g, '[$1]')

    return new RegExp(`^${regexPattern}$`, 'i').test(agentId)
  }

  /**
   * Record load balancing decision and update statistics
   */
  private recordDecision(
    decision: LoadBalancingDecision,
    requestId?: string,
  ): void {
    const pathKey = `${decision.selectedRoute.agentId}:${decision.selectedRoute.asPath.join(':')}`

    // Update global stats
    this.stats.totalRequests++
    this.stats.distributionByMethod[decision.method]++

    // Update path utilization
    this.stats.pathUtilization[pathKey] =
      (this.stats.pathUtilization[pathKey] || 0) + 1

    // Update path health
    const health = this.pathHealth.get(pathKey)
    if (health) {
      health.totalRequests++
      health.currentConnections++
    }

    this.emit('requestStarted', { decision, requestId, pathKey })
  }

  /**
   * Report completion of a request (for connection tracking)
   */
  reportRequestComplete(
    route: AgentRoute,
    success: boolean,
    responseTime?: number,
  ): void {
    const pathKey = `${route.agentId}:${route.asPath.join(':')}`
    const health = this.pathHealth.get(pathKey)

    if (health) {
      health.currentConnections = Math.max(0, health.currentConnections - 1)

      if (responseTime !== undefined) {
        // Update response time directly for first measurement, then use moving average
        health.responseTime =
          health.responseTime === 0
            ? responseTime
            : health.responseTime * 0.8 + responseTime * 0.2
      }

      if (!success) {
        health.failedRequests++
      }

      // Update success rate
      health.successRate =
        health.totalRequests > 0
          ? (health.totalRequests - health.failedRequests) /
            health.totalRequests
          : 1.0

      // Update health status
      this.updatePathHealthStatus(pathKey, health)
    }

    this.emit('requestCompleted', { route, success, responseTime, pathKey })
  }

  /**
   * Update path health status based on metrics
   */
  private updatePathHealthStatus(pathKey: string, health: PathHealth): void {
    const oldStatus = health.status

    if (health.successRate < 0.5 || health.responseTime > 10000) {
      health.status = 'unhealthy'
    } else if (health.successRate < 0.8 || health.responseTime > 5000) {
      health.status = 'degraded'
    } else {
      health.status = 'healthy'
    }

    if (oldStatus !== health.status) {
      logger.log(
        `BGP Multi-Path: Path ${pathKey} status changed from ${oldStatus} to ${health.status}`,
      )
      this.emit('pathHealthChanged', {
        pathKey,
        oldStatus,
        newStatus: health.status,
        health,
      })
    }
  }

  /**
   * Configure path weights
   */
  setPathWeights(weights: PathWeight[]): void {
    this.pathWeights = weights
    logger.log(`BGP Multi-Path: Updated path weights (${weights.length} rules)`)
    this.emit('weightsUpdated', weights)
  }

  /**
   * Start health checks for paths
   */
  private startHealthChecks(): void {
    if (this.healthCheckTimer || !this.config.healthCheckInterval) return

    this.healthCheckTimer = setInterval(() => {
      this.performHealthChecks()
    }, this.config.healthCheckInterval)

    logger.log(
      `BGP Multi-Path: Started health checks (interval: ${this.config.healthCheckInterval}ms)`,
    )
  }

  /**
   * Perform health checks on all paths
   */
  private performHealthChecks(): void {
    for (const [pathKey, health] of this.pathHealth.entries()) {
      health.lastHealthCheck = new Date()

      // Simple health check logic (can be extended)
      if (health.totalRequests > 10) {
        this.updatePathHealthStatus(pathKey, health)
      }
    }

    this.updateStats()
    this.emit('healthCheckCompleted')
  }

  /**
   * Update statistics
   */
  private updateStats(): void {
    this.stats.totalPaths = this.availablePaths.size
    this.stats.healthyPaths = Array.from(this.pathHealth.values()).filter(
      (h) => h.status === 'healthy',
    ).length
    this.stats.activePaths = Array.from(this.pathHealth.values()).filter(
      (h) => h.currentConnections > 0,
    ).length

    // Calculate average response time
    const healthValues = Array.from(this.pathHealth.values())
    if (healthValues.length > 0) {
      this.stats.averageResponseTime =
        healthValues.reduce((sum, h) => sum + h.responseTime, 0) /
        healthValues.length
    }
  }

  /**
   * Get load balancing statistics
   */
  getStats(): MultiPathStats {
    this.updateStats()
    return { ...this.stats }
  }

  /**
   * Get path health information
   */
  getPathHealth(): Record<string, PathHealth> {
    const result: Record<string, PathHealth> = {}
    for (const [pathKey, health] of this.pathHealth.entries()) {
      result[pathKey] = { ...health }
    }
    return result
  }

  /**
   * Get recent load balancing decisions
   */
  getRecentDecisions(limit = 50): LoadBalancingDecision[] {
    return this.decisions.slice(-limit)
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<MultiPathConfig>): void {
    const oldConfig = { ...this.config }
    this.config = { ...this.config, ...config }

    // Restart health checks if interval changed
    if (
      config.healthCheckInterval !== undefined &&
      config.healthCheckInterval !== oldConfig.healthCheckInterval
    ) {
      this.stopHealthChecks()
      if (this.config.enabled && this.config.healthCheckInterval) {
        this.startHealthChecks()
      }
    }

    logger.log('BGP Multi-Path: Configuration updated')
    this.emit('configUpdated', { oldConfig, newConfig: this.config })
  }

  /**
   * Stop health checks
   */
  private stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = undefined
    }
  }

  /**
   * Shutdown load balancer
   */
  async shutdown(): Promise<void> {
    if (this.isShutdown) return

    logger.log('BGP Multi-Path: Shutting down load balancer')
    this.isShutdown = true

    this.stopHealthChecks()

    // Clear all data
    this.availablePaths.clear()
    this.pathHealth.clear()
    this.pathWeights = []
    this.decisions.length = 0

    this.emit('shutdown')
  }
}
