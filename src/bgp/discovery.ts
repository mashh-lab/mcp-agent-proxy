// Real-Time Agent Discovery System for BGP Networks
// Enables instant network-wide agent availability notifications and capability updates

import { EventEmitter } from 'events'
import { BGPSession } from './session.js'
import {
  AgentAdvertisementManager,
  AgentCapabilities,
} from './advertisement.js'
import { BGPUpdate, AgentRoute } from './types.js'
import { logger } from '../config.js'

export interface DiscoveryConfig {
  localASN: number
  routerId: string
  realTimeUpdates?: boolean // Enable real-time discovery notifications
  discoveryInterval?: number // How often to send discovery requests (default: 30s)
  capabilityFilters?: string[] // Only discover agents with specific capabilities
  healthThreshold?: 'healthy' | 'degraded' | 'unhealthy' // Minimum health to include
  maxHops?: number // Maximum AS hops for discovery
  enableBroadcast?: boolean // Enable network-wide discovery broadcasts
}

export interface DiscoveryRequest {
  requestId: string
  requestorASN: number
  targetCapabilities: string[]
  maxResults?: number
  healthFilter?: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: Date
  ttl?: number // Time-to-live in hops
}

export interface DiscoveryResponse {
  requestId: string
  responderASN: number
  agents: AgentCapabilities[]
  totalAvailable: number
  timestamp: Date
  routingInfo?: {
    asPath: number[]
    nextHop: string
    localPref: number
  }
}

export interface NetworkAgent {
  agent: AgentCapabilities
  sourceASN: number
  asPath: number[]
  nextHop: string
  lastUpdated: Date
  routingMetrics: {
    localPref: number
    med: number
    pathLength: number
  }
}

export interface DiscoveryEvent {
  type: 'agentDiscovered' | 'agentLost' | 'capabilityChanged' | 'healthChanged'
  agent: NetworkAgent
  timestamp: Date
  sourceASN: number
}

/**
 * Real-Time Agent Discovery Manager
 * Provides instant network-wide agent discovery and capability monitoring
 */
export class RealTimeDiscoveryManager extends EventEmitter {
  private bgpSession: BGPSession
  private advertisementManager: AgentAdvertisementManager
  private config: DiscoveryConfig
  private networkAgents = new Map<string, NetworkAgent>() // agentId -> NetworkAgent
  private discoveryTimer?: NodeJS.Timeout
  private pendingRequests = new Map<string, DiscoveryRequest>()
  private capabilityIndex = new Map<string, Set<string>>() // capability -> agentIds
  private asnIndex = new Map<number, Set<string>>() // asn -> agentIds

  constructor(
    bgpSession: BGPSession,
    advertisementManager: AgentAdvertisementManager,
    config: DiscoveryConfig,
  ) {
    super()
    this.bgpSession = bgpSession
    this.advertisementManager = advertisementManager
    this.config = {
      realTimeUpdates: true,
      discoveryInterval: 30 * 1000, // 30 seconds
      healthThreshold: 'degraded',
      maxHops: 5,
      enableBroadcast: true,
      ...config,
    }

    this.setupEventHandlers()
    this.startDiscoveryTimer()

    logger.log(
      `BGP: Real-time discovery manager initialized for AS${config.localASN} (${config.routerId})`,
    )
  }

  /**
   * Setup event handlers for BGP and advertisement events
   */
  private setupEventHandlers(): void {
    // Handle BGP route updates for agent discovery
    this.bgpSession.on('routeUpdate', (peerASN: number, update: BGPUpdate) => {
      this.handleRouteUpdate(peerASN, update)
    })

    // Handle new BGP sessions for discovery exchange
    this.bgpSession.on('sessionEstablished', (peerASN: number) => {
      logger.log(
        `BGP: New session established with AS${peerASN}, initiating discovery exchange`,
      )
      this.initiateDiscoveryExchange(peerASN)
    })

    // Handle local agent changes for real-time propagation
    this.advertisementManager.on(
      'agentRegistered',
      (agentId: string, capabilities: AgentCapabilities) => {
        this.handleLocalAgentChange('agentDiscovered', agentId, capabilities)
      },
    )

    this.advertisementManager.on('agentUnregistered', (agentId: string) => {
      this.handleLocalAgentRemoval(agentId)
    })

    this.advertisementManager.on(
      'agentUpdated',
      (agentId: string, capabilities: AgentCapabilities) => {
        this.handleLocalAgentChange('capabilityChanged', agentId, capabilities)
      },
    )

    // Handle peer removal
    this.bgpSession.on('peerRemoved', (peerASN: number) => {
      this.handlePeerRemoval(peerASN)
    })
  }

