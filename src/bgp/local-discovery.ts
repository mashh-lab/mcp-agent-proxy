// Local Agent Discovery Bridge
// Discovers agents from local Mastra servers and registers them with BGP advertisement

import { EventEmitter } from 'events'
import { MastraClient } from '@mastra/client-js'
import { logger } from '../config.js'
import {
  AgentAdvertisementManager,
  AgentRegistration,
} from './advertisement.js'

export interface LocalDiscoveryConfig {
  localASN: number
  routerId: string
  mastraServers: string[]
  discoveryInterval?: number // How often to rediscover (default: 30s)
  healthCheckInterval?: number // How often to health check (default: 60s)
}

export interface LocalAgent {
  agentId: string
  serverUrl: string
  capabilities: string[]
  lastSeen: Date
  healthStatus: 'healthy' | 'degraded' | 'unhealthy'
}

/**
 * Local Agent Discovery Manager
 * Bridges MCP agent discovery from Mastra servers to BGP advertisement
 */
export class LocalAgentDiscovery extends EventEmitter {
  private config: LocalDiscoveryConfig
  private advertisementManager: AgentAdvertisementManager
  private discoveryTimer?: NodeJS.Timeout
  private healthCheckTimer?: NodeJS.Timeout
  private lastKnownAgents = new Map<string, LocalAgent>()

  constructor(
    advertisementManager: AgentAdvertisementManager,
    config: LocalDiscoveryConfig,
  ) {
    super()
    this.advertisementManager = advertisementManager
    this.config = {
      discoveryInterval: 30 * 1000, // 30 seconds
      healthCheckInterval: 60 * 1000, // 60 seconds
      ...config,
    }

    logger.log(
      `BGP: Local agent discovery initialized for AS${config.localASN} (${config.mastraServers.length} servers)`,
    )
  }

  /**
   * Start local agent discovery
   */
  async start(): Promise<void> {
    // Initial discovery
    await this.performDiscovery()

    // Start periodic discovery
    if (this.config.discoveryInterval && this.config.discoveryInterval > 0) {
      this.discoveryTimer = setInterval(async () => {
        await this.performDiscovery()
      }, this.config.discoveryInterval)
    }

    // Start health checking
    if (
      this.config.healthCheckInterval &&
      this.config.healthCheckInterval > 0
    ) {
      this.healthCheckTimer = setInterval(async () => {
        await this.performHealthCheck()
      }, this.config.healthCheckInterval)
    }
  }

