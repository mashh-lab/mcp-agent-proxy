// BGP HTTP Server for Agent Network Communication
// Exposes BGP endpoints for peer discovery and route exchange

import { BGPSession } from './session.js'
import { BGPUpdate, AgentRoute } from './types.js'
import { PolicyEngine, PolicyConfig } from './policy.js'
import {
  getAllPolicyTemplates,
  getPolicyTemplate,
  searchPolicyTemplates,
  getPolicyTemplateCategories,
  applyPolicyTemplate,
  getPolicyTemplateStats,
} from './policy-templates.js'
import { logger } from '../config.js'

export interface BGPServerConfig {
  port: number
  hostname?: string
  localASN: number
  routerId: string
}

export interface BGPEndpointRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  headers: Record<string, string>
  body?: unknown
  query?: Record<string, string>
}

export interface BGPEndpointResponse {
  status: number
  headers: Record<string, string>
  body?: unknown
}

/**
 * BGP HTTP Server for Agent Networks
 * Provides REST endpoints for BGP communication between agent servers
 */
export class BGPServer {
  private bgpSession: BGPSession
  private config: BGPServerConfig
  private policyEngine?: PolicyEngine
  private endpoints = new Map<
    string,
    (req: BGPEndpointRequest) => Promise<BGPEndpointResponse>
  >()

  constructor(config: BGPServerConfig) {
    this.config = config
    this.bgpSession = new BGPSession(config.localASN, config.routerId)
    this.setupEndpoints()

    logger.log(
      `BGP: Server initialized for AS${config.localASN} on ${config.hostname || 'localhost'}:${config.port}`,
    )
  }

  /**
   * Configure policy engine for policy management endpoints
   */
  configurePolicyEngine(policyEngine: PolicyEngine): void {
    this.policyEngine = policyEngine
    this.setupPolicyEndpoints()
    logger.log('BGP: Policy engine configured with HTTP endpoints')
  }

  /**
   * Setup BGP HTTP endpoints
   */
  private setupEndpoints(): void {
    // BGP Peer Discovery
    this.endpoints.set('GET /bgp/peers', this.handleGetPeers.bind(this))
    this.endpoints.set('POST /bgp/peers', this.handleAddPeer.bind(this))
    this.endpoints.set(
      'DELETE /bgp/peers/:asn',
      this.handleRemovePeer.bind(this),
    )

    // BGP Route Exchange
    this.endpoints.set('GET /bgp/routes', this.handleGetRoutes.bind(this))
    this.endpoints.set(
      'POST /bgp/routes/update',
      this.handleRouteUpdate.bind(this),
    )
    this.endpoints.set(
      'POST /bgp/routes/withdraw',
      this.handleRouteWithdraw.bind(this),
    )

    // BGP Session Management
    this.endpoints.set('GET /bgp/sessions', this.handleGetSessions.bind(this))
    this.endpoints.set(
      'POST /bgp/sessions/:asn/keepalive',
      this.handleKeepalive.bind(this),
    )

    // BGP Open/Negotiation
    this.endpoints.set('POST /bgp/open', this.handleBGPOpen.bind(this))
    this.endpoints.set(
      'POST /bgp/notification',
      this.handleBGPNotification.bind(this),
    )

    // Agent Discovery (BGP-aware agent listing)
    this.endpoints.set('GET /bgp/agents', this.handleGetAgents.bind(this))
    this.endpoints.set(
      'POST /bgp/agents/advertise',
      this.handleAdvertiseAgent.bind(this),
    )

    // Health and Status
    this.endpoints.set('GET /bgp/status', this.handleGetStatus.bind(this))
    this.endpoints.set('GET /bgp/stats', this.handleGetStats.bind(this))

    // Policy Template Discovery (works without policy engine)
    this.endpoints.set(
      'GET /bgp/policy-templates',
      this.handleGetPolicyTemplates.bind(this),
    )
    this.endpoints.set(
      'GET /bgp/policy-templates/categories',
      this.handleGetTemplateCategories.bind(this),
    )
    this.endpoints.set(
      'GET /bgp/policy-templates/search',
      this.handleSearchTemplates.bind(this),
    )
    this.endpoints.set(
      'GET /bgp/policy-templates/:templateId',
      this.handleGetPolicyTemplate.bind(this),
    )
    this.endpoints.set(
      'GET /bgp/policy-templates/stats',
      this.handleGetTemplateStats.bind(this),
    )
    this.endpoints.set(
      'POST /bgp/policy-templates/:templateId/apply',
      this.handleApplyTemplate.bind(this),
    )
  }