  /**
   * Handle BGP route updates containing agent information
   */
  private handleRouteUpdate(peerASN: number, update: BGPUpdate): void {
    if (update.advertisedRoutes) {
      for (const route of update.advertisedRoutes) {
        this.processDiscoveredAgent(route, peerASN)
      }
    }

    if (update.withdrawnRoutes) {
      for (const agentId of update.withdrawnRoutes) {
        this.processAgentWithdrawal(agentId, peerASN)
      }
    }
  }

  /**
   * Process a newly discovered agent from BGP updates
   */
  private processDiscoveredAgent(route: AgentRoute, sourceASN: number): void {
    // Validate route has required properties
    if (
      !route ||
      !route.agentId ||
      !route.capabilities ||
      !route.asPath ||
      route.asPath.length === 0
    ) {
      logger.log(
        `BGP: Skipping malformed route from AS${sourceASN}: missing required properties`,
      )
      return
    }

    // Skip if agent originates from us
    if (route.asPath[0] === this.config.localASN) {
      return
    }

    // Apply health filtering
    const agentHealth = this.extractHealthFromCommunities(route.communities)
    if (!this.meetsHealthThreshold(agentHealth)) {
      return
    }

    // Apply capability filtering
    if (
      this.config.capabilityFilters &&
      !this.hasRequiredCapabilities(route.capabilities)
    ) {
      return
    }

    const networkAgent: NetworkAgent = {
      agent: {
        agentId: route.agentId,
        capabilities: route.capabilities,
        healthStatus: agentHealth,
        lastSeen: new Date(),
        metadata: this.extractMetadataFromPathAttributes(route.pathAttributes),
      },
      sourceASN,
      asPath: route.asPath,
      nextHop: route.nextHop,
      lastUpdated: new Date(),
      routingMetrics: {
        localPref: route.localPref,
        med: route.med,
        pathLength: route.asPath.length,
      },
    }

    const existingAgent = this.networkAgents.get(route.agentId)
    const isNewAgent = !existingAgent
    const isUpdate =
      existingAgent && this.isAgentUpdate(existingAgent, networkAgent)

    // Update our network view
    this.networkAgents.set(route.agentId, networkAgent)
    this.updateIndices(networkAgent)

    // Emit discovery events
    if (isNewAgent) {
      this.emitDiscoveryEvent('agentDiscovered', networkAgent)
      logger.log(
        `BGP: Discovered new agent ${route.agentId} from AS${sourceASN} with capabilities: [${route.capabilities.join(', ')}]`,
      )
    } else if (isUpdate) {
      this.emitDiscoveryEvent('capabilityChanged', networkAgent)
      logger.log(`BGP: Updated agent ${route.agentId} from AS${sourceASN}`)
    }
  }

  /**
   * Process agent withdrawal from the network
   */
  private processAgentWithdrawal(agentId: string, sourceASN: number): void {
    const agent = this.networkAgents.get(agentId)
    if (agent && agent.sourceASN === sourceASN) {
      this.networkAgents.delete(agentId)
      this.removeFromIndices(agent)
      this.emitDiscoveryEvent('agentLost', agent)
      logger.log(`BGP: Agent ${agentId} withdrawn from AS${sourceASN}`)
    }
  }

  /**
   * Handle local agent changes for real-time propagation
   */
  private handleLocalAgentChange(
    eventType: 'agentDiscovered' | 'capabilityChanged',
    agentId: string,
    capabilities: AgentCapabilities,
  ): void {
    if (!this.config.realTimeUpdates) return

    // Create network agent representation for local agent
    const networkAgent: NetworkAgent = {
      agent: capabilities,
      sourceASN: this.config.localASN,
      asPath: [this.config.localASN],
      nextHop: `http://localhost:${this.config.localASN}`,
      lastUpdated: new Date(),
      routingMetrics: {
        localPref: 200, // Higher preference for local agents
        med: 0,
        pathLength: 0,
      },
    }

    this.emitDiscoveryEvent(eventType, networkAgent)
  }

