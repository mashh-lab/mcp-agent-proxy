// BGP Route Table Management for Agent Routing
// Implements the standard BGP three-table structure adapted for agents

import { AgentRoute, AgentRoutingTable, ASN, AgentID } from './types.js'

/**
 * AgentRouteTable manages the BGP-style routing tables for agent discovery
 *
 * Structure mirrors BGP:
 * - Adj-RIB-In: Routes received from peers (before policy)
 * - Loc-RIB: Best routes after path selection
 * - Adj-RIB-Out: Routes advertised to peers (after policy)
 */
export class AgentRouteTable {
  private rib: AgentRoutingTable

  constructor() {
    this.rib = {
      adjRibIn: new Map(), // peerASN -> agentId -> route
      locRib: new Map(), // agentId -> best route
      adjRibOut: new Map(), // peerASN -> agentId -> route
    }
  }

  // ===== Adj-RIB-In Operations (Routes from Peers) =====

  /**
   * Add route from peer to Adj-RIB-In
   * This is called when we receive a route advertisement from a BGP peer
   */
  addRouteFromPeer(peerASN: ASN, route: AgentRoute): void {
    if (!this.rib.adjRibIn.has(peerASN)) {
      this.rib.adjRibIn.set(peerASN, new Map())
    }

    const peerRoutes = this.rib.adjRibIn.get(peerASN)!
    peerRoutes.set(route.agentId, route)

    // Note: Path selection happens separately - this just stores the route
  }

  /**
   * Remove route from peer (route withdrawal)
   */
  removeRouteFromPeer(peerASN: ASN, agentId: AgentID): boolean {
    const peerRoutes = this.rib.adjRibIn.get(peerASN)
    if (peerRoutes) {
      return peerRoutes.delete(agentId)
    }
    return false
  }

  /**
   * Remove all routes from a peer (peer down)
   */
  removeAllRoutesFromPeer(peerASN: ASN): number {
    const peerRoutes = this.rib.adjRibIn.get(peerASN)
    if (peerRoutes) {
      const count = peerRoutes.size
      peerRoutes.clear()
      return count
    }
    return 0
  }

  /**
   * Get all routes for an agent from all peers
   * Used by path selection algorithm to compare alternatives
   */
  getRoutesForAgent(agentId: AgentID): AgentRoute[] {
    const routes: AgentRoute[] = []

    for (const peerRoutes of this.rib.adjRibIn.values()) {
      const route = peerRoutes.get(agentId)
      if (route) {
        routes.push(route)
      }
    }

    return routes
  }

  /**
   * Get all routes from a specific peer
   */
  getRoutesFromPeer(peerASN: ASN): Map<AgentID, AgentRoute> {
    return this.rib.adjRibIn.get(peerASN) || new Map()
  }

  // ===== Loc-RIB Operations (Best Routes) =====

  /**
   * Install best route in Loc-RIB
   * This is the result of BGP path selection algorithm
   */
  installBestRoute(agentId: AgentID, route: AgentRoute): void {
    this.rib.locRib.set(agentId, route)
  }

  /**
   * Remove route from Loc-RIB
   */
  removeBestRoute(agentId: AgentID): boolean {
    return this.rib.locRib.delete(agentId)
  }

  /**
   * Get best route for agent (for actual routing decisions)
   */
  getBestRoute(agentId: AgentID): AgentRoute | undefined {
    return this.rib.locRib.get(agentId)
  }

  /**
   * Get all best routes (entire routing table)
   */
  getAllBestRoutes(): Map<AgentID, AgentRoute> {
    return new Map(this.rib.locRib)
  }

  /**
   * Get all known agent IDs
   */
  getAllKnownAgents(): AgentID[] {
    return Array.from(this.rib.locRib.keys())
  }

  // ===== Adj-RIB-Out Operations (Routes to Peers) =====

  /**
   * Add route to Adj-RIB-Out (for advertising to peer)
   * This happens after export policy is applied
   */
  addRouteForPeer(peerASN: ASN, route: AgentRoute): void {
    if (!this.rib.adjRibOut.has(peerASN)) {
      this.rib.adjRibOut.set(peerASN, new Map())
    }

    const peerRoutes = this.rib.adjRibOut.get(peerASN)!
    peerRoutes.set(route.agentId, route)
  }

  /**
   * Remove route from Adj-RIB-Out (withdraw from peer)
   */
  removeRouteForPeer(peerASN: ASN, agentId: AgentID): boolean {
    const peerRoutes = this.rib.adjRibOut.get(peerASN)
    if (peerRoutes) {
      return peerRoutes.delete(agentId)
    }
    return false
  }

  /**
   * Get routes to advertise to a specific peer
   */
  getRoutesForPeer(peerASN: ASN): Map<AgentID, AgentRoute> {
    return this.rib.adjRibOut.get(peerASN) || new Map()
  }

  // ===== Statistics and Monitoring =====