  /**
   * Setup policy management endpoints
   */
  private setupPolicyEndpoints(): void {
    // Policy Management
    this.endpoints.set('GET /bgp/policies', this.handleGetPolicies.bind(this))
    this.endpoints.set('POST /bgp/policies', this.handleAddPolicy.bind(this))
    this.endpoints.set(
      'PUT /bgp/policies/:name',
      this.handleUpdatePolicy.bind(this),
    )
    this.endpoints.set(
      'DELETE /bgp/policies/:name',
      this.handleDeletePolicy.bind(this),
    )
    this.endpoints.set(
      'POST /bgp/policies/:name/toggle',
      this.handleTogglePolicy.bind(this),
    )

    // Policy Statistics and Monitoring
    this.endpoints.set(
      'GET /bgp/policies/stats',
      this.handleGetPolicyStats.bind(this),
    )
    this.endpoints.set(
      'GET /bgp/policies/decisions',
      this.handleGetPolicyDecisions.bind(this),
    )

    // Policy Import/Export
    this.endpoints.set(
      'POST /bgp/policies/import',
      this.handleImportPolicies.bind(this),
    )
    this.endpoints.set(
      'GET /bgp/policies/export',
      this.handleExportPolicies.bind(this),
    )

    // Policy Testing and Simulation
    this.endpoints.set(
      'POST /bgp/policies/test',
      this.handleTestPolicies.bind(this),
    )

    logger.log('BGP: Policy management endpoints configured')
  }

  /**
   * Handle HTTP request routing
   */
  async handleRequest(req: BGPEndpointRequest): Promise<BGPEndpointResponse> {
    const key = `${req.method} ${req.path}`
    const handler = this.endpoints.get(key)

    if (!handler) {
      // Try pattern matching for parameterized routes
      for (const [pattern, handlerFunc] of this.endpoints.entries()) {
        if (this.matchesPattern(pattern, key)) {
          return await handlerFunc(req)
        }
      }

      return {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'BGP endpoint not found', path: req.path },
      }
    }

