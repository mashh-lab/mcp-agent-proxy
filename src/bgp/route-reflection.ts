// BGP Route Reflection System
// Enables scalable agent networks without full mesh BGP sessions

import { EventEmitter } from 'events'
import { AgentRoute, AgentPeer } from './types.js'
import { logger } from '../config.js'

/**
 * Route Reflector Configuration
 */
export interface RouteReflectorConfig {
  /** Route Reflector ID (typically same as Router ID) */
  reflectorId: string
  /** Local AS Number */
  localASN: number
  /** Cluster ID for route reflection */
  clusterId?: string
  /** Whether this router acts as a route reflector */
  isRouteReflector: boolean
  /** Maximum routes to cache for reflection */
  maxReflectedRoutes?: number
  /** Route reflection policies */
  reflectionPolicies?: RouteReflectionPolicy[]
}

/**
 * Route Reflection Policy
 */
export interface RouteReflectionPolicy {
  /** Policy name */
  name: string
  /** Client ASN filter (reflect only from these ASNs) */
  clientASNs?: number[]
  /** Capability filter (reflect only routes with these capabilities) */
  capabilities?: string[]
  /** Action: reflect, no-reflect, modify */
  action: 'reflect' | 'no-reflect' | 'modify'
  /** Route modifications to apply */
  modifications?: {
    localPref?: number
    med?: number
    communities?: string[]
  }
}

/**
 * Route Reflector Client
 */
export interface RouteReflectorClient {
  /** Client peer information */
  peer: AgentPeer
  /** Client type: ibgp-client, ibgp-non-client, ebgp */
  clientType: 'ibgp-client' | 'ibgp-non-client' | 'ebgp'
  /** Routes learned from this client */
  learnedRoutes: AgentRoute[]
  /** Routes reflected to this client */
  reflectedRoutes: AgentRoute[]
  /** Client statistics */
  stats: {
    routesReceived: number
    routesReflected: number
    lastUpdate: Date
  }
}

/**
 * Route Reflection Decision
 */
export interface RouteReflectionDecision {
  /** Original route */
  originalRoute: AgentRoute
  /** Client that sent the route */
  sourceClient: RouteReflectorClient
  /** Clients to reflect to */
  reflectToClients: RouteReflectorClient[]
  /** Modified route (if any modifications applied) */
  modifiedRoute?: AgentRoute
  /** Decision reason */
  reason: string
  /** Timestamp */
  timestamp: Date
}

/**
 * Simplified Route Reflector Client for decision history
 */
interface SimplifiedRouteReflectorClient {
  clientId: string
  clientType: 'ibgp-client' | 'ibgp-non-client' | 'ebgp'
}

/**
 * Route Reflection Decision for history (simplified)
 */
interface SimplifiedRouteReflectionDecision {
  originalRoute: AgentRoute
  sourceClient: SimplifiedRouteReflectorClient
  reflectToClients: SimplifiedRouteReflectorClient[]
  modifiedRoute?: AgentRoute
  reason: string
  timestamp: Date
}

/**
 * BGP Route Reflector
 * Implements RFC 4456 - BGP Route Reflection
 */
export class BGPRouteReflector extends EventEmitter {
  private config: RouteReflectorConfig
  private clients: Map<string, RouteReflectorClient> = new Map()
  private reflectedRoutes: Map<string, AgentRoute> = new Map()
  private reflectionDecisions: RouteReflectionDecision[] = []
  private isShutdown = false

  constructor(config: RouteReflectorConfig) {
    super()
    this.config = config

    logger.log(
      `BGP: Route reflector initialized (RR ID: ${config.reflectorId}, Cluster: ${config.clusterId || 'default'})`,
    )
  }

  /**
   * Add a route reflector client
   */
  addClient(
    peer: AgentPeer,
    clientType: 'ibgp-client' | 'ibgp-non-client' | 'ebgp',
  ): void {
    if (this.isShutdown) return

    const clientId = `${peer.asn}:${peer.address}`

    const client: RouteReflectorClient = {
      peer,
      clientType,
      learnedRoutes: [],
      reflectedRoutes: [],
      stats: {
        routesReceived: 0,
        routesReflected: 0,
        lastUpdate: new Date(),
      },
    }

    this.clients.set(clientId, client)

    logger.log(`BGP RR: Added ${clientType} client ${clientId}`)
    this.emit('clientAdded', client)
  }

