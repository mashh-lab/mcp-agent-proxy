// BGP Integration for MCP Tools
// Provides access to BGP route tables and BGP-aware agent discovery

import { AgentRoute } from '../bgp/types.js'
import { getBGPConfig, logger } from '../config.js'

// Global references to BGP infrastructure (set by main server)
let globalBGPSession: import('../bgp/session.js').BGPSession | null = null
let globalDiscoveryManager:
  | import('../bgp/discovery.js').RealTimeDiscoveryManager
  | null = null
let globalAdvertisementManager:
  | import('../bgp/advertisement.js').AgentAdvertisementManager
  | null = null

/**
 * Set BGP infrastructure references for use in MCP tools
 * Called by main server during BGP initialization
 */
export function setBGPInfrastructure(
  bgpSession: import('../bgp/session.js').BGPSession | null,
  discoveryManager:
    | import('../bgp/discovery.js').RealTimeDiscoveryManager
    | null,
  advertisementManager:
    | import('../bgp/advertisement.js').AgentAdvertisementManager
    | null,
): void {
  globalBGPSession = bgpSession
  globalDiscoveryManager = discoveryManager
  globalAdvertisementManager = advertisementManager

  // BGP infrastructure configured - no logging to avoid MCP stdio interference
}

/**
 * Get BGP infrastructure from HTTP endpoint (fallback for stdio mode)
 * This allows MCP tools to access live BGP data even when global variables aren't set
 */
async function getBGPInfrastructureFromHTTP(): Promise<{
  routes: AgentRoute[]
  networkAgents: Array<{
    agent: {
      agentId: string
      capabilities: string[]
      serverUrl: string
      healthStatus: string
    }
    sourceASN: number
    route: AgentRoute
  }>
  localAgents: Array<{
    agentId: string
    capabilities: string[]
    serverUrl: string
    healthStatus: string
  }>
  status: {
    localASN: number
    routerId: string
    peersConnected: number
    routesLearned: number
    localAgentsAdvertised: number
    networkAgentsDiscovered: number
  } | null
}> {
  try {
    const bgpConfig = getBGPConfig()
    const bgpPort = 1179 + (bgpConfig.localASN - 64512)

    // Get routes from BGP HTTP server
    const routesResponse = await fetch(`http://localhost:${bgpPort}/bgp/routes`)
    const routesData = (await routesResponse.json()) as {
      routes?: AgentRoute[]
    }
    const routes: AgentRoute[] = routesData.routes || []

    // Convert routes to network agents format
    const networkAgents = routes.map((route) => ({
      agent: {
        agentId: route.agentId,
        capabilities: route.capabilities,
        serverUrl: route.nextHop,
        healthStatus:
          route.communities
            .find((c) => c.startsWith('health:'))
            ?.split(':')[1] || 'healthy',
      },
      sourceASN: route.asPath[route.asPath.length - 1],
      route,
    }))

    // Get session stats for status
    const sessionResponse = await fetch(
      `http://localhost:${bgpPort}/bgp/sessions`,
    )
    const sessionData = (await sessionResponse.json()) as {
      sessionStats?: { totalPeers?: number }
    }

    const status = {
      localASN: bgpConfig.localASN,
      routerId: bgpConfig.routerId,
      peersConnected: sessionData.sessionStats?.totalPeers || 0,
      routesLearned: routes.length,
      localAgentsAdvertised: 0, // Will be filled by local agents
      networkAgentsDiscovered: networkAgents.length,
    }

    return {
      routes,
      networkAgents,
      localAgents: [], // TODO: Get from advertisement manager if needed
      status,
    }
  } catch (error) {
    logger.error('Failed to get BGP infrastructure from HTTP:', error)
    return {
      routes: [],
      networkAgents: [],
      localAgents: [],
      status: null,
    }
  }
}

/**
 * Get all BGP-learned agent routes from the network
 */
export async function getBGPAgentRoutes(): Promise<AgentRoute[]> {
  if (globalBGPSession) {
    try {
      // Use global BGP session if available
      const peers = globalBGPSession.getPeers()
      const allRoutes: AgentRoute[] = []

      for (const peer of peers.values()) {
        const peerRoutes = globalBGPSession.getRoutesFromPeer(peer.asn)
        allRoutes.push(...peerRoutes)
      }

      return allRoutes
    } catch (error) {
      logger.error('Failed to get BGP agent routes from session:', error)
    }
  }

  // Fallback to HTTP endpoint
  const bgpData = await getBGPInfrastructureFromHTTP()
  return bgpData.routes
}

/**
 * Get network-wide agent discovery from BGP
 */
export async function getBGPNetworkAgents(): Promise<
  Array<{
    agent: {
      agentId: string
      capabilities: string[]
      serverUrl: string
      healthStatus: string
    }
    sourceASN: number
    route: AgentRoute
  }>