    try {
      return await handler(req)
    } catch (error) {
      logger.log(
        `BGP: Request error on ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
      return {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: {
          error: 'Internal BGP server error',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      }
    }
  }

  /**
   * Pattern matching for parameterized routes
   */
  private matchesPattern(pattern: string, actual: string): boolean {
    const patternParts = pattern.split(' ')
    const actualParts = actual.split(' ')

    if (patternParts.length !== actualParts.length) return false
    if (patternParts[0] !== actualParts[0]) return false // Method must match

    const patternPath = patternParts[1].split('/')
    const actualPath = actualParts[1].split('/')

    if (patternPath.length !== actualPath.length) return false

    for (let i = 0; i < patternPath.length; i++) {
      if (patternPath[i].startsWith(':')) continue // Parameter
      if (patternPath[i] !== actualPath[i]) return false
    }

    return true
  }

  /**
   * Extract parameters from URL path
   */
  private extractParams(
    pattern: string,
    actual: string,
  ): Record<string, string> {
    const params: Record<string, string> = {}
    const patternParts = pattern.split(' ')[1].split('/')
    const actualParts = actual.split(' ')[1].split('/')

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        const paramName = patternParts[i].substring(1)
        params[paramName] = actualParts[i]
      }
    }

    return params
  }

  // =================================
  // BGP ENDPOINT HANDLERS
  // =================================

  /**
   * GET /bgp/peers - List all BGP peers
   */
  private async handleGetPeers(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _req: BGPEndpointRequest,
  ): Promise<BGPEndpointResponse> {
    const peers = Array.from(this.bgpSession.getPeers().values())

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        localASN: this.config.localASN,
        routerId: this.config.routerId,
        peers: peers.map((peer) => ({
          asn: peer.asn,
          address: peer.address,
          status: peer.status,
          lastUpdate: peer.lastUpdate,
          routesReceived: peer.routesReceived,
          routesSent: peer.routesSent,
        })),
      },
    }
  }

  /**
   * POST /bgp/peers - Add a new BGP peer
   */
  private async handleAddPeer(
    req: BGPEndpointRequest,
  ): Promise<BGPEndpointResponse> {
    const body = req.body as { asn: number; address: string }

    if (!body?.asn || !body?.address) {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Missing required fields: asn, address' },
      }
    }

    await this.bgpSession.addPeer(body.asn, body.address)

    return {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
      body: {
        message: `BGP peer AS${body.asn} added successfully`,
        asn: body.asn,
        address: body.address,
      },
    }
  }

  /**
   * DELETE /bgp/peers/:asn - Remove a BGP peer
   */
  private async handleRemovePeer(
    req: BGPEndpointRequest,
  ): Promise<BGPEndpointResponse> {
    const params = this.extractParams(
      'DELETE /bgp/peers/:asn',
      `${req.method} ${req.path}`,
    )
    const asn = parseInt(params.asn)

    if (isNaN(asn)) {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Invalid ASN parameter' },
      }
    }

    this.bgpSession.removePeer(asn)

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { message: `BGP peer AS${asn} removed successfully` },
    }
  }

  /**
   * GET /bgp/routes - Get all learned routes
   */
  private async handleGetRoutes(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _req: BGPEndpointRequest,
  ): Promise<BGPEndpointResponse> {
    const allRoutes: Array<AgentRoute & { peerASN: number }> = []

    for (const peer of this.bgpSession.getPeers().values()) {
      const routes = this.bgpSession.getRoutesFromPeer(peer.asn)
      routes.forEach((route) => {
        allRoutes.push({ ...route, peerASN: peer.asn })
      })
    }

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        localASN: this.config.localASN,
        totalRoutes: allRoutes.length,
        routes: allRoutes.map((route) => ({
          agentId: route.agentId,
          capabilities: route.capabilities,
          asPath: route.asPath,
          nextHop: route.nextHop,
          localPref: route.localPref,
          med: route.med,
          communities: route.communities,
          learnedFrom: route.peerASN,
          originTime: route.originTime,
        })),
      },
    }
  }

  /**
   * POST /bgp/routes/update - Receive BGP UPDATE message
   */
  private async handleRouteUpdate(
    req: BGPEndpointRequest,
  ): Promise<BGPEndpointResponse> {
    const update = req.body as BGPUpdate

    if (!update?.senderASN) {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Invalid BGP UPDATE message' },
      }
    }

    await this.bgpSession.receiveUpdate(update.senderASN, update)

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        message: 'BGP UPDATE processed successfully',
        advertisedRoutes: update.advertisedRoutes?.length || 0,
        withdrawnRoutes: update.withdrawnRoutes?.length || 0,
      },
    }
  }

  /**
   * POST /bgp/routes/withdraw - Withdraw routes
   */
  private async handleRouteWithdraw(
    req: BGPEndpointRequest,
  ): Promise<BGPEndpointResponse> {
    const body = req.body as { senderASN: number; agentIds: string[] }

    if (!body?.senderASN || !body?.agentIds) {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Missing required fields: senderASN, agentIds' },
      }
    }

    const update: BGPUpdate = {
      type: 'UPDATE',
      timestamp: new Date(),
      senderASN: body.senderASN,
      withdrawnRoutes: body.agentIds,
    }

    await this.bgpSession.receiveUpdate(body.senderASN, update)

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        message: `Withdrew ${body.agentIds.length} routes from AS${body.senderASN}`,
      },
    }
  }

  /**
   * GET /bgp/sessions - Get session statistics
   */
  private async handleGetSessions(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _req: BGPEndpointRequest,
  ): Promise<BGPEndpointResponse> {
    const stats = this.bgpSession.getSessionStats()

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        localASN: this.config.localASN,
        routerId: this.config.routerId,
        sessionStats: {
          totalPeers: stats.totalPeers,
          establishedSessions: stats.establishedSessions,
          totalRoutes: stats.totalRoutes,
          sessionStates: Object.fromEntries(stats.sessionStates),
        },
      },
    }
  }

  /**
   * POST /bgp/sessions/:asn/keepalive - Receive keepalive
   */
  private async handleKeepalive(
    req: BGPEndpointRequest,
  ): Promise<BGPEndpointResponse> {
    const params = this.extractParams(
      'POST /bgp/sessions/:asn/keepalive',
      `${req.method} ${req.path}`,
    )
    const asn = parseInt(params.asn)

    if (isNaN(asn)) {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Invalid ASN parameter' },
      }
    }

    this.bgpSession.receiveKeepalive(asn)

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { message: `Keepalive received from AS${asn}` },
    }
  }

  /**
   * POST /bgp/open - Handle BGP OPEN message
   */
  private async handleBGPOpen(
    req: BGPEndpointRequest,
  ): Promise<BGPEndpointResponse> {
    const body = req.body as {
      asn: number
      routerId: string
      holdTime: number
      capabilities: string[]
    }

    if (!body?.asn || !body?.routerId) {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Invalid BGP OPEN message' },
      }
    }

    // In a real implementation, this would negotiate capabilities
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        message: 'BGP OPEN accepted',
        localASN: this.config.localASN,
        routerId: this.config.routerId,
        holdTime: 90,
        capabilities: ['agent-routing', 'path-vector'],
      },
    }
  }

  /**
   * POST /bgp/notification - Handle BGP NOTIFICATION message
   */
  private async handleBGPNotification(
    req: BGPEndpointRequest,
  ): Promise<BGPEndpointResponse> {
    const body = req.body as { senderASN: number; reason: string }

    if (!body?.senderASN || !body?.reason) {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Invalid BGP NOTIFICATION message' },
      }
    }

    logger.log(
      `BGP: Received NOTIFICATION from AS${body.senderASN}: ${body.reason}`,
    )

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { message: 'BGP NOTIFICATION received' },
    }
  }

  /**
   * GET /bgp/agents - BGP-aware agent discovery
   */
  private async handleGetAgents(
    req: BGPEndpointRequest,
  ): Promise<BGPEndpointResponse> {
    const capability = req.query?.capability as string
    const allRoutes: Array<AgentRoute & { peerASN: number }> = []

    // Collect all routes from all peers
    for (const peer of this.bgpSession.getPeers().values()) {
      const routes = this.bgpSession.getRoutesFromPeer(peer.asn)
      routes.forEach((route) => {
        allRoutes.push({ ...route, peerASN: peer.asn })
      })
    }

    // Filter by capability if specified
    let filteredRoutes = allRoutes
    if (capability) {
      filteredRoutes = allRoutes.filter((route) =>
        route.capabilities.some((cap) =>
          cap.toLowerCase().includes(capability.toLowerCase()),
        ),
      )
    }

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        localASN: this.config.localASN,
        totalAgents: filteredRoutes.length,
        capabilityFilter: capability || null,
        agents: filteredRoutes.map((route) => ({
          agentId: route.agentId,
          capabilities: route.capabilities,
          asPath: route.asPath,
          nextHop: route.nextHop,
          localPref: route.localPref,
          learnedFrom: route.peerASN,
        })),
      },
    }
  }

  /**
   * POST /bgp/agents/advertise - Advertise local agent capabilities
   */
  private async handleAdvertiseAgent(
    req: BGPEndpointRequest,
  ): Promise<BGPEndpointResponse> {
    const body = req.body as {
      agentId: string
      capabilities: string[]
      localPref?: number
    }

    if (!body?.agentId || !body?.capabilities) {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Missing required fields: agentId, capabilities' },
      }
    }

    // Create route for local agent
    const route: AgentRoute = {
      agentId: body.agentId,
      capabilities: body.capabilities,
      asPath: [this.config.localASN],
      nextHop: `http://${this.config.hostname || 'localhost'}:${this.config.port}`,
      localPref: body.localPref || 100,
      med: 0,
      communities: [],
      originTime: new Date(),
      pathAttributes: new Map(),
    }

    // Advertise to all established peers
    const update: BGPUpdate = {
      type: 'UPDATE',
      timestamp: new Date(),
      senderASN: this.config.localASN,
      advertisedRoutes: [route],
    }

    const advertisedTo: number[] = []
    for (const peer of this.bgpSession.getPeers().values()) {
      try {
        await this.bgpSession.sendUpdate(peer.asn, update)
        advertisedTo.push(peer.asn)
      } catch (error) {
        logger.log(
          `BGP: Failed to advertise to AS${peer.asn}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
      }
    }

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        message: `Agent ${body.agentId} advertised successfully`,
        advertisedTo,
        route: {
          agentId: route.agentId,
          capabilities: route.capabilities,
          asPath: route.asPath,
        },
      },
    }
  }

  /**
   * GET /bgp/status - Server health status
   */
  private async handleGetStatus(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _req: BGPEndpointRequest,
  ): Promise<BGPEndpointResponse> {
    const stats = this.bgpSession.getSessionStats()

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        server: 'BGP Agent Router',
        version: '1.0.0',
        localASN: this.config.localASN,
        routerId: this.config.routerId,
        uptime: process.uptime(),
        status: 'healthy',
        bgp: {
          peersConfigured: stats.totalPeers,
          sessionsEstablished: stats.establishedSessions,
          routesLearned: stats.totalRoutes,
        },
      },
    }
  }

  /**
   * GET /bgp/stats - Get BGP statistics
   */
  private async handleGetStats(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _req: BGPEndpointRequest,
  ): Promise<BGPEndpointResponse> {
    const sessionStats = this.bgpSession.getSessionStats()
    const peerDetails = Array.from(this.bgpSession.getPeers().values())

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        localASN: this.config.localASN,
        routerId: this.config.routerId,
        server: {
          port: this.config.port,
          hostname: this.config.hostname || 'localhost',
        },
        session: {
          totalPeers: sessionStats.totalPeers,
          establishedSessions: sessionStats.establishedSessions,
          totalRoutes: sessionStats.totalRoutes,
          sessionStates: Object.fromEntries(sessionStats.sessionStates),
        },
        peers: peerDetails.map((peer) => ({
          asn: peer.asn,
          status: peer.status,
          routesReceived: peer.routesReceived,
          routesSent: peer.routesSent,
          lastUpdate: peer.lastUpdate,
        })),
      },
    }
  }

  /**
   * Get BGP session instance for internal use
   */
  getBGPSession(): BGPSession {
    return this.bgpSession
  }

  /**
   * Get server configuration
   */
  getConfig(): BGPServerConfig {
    return { ...this.config }
  }

  /**
   * Shutdown BGP server
   */
  async shutdown(): Promise<void> {
    logger.log('BGP: Shutting down BGP server')
    await this.bgpSession.shutdown()
  }

  // =================================
  // POLICY ENDPOINT HANDLERS
  // =================================

  /**
   * GET /bgp/policies - Get all policies
   */
  private async handleGetPolicies(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _req: BGPEndpointRequest,
  ): Promise<BGPEndpointResponse> {
    if (!this.policyEngine) {
      return {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Policy engine not configured' },
      }
    }

    const policies = this.policyEngine.getPolicies()
    const stats = this.policyEngine.getStats()

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        localASN: this.config.localASN,
        totalPolicies: stats.totalPolicies,
        enabledPolicies: stats.enabledPolicies,
        policies: policies,
      },
    }
  }

  /**
   * POST /bgp/policies - Add a new policy
   */
  private async handleAddPolicy(
    req: BGPEndpointRequest,
  ): Promise<BGPEndpointResponse> {
    if (!this.policyEngine) {
      return {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Policy engine not configured' },
      }
    }

    const policy = req.body as PolicyConfig

    if (!policy?.name || !policy?.action) {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Invalid policy: missing name or action' },
      }
    }

    const success = this.policyEngine.addPolicy(policy)

    if (success) {
      return {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
        body: {
          message: `Policy "${policy.name}" added successfully`,
          policy: policy,
        },
      }
    } else {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Failed to add policy - validation failed' },
      }
    }
  }

  /**
   * PUT /bgp/policies/:name - Update an existing policy
   */
  private async handleUpdatePolicy(
    req: BGPEndpointRequest,
  ): Promise<BGPEndpointResponse> {
    if (!this.policyEngine) {
      return {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Policy engine not configured' },
      }
    }

    const params = this.extractParams(
      'PUT /bgp/policies/:name',
      `${req.method} ${req.path}`,
    )
    const policyName = params.name
    const policy = req.body as PolicyConfig

    if (!policy?.name || policy.name !== policyName) {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Policy name mismatch' },
      }
    }

    const success = this.policyEngine.addPolicy(policy) // addPolicy handles updates too

    if (success) {
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          message: `Policy "${policyName}" updated successfully`,
          policy: policy,
        },
      }
    } else {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Failed to update policy - validation failed' },
      }
    }
  }

  /**
   * DELETE /bgp/policies/:name - Delete a policy
   */
  private async handleDeletePolicy(
    req: BGPEndpointRequest,
  ): Promise<BGPEndpointResponse> {
    if (!this.policyEngine) {
      return {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Policy engine not configured' },
      }
    }

    const params = this.extractParams(
      'DELETE /bgp/policies/:name',
      `${req.method} ${req.path}`,
    )
    const policyName = params.name

    const success = this.policyEngine.removePolicy(policyName)

    if (success) {
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: { message: `Policy "${policyName}" deleted successfully` },
      }
    } else {
      return {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
        body: { error: `Policy "${policyName}" not found` },
      }
    }
  }

  /**
   * POST /bgp/policies/:name/toggle - Enable/disable a policy
   */
  private async handleTogglePolicy(
    req: BGPEndpointRequest,
  ): Promise<BGPEndpointResponse> {
    if (!this.policyEngine) {
      return {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Policy engine not configured' },
      }
    }

    const params = this.extractParams(
      'POST /bgp/policies/:name/toggle',
      `${req.method} ${req.path}`,
    )
    const policyName = params.name
    const body = req.body as { enabled: boolean }

    if (typeof body?.enabled !== 'boolean') {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Invalid request: enabled field must be boolean' },
      }
    }

    const success = this.policyEngine.togglePolicy(policyName, body.enabled)

    if (success) {
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          message: `Policy "${policyName}" ${body.enabled ? 'enabled' : 'disabled'} successfully`,
          enabled: body.enabled,
        },
      }
    } else {
      return {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
        body: { error: `Policy "${policyName}" not found` },
      }
    }
  }

  /**
   * GET /bgp/policies/stats - Get policy statistics
   */
  private async handleGetPolicyStats(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _req: BGPEndpointRequest,
  ): Promise<BGPEndpointResponse> {
    if (!this.policyEngine) {
      return {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Policy engine not configured' },
      }
    }

    const stats = this.policyEngine.getStats()

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        localASN: this.config.localASN,
        policyStats: {
          totalPolicies: stats.totalPolicies,
          enabledPolicies: stats.enabledPolicies,
          totalDecisions: stats.totalDecisions,
          acceptDecisions: stats.acceptDecisions,
          rejectDecisions: stats.rejectDecisions,
          modifyDecisions: stats.modifyDecisions,
          averageDecisionTime: stats.averageDecisionTime,
          lastDecisionTime: stats.lastDecisionTime,
          decisionsByPolicy: Object.fromEntries(stats.decisionsByPolicy),
        },
      },
    }
  }

  /**
   * GET /bgp/policies/decisions - Get policy decision history
   */
  private async handleGetPolicyDecisions(
    req: BGPEndpointRequest,
  ): Promise<BGPEndpointResponse> {
    if (!this.policyEngine) {
      return {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Policy engine not configured' },
      }
    }

    const limit = req.query?.limit ? parseInt(req.query.limit as string) : 100

    const decisions = this.policyEngine.getDecisionHistory(limit)

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        localASN: this.config.localASN,
        totalDecisions: decisions.length,
        maxLimit: limit,
        decisions: decisions.map((decision) => ({
          policyName: decision.policy.name,
          action: decision.action,
          agentId: decision.route.agentId,
          reason: decision.reason,
          timestamp: decision.timestamp,
          routeInfo: {
            capabilities: decision.route.capabilities,
            asPath: decision.route.asPath,
            localPref: decision.route.localPref,
            med: decision.route.med,
          },
        })),
      },
    }
  }

  /**
   * POST /bgp/policies/import - Import policies from JSON
   */
  private async handleImportPolicies(
    req: BGPEndpointRequest,
  ): Promise<BGPEndpointResponse> {
    if (!this.policyEngine) {
      return {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Policy engine not configured' },
      }
    }

    const body = req.body as { policies: string }

    if (!body?.policies) {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Missing policies JSON string' },
      }
    }

    const success = this.policyEngine.importPolicies(body.policies)

    if (success) {
      const stats = this.policyEngine.getStats()
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          message: 'Policies imported successfully',
          totalPolicies: stats.totalPolicies,
          enabledPolicies: stats.enabledPolicies,
        },
      }
    } else {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: {
          error:
            'Failed to import policies - invalid JSON or validation failed',
        },
      }
    }
  }

  /**
   * GET /bgp/policies/export - Export policies as JSON
   */
  private async handleExportPolicies(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _req: BGPEndpointRequest,
  ): Promise<BGPEndpointResponse> {
    if (!this.policyEngine) {
      return {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Policy engine not configured' },
      }
    }

    const policiesJson = this.policyEngine.exportPolicies()

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        localASN: this.config.localASN,
        exportTime: new Date().toISOString(),
        policies: policiesJson,
      },
    }
  }

  /**
   * POST /bgp/policies/test - Test policies against sample routes
   */
  private async handleTestPolicies(
    req: BGPEndpointRequest,
  ): Promise<BGPEndpointResponse> {
    if (!this.policyEngine) {
      return {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Policy engine not configured' },
      }
    }

    const body = req.body as { routes: AgentRoute[] }

    if (!body?.routes || !Array.isArray(body.routes)) {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Invalid request: routes array required' },
      }
    }

    const acceptedRoutes = this.policyEngine.applyPolicies(body.routes)
    const rejectedCount = body.routes.length - acceptedRoutes.length

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        localASN: this.config.localASN,
        testResults: {
          totalRoutes: body.routes.length,
          acceptedRoutes: acceptedRoutes.length,
          rejectedRoutes: rejectedCount,
          routeDetails: acceptedRoutes.map((route) => ({
            agentId: route.agentId,
            capabilities: route.capabilities,
            asPath: route.asPath,
            localPref: route.localPref,
            med: route.med,
          })),
        },
      },
    }
  }

  /**
   * POST /bgp/policy-templates/:templateId/apply - Apply a policy template
   */
  private async handleApplyTemplate(
    req: BGPEndpointRequest,
  ): Promise<BGPEndpointResponse> {
    if (!this.policyEngine) {
      return {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Policy engine not configured' },
      }
    }

    const params = this.extractParams(
      'POST /bgp/policy-templates/:templateId/apply',
      `${req.method} ${req.path}`,
    )
    const templateId = params.templateId
    const body = req.body as {
      enabledOnly?: boolean
      priorityOffset?: number
      namePrefix?: string
      testRoutes?: AgentRoute[]
    }

    const template = getPolicyTemplate(templateId)

    if (!template) {
      return {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
        body: { error: `Policy template '${templateId}' not found` },
      }
    }

    try {
      // Apply template to get policies
      const policies = applyPolicyTemplate(templateId, {
        enabledOnly: body?.enabledOnly,
        priorityOffset: body?.priorityOffset,
        namePrefix: body?.namePrefix,
      })

      // Add policies to the policy engine
      let addedPolicies = 0
      for (const policy of policies) {
        if (this.policyEngine.addPolicy(policy)) {
          addedPolicies++
        }
      }

      // If test routes provided, test the template
      let testResults
      if (body?.testRoutes && Array.isArray(body.testRoutes)) {
        const acceptedRoutes = this.policyEngine.applyPolicies(body.testRoutes)
        const rejectedCount = body.testRoutes.length - acceptedRoutes.length

        testResults = {
          totalRoutes: body.testRoutes.length,
          acceptedRoutes: acceptedRoutes.length,
          rejectedRoutes: rejectedCount,
          routeDetails: acceptedRoutes.map((route) => ({
            agentId: route.agentId,
            capabilities: route.capabilities,
            asPath: route.asPath,
            localPref: route.localPref,
            med: route.med,
          })),
        }
      }

      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          localASN: this.config.localASN,
          templateId: template.id,
          templateName: template.name,
          appliedPolicies: addedPolicies,
          totalPolicies: policies.length,
          policies: policies.map((policy) => ({
            name: policy.name,
            description: policy.description,
            enabled: policy.enabled,
            priority: policy.priority,
          })),
          ...(testResults && { testResults }),
        },
      }
    } catch (error) {
      return {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: {
          error: 'Failed to apply policy template',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      }
    }
  }

  // =================================
  // POLICY TEMPLATE ENDPOINT HANDLERS
  // =================================

  /**
   * GET /bgp/policy-templates - Get all policy templates
   */
  private async handleGetPolicyTemplates(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _req: BGPEndpointRequest,
  ): Promise<BGPEndpointResponse> {
    const templates = getAllPolicyTemplates()

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        localASN: this.config.localASN,
        totalTemplates: templates.length,
        templates: templates,
      },
    }
  }

  /**
   * GET /bgp/policy-templates/categories - Get all policy template categories
   */
  private async handleGetTemplateCategories(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _req: BGPEndpointRequest,
  ): Promise<BGPEndpointResponse> {
    const categories = getPolicyTemplateCategories()

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        localASN: this.config.localASN,
        totalCategories: categories.length,
        categories: categories,
      },
    }
  }

  /**
   * GET /bgp/policy-templates/search - Search for policy templates
   */
  private async handleSearchTemplates(
    req: BGPEndpointRequest,
  ): Promise<BGPEndpointResponse> {
    const query = req.query?.query as string
    const templates = searchPolicyTemplates(query)

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        localASN: this.config.localASN,
        totalTemplates: templates.length,
        query: query,
        templates: templates,
      },
    }
  }

  /**
   * GET /bgp/policy-templates/:templateId - Get a policy template by ID
   */
  private async handleGetPolicyTemplate(
    req: BGPEndpointRequest,
  ): Promise<BGPEndpointResponse> {
    const params = this.extractParams(
      'GET /bgp/policy-templates/:templateId',
      `${req.method} ${req.path}`,
    )
    const templateId = params.templateId
    const template = getPolicyTemplate(templateId)

    if (template) {
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          localASN: this.config.localASN,
          templateId: template.id,
          template: template,
        },
      }
    } else {
      return {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
        body: { error: `Policy template ID ${templateId} not found` },
      }
    }
  }

  /**
   * GET /bgp/policy-templates/stats - Get policy template statistics
   */
  private async handleGetTemplateStats(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _req: BGPEndpointRequest,
  ): Promise<BGPEndpointResponse> {
    const stats = getPolicyTemplateStats()

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        localASN: this.config.localASN,
        templateStats: stats,
      },
    }
  }
}