  /**
   * Remove a route reflector client
   */
  removeClient(peer: AgentPeer): void {
    const clientId = `${peer.asn}:${peer.address}`
    const client = this.clients.get(clientId)

    if (client) {
      // Remove all routes learned from this client
      client.learnedRoutes.forEach((route) => {
        this.removeReflectedRoute(route)
      })

      this.clients.delete(clientId)
      logger.log(`BGP RR: Removed client ${clientId}`)
      this.emit('clientRemoved', client)
    }
  }

  /**
   * Process incoming route for reflection
   */
  processIncomingRoute(route: AgentRoute, sourcePeer: AgentPeer): void {
    if (this.isShutdown || !this.config.isRouteReflector) return

    const clientId = `${sourcePeer.asn}:${sourcePeer.address}`
    const sourceClient = this.clients.get(clientId)

    if (!sourceClient) {
      logger.warn(`BGP RR: Received route from unknown client ${clientId}`)
      return
    }

    // Update client stats
    sourceClient.stats.routesReceived++
    sourceClient.stats.lastUpdate = new Date()

    // Add to client's learned routes
    sourceClient.learnedRoutes.push(route)

    // Apply reflection policies
    const decision = this.makeReflectionDecision(route, sourceClient)

    if (decision.reflectToClients.length > 0) {
      this.reflectRoute(decision)
    }

    // Store decision for debugging/monitoring
    this.reflectionDecisions.push(decision)
    if (this.reflectionDecisions.length > 1000) {
      this.reflectionDecisions.shift() // Keep last 1000 decisions
    }

    this.emit('routeProcessed', decision)
  }

  /**
   * Make route reflection decision based on RFC 4456 rules
   */
  private makeReflectionDecision(
    route: AgentRoute,
    sourceClient: RouteReflectorClient,
  ): RouteReflectionDecision {
    const decision: RouteReflectionDecision = {
      originalRoute: route,
      sourceClient,
      reflectToClients: [],
      reason: '',
      timestamp: new Date(),
    }

    // Apply reflection policies first
    const policyResult = this.applyReflectionPolicies(route, sourceClient)
    if (policyResult.action === 'no-reflect') {
      decision.reason = `Policy ${policyResult.policyName} blocks reflection`
      return decision
    }

    decision.modifiedRoute = policyResult.modifiedRoute

    // RFC 4456 Route Reflection Rules:
    // 1. Routes from EBGP clients: reflect to all IBGP clients
    // 2. Routes from IBGP clients: reflect to all EBGP peers and IBGP non-clients
    // 3. Routes from IBGP non-clients: reflect to all IBGP clients

    const candidateClients: RouteReflectorClient[] = []

    if (sourceClient.clientType === 'ebgp') {
      // Reflect to all IBGP clients
      candidateClients.push(
        ...Array.from(this.clients.values()).filter(
          (c) =>
            c.clientType === 'ibgp-client' ||
            c.clientType === 'ibgp-non-client',
        ),
      )
      decision.reason = 'EBGP -> All IBGP'
    } else if (sourceClient.clientType === 'ibgp-client') {
      // Reflect to EBGP peers and IBGP non-clients
      candidateClients.push(
        ...Array.from(this.clients.values()).filter(
          (c) => c.clientType === 'ebgp' || c.clientType === 'ibgp-non-client',
        ),
      )
      decision.reason = 'IBGP client -> EBGP + IBGP non-clients'
    } else if (sourceClient.clientType === 'ibgp-non-client') {
      // Reflect to IBGP clients only
      candidateClients.push(
        ...Array.from(this.clients.values()).filter(
          (c) => c.clientType === 'ibgp-client',
        ),
      )
      decision.reason = 'IBGP non-client -> IBGP clients'
    }

    // Filter out the source client (don't reflect back to sender)
    decision.reflectToClients = candidateClients.filter(
      (c) => c !== sourceClient,
    )

    return decision
  }