  /**
   * Handle local agent removal
   */
  private handleLocalAgentRemoval(agentId: string): void {
    if (!this.config.realTimeUpdates) return

    // Try to get agent info, but create a basic representation if not found
    // (agent might already be deleted from advertisement manager)
    const localAgent = this.advertisementManager.getAgent(agentId)

    const networkAgent: NetworkAgent = {
      agent: localAgent || {
        agentId,
        capabilities: [], // Unknown capabilities after deletion
        healthStatus: 'healthy',
        lastSeen: new Date(),
      },
      sourceASN: this.config.localASN,
      asPath: [this.config.localASN],
      nextHop: `http://localhost:${this.config.localASN}`,
      lastUpdated: new Date(),
      routingMetrics: {
        localPref: 200,
        med: 0,
        pathLength: 0,
      },
    }

    this.emitDiscoveryEvent('agentLost', networkAgent)
  }

  /**
   * Handle peer removal - clean up agents from that ASN
   */
  private handlePeerRemoval(peerASN: number): void {
    const agentsToRemove: string[] = []

    for (const [agentId, agent] of this.networkAgents.entries()) {
      if (agent.sourceASN === peerASN) {
        agentsToRemove.push(agentId)
      }
    }

    for (const agentId of agentsToRemove) {
      const agent = this.networkAgents.get(agentId)
      if (agent) {
        this.networkAgents.delete(agentId)
        this.removeFromIndices(agent)
        this.emitDiscoveryEvent('agentLost', agent)
      }
    }

    if (agentsToRemove.length > 0) {
      logger.log(
        `BGP: Removed ${agentsToRemove.length} agents from disconnected AS${peerASN}`,
      )
    }
  }

  /**
   * Discover agents by capability across the network
   */
  async discoverAgentsByCapability(
    capability: string,
    options?: {
      maxResults?: number
      healthFilter?: 'healthy' | 'degraded' | 'unhealthy'
      timeout?: number
    },
  ): Promise<NetworkAgent[]> {
    const results: NetworkAgent[] = []
    const {
      maxResults = 50,
      healthFilter = 'degraded',
      timeout = 5000,
    } = options || {}

    // First, check local cache
    const cachedAgentIds =
      this.capabilityIndex.get(capability.toLowerCase()) || new Set()
    for (const agentId of cachedAgentIds) {
      const agent = this.networkAgents.get(agentId)
      if (
        agent &&
        this.meetsHealthFilter(agent.agent.healthStatus, healthFilter)
      ) {
        results.push(agent)
        if (results.length >= maxResults) break
      }
    }

    // If we have enough results from cache, return them
    if (results.length >= maxResults) {
      return this.sortAgentsByPreference(results.slice(0, maxResults))
    }

    // Otherwise, initiate network-wide discovery
    if (this.config.enableBroadcast) {
      const remainingResults = maxResults - results.length
      const networkResults = await this.broadcastDiscoveryRequest(
        [capability],
        { maxResults: remainingResults, healthFilter, timeout },
      )

      results.push(...networkResults)
    }

    return this.sortAgentsByPreference(results.slice(0, maxResults))
  }

