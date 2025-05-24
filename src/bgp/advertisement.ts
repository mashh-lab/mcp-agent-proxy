// Agent Advertisement System for BGP Networks
// Enables dynamic agent discovery and capability broadcasting

import { EventEmitter } from 'events'
import { BGPSession } from './session.js'
import { BGPUpdate, AgentRoute } from './types.js'
import { logger } from '../config.js'

export interface AgentCapabilities {
  agentId: string
  capabilities: string[]
  version?: string
  description?: string
  metadata?: Record<string, unknown>
  healthStatus?: 'healthy' | 'degraded' | 'unhealthy'
  lastSeen?: Date
}

export interface AdvertisementConfig {
  localASN: number
  routerId: string
  hostname?: string
  port?: number
  advertisementInterval?: number // How often to re-advertise (default: 5 minutes)
  maxRetries?: number // Max retries for failed advertisements
  localPreference?: number // Default local preference for advertised agents
}

export interface AgentRegistration {
  agentId: string
  capabilities: string[]
  localPref?: number
  metadata?: Record<string, unknown>
  autoRefresh?: boolean // Auto re-advertise periodically
}

/**
 * Agent Advertisement Manager
 * Handles dynamic agent capability broadcasting across BGP networks
 */
export class AgentAdvertisementManager extends EventEmitter {
  private bgpSession: BGPSession
  private config: AdvertisementConfig
  private localAgents = new Map<string, AgentCapabilities>()
  private advertisementTimer?: NodeJS.Timeout
  private registrationCallbacks = new Map<
    string,
    () => Promise<AgentCapabilities | null>
  >()

  constructor(bgpSession: BGPSession, config: AdvertisementConfig) {
    super()
    this.bgpSession = bgpSession
    this.config = {
      advertisementInterval: 5 * 60 * 1000, // 5 minutes
      maxRetries: 3,
      localPreference: 100,
      ...config,
    }

    this.setupEventHandlers()
    this.startAdvertisementTimer()

    logger.log(
      `BGP: Advertisement manager initialized for AS${config.localASN} (${config.routerId})`,
    )
  }

  /**
   * Setup event handlers for BGP session events
   */
  private setupEventHandlers(): void {
    // When a new BGP session is established, advertise all local agents
    this.bgpSession.on('sessionEstablished', (peerASN: number) => {
      logger.log(
        `BGP: New session established with AS${peerASN}, advertising local agents`,
      )
      this.advertiseAllAgentsToPeer(peerASN)
    })

    // Handle route exchange events
    this.bgpSession.on('routeExchangeStarted', (peerASN: number) => {
      logger.log(`BGP: Route exchange started with AS${peerASN}`)
      this.advertiseAllAgentsToPeer(peerASN)
    })

    // Handle peer removal
    this.bgpSession.on('peerRemoved', (peerASN: number) => {
      logger.log(
        `BGP: Peer AS${peerASN} removed, no longer advertising to them`,
      )
    })
  }

  /**
   * Register a local agent for advertisement
   */
  async registerAgent(registration: AgentRegistration): Promise<void> {
    const agentCapabilities: AgentCapabilities = {
      agentId: registration.agentId,
      capabilities: registration.capabilities,
      healthStatus: 'healthy',
      lastSeen: new Date(),
      metadata: registration.metadata,
    }

    this.localAgents.set(registration.agentId, agentCapabilities)

    logger.log(
      `BGP: Registered agent ${registration.agentId} with capabilities: [${registration.capabilities.join(', ')}]`,
    )

    // Immediately advertise to all established peers
    await this.advertiseAgent(registration.agentId, registration.localPref)

    this.emit('agentRegistered', registration.agentId, agentCapabilities)
  }

  /**
   * Register a callback for dynamic agent discovery
   * This allows for external systems to provide agent information on-demand
   */
  registerAgentCallback(
    agentId: string,
    callback: () => Promise<AgentCapabilities | null>,
  ): void {
    this.registrationCallbacks.set(agentId, callback)
    logger.log(`BGP: Registered dynamic callback for agent ${agentId}`)
  }

  /**
   * Unregister an agent (withdraw from network)
   */
  async unregisterAgent(agentId: string): Promise<void> {
    const agent = this.localAgents.get(agentId)
    if (!agent) {
      logger.log(`BGP: Agent ${agentId} not found for unregistration`)
      return
    }

    // Withdraw the agent from all peers
    await this.withdrawAgent(agentId)

    this.localAgents.delete(agentId)
    this.registrationCallbacks.delete(agentId)

    logger.log(`BGP: Unregistered agent ${agentId}`)
    this.emit('agentUnregistered', agentId)
  }