  /**
   * Apply route reflection policies
   */
  private applyReflectionPolicies(
    route: AgentRoute,
    sourceClient: RouteReflectorClient,
  ): {
    action: 'reflect' | 'no-reflect' | 'modify'
    modifiedRoute?: AgentRoute
    policyName?: string
  } {
    if (!this.config.reflectionPolicies) {
      return { action: 'reflect' }
    }

    for (const policy of this.config.reflectionPolicies) {
      // Check if policy applies to this route/client
      let applies = true

      if (
        policy.clientASNs &&
        !policy.clientASNs.includes(sourceClient.peer.asn)
      ) {
        applies = false
      }

      if (policy.capabilities && applies) {
        const hasMatchingCapability = policy.capabilities.some((cap) =>
          route.capabilities.some((agentCap: string) =>
            agentCap.toLowerCase().includes(cap.toLowerCase()),
          ),
        )
        if (!hasMatchingCapability) {
          applies = false
        }
      }

      if (applies) {
        if (policy.action === 'no-reflect') {
          return { action: 'no-reflect', policyName: policy.name }
        } else if (policy.action === 'modify' && policy.modifications) {
          const modifiedRoute: AgentRoute = {
            ...route,
            localPref: policy.modifications.localPref ?? route.localPref,
            med: policy.modifications.med ?? route.med,
            communities: policy.modifications.communities
              ? [...route.communities, ...policy.modifications.communities]
              : route.communities,
          }
          return { action: 'modify', modifiedRoute, policyName: policy.name }
        }
      }
    }

    return { action: 'reflect' }
  }

  /**
   * Reflect route to specified clients
   */
  private reflectRoute(decision: RouteReflectionDecision): void {
    const routeToReflect = decision.modifiedRoute || decision.originalRoute

    // Add route reflector attributes
    const reflectedRoute: AgentRoute = {
      ...routeToReflect,
      // Add ORIGINATOR_ID if not present
      pathAttributes: new Map([
        ...routeToReflect.pathAttributes.entries(),
        [
          'originatorId',
          routeToReflect.pathAttributes.get('originatorId') ||
            decision.sourceClient.peer.address,
        ],
        ['clusterId', this.config.clusterId || this.config.reflectorId],
      ]),
      // Mark as reflected
      communities: [...routeToReflect.communities, 'rr:reflected'],
    }

    const routeKey = `${reflectedRoute.agentId}:${reflectedRoute.asPath[0]}`
    this.reflectedRoutes.set(routeKey, reflectedRoute)

    // Update client stats and send to each target client
    decision.reflectToClients.forEach((client) => {
      client.reflectedRoutes.push(reflectedRoute)
      client.stats.routesReflected++

      // Emit reflection event for BGP session to handle
      this.emit('routeReflected', {
        route: reflectedRoute,
        targetPeer: client.peer,
        sourceClient: decision.sourceClient,
      })
    })

    logger.log(
      `BGP RR: Reflected route ${routeToReflect.agentId} to ${decision.reflectToClients.length} clients (${decision.reason})`,
    )
  }

  /**
   * Remove reflected route
   */
  private removeReflectedRoute(route: AgentRoute): void {
    const routeKey = `${route.agentId}:${route.asPath[0]}`
    this.reflectedRoutes.delete(routeKey)

    // Remove from all client reflection lists
    this.clients.forEach((client) => {
      client.reflectedRoutes = client.reflectedRoutes.filter(
        (r) => `${r.agentId}:${r.asPath[0]}` !== routeKey,
      )
    })

    this.emit('routeWithdrawn', route)
  }

  /**
   * Get route reflector statistics
   */
  getReflectorStats() {
    const clientStats = Array.from(this.clients.values()).map((client) => ({
      clientId: `${client.peer.asn}:${client.peer.address}`,
      clientType: client.clientType,
      routesReceived: client.stats.routesReceived,
      routesReflected: client.stats.routesReflected,
      lastUpdate: client.stats.lastUpdate,
    }))

    return {
      reflectorId: this.config.reflectorId,
      clusterId: this.config.clusterId,
      isRouteReflector: this.config.isRouteReflector,
      totalClients: this.clients.size,
      clientsByType: {
        'ibgp-client': Array.from(this.clients.values()).filter(
          (c) => c.clientType === 'ibgp-client',
        ).length,
        'ibgp-non-client': Array.from(this.clients.values()).filter(
          (c) => c.clientType === 'ibgp-non-client',
        ).length,
        ebgp: Array.from(this.clients.values()).filter(
          (c) => c.clientType === 'ebgp',
        ).length,
      },
      totalReflectedRoutes: this.reflectedRoutes.size,
      totalDecisions: this.reflectionDecisions.length,
      clients: clientStats,
    }
  }