  /**
   * Stop local agent discovery
   */
  async stop(): Promise<void> {
    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer)
      this.discoveryTimer = undefined
    }

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = undefined
    }

    // Unregister all discovered agents
    for (const agentId of this.lastKnownAgents.keys()) {
      await this.advertisementManager.unregisterAgent(agentId)
    }

    this.lastKnownAgents.clear()
  }

  /**
   * Perform agent discovery from all Mastra servers
   */
  private async performDiscovery(): Promise<void> {
    const discoveredAgents = new Map<string, LocalAgent>()

    for (const serverUrl of this.config.mastraServers) {
      try {
        const agents = await this.discoverAgentsFromServer(serverUrl)
        for (const agent of agents) {
          discoveredAgents.set(agent.agentId, agent)
        }
      } catch (error) {
        logger.log(
          `BGP: Failed to discover agents from ${serverUrl}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
      }
    }

    // Compare with last known agents
    const added: LocalAgent[] = []
    const removed: string[] = []
    const updated: LocalAgent[] = []

    // Find new and updated agents
    for (const [agentId, agent] of discoveredAgents.entries()) {
      const lastKnown = this.lastKnownAgents.get(agentId)
      if (!lastKnown) {
        added.push(agent)
      } else if (this.hasAgentChanged(lastKnown, agent)) {
        updated.push(agent)
      }
    }

    // Find removed agents
    for (const agentId of this.lastKnownAgents.keys()) {
      if (!discoveredAgents.has(agentId)) {
        removed.push(agentId)
      }
    }

    // Update our state
    this.lastKnownAgents = discoveredAgents

    // Process changes
    await this.processAgentChanges(added, removed, updated)

    // Log summary
    if (added.length > 0 || removed.length > 0 || updated.length > 0) {
      logger.log(
        `BGP: Local discovery complete - Added: ${added.length}, Removed: ${removed.length}, Updated: ${updated.length}`,
      )
    }

    this.emit('discoveryComplete', {
      totalAgents: discoveredAgents.size,
      added: added.length,
      removed: removed.length,
      updated: updated.length,
    })
  }

  /**
   * Discover agents from a specific Mastra server
   */
  private async discoverAgentsFromServer(
    serverUrl: string,
  ): Promise<LocalAgent[]> {
    const agents: LocalAgent[] = []

    try {
      const client = new MastraClient({ baseUrl: serverUrl })
      const agentsData = await client.getAgents()

      for (const [agentId, agentData] of Object.entries(agentsData)) {
        const agent: LocalAgent = {
          agentId,
          serverUrl,
          capabilities: this.extractCapabilities(agentData),
          lastSeen: new Date(),
          healthStatus: 'healthy', // Default to healthy for newly discovered agents
        }
        agents.push(agent)
      }
    } catch (error) {
      // Re-throw to be handled by caller
      throw error
    }

    return agents
  }

  /**
   * Extract capabilities from Mastra agent data
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractCapabilities(agentData: any): string[] {
    // Default capabilities based on agent type/name
    const capabilities: string[] = []

    if (agentData.name) {
      const name = agentData.name.toLowerCase()

      // Extract capabilities from agent name patterns
      if (name.includes('weather')) capabilities.push('weather', 'forecast')
      if (name.includes('conversation'))
        capabilities.push('conversation', 'chat')
      if (name.includes('sarcastic')) capabilities.push('humor', 'sarcasm')
      if (name.includes('surfer')) capabilities.push('casual', 'slang')
      if (name.includes('coding') || name.includes('code'))
        capabilities.push('programming', 'development')
      if (name.includes('search')) capabilities.push('search', 'query')
      if (name.includes('analysis')) capabilities.push('analysis', 'data')
    }

    // If no specific capabilities found, add generic ones
    if (capabilities.length === 0) {
      capabilities.push('general', 'assistant')
    }

    return capabilities
  }

  /**
   * Check if agent has changed since last discovery
   */
  private hasAgentChanged(lastKnown: LocalAgent, current: LocalAgent): boolean {
    // Check if capabilities changed
    const lastCapabilities = lastKnown.capabilities.sort().join(',')
    const currentCapabilities = current.capabilities.sort().join(',')

    if (lastCapabilities !== currentCapabilities) {
      return true
    }

    // Check if server URL changed
    if (lastKnown.serverUrl !== current.serverUrl) {
      return true
    }

    return false
  }

  /**
   * Process agent changes by updating BGP advertisement
   */
  private async processAgentChanges(
    added: LocalAgent[],
    removed: string[],
    updated: LocalAgent[],
  ): Promise<void> {
    // Register new agents
    for (const agent of added) {
      try {
        const registration: AgentRegistration = {
          agentId: agent.agentId,
          capabilities: agent.capabilities,
          localPref: 100, // Default local preference
          metadata: {
            serverUrl: agent.serverUrl,
            discoveredAt: agent.lastSeen.toISOString(),
            healthStatus: agent.healthStatus,
          },
        }

        await this.advertisementManager.registerAgent(registration)
      } catch (error) {
        logger.log(
          `BGP: Failed to register agent ${agent.agentId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
      }
    }

    // Unregister removed agents
    for (const agentId of removed) {
      try {
        await this.advertisementManager.unregisterAgent(agentId)
      } catch (error) {
        logger.log(
          `BGP: Failed to unregister agent ${agentId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
      }
    }

    // Update changed agents
    for (const agent of updated) {
      try {
        await this.advertisementManager.updateAgent(agent.agentId, {
          capabilities: agent.capabilities,
          lastSeen: agent.lastSeen,
          healthStatus: agent.healthStatus,
          metadata: {
            serverUrl: agent.serverUrl,
            lastUpdated: new Date().toISOString(),
          },
        })
      } catch (error) {
        logger.log(
          `BGP: Failed to update agent ${agent.agentId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
      }
    }
  }

  /**
   * Perform health check on discovered agents
   */
  private async performHealthCheck(): Promise<void> {
    const healthyAgents = 0
    const degradedAgents = 0
    const unhealthyAgents = 0

    for (const [agentId, agent] of this.lastKnownAgents.entries()) {
      try {
        // Simple health check - try to connect to the server
        const client = new MastraClient({ baseUrl: agent.serverUrl })
        await client.getAgents() // Basic connectivity test

        // Update health status if it changed
        if (agent.healthStatus !== 'healthy') {
          agent.healthStatus = 'healthy'
          await this.advertisementManager.updateAgent(agentId, {
            healthStatus: 'healthy',
            lastSeen: new Date(),
          })
        }
      } catch {
        // Mark as degraded or unhealthy based on error type
        const newStatus = 'degraded' // Could be more sophisticated
        if (agent.healthStatus !== newStatus) {
          agent.healthStatus = newStatus
          await this.advertisementManager.updateAgent(agentId, {
            healthStatus: newStatus,
            lastSeen: new Date(),
          })
          logger.log(
            `BGP: Agent ${agentId} health status changed to ${newStatus}`,
          )
        }
      }
    }

    this.emit('healthCheckComplete', {
      totalAgents: this.lastKnownAgents.size,
      healthyAgents,
      degradedAgents,
      unhealthyAgents,
    })
  }

  /**
   * Get all discovered agents
   */
  getDiscoveredAgents(): Map<string, LocalAgent> {
    return new Map(this.lastKnownAgents)
  }

  /**
   * Get discovery statistics
   */
  getDiscoveryStats() {
    const stats = {
      totalAgents: this.lastKnownAgents.size,
      serversConfigured: this.config.mastraServers.length,
      discoveryInterval: this.config.discoveryInterval || 0,
      healthCheckInterval: this.config.healthCheckInterval || 0,
      healthDistribution: {
        healthy: 0,
        degraded: 0,
        unhealthy: 0,
      },
      capabilityDistribution: new Map<string, number>(),
    }

    for (const agent of this.lastKnownAgents.values()) {
      // Health distribution
      stats.healthDistribution[agent.healthStatus]++

      // Capability distribution
      for (const capability of agent.capabilities) {
        stats.capabilityDistribution.set(
          capability,
          (stats.capabilityDistribution.get(capability) || 0) + 1,
        )
      }
    }

    return {
      ...stats,
      capabilityDistribution: Object.fromEntries(stats.capabilityDistribution),
    }
  }
}