  /**
   * Update agent capabilities
   */
  async updateAgent(
    agentId: string,
    updates: Partial<AgentCapabilities>,
  ): Promise<void> {
    const agent = this.localAgents.get(agentId)
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`)
    }

    // Update agent information
    const updatedAgent: AgentCapabilities = {
      ...agent,
      ...updates,
      lastSeen: new Date(),
    }

    this.localAgents.set(agentId, updatedAgent)

    // Re-advertise if capabilities changed
    if (updates.capabilities || updates.healthStatus) {
      await this.advertiseAgent(agentId)
      logger.log(`BGP: Updated and re-advertised agent ${agentId}`)
    }

    this.emit('agentUpdated', agentId, updatedAgent)
  }

  /**
   * Advertise a specific agent to all established peers
   */
  private async advertiseAgent(
    agentId: string,
    localPref?: number,
  ): Promise<void> {
    const agent = this.localAgents.get(agentId)
    if (!agent) {
      logger.log(`BGP: Cannot advertise unknown agent ${agentId}`)
      return
    }

    const route: AgentRoute = {
      agentId: agent.agentId,
      capabilities: agent.capabilities,
      asPath: [this.config.localASN],
      nextHop: `http://${this.config.hostname || 'localhost'}:${this.config.port || 8080}`,
      localPref: localPref || this.config.localPreference || 100,
      med: this.calculateMED(agent),
      communities: this.generateCommunities(agent),
      originTime: new Date(),
      pathAttributes: this.generatePathAttributes(agent),
    }

    const update: BGPUpdate = {
      type: 'UPDATE',
      timestamp: new Date(),
      senderASN: this.config.localASN,
      advertisedRoutes: [route],
    }

    // Advertise to all established peers
    const peers = this.bgpSession.getPeers()
    const advertisedTo: number[] = []
    let failedAdvertisements = 0

    for (const peer of peers.values()) {
      try {
        await this.bgpSession.sendUpdate(peer.asn, update)
        advertisedTo.push(peer.asn)
      } catch (error) {
        failedAdvertisements++
        logger.log(
          `BGP: Failed to advertise ${agentId} to AS${peer.asn}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
      }
    }

    if (advertisedTo.length > 0) {
      logger.log(
        `BGP: Advertised agent ${agentId} to ${advertisedTo.length} peers: [${advertisedTo.join(', ')}]`,
      )
    }

    if (failedAdvertisements > 0) {
      logger.log(
        `BGP: Failed to advertise ${agentId} to ${failedAdvertisements} peers`,
      )
    }

    this.emit('agentAdvertised', agentId, advertisedTo, failedAdvertisements)
  }

  /**
   * Advertise all local agents to a specific peer
   */
  private async advertiseAllAgentsToPeer(peerASN: number): Promise<void> {
    if (this.localAgents.size === 0) {
      logger.log(`BGP: No local agents to advertise to AS${peerASN}`)
      return
    }

    const routes: AgentRoute[] = []

    // Create routes for all local agents
    for (const agent of this.localAgents.values()) {
      const route: AgentRoute = {
        agentId: agent.agentId,
        capabilities: agent.capabilities,
        asPath: [this.config.localASN],
        nextHop: `http://${this.config.hostname || 'localhost'}:${this.config.port || 8080}`,
        localPref: this.config.localPreference || 100,
        med: this.calculateMED(agent),
        communities: this.generateCommunities(agent),
        originTime: new Date(),
        pathAttributes: this.generatePathAttributes(agent),
      }
      routes.push(route)
    }

    const update: BGPUpdate = {
      type: 'UPDATE',
      timestamp: new Date(),
      senderASN: this.config.localASN,
      advertisedRoutes: routes,
    }

    try {
      await this.bgpSession.sendUpdate(peerASN, update)
      logger.log(`BGP: Advertised ${routes.length} agents to AS${peerASN}`)
    } catch (error) {
      logger.log(
        `BGP: Failed to advertise agents to AS${peerASN}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  /**
   * Withdraw an agent from all peers
   */
  private async withdrawAgent(agentId: string): Promise<void> {
    const update: BGPUpdate = {
      type: 'UPDATE',
      timestamp: new Date(),
      senderASN: this.config.localASN,
      withdrawnRoutes: [agentId],
    }

    const peers = this.bgpSession.getPeers()
    const withdrawnFrom: number[] = []

    for (const peer of peers.values()) {
      try {
        await this.bgpSession.sendUpdate(peer.asn, update)
        withdrawnFrom.push(peer.asn)
      } catch (error) {
        logger.log(
          `BGP: Failed to withdraw ${agentId} from AS${peer.asn}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
      }
    }

    if (withdrawnFrom.length > 0) {
      logger.log(
        `BGP: Withdrew agent ${agentId} from ${withdrawnFrom.length} peers: [${withdrawnFrom.join(', ')}]`,
      )
    }

    this.emit('agentWithdrawn', agentId, withdrawnFrom)
  }

