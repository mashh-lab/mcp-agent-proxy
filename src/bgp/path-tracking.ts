// BGP AS Path Tracking for Agent Discovery
// Implements path vector protocol for loop-free agent routing

import { AgentRoute, ServerConfig, BGP_DEFAULTS } from './types.js'
import { MastraClient } from '@mastra/client-js'
import { getRetryConfig, logger } from '../config.js'

/**
 * BGP-aware agent discovery with AS path tracking
 * Prevents routing loops and enables intelligent path selection
 */
export class AgentPathTracker {
  constructor(
    private localASN: number,
    private servers: ServerConfig[],
  ) {}

  /**
   * Discover agents with BGP path vector tracking
   * Returns routes that include full AS path information for loop prevention
   */
  async discoverAgentWithPath(
    agentId: string,
    currentASPath: number[] = [],
  ): Promise<AgentRoute[]> {
    const foundRoutes: AgentRoute[] = []
    const retryConfig = getRetryConfig()

    // Start with our AS in the path if this is the first hop
    const asPath = currentASPath.length === 0 ? [this.localASN] : currentASPath

    for (const server of this.servers) {
      // BGP loop prevention: Skip if this server's AS is already in our path
      if (asPath.includes(server.asn)) {
        logger.log(
          `BGP: Skipping ${server.name} (AS${server.asn}) - loop detected in path [${asPath.join(' → ')}]`,
        )
        continue
      }

      // BGP path length protection: Prevent excessively long paths
      if (asPath.length >= BGP_DEFAULTS.MAX_AS_PATH_LENGTH) {
        logger.log(
          `BGP: Skipping ${server.name} - AS path too long (${asPath.length} hops)`,
        )
        continue
      }

      try {
        const clientConfig = {
          baseUrl: server.url,
          retries: retryConfig.discovery.retries,
          backoffMs: retryConfig.discovery.backoffMs,
          maxBackoffMs: retryConfig.discovery.maxBackoffMs,
        }

        const mastraClient = new MastraClient(clientConfig)
        const agentsData = await mastraClient.getAgents()

        // Check if this server has our target agent
        if (agentsData && Object.keys(agentsData).includes(agentId)) {
          const agentData = agentsData[agentId]

          // Create BGP-style route with complete AS path
          const route: AgentRoute = {
            agentId,
            capabilities: this.extractCapabilities(agentData),
            asPath: [...asPath, server.asn], // Add this server's AS to path
            nextHop: server.url,
            localPref: this.calculateLocalPref(server, agentData),
            med: this.calculateMED(agentData),
            communities: this.extractCommunities(server, agentData),
            originTime: new Date(),
            pathAttributes: new Map<string, unknown>([
              ['server_name', server.name],
              ['server_region', server.region || 'unknown'],
              ['server_priority', server.priority || 100],
              ['discovery_method', 'bgp_path_vector'],
            ]),
          }

          foundRoutes.push(route)

          logger.log(
            `BGP: Found agent ${agentId} on ${server.name} (AS${server.asn}) ` +
              `with path [${route.asPath.join(' → ')}]`,
          )
        }
      } catch (error) {
        logger.log(
          `BGP: Failed to query ${server.name} (AS${server.asn}): ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
        continue
      }
    }

    return foundRoutes
  }

  /**
   * Discover all agents across the network with path tracking
   * Returns a map of agentId -> routes with AS path information
   */
  async discoverAllAgentsWithPaths(): Promise<Map<string, AgentRoute[]>> {
    const allRoutes = new Map<string, AgentRoute[]>()
    const retryConfig = getRetryConfig()

    for (const server of this.servers) {
      try {
        const clientConfig = {
          baseUrl: server.url,
          retries: retryConfig.listing.retries,
          backoffMs: retryConfig.listing.backoffMs,
          maxBackoffMs: retryConfig.listing.maxBackoffMs,
        }

        const mastraClient = new MastraClient(clientConfig)
        const agentsData = await mastraClient.getAgents()

        // Create routes for all agents on this server
        for (const [agentId, agentData] of Object.entries(agentsData)) {
          const route: AgentRoute = {
            agentId,
            capabilities: this.extractCapabilities(agentData),
            asPath: [this.localASN, server.asn], // Simple 2-hop path for discovery
            nextHop: server.url,
            localPref: this.calculateLocalPref(server, agentData),
            med: this.calculateMED(agentData),
            communities: this.extractCommunities(server, agentData),
            originTime: new Date(),
            pathAttributes: new Map<string, unknown>([
              ['server_name', server.name],
              ['server_region', server.region || 'unknown'],
              ['discovery_method', 'bgp_full_discovery'],
            ]),
          }

          // Add route to the map
          if (!allRoutes.has(agentId)) {
            allRoutes.set(agentId, [])
          }
          allRoutes.get(agentId)!.push(route)
        }

        logger.log(
          `BGP: Discovered ${Object.keys(agentsData).length} agents on ${server.name} (AS${server.asn})`,
        )
      } catch (error) {
        logger.log(
          `BGP: Failed to discover agents on ${server.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
        continue
      }
    }

    return allRoutes
  }

  /**
   * Extract agent capabilities from Mastra agent data
   */
  private extractCapabilities(agentData: unknown): string[] {
    // Handle different agent data formats
    const data = agentData as Record<string, unknown>

    // Try to extract from explicit capabilities field
    if (data.capabilities && Array.isArray(data.capabilities)) {
      return data.capabilities.filter(
        (cap) => typeof cap === 'string',
      ) as string[]
    }

    // Infer capabilities from agent name/type
    const capabilities: string[] = ['general'] // Default capability

    if (data.name && typeof data.name === 'string') {
      const name = data.name.toLowerCase()

      if (
        name.includes('cod') ||
        name.includes('dev') ||
        name.includes('program')
      ) {
        capabilities.push('coding', 'development', 'debugging')
      }
      if (name.includes('weather') || name.includes('forecast')) {
        capabilities.push('weather', 'forecasting', 'meteorology')
      }
      if (
        name.includes('analy') ||
        name.includes('data') ||
        name.includes('insight')
      ) {
        capabilities.push('analysis', 'data-processing', 'insights')
      }
      if (
        name.includes('write') ||
        name.includes('content') ||
        name.includes('blog')
      ) {
        capabilities.push('writing', 'content-creation', 'editing')
      }
    }

    // Add type-based capabilities
    if (data.type && typeof data.type === 'string') {
      capabilities.push(`type:${data.type}`)
    }

    return [...new Set(capabilities)] // Remove duplicates
  }

  /**
   * Calculate BGP local preference based on server and agent characteristics
   */
  private calculateLocalPref(server: ServerConfig, agentData: unknown): number {
    let localPref = BGP_DEFAULTS.LOCAL_PREF // Start with default (100)

    // Prefer higher priority servers
    if (server.priority) {
      localPref += Math.max(0, server.priority - 100) // Bonus for high priority
    }

    // Prefer local region servers
    if (server.region === 'local' || server.region === 'primary') {
      localPref += 50
    }

    // Agent-specific preferences
    const data = agentData as Record<string, unknown>
    if (data.performanceRating && typeof data.performanceRating === 'number') {
      localPref += Math.floor(data.performanceRating * 10)
    }

    return Math.min(localPref, 999) // Cap at 999
  }

  /**
   * Calculate BGP MED (Multi-Exit Discriminator) based on agent performance
   */
  private calculateMED(agentData: unknown): number {
    let med = BGP_DEFAULTS.MED // Start with default (0)

    const data = agentData as Record<string, unknown>

    // Add latency penalty
    if (data.responseTime && typeof data.responseTime === 'number') {
      med += Math.floor(data.responseTime / 10) // 10ms = 1 MED point
    }

    // Add queue depth penalty
    if (data.queueDepth && typeof data.queueDepth === 'number') {
      med += data.queueDepth * 5 // Each queued request = 5 MED points
    }

    // Add error rate penalty
    if (data.errorRate && typeof data.errorRate === 'number') {
      med += Math.floor(data.errorRate * 100) // 1% error rate = 1 MED point
    }

    return Math.min(med, 999) // Cap at 999
  }

  /**
   * Extract BGP communities for policy control
   */
  private extractCommunities(
    server: ServerConfig,
    agentData: unknown,
  ): string[] {
    const communities: string[] = []

    // Server-based communities
    communities.push(`server:${server.name}`)
    communities.push(`as:${server.asn}`)

    if (server.region) {
      communities.push(`region:${server.region}`)
    }

    // Agent-based communities
    const data = agentData as Record<string, unknown>

    if (data.type && typeof data.type === 'string') {
      communities.push(`agent-type:${data.type}`)
    }

    // Performance-based communities
    if (data.responseTime && typeof data.responseTime === 'number') {
      if (data.responseTime < 100) {
        communities.push('performance:fast')
      } else if (data.responseTime > 1000) {
        communities.push('performance:slow')
      } else {
        communities.push('performance:medium')
      }
    }

    // Availability-based communities
    if (data.availability && typeof data.availability === 'number') {
      if (data.availability > 0.99) {
        communities.push('availability:high')
      } else if (data.availability > 0.95) {
        communities.push('availability:medium')
      } else {
        communities.push('availability:low')
      }
    }

    return communities
  }

  /**
   * Validate AS path for loops and maximum length
   */
  static validateASPath(asPath: number[]): {
    valid: boolean
    issues: string[]
  } {
    const issues: string[] = []

    // Check for loops
    const uniqueASes = new Set(asPath)
    if (asPath.length !== uniqueASes.size) {
      issues.push(`AS path contains loop: [${asPath.join(' → ')}]`)
    }

    // Check maximum length
    if (asPath.length > BGP_DEFAULTS.MAX_AS_PATH_LENGTH) {
      issues.push(
        `AS path too long: ${asPath.length} > ${BGP_DEFAULTS.MAX_AS_PATH_LENGTH}`,
      )
    }

    // Check for empty path
    if (asPath.length === 0) {
      issues.push('AS path cannot be empty')
    }

    return {
      valid: issues.length === 0,
      issues,
    }
  }

  /**
   * Get path distance between two AS numbers
   */
  static getPathDistance(
    fromAS: number,
    toAS: number,
    asPath: number[],
  ): number {
    const fromIndex = asPath.indexOf(fromAS)
    const toIndex = asPath.indexOf(toAS)

    if (fromIndex === -1 || toIndex === -1) {
      return -1 // Not found in path
    }

    return Math.abs(toIndex - fromIndex)
  }

  /**
   * Check if AS path contains specific AS numbers
   */
  static pathContainsASes(asPath: number[], targetASes: number[]): boolean {
    return targetASes.every((asn) => asPath.includes(asn))
  }
}