  /**
   * Get routing table statistics
   */
  getStatistics() {
    const stats = {
      adjRibIn: {
        totalPeers: this.rib.adjRibIn.size,
        totalRoutes: 0,
        routesPerPeer: new Map<ASN, number>(),
      },
      locRib: {
        totalRoutes: this.rib.locRib.size,
      },
      adjRibOut: {
        totalPeers: this.rib.adjRibOut.size,
        totalRoutes: 0,
        routesPerPeer: new Map<ASN, number>(),
      },
    }

    // Count Adj-RIB-In routes
    for (const [peerASN, routes] of this.rib.adjRibIn.entries()) {
      const routeCount = routes.size
      stats.adjRibIn.totalRoutes += routeCount
      stats.adjRibIn.routesPerPeer.set(peerASN, routeCount)
    }

    // Count Adj-RIB-Out routes
    for (const [peerASN, routes] of this.rib.adjRibOut.entries()) {
      const routeCount = routes.size
      stats.adjRibOut.totalRoutes += routeCount
      stats.adjRibOut.routesPerPeer.set(peerASN, routeCount)
    }

    return stats
  }

  /**
   * Find agents by capability
   */
  findAgentsByCapability(capability: string): AgentRoute[] {
    const matches: AgentRoute[] = []

    for (const route of this.rib.locRib.values()) {
      if (route.capabilities.includes(capability)) {
        matches.push(route)
      }
    }

    return matches
  }

  /**
   * Find agents by capability pattern (supports wildcards)
   */
  findAgentsByCapabilityPattern(pattern: string): AgentRoute[] {
    const matches: AgentRoute[] = []
    const regex = new RegExp(pattern.replace('*', '.*'), 'i')

    for (const route of this.rib.locRib.values()) {
      if (route.capabilities.some((cap) => regex.test(cap))) {
        matches.push(route)
      }
    }

    return matches
  }

  /**
   * Find agents by AS path (routes through specific ASes)
   */
  findAgentsByASPath(asns: ASN[]): AgentRoute[] {
    const matches: AgentRoute[] = []

    for (const route of this.rib.locRib.values()) {
      if (asns.every((asn) => route.asPath.includes(asn))) {
        matches.push(route)
      }
    }

    return matches
  }

  /**
   * Find agents by community
   */
  findAgentsByCommunity(community: string): AgentRoute[] {
    const matches: AgentRoute[] = []

    for (const route of this.rib.locRib.values()) {
      if (route.communities.includes(community)) {
        matches.push(route)
      }
    }

    return matches
  }

  // ===== Debugging and Inspection =====

  /**
   * Get detailed route information for debugging
   */
  getRouteDetails(agentId: AgentID) {
    return {
      bestRoute: this.rib.locRib.get(agentId),
      alternativeRoutes: this.getRoutesForAgent(agentId),
      advertisedToPeers: Array.from(this.rib.adjRibOut.entries())
        .filter(([, routes]) => routes.has(agentId))
        .map(([peerASN]) => peerASN),
    }
  }

  /**
   * Export routing table for analysis or backup
   */
  exportRoutingTable() {
    return {
      adjRibIn: Array.from(this.rib.adjRibIn.entries()).map(
        ([peerASN, routes]) => ({
          peerASN,
          routes: Array.from(routes.entries()).map(([agentId, route]) => ({
            agentId,
            route: this.serializeRoute(route),
          })),
        }),
      ),
      locRib: Array.from(this.rib.locRib.entries()).map(([agentId, route]) => ({
        agentId,
        route: this.serializeRoute(route),
      })),
      adjRibOut: Array.from(this.rib.adjRibOut.entries()).map(
        ([peerASN, routes]) => ({
          peerASN,
          routes: Array.from(routes.entries()).map(([agentId, route]) => ({
            agentId,
            route: this.serializeRoute(route),
          })),
        }),
      ),
    }
  }

  /**
   * Serialize a route for export (handles Map serialization)
   */
  private serializeRoute(route: AgentRoute) {
    return {
      ...route,
      pathAttributes: Array.from(route.pathAttributes.entries()),
      originTime: route.originTime.toISOString(),
    }
  }

  /**
   * Clear all routing tables (for testing or reset)
   */
  clear(): void {
    this.rib.adjRibIn.clear()
    this.rib.locRib.clear()
    this.rib.adjRibOut.clear()
  }

  /**
   * Validate routing table consistency
   * Returns list of issues found
   */
  validate(): string[] {
    const issues: string[] = []

    // Check for loops in AS paths
    for (const [agentId, route] of this.rib.locRib.entries()) {
      const asPath = route.asPath
      const uniqueASes = new Set(asPath)

      if (asPath.length !== uniqueASes.size) {
        issues.push(`Agent ${agentId} has AS path loop: [${asPath.join(', ')}]`)
      }

      if (asPath.length > 10) {
        // Max reasonable AS path length
        issues.push(
          `Agent ${agentId} has suspiciously long AS path: ${asPath.length}`,
        )
      }
    }

    // Check for stale routes (routes older than 24 hours)
    const staleThreshold = Date.now() - 24 * 60 * 60 * 1000
    for (const [agentId, route] of this.rib.locRib.entries()) {
      if (route.originTime.getTime() < staleThreshold) {
        issues.push(
          `Agent ${agentId} has stale route (age: ${Math.floor(
            (Date.now() - route.originTime.getTime()) / (60 * 60 * 1000),
          )} hours)`,
        )
      }
    }

    return issues
  }
}