> {
  if (globalDiscoveryManager) {
    // Use global discovery manager if available (original implementation)
    // This is kept for compatibility but may not work in stdio mode
  }

  // Use HTTP endpoint approach (works in both stdio and HTTP modes)
  const bgpData = await getBGPInfrastructureFromHTTP()
  return bgpData.networkAgents
}

/**
 * Get local agents advertised via BGP
 */
export async function getBGPLocalAgents(): Promise<
  Array<{
    agentId: string
    capabilities: string[]
    serverUrl: string
    healthStatus: string
  }>
> {
  if (!globalAdvertisementManager) {
    return []
  }

  try {
    // Get local agents being advertised
    const localAgents = globalAdvertisementManager.getLocalAgents()
    const result: Array<{
      agentId: string
      capabilities: string[]
      serverUrl: string
      healthStatus: string
    }> = []

    for (const agent of localAgents.values()) {
      result.push({
        agentId: agent.agentId,
        capabilities: agent.capabilities,
        serverUrl: 'localhost', // Local agents
        healthStatus: agent.healthStatus || 'healthy',
      })
    }

    return result
  } catch (error) {
    logger.error('Failed to get BGP local agents:', error)
    return []
  }
}

/**
 * Find best BGP route for an agent
 */
export async function findBGPRoute(
  agentId: string,
): Promise<AgentRoute | null> {
  if (!globalBGPSession) {
    return null
  }

  try {
    // Get routes from all peers
    const peers = globalBGPSession.getPeers()
    const candidateRoutes: AgentRoute[] = []

    for (const peer of peers.values()) {
      const peerRoutes = globalBGPSession.getRoutesFromPeer(peer.asn)
      const agentRoutes = peerRoutes.filter(
        (route) => route.agentId === agentId,
      )
      candidateRoutes.push(...agentRoutes)
    }

    if (candidateRoutes.length === 0) {
      return null
    }

    // Apply BGP path selection algorithm
    const bestRoute = selectBestBGPRoute(candidateRoutes)
    return bestRoute
  } catch (error) {
    logger.error(`Failed to find BGP route for agent ${agentId}:`, error)
    return null
  }
}

/**
 * BGP path selection algorithm
 */
function selectBestBGPRoute(routes: AgentRoute[]): AgentRoute {
  if (routes.length === 1) return routes[0]

  let candidates = [...routes]

  // 1. Highest local preference
  const maxLocalPref = Math.max(...candidates.map((r) => r.localPref))
  candidates = candidates.filter((r) => r.localPref === maxLocalPref)
  if (candidates.length === 1) return candidates[0]

  // 2. Shortest AS path
  const minASPathLength = Math.min(...candidates.map((r) => r.asPath.length))
  candidates = candidates.filter((r) => r.asPath.length === minASPathLength)
  if (candidates.length === 1) return candidates[0]

  // 3. Lowest MED
  const minMED = Math.min(...candidates.map((r) => r.med))
  candidates = candidates.filter((r) => r.med === minMED)
  if (candidates.length === 1) return candidates[0]

  // 4. Newest route
  const newestTime = Math.max(...candidates.map((r) => r.originTime.getTime()))
  candidates = candidates.filter((r) => r.originTime.getTime() === newestTime)

  return candidates[0]
}

/**
 * Get BGP routing information for an agent
 */
export async function getBGPRoutingInfo(agentId: string): Promise<{
  hasBGPRoute: boolean
  route?: AgentRoute
  nextHop?: string
  asPath?: number[]
  localPref?: number
  med?: number
  sourceASN?: number
} | null> {
  const route = await findBGPRoute(agentId)

  if (!route) {
    return {
      hasBGPRoute: false,
    }
  }

  return {
    hasBGPRoute: true,
    route,
    nextHop: route.nextHop,
    asPath: route.asPath,
    localPref: route.localPref,
    med: route.med,
    sourceASN: route.asPath[route.asPath.length - 1], // Last AS in path is source
  }
}

/**
 * Check if BGP infrastructure is available
 */
export function isBGPAvailable(): boolean {
  return (
    globalBGPSession !== null &&
    globalDiscoveryManager !== null &&
    globalAdvertisementManager !== null
  )
}

/**
 * Get BGP network status
 */
export async function getBGPNetworkStatus(): Promise<{
  localASN: number
  routerId: string
  peersConnected: number
  routesLearned: number
  localAgentsAdvertised: number
  networkAgentsDiscovered: number
} | null> {
  if (!isBGPAvailable()) {
    return null
  }

  const bgpConfig = getBGPConfig()

  try {
    const peers = globalBGPSession!.getPeers()
    const routes = await getBGPAgentRoutes()
    const localAgents = await getBGPLocalAgents()
    const networkAgents = await getBGPNetworkAgents()

    return {
      localASN: bgpConfig.localASN,
      routerId: bgpConfig.routerId,
      peersConnected: peers.size,
      routesLearned: routes.length,
      localAgentsAdvertised: localAgents.length,
      networkAgentsDiscovered: networkAgents.length,
    }
  } catch (error) {
    logger.error('Failed to get BGP network status:', error)
    return null
  }
}