  /**
   * Broadcast discovery request across the network
   */
  private async broadcastDiscoveryRequest(
    capabilities: string[],
    options: {
      maxResults?: number
      healthFilter?: 'healthy' | 'degraded' | 'unhealthy'
      timeout?: number
    },
  ): Promise<NetworkAgent[]> {
    const { maxResults = 50, timeout = 5000 } = options
    const requestId = `discovery-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    const request: DiscoveryRequest = {
      requestId,
      requestorASN: this.config.localASN,
      targetCapabilities: capabilities,
      maxResults,
      timestamp: new Date(),
      ttl: this.config.maxHops,
    }

    this.pendingRequests.set(requestId, request)

    // Send discovery request to all established peers
    const peers = this.bgpSession.getPeers()
    const promises: Promise<void>[] = []

    for (const peer of peers.values()) {
      promises.push(this.sendDiscoveryRequest(peer.asn, request))
    }

    // Wait for responses or timeout
    return new Promise((resolve) => {
      const results: NetworkAgent[] = []
      let responseCount = 0
      const expectedResponses = peers.size

      const responseHandler = (response: DiscoveryResponse) => {
        if (response.requestId === requestId) {
          // Convert response agents to NetworkAgent format
          for (const agent of response.agents) {
            const networkAgent: NetworkAgent = {
              agent,
              sourceASN: response.responderASN,
              asPath: response.routingInfo?.asPath || [response.responderASN],
              nextHop:
                response.routingInfo?.nextHop ||
                `http://as${response.responderASN}`,
              lastUpdated: response.timestamp,
              routingMetrics: {
                localPref: response.routingInfo?.localPref || 100,
                med: 50, // Default MED for discovered agents
                pathLength: response.routingInfo?.asPath?.length || 1,
              },
            }
            results.push(networkAgent)
          }

          responseCount++
          if (
            responseCount >= expectedResponses ||
            results.length >= maxResults
          ) {
            this.off('discoveryResponse', responseHandler)
            this.pendingRequests.delete(requestId)
            resolve(results.slice(0, maxResults))
          }
        }
      }

      this.on('discoveryResponse', responseHandler)

      // Timeout handling
      setTimeout(() => {
        this.off('discoveryResponse', responseHandler)
        this.pendingRequests.delete(requestId)
        resolve(results.slice(0, maxResults))
      }, timeout)

      // If no peers, resolve immediately
      if (expectedResponses === 0) {
        resolve(results)
      }
    })
  }

  /**
   * Send discovery request to a specific peer
   */
  private async sendDiscoveryRequest(
    peerASN: number,
    request: DiscoveryRequest,
  ): Promise<void> {
    try {
      // For now, we'll simulate discovery via BGP UPDATE messages
      // In a real implementation, this could use custom BGP extensions
      logger.log(
        `BGP: Sending discovery request ${request.requestId} to AS${peerASN} for capabilities: [${request.targetCapabilities.join(', ')}]`,
      )

      // This would be implemented as part of the BGP protocol extension
      // For the current implementation, we rely on the advertisement system
    } catch (error) {
      logger.log(
        `BGP: Failed to send discovery request to AS${peerASN}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  /**
   * Initiate discovery exchange with a new peer
   */
  private async initiateDiscoveryExchange(peerASN: number): Promise<void> {
    // Request a full capability update from the peer
    if (
      this.config.capabilityFilters &&
      this.config.capabilityFilters.length > 0
    ) {
      // Request specific capabilities
      await this.broadcastDiscoveryRequest(this.config.capabilityFilters, {
        maxResults: 100,
        timeout: 3000,
      })
    }

    logger.log(`BGP: Initiated discovery exchange with AS${peerASN}`)
  }

  /**
   * Start the periodic discovery timer
   */
  private startDiscoveryTimer(): void {
    if (this.config.discoveryInterval && this.config.discoveryInterval > 0) {
      this.discoveryTimer = setInterval(async () => {
        await this.performPeriodicDiscovery()
      }, this.config.discoveryInterval)

      logger.log(
        `BGP: Started discovery timer (interval: ${this.config.discoveryInterval / 1000}s)`,
      )
    }
  }

  /**
   * Perform periodic discovery sweep
   */
  private async performPeriodicDiscovery(): Promise<void> {
    logger.log(
      `BGP: Performing periodic discovery sweep (${this.networkAgents.size} agents known)`,
    )

    // Clean up stale agents (older than 5 minutes)
    const staleThreshold = Date.now() - 5 * 60 * 1000
    const staleAgents: string[] = []

    for (const [agentId, agent] of this.networkAgents.entries()) {
      if (agent.lastUpdated.getTime() < staleThreshold) {
        staleAgents.push(agentId)
      }
    }

    for (const agentId of staleAgents) {
      const agent = this.networkAgents.get(agentId)
      if (agent) {
        this.networkAgents.delete(agentId)
        this.removeFromIndices(agent)
        this.emitDiscoveryEvent('agentLost', agent)
      }
    }

    if (staleAgents.length > 0) {
      logger.log(`BGP: Cleaned up ${staleAgents.length} stale agents`)
    }

    // Optionally trigger capability-based discovery
    if (
      this.config.capabilityFilters &&
      this.config.capabilityFilters.length > 0
    ) {
      for (const capability of this.config.capabilityFilters) {
        await this.discoverAgentsByCapability(capability, { maxResults: 10 })
      }
    }

    this.emit('discoverySweeperCompleted', {
      totalAgents: this.networkAgents.size,
      staleAgentsRemoved: staleAgents.length,
      timestamp: new Date(),
    })
  }

  /**
   * Get all discovered agents in the network
   */
  getNetworkAgents(): Map<string, NetworkAgent> {
    return new Map(this.networkAgents)
  }

  /**
   * Get agents by ASN
   */
  getAgentsByASN(asn: number): NetworkAgent[] {
    const agentIds = this.asnIndex.get(asn) || new Set()
    const agents: NetworkAgent[] = []

    for (const agentId of agentIds) {
      const agent = this.networkAgents.get(agentId)
      if (agent) {
        agents.push(agent)
      }
    }

    return agents
  }

  /**
   * Get discovery statistics
   */
  getDiscoveryStats() {
    const stats = {
      totalNetworkAgents: this.networkAgents.size,
      totalCapabilities: this.capabilityIndex.size,
      totalASNs: this.asnIndex.size,
      discoveryInterval: this.config.discoveryInterval || 0,
      realTimeUpdates: this.config.realTimeUpdates || false,
      pendingRequests: this.pendingRequests.size,
      healthDistribution: {
        healthy: 0,
        degraded: 0,
        unhealthy: 0,
        unknown: 0,
      },
      asPathLengths: new Map<number, number>(),
    }

    for (const agent of this.networkAgents.values()) {
      // Health distribution
      const health = agent.agent.healthStatus || 'unknown'
      stats.healthDistribution[health]++

      // AS path length distribution
      const pathLength = agent.asPath.length
      stats.asPathLengths.set(
        pathLength,
        (stats.asPathLengths.get(pathLength) || 0) + 1,
      )
    }

    return {
      ...stats,
      asPathLengths: Object.fromEntries(stats.asPathLengths),
    }
  }

  /**
   * Shutdown the discovery manager
   */
  async shutdown(): Promise<void> {
    logger.log('BGP: Shutting down real-time discovery manager')

    // Stop the discovery timer
    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer)
    }

    // Clear all data
    this.networkAgents.clear()
    this.capabilityIndex.clear()
    this.asnIndex.clear()
    this.pendingRequests.clear()

    this.emit('shutdown')
  }

  // Helper methods

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

  private extractMetadataFromPathAttributes(
    pathAttributes: Map<string, unknown>,
  ): Record<string, unknown> {
    const metadata: Record<string, unknown> = {}

    if (pathAttributes.has('agent-version')) {
      metadata.version = pathAttributes.get('agent-version')
    }

    if (pathAttributes.has('agent-description')) {
      metadata.description = pathAttributes.get('agent-description')
    }

    if (pathAttributes.has('agent-metadata')) {
      const agentMetadata = pathAttributes.get('agent-metadata')
      if (typeof agentMetadata === 'object' && agentMetadata !== null) {
        Object.assign(metadata, agentMetadata)
      }
    }

    return metadata
  }

  private meetsHealthThreshold(
    health?: 'healthy' | 'degraded' | 'unhealthy',
  ): boolean {
    if (!health) return true

    const healthLevels = { healthy: 3, degraded: 2, unhealthy: 1 }
    const threshold = healthLevels[this.config.healthThreshold || 'degraded']
    const agentLevel = healthLevels[health]

    return agentLevel >= threshold
  }

  private hasRequiredCapabilities(capabilities: string[]): boolean {
    if (
      !this.config.capabilityFilters ||
      this.config.capabilityFilters.length === 0
    ) {
      return true
    }

    return this.config.capabilityFilters.some((filter) =>
      capabilities.some((cap) =>
        cap.toLowerCase().includes(filter.toLowerCase()),
      ),
    )
  }

  private meetsHealthFilter(
    health?: 'healthy' | 'degraded' | 'unhealthy',
    filter?: 'healthy' | 'degraded' | 'unhealthy',
  ): boolean {
    if (!filter || !health) return true

    const healthLevels = { healthy: 3, degraded: 2, unhealthy: 1 }
    const filterLevel = healthLevels[filter]
    const agentLevel = healthLevels[health]

    return agentLevel >= filterLevel
  }

  private isAgentUpdate(
    existing: NetworkAgent,
    updated: NetworkAgent,
  ): boolean {
    // Check if capabilities changed
    const existingCaps = existing.agent.capabilities.sort().join(',')
    const updatedCaps = updated.agent.capabilities.sort().join(',')

    if (existingCaps !== updatedCaps) return true

    // Check if health status changed
    if (existing.agent.healthStatus !== updated.agent.healthStatus) return true

    // Check if routing metrics changed significantly
    const existingMetrics = existing.routingMetrics
    const updatedMetrics = updated.routingMetrics

    if (
      existingMetrics.localPref !== updatedMetrics.localPref ||
      existingMetrics.med !== updatedMetrics.med ||
      existingMetrics.pathLength !== updatedMetrics.pathLength
    ) {
      return true
    }

    return false
  }

  private updateIndices(agent: NetworkAgent): void {
    const agentId = agent.agent.agentId

    // Update capability index
    for (const capability of agent.agent.capabilities) {
      const lowerCap = capability.toLowerCase()
      if (!this.capabilityIndex.has(lowerCap)) {
        this.capabilityIndex.set(lowerCap, new Set())
      }
      this.capabilityIndex.get(lowerCap)!.add(agentId)
    }

    // Update ASN index
    if (!this.asnIndex.has(agent.sourceASN)) {
      this.asnIndex.set(agent.sourceASN, new Set())
    }
    this.asnIndex.get(agent.sourceASN)!.add(agentId)
  }

  private removeFromIndices(agent: NetworkAgent): void {
    const agentId = agent.agent.agentId

    // Remove from capability index
    for (const capability of agent.agent.capabilities) {
      const lowerCap = capability.toLowerCase()
      const capabilitySet = this.capabilityIndex.get(lowerCap)
      if (capabilitySet) {
        capabilitySet.delete(agentId)
        if (capabilitySet.size === 0) {
          this.capabilityIndex.delete(lowerCap)
        }
      }
    }

    // Remove from ASN index
    const asnSet = this.asnIndex.get(agent.sourceASN)
    if (asnSet) {
      asnSet.delete(agentId)
      if (asnSet.size === 0) {
        this.asnIndex.delete(agent.sourceASN)
      }
    }
  }

  private sortAgentsByPreference(agents: NetworkAgent[]): NetworkAgent[] {
    return agents.sort((a, b) => {
      // Primary: Local preference (higher is better)
      if (a.routingMetrics.localPref !== b.routingMetrics.localPref) {
        return b.routingMetrics.localPref - a.routingMetrics.localPref
      }

      // Secondary: AS path length (shorter is better)
      if (a.routingMetrics.pathLength !== b.routingMetrics.pathLength) {
        return a.routingMetrics.pathLength - b.routingMetrics.pathLength
      }

      // Tertiary: MED (lower is better)
      if (a.routingMetrics.med !== b.routingMetrics.med) {
        return a.routingMetrics.med - b.routingMetrics.med
      }

      // Quaternary: Last updated (more recent is better)
      return b.lastUpdated.getTime() - a.lastUpdated.getTime()
    })
  }

  private emitDiscoveryEvent(
    type:
      | 'agentDiscovered'
      | 'agentLost'
      | 'capabilityChanged'
      | 'healthChanged',
    agent: NetworkAgent,
  ): void {
    const event: DiscoveryEvent = {
      type,
      agent,
      timestamp: new Date(),
      sourceASN: agent.sourceASN,
    }

    this.emit('discoveryEvent', event)
    this.emit(type, agent)

    if (this.config.realTimeUpdates) {
      this.emit('realTimeUpdate', event)
    }
  }
}