  /**
   * Get recent reflection decisions
   */
  getRecentDecisions(limit = 50): SimplifiedRouteReflectionDecision[] {
    return this.reflectionDecisions.slice(-limit).map((decision) => ({
      ...decision,
      // Simplify client objects for readability
      sourceClient: {
        clientId: `${decision.sourceClient.peer.asn}:${decision.sourceClient.peer.address}`,
        clientType: decision.sourceClient.clientType,
      },
      reflectToClients: decision.reflectToClients.map((c) => ({
        clientId: `${c.peer.asn}:${c.peer.address}`,
        clientType: c.clientType,
      })),
    }))
  }

  /**
   * Get all route reflector clients
   */
  getClients(): RouteReflectorClient[] {
    return Array.from(this.clients.values())
  }

  /**
   * Check if a peer is a route reflector client
   */
  isClient(peer: AgentPeer): boolean {
    const clientId = `${peer.asn}:${peer.address}`
    return this.clients.has(clientId)
  }

  /**
   * Update route reflection policies
   */
  updatePolicies(policies: RouteReflectionPolicy[]): void {
    this.config.reflectionPolicies = policies
    logger.log(
      `BGP RR: Updated reflection policies (${policies.length} policies)`,
    )
    this.emit('policiesUpdated', policies)
  }

  /**
   * Shutdown route reflector
   */
  async shutdown(): Promise<void> {
    if (this.isShutdown) return

    logger.log('BGP RR: Shutting down route reflector')
    this.isShutdown = true

    // Clear all data
    this.clients.clear()
    this.reflectedRoutes.clear()
    this.reflectionDecisions.length = 0

    this.emit('shutdown')
  }
}

/**
 * Route Reflector Cluster Manager
 * Manages multiple route reflectors in a cluster
 */
export class RouteReflectorClusterManager extends EventEmitter {
  private clusterId: string
  private routeReflectors: Map<string, BGPRouteReflector> = new Map()
  private clusterConfig: {
    redundancy: number
    loadBalancing: boolean
    failoverTimeout: number
  }

  constructor(
    clusterId: string,
    config = { redundancy: 2, loadBalancing: true, failoverTimeout: 30000 },
  ) {
    super()
    this.clusterId = clusterId
    this.clusterConfig = config

    logger.log(`BGP RR Cluster: Initialized cluster ${clusterId}`)
  }

  /**
   * Add route reflector to cluster
   */
  addRouteReflector(reflector: BGPRouteReflector): void {
    const reflectorId = reflector.getReflectorStats().reflectorId
    this.routeReflectors.set(reflectorId, reflector)

    // Set up event forwarding
    reflector.on('routeReflected', (event) => {
      this.emit('routeReflected', { ...event, reflectorId })
    })

    reflector.on('clientAdded', (client) => {
      this.emit('clientAdded', { client, reflectorId })
    })

    logger.log(
      `BGP RR Cluster: Added route reflector ${reflectorId} to cluster ${this.clusterId}`,
    )
  }

  /**
   * Get cluster statistics
   */
  getClusterStats() {
    const reflectorStats = Array.from(this.routeReflectors.values()).map((rr) =>
      rr.getReflectorStats(),
    )

    return {
      clusterId: this.clusterId,
      totalRouteReflectors: this.routeReflectors.size,
      config: this.clusterConfig,
      reflectors: reflectorStats,
      aggregateStats: {
        totalClients: reflectorStats.reduce(
          (sum, stats) => sum + stats.totalClients,
          0,
        ),
        totalReflectedRoutes: reflectorStats.reduce(
          (sum, stats) => sum + stats.totalReflectedRoutes,
          0,
        ),
        totalDecisions: reflectorStats.reduce(
          (sum, stats) => sum + stats.totalDecisions,
          0,
        ),
      },
    }
  }

  /**
   * Shutdown entire cluster
   */
  async shutdown(): Promise<void> {
    logger.log(`BGP RR Cluster: Shutting down cluster ${this.clusterId}`)

    await Promise.all(
      Array.from(this.routeReflectors.values()).map((rr) => rr.shutdown()),
    )

    this.routeReflectors.clear()
    this.emit('shutdown')
  }
}