  /**
   * Calculate MED (Multi-Exit Discriminator) based on agent health and performance
   */
  private calculateMED(agent: AgentCapabilities): number {
    let med = 0

    // Lower MED = higher preference
    switch (agent.healthStatus) {
      case 'healthy':
        med = 0
        break
      case 'degraded':
        med = 50
        break
      case 'unhealthy':
        med = 100
        break
      default:
        med = 25
    }

    // Adjust based on how recently we've seen the agent
    const timeSinceLastSeen = agent.lastSeen
      ? Date.now() - agent.lastSeen.getTime()
      : 0

    if (timeSinceLastSeen > 60000) {
      // More than 1 minute
      med += Math.min(50, Math.floor(timeSinceLastSeen / 60000))
    }

    return med
  }

  /**
   * Generate BGP communities for agent categorization
   */
  private generateCommunities(agent: AgentCapabilities): string[] {
    const communities: string[] = []

    // Add capability-based communities
    for (const capability of agent.capabilities) {
      communities.push(`capability:${capability.toLowerCase()}`)
    }

    // Add health-based community
    if (agent.healthStatus) {
      communities.push(`health:${agent.healthStatus}`)
    }

    // Add AS-specific community
    communities.push(`as:${this.config.localASN}`)

    return communities
  }

  /**
   * Generate BGP path attributes with agent metadata
   */
  private generatePathAttributes(
    agent: AgentCapabilities,
  ): Map<string, unknown> {
    const attributes = new Map<string, unknown>()

    if (agent.version) {
      attributes.set('agent-version', agent.version)
    }

    if (agent.description) {
      attributes.set('agent-description', agent.description)
    }

    if (agent.metadata) {
      attributes.set('agent-metadata', agent.metadata)
    }

    attributes.set('advertisement-time', new Date().toISOString())
    attributes.set('advertiser-asn', this.config.localASN)

    return attributes
  }

  /**
   * Start the periodic advertisement timer
   */
  private startAdvertisementTimer(): void {
    if (
      this.config.advertisementInterval &&
      this.config.advertisementInterval > 0
    ) {
      this.advertisementTimer = setInterval(async () => {
        await this.refreshAllAdvertisements()
      }, this.config.advertisementInterval)

      logger.log(
        `BGP: Started advertisement timer (interval: ${this.config.advertisementInterval / 1000}s)`,
      )
    }
  }

  /**
   * Refresh all agent advertisements
   */
  private async refreshAllAdvertisements(): Promise<void> {
    if (this.localAgents.size === 0) return

    logger.log(
      `BGP: Refreshing advertisements for ${this.localAgents.size} agents`,
    )

    // Update agent information from callbacks
    for (const [agentId, callback] of this.registrationCallbacks.entries()) {
      try {
        const updatedAgent = await callback()
        if (updatedAgent) {
          this.localAgents.set(agentId, updatedAgent)
        } else {
          // Agent no longer available, unregister it
          await this.unregisterAgent(agentId)
        }
      } catch (error) {
        logger.log(
          `BGP: Failed to refresh agent ${agentId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
      }
    }

    // Re-advertise all agents
    for (const agentId of this.localAgents.keys()) {
      await this.advertiseAgent(agentId)
    }

    this.emit('advertisementsRefreshed', this.localAgents.size)
  }

  /**
   * Get all local agents
   */
  getLocalAgents(): Map<string, AgentCapabilities> {
    return new Map(this.localAgents)
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): AgentCapabilities | undefined {
    return this.localAgents.get(agentId)
  }

  /**
   * Get agents by capability
   */
  getAgentsByCapability(capability: string): AgentCapabilities[] {
    const agents: AgentCapabilities[] = []
    for (const agent of this.localAgents.values()) {
      if (
        agent.capabilities.some((cap) =>
          cap.toLowerCase().includes(capability.toLowerCase()),
        )
      ) {
        agents.push(agent)
      }
    }
    return agents
  }

  /**
   * Get advertisement statistics
   */
  getAdvertisementStats() {
    const stats = {
      totalLocalAgents: this.localAgents.size,
      totalCallbacks: this.registrationCallbacks.size,
      advertisementInterval: this.config.advertisementInterval || 0,
      healthyAgents: 0,
      degradedAgents: 0,
      unhealthyAgents: 0,
      capabilities: new Set<string>(),
    }

    for (const agent of this.localAgents.values()) {
      switch (agent.healthStatus) {
        case 'healthy':
          stats.healthyAgents++
          break
        case 'degraded':
          stats.degradedAgents++
          break
        case 'unhealthy':
          stats.unhealthyAgents++
          break
      }

      for (const capability of agent.capabilities) {
        stats.capabilities.add(capability)
      }
    }

    return {
      ...stats,
      capabilities: Array.from(stats.capabilities),
    }
  }

  /**
   * Shutdown the advertisement manager
   */
  async shutdown(): Promise<void> {
    logger.log('BGP: Shutting down advertisement manager')

    // Stop the advertisement timer
    if (this.advertisementTimer) {
      clearInterval(this.advertisementTimer)
    }

    // Withdraw all agents
    for (const agentId of this.localAgents.keys()) {
      await this.withdrawAgent(agentId)
    }

    // Clear all data
    this.localAgents.clear()
    this.registrationCallbacks.clear()

    this.emit('shutdown')
  }
}
