# Agent BGP Implementation Plan

## From Simple Proxy to Internet-Scale Agent Routing

> **🚀 Meta-Instructions for Implementer:**
>
> 1. **Create Implementation Log**: Start with `IMPLEMENTATION_LOG.md` (template at bottom)
> 2. **Track Progress**: Update log after each step with status, challenges, learnings
> 3. **Test Continuously**: Run tests after each milestone, not just at the end
> 4. **Maintain Backwards Compatibility**: Current MCP clients should keep working throughout
> 5. **Branch Strategy**: Use feature branches for each phase, merge to main when stable
> 6. **Documentation**: Update README and examples as features are added

## Overview

Transform `mcp-agent-proxy` from a ~500 line static proxy into a BGP-inspired dynamic routing system for agents, maintaining full backwards compatibility while adding Internet-scale capabilities.

### Success Metrics

- ✅ Current MCP clients continue working unchanged
- ✅ No loops in recursive agent networks
- ✅ Dynamic agent discovery without broadcast storms
- ✅ Policy-based agent access control
- ✅ Sub-second agent resolution in large networks
- ✅ Graceful handling of 100+ agent networks

---

## Phase 1: BGP Foundation (Weeks 1-2)

_Add BGP awareness while maintaining current functionality_

### 1.1: Core BGP Types and Interfaces

**Goal**: Establish BGP data structures without changing behavior

**Step 1.1.1**: Create BGP type definitions

```bash
# Create new files
mkdir -p src/bgp
touch src/bgp/types.ts
touch src/bgp/route-table.ts
touch src/bgp/path-selection.ts
```

**Implementation**: `src/bgp/types.ts`

```typescript
// Core BGP-inspired types for agent routing
export interface AgentRoute {
  agentId: string
  capabilities: string[]
  asPath: number[] // BGP path vector for loop prevention
  nextHop: string // URL of next router/server
  localPref: number // Local preference (higher = better)
  med: number // Multi-exit discriminator (lower = better)
  communities: string[] // BGP communities for policy
  originTime: Date // When route was first learned
  pathAttributes: Map<string, any>
}

export interface AgentPeer {
  asn: number
  address: string
  status: 'idle' | 'connect' | 'active' | 'established'
  lastUpdate: Date
  routesReceived: number
  routesSent: number
}

export interface AgentRoutingTable {
  // BGP Adj-RIB-In: Routes received from peers (before policy)
  adjRibIn: Map<number, Map<string, AgentRoute>>

  // BGP Loc-RIB: Best routes after path selection
  locRib: Map<string, AgentRoute>

  // BGP Adj-RIB-Out: Routes sent to peers (after policy)
  adjRibOut: Map<number, Map<string, AgentRoute>>
}

export interface RoutingPolicy {
  import: PolicyStatement[]
  export: PolicyStatement[]
}

export interface PolicyStatement {
  name: string
  match: MatchCondition
  action: PolicyAction
}

export interface MatchCondition {
  asPath?: number[]
  capabilities?: string[]
  communities?: string[]
  agentPrefixes?: string[]
}

export interface PolicyAction {
  action: 'accept' | 'reject' | 'modify'
  setLocalPref?: number
  setCommunities?: string[]
  setMED?: number
  prependCount?: number // AS path prepending
}
```

**Step 1.1.2**: Implement route table management

```typescript
// src/bgp/route-table.ts
import { AgentRoute, AgentRoutingTable } from './types.js'

export class AgentRouteTable {
  private rib: AgentRoutingTable

  constructor() {
    this.rib = {
      adjRibIn: new Map(),
      locRib: new Map(),
      adjRibOut: new Map(),
    }
  }

  // Add route from peer (to Adj-RIB-In)
  addRouteFromPeer(peerASN: number, route: AgentRoute): void {
    if (!this.rib.adjRibIn.has(peerASN)) {
      this.rib.adjRibIn.set(peerASN, new Map())
    }
    this.rib.adjRibIn.get(peerASN)!.set(route.agentId, route)
  }

  // Get all routes for an agent from all peers
  getRoutesForAgent(agentId: string): AgentRoute[] {
    const routes: AgentRoute[] = []
    for (const peerRoutes of this.rib.adjRibIn.values()) {
      const route = peerRoutes.get(agentId)
      if (route) routes.push(route)
    }
    return routes
  }

  // Install best route in Loc-RIB
  installBestRoute(agentId: string, route: AgentRoute): void {
    this.rib.locRib.set(agentId, route)
  }

  // Get best route for agent
  getBestRoute(agentId: string): AgentRoute | undefined {
    return this.rib.locRib.get(agentId)
  }

  // Get all known agents
  getAllKnownAgents(): string[] {
    return Array.from(this.rib.locRib.keys())
  }
}
```

**Testing**: Create `tests/bgp/route-table.test.ts`

```typescript
import { AgentRouteTable } from '../../src/bgp/route-table.js'
import { AgentRoute } from '../../src/bgp/types.js'

describe('AgentRouteTable', () => {
  it('should store and retrieve routes correctly', () => {
    const table = new AgentRouteTable()
    const route: AgentRoute = {
      agentId: 'test-agent',
      capabilities: ['coding'],
      asPath: [65001],
      nextHop: 'http://localhost:4111',
      localPref: 100,
      med: 0,
      communities: [],
      originTime: new Date(),
      pathAttributes: new Map(),
    }

    table.addRouteFromPeer(65001, route)
    const routes = table.getRoutesForAgent('test-agent')
    expect(routes).toHaveLength(1)
    expect(routes[0].agentId).toBe('test-agent')
  })
})
```

### 1.2: Enhanced Server Configuration with AS Numbers

**Step 1.2.1**: Extend configuration to support AS numbers

**Implementation**: Update `src/config.ts`

```typescript
export interface ServerConfig {
  name: string
  url: string
  asn: number // NEW: AS number
  description?: string
}

/**
 * Load server mappings with AS numbers for BGP-style routing
 */
export function loadServerMappings(): Map<string, ServerConfig> {
  const serversConfig = process.env.MASTRA_SERVERS

  if (serversConfig) {
    try {
      const serverUrls = serversConfig
        .split(/[,\s]+/)
        .map((url) => url.trim())
        .filter((url) => url.length > 0)

      const serverMap = new Map<string, ServerConfig>()

      // Auto-generate AS numbers starting from 65001 (private range)
      serverUrls.forEach((url, index) => {
        if (typeof url === 'string' && url.trim()) {
          const serverName = `server${index}`
          serverMap.set(serverName, {
            name: serverName,
            url: url.trim(),
            asn: 65001 + index, // Private AS numbers
            description: `Mastra Server (${serverName})`,
          })
        }
      })

      if (serverMap.size === 0) {
        logger.log('No valid URLs in MASTRA_SERVERS, using defaults')
        return getDefaultMappings()
      }

      logger.log(
        `Loaded ${serverMap.size} server mappings with AS numbers:`,
        Array.from(serverMap.entries()),
      )
      return serverMap
    } catch (error) {
      logger.error('Failed to parse MASTRA_SERVERS:', error)
      return getDefaultMappings()
    }
  }

  return getDefaultMappings()
}

function getDefaultMappings(): Map<string, ServerConfig> {
  return new Map([
    [
      'server0',
      {
        name: 'server0',
        url: 'http://localhost:4111',
        asn: 65001,
        description: 'Default Mastra Server',
      },
    ],
  ])
}
```

**Step 1.2.2**: Update tools to use new configuration

**Implementation**: Update `src/tools/list-mastra-agents-tool.ts`

```typescript
function getServersFromConfig(): ServerConfig[] {
  const serverMappings = loadServerMappings()
  return Array.from(serverMappings.values())
}
```

**Testing**: Update existing tests to handle AS numbers, ensure backwards compatibility

### 1.3: Basic Path Vector Tracking

**Step 1.3.1**: Add AS path tracking to agent discovery

**Implementation**: Update `src/tools/agent-proxy-tool.ts`

```typescript
import { AgentRouteTable } from '../bgp/route-table.js'
import { AgentRoute } from '../bgp/types.js'

// Add route table to proxy tool (global for now, will be per-router later)
const routeTable = new AgentRouteTable()

async function findAgentServersWithPaths(
  agentId: string,
  serverMap: Map<string, ServerConfig>,
  currentASPath: number[] = [], // NEW: Track AS path
): Promise<Map<string, AgentRoute>> {
  const foundRoutes = new Map<string, AgentRoute>()
  const retryConfig = getRetryConfig()

  for (const [serverName, serverConfig] of serverMap.entries()) {
    // BGP loop prevention: Don't query servers in our AS path
    if (currentASPath.includes(serverConfig.asn)) {
      logger.log(
        `Skipping ${serverName} (AS ${serverConfig.asn}) - loop detected in path [${currentASPath.join(', ')}]`,
      )
      continue
    }

    try {
      const clientConfig = {
        baseUrl: serverConfig.url,
        retries: retryConfig.discovery.retries,
        backoffMs: retryConfig.discovery.backoffMs,
        maxBackoffMs: retryConfig.discovery.maxBackoffMs,
      }

      const mastraClient = new MastraClient(clientConfig)
      const agentsData = await mastraClient.getAgents()

      if (agentsData && Object.keys(agentsData).includes(agentId)) {
        // Create BGP-style route
        const route: AgentRoute = {
          agentId,
          capabilities: extractCapabilities(agentsData[agentId]), // Helper function
          asPath: [...currentASPath, serverConfig.asn], // Add this AS to path
          nextHop: serverConfig.url,
          localPref: 100, // Default preference
          med: 0, // Default MED
          communities: [], // No communities yet
          originTime: new Date(),
          pathAttributes: new Map(),
        }

        foundRoutes.set(serverName, route)

        // Store in route table for future BGP operations
        routeTable.addRouteFromPeer(serverConfig.asn, route)
      }
    } catch (error) {
      logger.log(`Failed to query ${serverName}: ${error}`)
      continue
    }
  }

  return foundRoutes
}

function extractCapabilities(agentData: any): string[] {
  // Extract capabilities from agent metadata
  // For now, return basic capability based on agent type
  if (agentData.name?.includes('code') || agentData.name?.includes('coding')) {
    return ['coding', 'typescript', 'debugging']
  }
  if (agentData.name?.includes('weather')) {
    return ['weather', 'forecasting']
  }
  // Default capabilities
  return ['general', 'conversation']
}
```

**Step 1.3.2**: Update resolution logic to use routes

```typescript
// Update the main resolution logic in agentProxyTool
if (serverUrl) {
  // Explicit server URL override - maintain backwards compatibility
  serverToUse = serverUrl
  resolutionMethod = 'explicit_url_override'
  // ... existing logic
} else {
  // NEW: Use BGP-style route discovery with path vectors
  const currentAS = 65000 // Our proxy's AS number (configurable later)
  const foundRoutes = await findAgentServersWithPaths(
    actualAgentId,
    SERVER_MAP,
    [currentAS],
  )

  if (foundRoutes.size === 0) {
    // Agent not found - same error as before
    const availableServers = Array.from(SERVER_MAP.keys()).join(', ')
    throw new Error(
      `Agent '${actualAgentId}' not found on any configured server. Available servers: ${availableServers}.`,
    )
  }

  // For now, use simple selection (Phase 2 will add full path selection)
  const [serverName, route] = Array.from(foundRoutes.entries())[0]
  serverToUse = route.nextHop
  fullyQualifiedId = `${serverName}:${actualAgentId}`
  resolutionMethod = `bgp_path_vector_${route.asPath.join('-')}`
}
```

**Testing**: Create `tests/bgp/path-tracking.test.ts`

```typescript
describe('Path Vector Tracking', () => {
  it('should prevent loops in AS path', async () => {
    // Test that servers already in AS path are skipped
    const serverMap = new Map([
      ['server0', { name: 'server0', url: 'http://test1', asn: 65001 }],
      ['server1', { name: 'server1', url: 'http://test2', asn: 65002 }],
    ])

    const routes = await findAgentServersWithPaths(
      'test-agent',
      serverMap,
      [65001], // AS 65001 already in path
    )

    // Should only find routes from server1 (AS 65002)
    expect(routes.has('server0')).toBe(false)
    expect(routes.has('server1')).toBe(true)
  })
})
```

---

## Phase 2: Dynamic Discovery & Basic BGP (Weeks 3-4)

_Replace static discovery with dynamic route advertisement_

### 2.1: BGP Session Management

**Step 2.1.1**: Implement BGP neighbor management

**Implementation**: Create `src/bgp/session.ts`

```typescript
import { AgentPeer } from './types.js'
import { EventEmitter } from 'events'

export class BGPSession extends EventEmitter {
  private peers: Map<number, AgentPeer> = new Map()
  private keepAliveInterval: NodeJS.Timeout | null = null

  constructor(private localASN: number) {
    super()
  }

  async addPeer(asn: number, address: string): Promise<void> {
    const peer: AgentPeer = {
      asn,
      address,
      status: 'idle',
      lastUpdate: new Date(),
      routesReceived: 0,
      routesSent: 0,
    }

    this.peers.set(asn, peer)
    await this.establishConnection(peer)
  }

  private async establishConnection(peer: AgentPeer): Promise<void> {
    try {
      peer.status = 'connect'

      // Simple HTTP-based "BGP" connection (WebSocket would be better for production)
      const response = await fetch(`${peer.address}/bgp/hello`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          localASN: this.localASN,
          timestamp: new Date().toISOString(),
        }),
      })

      if (response.ok) {
        peer.status = 'established'
        peer.lastUpdate = new Date()
        this.emit('peerEstablished', peer)

        // Start keep-alive mechanism
        this.startKeepAlive(peer)

        // Request initial route table
        await this.requestRoutes(peer)
      } else {
        peer.status = 'idle'
        this.emit('peerFailed', peer)
      }
    } catch (error) {
      peer.status = 'idle'
      this.emit('peerFailed', peer, error)
    }
  }

  private startKeepAlive(peer: AgentPeer): void {
    // Send keep-alive every 30 seconds
    setInterval(async () => {
      try {
        await fetch(`${peer.address}/bgp/keepalive`, { method: 'POST' })
        peer.lastUpdate = new Date()
      } catch (error) {
        peer.status = 'idle'
        this.emit('peerDown', peer)
      }
    }, 30000)
  }

  private async requestRoutes(peer: AgentPeer): Promise<void> {
    try {
      const response = await fetch(`${peer.address}/bgp/routes`)
      const routes = await response.json()

      this.emit('routesReceived', peer, routes)
      peer.routesReceived = routes.length
    } catch (error) {
      this.emit('routeRequestFailed', peer, error)
    }
  }

  async advertiseRoutes(routes: AgentRoute[]): Promise<void> {
    for (const peer of this.peers.values()) {
      if (peer.status === 'established') {
        try {
          await fetch(`${peer.address}/bgp/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ routes }),
          })
          peer.routesSent += routes.length
        } catch (error) {
          this.emit('advertiseFailed', peer, error)
        }
      }
    }
  }

  getPeers(): Map<number, AgentPeer> {
    return new Map(this.peers)
  }
}
```

**Step 2.1.2**: Add BGP endpoints to MCP server

**Implementation**: Update `src/mcp-server.ts`

```typescript
import { BGPSession } from './bgp/session.js'

// Add BGP session management
const bgpSession = new BGPSession(65000) // Our proxy AS number

// Add BGP endpoints to HTTP server
if (requestUrl.pathname === '/bgp/hello') {
  // BGP neighbor establishment
  const body = await readRequestBody(req)
  const { localASN } = JSON.parse(body)

  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(
    JSON.stringify({
      status: 'established',
      localASN: 65000,
      timestamp: new Date().toISOString(),
    }),
  )
  return
}

if (requestUrl.pathname === '/bgp/routes') {
  // Advertise our local routes
  const localRoutes = await getLocalAgentRoutes()
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(localRoutes))
  return
}

if (requestUrl.pathname === '/bgp/update') {
  // Receive route updates from peers
  const body = await readRequestBody(req)
  const { routes } = JSON.parse(body)

  // Process received routes
  await processReceivedRoutes(routes)

  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ status: 'accepted' }))
  return
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => resolve(body))
  })
}
```

### 2.2: Agent Advertisement System

**Step 2.2.1**: Implement local agent discovery and advertisement

**Implementation**: Create `src/bgp/agent-discovery.ts`

```typescript
import { AgentRoute } from './types.js'
import { MastraClient } from '@mastra/client-js'

export class AgentDiscovery {
  private localRoutes: Map<string, AgentRoute> = new Map()
  private discoveryInterval: NodeJS.Timeout | null = null

  constructor(
    private localASN: number,
    private localServers: ServerConfig[],
  ) {}

  async start(): Promise<void> {
    // Initial discovery
    await this.discoverLocalAgents()

    // Periodic rediscovery (every 5 minutes)
    this.discoveryInterval = setInterval(
      () => {
        this.discoverLocalAgents()
      },
      5 * 60 * 1000,
    )
  }

  async stop(): Promise<void> {
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval)
    }
  }

  private async discoverLocalAgents(): Promise<void> {
    const newRoutes = new Map<string, AgentRoute>()

    for (const server of this.localServers) {
      try {
        const client = new MastraClient({ baseUrl: server.url })
        const agents = await client.getAgents()

        for (const [agentId, agentData] of Object.entries(agents)) {
          const route: AgentRoute = {
            agentId,
            capabilities: this.extractCapabilities(agentData),
            asPath: [this.localASN], // Origin from our AS
            nextHop: server.url,
            localPref: 100,
            med: this.calculateMED(agentData), // Based on agent performance
            communities: this.extractCommunities(server, agentData),
            originTime: new Date(),
            pathAttributes: new Map(),
          }

          newRoutes.set(agentId, route)
        }
      } catch (error) {
        console.error(`Failed to discover agents from ${server.url}:`, error)
      }
    }

    // Detect changes and emit events
    const added = this.findAddedRoutes(newRoutes)
    const removed = this.findRemovedRoutes(newRoutes)

    if (added.length > 0 || removed.length > 0) {
      this.localRoutes = newRoutes
      this.emit('routesChanged', { added, removed })
    }
  }

  private calculateMED(agentData: any): number {
    // Calculate MED based on agent performance metrics
    // Lower MED = better performance
    let med = 100 // Default

    if (agentData.responseTime) {
      med += Math.floor(agentData.responseTime / 10) // Add response time penalty
    }

    if (agentData.queueDepth) {
      med += agentData.queueDepth * 10 // Queue depth penalty
    }

    return Math.min(med, 999) // Cap at 999
  }

  private extractCommunities(server: ServerConfig, agentData: any): string[] {
    const communities: string[] = []

    // Add server-based communities
    communities.push(`server:${server.name}`)
    communities.push(`as:${server.asn}`)

    // Add capability-based communities
    if (agentData.capabilities) {
      agentData.capabilities.forEach((cap: string) => {
        communities.push(`capability:${cap}`)
      })
    }

    // Add performance communities
    if (agentData.responseTime < 100) {
      communities.push('performance:fast')
    } else if (agentData.responseTime > 1000) {
      communities.push('performance:slow')
    }

    return communities
  }

  getLocalRoutes(): Map<string, AgentRoute> {
    return new Map(this.localRoutes)
  }
}
```

### 2.3: Basic Path Selection Algorithm

**Step 2.3.1**: Implement BGP decision process for agents

**Implementation**: Create `src/bgp/path-selection.ts`

```typescript
import { AgentRoute } from './types.js'

export class AgentPathSelection {
  /**
   * BGP path selection algorithm adapted for agents
   * Returns the best route for an agent based on BGP rules
   */
  selectBestPath(routes: AgentRoute[]): AgentRoute | null {
    if (routes.length === 0) return null
    if (routes.length === 1) return routes[0]

    let candidates = [...routes]

    // 1. Highest local preference
    candidates = this.filterByMaxLocalPref(candidates)
    if (candidates.length === 1) return candidates[0]

    // 2. Shortest AS path length
    candidates = this.filterByShortestASPath(candidates)
    if (candidates.length === 1) return candidates[0]

    // 3. Lowest origin time (prefer more established agents)
    candidates = this.filterByOriginTime(candidates)
    if (candidates.length === 1) return candidates[0]

    // 4. Lowest MED (better performance)
    candidates = this.filterByLowestMED(candidates)
    if (candidates.length === 1) return candidates[0]

    // 5. Prefer internal routes (same AS as us)
    candidates = this.preferInternalRoutes(candidates)
    if (candidates.length === 1) return candidates[0]

    // 6. Capability match score (agent-specific tie-breaker)
    candidates = this.sortByCapabilityMatch(candidates)

    return candidates[0]
  }

  private filterByMaxLocalPref(routes: AgentRoute[]): AgentRoute[] {
    const maxPref = Math.max(...routes.map((r) => r.localPref))
    return routes.filter((r) => r.localPref === maxPref)
  }

  private filterByShortestASPath(routes: AgentRoute[]): AgentRoute[] {
    const minLength = Math.min(...routes.map((r) => r.asPath.length))
    return routes.filter((r) => r.asPath.length === minLength)
  }

  private filterByOriginTime(routes: AgentRoute[]): AgentRoute[] {
    const earliestTime = Math.min(...routes.map((r) => r.originTime.getTime()))
    return routes.filter((r) => r.originTime.getTime() === earliestTime)
  }

  private filterByLowestMED(routes: AgentRoute[]): AgentRoute[] {
    const minMED = Math.min(...routes.map((r) => r.med))
    return routes.filter((r) => r.med === minMED)
  }

  private preferInternalRoutes(
    routes: AgentRoute[],
    localASN: number = 65000,
  ): AgentRoute[] {
    const internalRoutes = routes.filter(
      (r) => r.asPath.length === 1 && r.asPath[0] === localASN,
    )
    return internalRoutes.length > 0 ? internalRoutes : routes
  }

  private sortByCapabilityMatch(
    routes: AgentRoute[],
    requiredCapabilities: string[] = [],
  ): AgentRoute[] {
    if (requiredCapabilities.length === 0) {
      return routes // No specific requirements
    }

    return routes.sort((a, b) => {
      const scoreA = this.calculateCapabilityScore(
        a.capabilities,
        requiredCapabilities,
      )
      const scoreB = this.calculateCapabilityScore(
        b.capabilities,
        requiredCapabilities,
      )
      return scoreB - scoreA // Higher score first
    })
  }

  private calculateCapabilityScore(
    agentCapabilities: string[],
    required: string[],
  ): number {
    let score = 0
    for (const reqCap of required) {
      if (agentCapabilities.includes(reqCap)) {
        score += 10 // Exact match
      } else if (
        agentCapabilities.some(
          (cap) => cap.includes(reqCap) || reqCap.includes(cap),
        )
      ) {
        score += 5 // Partial match
      }
    }
    return score
  }
}
```

**Testing**: Create comprehensive path selection tests

```typescript
describe('AgentPathSelection', () => {
  const selector = new AgentPathSelection()

  it('should prefer routes with higher local preference', () => {
    const routes = [
      createRoute('agent1', { localPref: 100 }),
      createRoute('agent1', { localPref: 150 }),
      createRoute('agent1', { localPref: 80 }),
    ]

    const best = selector.selectBestPath(routes)
    expect(best?.localPref).toBe(150)
  })

  it('should prefer shorter AS paths when local pref is equal', () => {
    const routes = [
      createRoute('agent1', { localPref: 100, asPath: [65001, 65002, 65003] }),
      createRoute('agent1', { localPref: 100, asPath: [65001] }),
      createRoute('agent1', { localPref: 100, asPath: [65001, 65002] }),
    ]

    const best = selector.selectBestPath(routes)
    expect(best?.asPath).toEqual([65001])
  })
})
```

---

## Phase 3: Policy Framework (Weeks 5-6)

_Add enterprise-grade policy controls_

### 3.1: Policy Configuration System

**Step 3.1.1**: Implement policy configuration

**Implementation**: Create `src/bgp/policy.ts`

```typescript
import { RoutingPolicy, PolicyStatement, AgentRoute } from './types.js'

export class PolicyEngine {
  constructor(private policy: RoutingPolicy) {}

  applyImportPolicy(route: AgentRoute, peerASN: number): AgentRoute | null {
    for (const statement of this.policy.import) {
      if (this.matchesCondition(route, statement.match, peerASN)) {
        return this.applyAction(route, statement.action)
      }
    }

    // Default accept if no explicit rules
    return route
  }

  applyExportPolicy(route: AgentRoute, peerASN: number): AgentRoute | null {
    for (const statement of this.policy.export) {
      if (this.matchesCondition(route, statement.match, peerASN)) {
        return this.applyAction(route, statement.action)
      }
    }

    // Default accept if no explicit rules
    return route
  }

  private matchesCondition(
    route: AgentRoute,
    match: MatchCondition,
    peerASN: number,
  ): boolean {
    // AS Path matching
    if (match.asPath && !this.matchesASPath(route.asPath, match.asPath)) {
      return false
    }

    // Capability matching
    if (
      match.capabilities &&
      !this.matchesCapabilities(route.capabilities, match.capabilities)
    ) {
      return false
    }

    // Community matching
    if (
      match.communities &&
      !this.matchesCommunities(route.communities, match.communities)
    ) {
      return false
    }

    // Agent prefix matching
    if (
      match.agentPrefixes &&
      !this.matchesAgentPrefixes(route.agentId, match.agentPrefixes)
    ) {
      return false
    }

    return true
  }

  private matchesASPath(routePath: number[], matchPath: number[]): boolean {
    // Simple containment check - route path contains all match ASNs
    return matchPath.every((asn) => routePath.includes(asn))
  }

  private matchesCapabilities(
    routeCaps: string[],
    matchCaps: string[],
  ): boolean {
    // Route must have all required capabilities
    return matchCaps.every((cap) => routeCaps.includes(cap))
  }

  private matchesCommunities(
    routeCommunities: string[],
    matchCommunities: string[],
  ): boolean {
    // Route must have at least one matching community
    return matchCommunities.some((comm) => routeCommunities.includes(comm))
  }

  private matchesAgentPrefixes(agentId: string, prefixes: string[]): boolean {
    // Check if agent ID matches any prefix pattern
    return prefixes.some((prefix) => {
      if (prefix.endsWith('*')) {
        return agentId.startsWith(prefix.slice(0, -1))
      }
      return agentId === prefix
    })
  }

  private applyAction(
    route: AgentRoute,
    action: PolicyAction,
  ): AgentRoute | null {
    if (action.action === 'reject') {
      return null
    }

    if (action.action === 'accept') {
      return route
    }

    if (action.action === 'modify') {
      const modifiedRoute = { ...route }

      if (action.setLocalPref !== undefined) {
        modifiedRoute.localPref = action.setLocalPref
      }

      if (action.setCommunities) {
        modifiedRoute.communities = [
          ...route.communities,
          ...action.setCommunities,
        ]
      }

      if (action.setMED !== undefined) {
        modifiedRoute.med = action.setMED
      }

      if (action.prependCount && action.prependCount > 0) {
        // AS path prepending - add our ASN multiple times
        const ownASN = route.asPath[route.asPath.length - 1] || 65000
        modifiedRoute.asPath = [
          ...Array(action.prependCount).fill(ownASN),
          ...route.asPath,
        ]
      }

      return modifiedRoute
    }

    return route
  }
}
```

**Step 3.1.2**: Add policy configuration to environment

**Implementation**: Update `src/config.ts`

```typescript
export function loadRoutingPolicy(): RoutingPolicy {
  const policyFile = process.env.AGENT_ROUTING_POLICY

  if (policyFile) {
    try {
      const policyData = JSON.parse(fs.readFileSync(policyFile, 'utf8'))
      return policyData as RoutingPolicy
    } catch (error) {
      logger.error('Failed to load routing policy:', error)
    }
  }

  // Default policy - allow everything
  return {
    import: [
      {
        name: 'default-import',
        match: {},
        action: { action: 'accept' },
      },
    ],
    export: [
      {
        name: 'default-export',
        match: {},
        action: { action: 'accept' },
      },
    ],
  }
}
```

### 3.2: Example Enterprise Policies

**Step 3.2.1**: Create policy templates

**Implementation**: Create `examples/policies/`

```bash
mkdir -p examples/policies
```

**File**: `examples/policies/enterprise-policy.json`

```json
{
  "_description": "Enterprise routing policy for agent networks",
  "import": [
    {
      "name": "block-external-training",
      "match": {
        "capabilities": ["model-training", "fine-tuning"],
        "asPath": [65001]
      },
      "action": {
        "action": "reject"
      }
    },
    {
      "name": "prefer-internal-coding",
      "match": {
        "capabilities": ["coding", "development"],
        "communities": ["internal"]
      },
      "action": {
        "action": "modify",
        "setLocalPref": 150
      }
    },
    {
      "name": "depref-slow-agents",
      "match": {
        "communities": ["performance:slow"]
      },
      "action": {
        "action": "modify",
        "prependCount": 2
      }
    }
  ],
  "export": [
    {
      "name": "no-confidential-external",
      "match": {
        "communities": ["confidential", "internal-only"]
      },
      "action": {
        "action": "reject"
      }
    },
    {
      "name": "mark-exported-agents",
      "match": {},
      "action": {
        "action": "modify",
        "setCommunities": ["exported"]
      }
    }
  ]
}
```

**File**: `examples/policies/development-policy.json`

```json
{
  "_description": "Development environment - more permissive",
  "import": [
    {
      "name": "accept-all-coding",
      "match": {
        "capabilities": ["coding", "testing", "debugging"]
      },
      "action": {
        "action": "accept"
      }
    },
    {
      "name": "prefer-local-development",
      "match": {
        "agentPrefixes": ["dev-*", "local-*"]
      },
      "action": {
        "action": "modify",
        "setLocalPref": 200
      }
    }
  ],
  "export": [
    {
      "name": "share-development-agents",
      "match": {
        "communities": ["development", "testing"]
      },
      "action": {
        "action": "accept"
      }
    }
  ]
}
```

---

## Phase 4: Advanced Features (Weeks 7-8)

_Production-ready features for large-scale deployment_

### 4.1: Route Reflection and Hierarchical Design

**Step 4.1.1**: Implement route reflection for scalability

**Implementation**: Create `src/bgp/route-reflector.ts`

```typescript
export class AgentRouteReflector extends AgentBGPRouter {
  private clients: Set<number> = new Set()
  private nonClients: Set<number> = new Set()

  constructor(
    asn: number,
    private clusterId: string,
  ) {
    super(asn)
  }

  addClient(clientASN: number): void {
    this.clients.add(clientASN)
    this.nonClients.delete(clientASN)
  }

  addNonClient(peerASN: number): void {
    this.nonClients.add(peerASN)
    this.clients.delete(peerASN)
  }

  async reflectRoute(route: AgentRoute, fromPeer: number): Promise<void> {
    // Add route reflector attributes
    const reflectedRoute = {
      ...route,
      pathAttributes: new Map(route.pathAttributes),
    }

    // Add cluster ID to prevent loops
    const clusterList = reflectedRoute.pathAttributes.get('CLUSTER_LIST') || []
    if (clusterList.includes(this.clusterId)) {
      // Loop detected, don't reflect
      return
    }
    clusterList.push(this.clusterId)
    reflectedRoute.pathAttributes.set('CLUSTER_LIST', clusterList)

    // Add originator ID
    if (!reflectedRoute.pathAttributes.has('ORIGINATOR_ID')) {
      reflectedRoute.pathAttributes.set('ORIGINATOR_ID', fromPeer)
    }

    if (this.clients.has(fromPeer)) {
      // From client: reflect to all other clients and non-clients
      await this.advertiseToClients(reflectedRoute, [fromPeer])
      await this.advertiseToNonClients(reflectedRoute)
    } else if (this.nonClients.has(fromPeer)) {
      // From non-client: reflect only to clients
      await this.advertiseToClients(reflectedRoute)
    }
    // From non-peer: don't reflect
  }

  private async advertiseToClients(
    route: AgentRoute,
    excludeClients: number[] = [],
  ): Promise<void> {
    for (const clientASN of this.clients) {
      if (!excludeClients.includes(clientASN)) {
        await this.advertiseToAS(clientASN, [route])
      }
    }
  }

  private async advertiseToNonClients(route: AgentRoute): Promise<void> {
    for (const peerASN of this.nonClients) {
      await this.advertiseToAS(peerASN, [route])
    }
  }
}
```

### 4.2: Multi-path Load Balancing

**Step 4.2.1**: Implement ECMP for agent requests

**Implementation**: Create `src/bgp/multipath.ts`

```typescript
interface MultiPathConfig {
  enableMultiPath: boolean
  maxPaths: number
  loadBalancingMethod: 'round-robin' | 'capability-aware' | 'latency-based'
}

export class MultiPathLoadBalancer {
  private pathIndex: Map<string, number> = new Map()

  constructor(private config: MultiPathConfig) {}

  selectPath(
    agentId: string,
    equalPaths: AgentRoute[],
    requiredCapabilities: string[] = [],
  ): AgentRoute {
    if (!this.config.enableMultiPath || equalPaths.length === 1) {
      return equalPaths[0]
    }

    const viablePaths = equalPaths.slice(0, this.config.maxPaths)

    switch (this.config.loadBalancingMethod) {
      case 'round-robin':
        return this.roundRobinSelection(agentId, viablePaths)

      case 'capability-aware':
        return this.capabilityAwareSelection(viablePaths, requiredCapabilities)

      case 'latency-based':
        return this.latencyBasedSelection(viablePaths)

      default:
        return viablePaths[0]
    }
  }

  private roundRobinSelection(
    agentId: string,
    paths: AgentRoute[],
  ): AgentRoute {
    const currentIndex = this.pathIndex.get(agentId) || 0
    const nextIndex = (currentIndex + 1) % paths.length
    this.pathIndex.set(agentId, nextIndex)
    return paths[currentIndex]
  }

  private capabilityAwareSelection(
    paths: AgentRoute[],
    requiredCapabilities: string[],
  ): AgentRoute {
    if (requiredCapabilities.length === 0) {
      return paths[0]
    }

    // Score paths by capability match
    const scoredPaths = paths.map((path) => ({
      path,
      score: this.calculateCapabilityScore(
        path.capabilities,
        requiredCapabilities,
      ),
    }))

    scoredPaths.sort((a, b) => b.score - a.score)
    return scoredPaths[0].path
  }

  private latencyBasedSelection(paths: AgentRoute[]): AgentRoute {
    // Select path with lowest MED (performance metric)
    return paths.reduce((best, current) =>
      current.med < best.med ? current : best,
    )
  }

  private calculateCapabilityScore(
    agentCaps: string[],
    required: string[],
  ): number {
    let score = 0
    for (const reqCap of required) {
      if (agentCaps.includes(reqCap)) {
        score += 10
      } else if (agentCaps.some((cap) => cap.includes(reqCap))) {
        score += 5
      }
    }
    return score
  }
}
```

### 4.3: Health Monitoring and MED Updates

**Step 4.3.1**: Implement dynamic health monitoring

**Implementation**: Create `src/bgp/health-monitor.ts`

```typescript
interface AgentHealthMetrics {
  responseTime: number
  successRate: number
  queueDepth: number
  cpuUsage: number
  errorRate: number
  lastCheck: Date
}

export class AgentHealthMonitor {
  private healthData: Map<string, AgentHealthMetrics> = new Map()
  private monitoringInterval: NodeJS.Timeout | null = null

  constructor(private routes: Map<string, AgentRoute>) {}

  start(): void {
    // Monitor health every 60 seconds
    this.monitoringInterval = setInterval(() => {
      this.checkAllAgents()
    }, 60000)

    // Initial check
    this.checkAllAgents()
  }

  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
    }
  }

  private async checkAllAgents(): Promise<void> {
    const healthChecks = Array.from(this.routes.entries()).map(
      ([agentId, route]) => this.checkAgentHealth(agentId, route),
    )

    await Promise.allSettled(healthChecks)
  }

  private async checkAgentHealth(
    agentId: string,
    route: AgentRoute,
  ): Promise<void> {
    const startTime = Date.now()

    try {
      // Simple health check via MCP ping
      const response = await fetch(`${route.nextHop}/health`, {
        method: 'GET',
        timeout: 5000,
      })

      const responseTime = Date.now() - startTime
      const isHealthy = response.ok

      const metrics: AgentHealthMetrics = {
        responseTime,
        successRate: isHealthy ? 1.0 : 0.0,
        queueDepth: await this.getQueueDepth(route.nextHop),
        cpuUsage: await this.getCPUUsage(route.nextHop),
        errorRate: isHealthy ? 0.0 : 1.0,
        lastCheck: new Date(),
      }

      this.healthData.set(agentId, metrics)

      // Update route MED based on health
      const newMED = this.calculateMED(metrics)
      if (newMED !== route.med) {
        route.med = newMED
        this.emit('routeHealthChanged', agentId, route)
      }
    } catch (error) {
      // Health check failed
      const metrics: AgentHealthMetrics = {
        responseTime: 5000, // Timeout value
        successRate: 0.0,
        queueDepth: 0,
        cpuUsage: 0,
        errorRate: 1.0,
        lastCheck: new Date(),
      }

      this.healthData.set(agentId, metrics)

      // Set high MED for unhealthy agents
      route.med = 999
      this.emit('routeHealthChanged', agentId, route)
    }
  }

  private calculateMED(metrics: AgentHealthMetrics): number {
    let med = 0

    // Response time component (0-100)
    med += Math.min(Math.floor(metrics.responseTime / 10), 100)

    // Success rate component (0-100, inverted)
    med += Math.floor((1 - metrics.successRate) * 100)

    // Queue depth component (0-50)
    med += Math.min(metrics.queueDepth * 10, 50)

    // CPU usage component (0-50)
    med += Math.min(Math.floor(metrics.cpuUsage * 50), 50)

    return Math.min(med, 999)
  }

  private async getQueueDepth(serverUrl: string): Promise<number> {
    try {
      const response = await fetch(`${serverUrl}/status`)
      const status = await response.json()
      return status.queueDepth || 0
    } catch {
      return 0
    }
  }

  private async getCPUUsage(serverUrl: string): Promise<number> {
    try {
      const response = await fetch(`${serverUrl}/status`)
      const status = await response.json()
      return status.cpuUsage || 0
    } catch {
      return 0
    }
  }

  getHealthMetrics(agentId: string): AgentHealthMetrics | undefined {
    return this.healthData.get(agentId)
  }
}
```

---

## Phase 5: Integration & Production (Weeks 9-10)

_Integration testing and production deployment_

### 5.1: Complete Integration

**Step 5.1.1**: Wire everything together in main BGP router

**Implementation**: Create `src/bgp/agent-bgp-router.ts`

```typescript
import { AgentRouteTable } from './route-table.js'
import { AgentPathSelection } from './path-selection.js'
import { PolicyEngine } from './policy.js'
import { BGPSession } from './session.js'
import { AgentDiscovery } from './agent-discovery.js'
import { MultiPathLoadBalancer } from './multipath.js'
import { AgentHealthMonitor } from './health-monitor.js'

export class AgentBGPRouter extends EventEmitter {
  private routeTable: AgentRouteTable
  private pathSelection: AgentPathSelection
  private policyEngine: PolicyEngine
  private bgpSession: BGPSession
  private discovery: AgentDiscovery
  private loadBalancer: MultiPathLoadBalancer
  private healthMonitor: AgentHealthMonitor

  constructor(
    private asn: number,
    private policy: RoutingPolicy,
    private serverConfigs: ServerConfig[],
  ) {
    super()

    this.routeTable = new AgentRouteTable()
    this.pathSelection = new AgentPathSelection()
    this.policyEngine = new PolicyEngine(policy)
    this.bgpSession = new BGPSession(asn)
    this.discovery = new AgentDiscovery(asn, serverConfigs)
    this.loadBalancer = new MultiPathLoadBalancer({
      enableMultiPath: true,
      maxPaths: 4,
      loadBalancingMethod: 'capability-aware',
    })
    this.healthMonitor = new AgentHealthMonitor(this.routeTable.getAllRoutes())

    this.setupEventHandlers()
  }

  async start(): Promise<void> {
    await this.discovery.start()
    await this.healthMonitor.start()

    // Establish BGP sessions with peers
    for (const server of this.serverConfigs) {
      await this.bgpSession.addPeer(server.asn, server.url)
    }
  }

  async stop(): Promise<void> {
    await this.discovery.stop()
    await this.healthMonitor.stop()
  }

  async resolveAgent(
    agentId: string,
    requiredCapabilities: string[] = [],
  ): Promise<AgentRoute | null> {
    // Get all routes for this agent
    const candidateRoutes = this.routeTable.getRoutesForAgent(agentId)

    if (candidateRoutes.length === 0) {
      return null
    }

    // Apply import policies
    const validRoutes = candidateRoutes
      .map((route) =>
        this.policyEngine.applyImportPolicy(route, route.asPath[0]),
      )
      .filter((route) => route !== null) as AgentRoute[]

    if (validRoutes.length === 0) {
      return null
    }

    // BGP path selection
    const bestRoutes = this.pathSelection.selectBestPaths(validRoutes)

    if (bestRoutes.length === 0) {
      return null
    }

    // Multi-path load balancing
    return this.loadBalancer.selectPath(
      agentId,
      bestRoutes,
      requiredCapabilities,
    )
  }

  private setupEventHandlers(): void {
    this.discovery.on('routesChanged', ({ added, removed }) => {
      // Update local route table
      for (const route of added) {
        this.routeTable.addLocalRoute(route)
      }
      for (const route of removed) {
        this.routeTable.removeLocalRoute(route.agentId)
      }

      // Advertise changes to peers
      this.bgpSession.advertiseRoutes(added)
      this.bgpSession.withdrawRoutes(removed.map((r) => r.agentId))
    })

    this.bgpSession.on('routesReceived', (peer, routes) => {
      // Process received routes
      for (const route of routes) {
        const processedRoute = this.policyEngine.applyImportPolicy(
          route,
          peer.asn,
        )
        if (processedRoute) {
          this.routeTable.addRouteFromPeer(peer.asn, processedRoute)
        }
      }
    })

    this.healthMonitor.on('routeHealthChanged', (agentId, route) => {
      // Re-advertise route with updated MED
      this.bgpSession.advertiseRoutes([route])
    })
  }
}
```

**Step 5.1.2**: Update main proxy tool to use BGP router

**Implementation**: Update `src/tools/agent-proxy-tool.ts`

```typescript
import { AgentBGPRouter } from '../bgp/agent-bgp-router.js'

// Global BGP router instance
let bgpRouter: AgentBGPRouter | null = null

// Initialize BGP router on first use
async function getBGPRouter(): Promise<AgentBGPRouter> {
  if (!bgpRouter) {
    const serverConfigs = Array.from(loadServerMappings().values())
    const policy = loadRoutingPolicy()

    bgpRouter = new AgentBGPRouter(65000, policy, serverConfigs)
    await bgpRouter.start()
  }
  return bgpRouter
}

// Update main execute function
execute: async (context: { context: z.infer<typeof agentProxyInputSchema> }) => {
  const { targetAgentId, interactionType, messages, serverUrl, threadId, resourceId, agentOptions } = context.context

  try {
    const router = await getBGPRouter()

    let actualAgentId: string
    let route: AgentRoute | null = null
    let resolutionMethod: string

    if (targetAgentId.includes(':')) {
      // Fully qualified ID - extract agent ID and resolve
      const [serverName, agentId] = targetAgentId.split(':', 2)
      actualAgentId = agentId
      route = await router.resolveAgent(actualAgentId)
      resolutionMethod = 'explicit_qualification'
    } else {
      // Plain agent ID - use BGP resolution
      actualAgentId = targetAgentId

      // Extract required capabilities from request context
      const requiredCapabilities = this.extractRequiredCapabilities(messages)

      route = await router.resolveAgent(actualAgentId, requiredCapabilities)
      resolutionMethod = 'bgp_resolution'
    }

    if (!route) {
      throw new Error(`Agent '${actualAgentId}' not found or blocked by policy`)
    }

    // Use the BGP-selected route
    const serverToUse = route.nextHop
    const fullyQualifiedId = `${route.asPath[route.asPath.length - 1]}:${actualAgentId}`

    // Rest of the execution logic remains the same...
    const retryConfig = getRetryConfig()
    const clientConfig = {
      baseUrl: serverToUse,
      retries: retryConfig.interaction.retries,
      backoffMs: retryConfig.interaction.backoffMs,
      maxBackoffMs: retryConfig.interaction.maxBackoffMs,
    }

    const mastraClient = new MastraClient(clientConfig)
    const agent = mastraClient.getAgent(actualAgentId)

    // ... rest of implementation

    return {
      success: true as const,
      responseData,
      interactionType,
      serverUsed: serverToUse,
      agentIdUsed: actualAgentId,
      fullyQualifiedId,
      resolutionMethod: `${resolutionMethod}_path_${route.asPath.join('-')}`,
      routeMetrics: {
        asPath: route.asPath,
        localPref: route.localPref,
        med: route.med,
        communities: route.communities
      }
    }
  } catch (error: unknown) {
    logger.error(`BGP resolution failed for agent '${targetAgentId}':`, error)
    throw error
  }
}

private extractRequiredCapabilities(messages: any[]): string[] {
  // Analyze messages to determine required capabilities
  const capabilities: string[] = []

  for (const message of messages) {
    if (typeof message.content === 'string') {
      const content = message.content.toLowerCase()

      if (content.includes('code') || content.includes('programming')) {
        capabilities.push('coding')
      }
      if (content.includes('weather') || content.includes('forecast')) {
        capabilities.push('weather')
      }
      if (content.includes('analyze') || content.includes('analysis')) {
        capabilities.push('analysis')
      }
      // Add more capability detection logic
    }
  }

  return capabilities
}
```

### 5.2: Comprehensive Testing Strategy

**Step 5.2.1**: Create integration test suite

**Implementation**: Create `tests/integration/bgp-integration.test.ts`

```typescript
describe('BGP Integration Tests', () => {
  let router1: AgentBGPRouter
  let router2: AgentBGPRouter
  let router3: AgentBGPRouter

  beforeEach(async () => {
    // Set up 3-router test network
    router1 = new AgentBGPRouter(65001, defaultPolicy, [])
    router2 = new AgentBGPRouter(65002, defaultPolicy, [])
    router3 = new AgentBGPRouter(65003, defaultPolicy, [])

    await Promise.all([router1.start(), router2.start(), router3.start()])

    // Establish peering
    await router1.addPeer(65002, 'http://router2:3001')
    await router2.addPeer(65003, 'http://router3:3001')
  })

  it('should prevent routing loops via AS path', async () => {
    // Router1 advertises agent
    await router1.advertiseAgent({
      agentId: 'test-agent',
      capabilities: ['coding'],
      asPath: [65001],
      nextHop: 'http://server1:4111',
    })

    // Should propagate: Router1 → Router2 → Router3
    await waitForConvergence()

    // Verify Router3 learned route with correct AS path
    const route = await router3.resolveAgent('test-agent')
    expect(route?.asPath).toEqual([65001, 65002])

    // Simulate Router3 trying to advertise back (should be rejected)
    const loopRoute = await router2.resolveAgent('test-agent')
    expect(loopRoute?.asPath).not.toContain(65002) // Router2 shouldn't accept routes containing its own AS
  })

  it('should apply policies correctly', async () => {
    const restrictivePolicy: RoutingPolicy = {
      import: [
        {
          name: 'block-external-coding',
          match: { capabilities: ['coding'], asPath: [65001] },
          action: { action: 'reject' },
        },
      ],
      export: [],
    }

    router2.updatePolicy(restrictivePolicy)

    await router1.advertiseAgent({
      agentId: 'coding-agent',
      capabilities: ['coding'],
      asPath: [65001],
    })

    await waitForConvergence()

    // Router2 should reject the route
    const route = await router2.resolveAgent('coding-agent')
    expect(route).toBeNull()
  })

  it('should load balance across multiple paths', async () => {
    // Set up multiple paths to same agent
    await router1.advertiseAgent({
      agentId: 'popular-agent',
      capabilities: ['general'],
      asPath: [65001],
      nextHop: 'http://server1:4111',
      med: 10,
    })

    await router3.advertiseAgent({
      agentId: 'popular-agent',
      capabilities: ['general'],
      asPath: [65003],
      nextHop: 'http://server3:4111',
      med: 15,
    })

    await waitForConvergence()

    // Router2 should see both paths and load balance
    const resolvedPaths = []
    for (let i = 0; i < 10; i++) {
      const route = await router2.resolveAgent('popular-agent')
      resolvedPaths.push(route?.nextHop)
    }

    // Should see both next hops used
    const uniquePaths = new Set(resolvedPaths)
    expect(uniquePaths.size).toBeGreaterThan(1)
  })
})

async function waitForConvergence(timeout = 5000): Promise<void> {
  // Wait for BGP convergence
  return new Promise((resolve) => setTimeout(resolve, timeout))
}
```

### 5.3: Documentation and Examples

**Step 5.3.1**: Update documentation

**Implementation**: Update `README.md` with BGP features

````markdown
## BGP-Style Agent Routing

The mcp-agent-proxy now supports BGP-inspired routing for enterprise-scale agent networks:

### Key Features

- **Loop Prevention**: AS path vectors prevent infinite loops in recursive networks
- **Policy Control**: Enterprise-grade import/export policies for agent access
- **Dynamic Discovery**: Agents advertise capabilities automatically
- **Load Balancing**: Multi-path routing across equivalent agent paths
- **Health Monitoring**: Routes updated based on agent performance metrics

### Configuration

#### Basic BGP Configuration

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "pnpx",
      "args": ["@mashh/mcp-agent-proxy"],
      "env": {
        "MASTRA_SERVERS": "http://localhost:4111 http://localhost:4222",
        "AGENT_ROUTING_POLICY": "./examples/policies/enterprise-policy.json",
        "BGP_ASN": "65000"
      }
    }
  }
}
```
````

#### Policy Configuration

Create routing policies to control agent access:

```json
{
  "import": [
    {
      "name": "prefer-internal-agents",
      "match": { "communities": ["internal"] },
      "action": { "action": "modify", "setLocalPref": 150 }
    }
  ],
  "export": [
    {
      "name": "no-confidential-external",
      "match": { "communities": ["confidential"] },
      "action": { "action": "reject" }
    }
  ]
}
```

### Migration from Simple Proxy

Existing configurations continue to work unchanged. BGP features are additive:

1. **Phase 1**: Current proxy behavior maintained
2. **Phase 2**: Optional BGP features enabled via environment variables
3. **Phase 3**: Full BGP routing with policy controls

````

**Step 5.3.2**: Create operational guide

**Implementation**: Create `docs/BGP_OPERATIONS.md`
```markdown
# BGP Operations Guide

## Monitoring

### Health Checks
```bash
# Check BGP session status
curl http://localhost:3001/bgp/status

# View routing table
curl http://localhost:3001/bgp/routes

# Monitor agent health
curl http://localhost:3001/bgp/health
````

### Troubleshooting

#### Common Issues

1. **Routes not propagating**

   - Check BGP session status
   - Verify policies aren't rejecting routes
   - Check AS path for loops

2. **Agent resolution failing**

   - Verify agent exists in routing table
   - Check import policies
   - Confirm server connectivity

3. **Performance issues**
   - Monitor MED values
   - Check health metrics
   - Consider multi-path configuration

## Production Deployment

### Recommended Architecture

```
          ┌─────────────────┐
          │  Route Reflector │
          │    (AS 65000)    │
          └─────────┬───────┘
                    │
         ┌──────────┼──────────┐
         │          │          │
    ┌────▼───┐ ┌────▼───┐ ┌────▼───┐
    │ Region │ │ Region │ │ Region │
    │   A    │ │   B    │ │   C    │
    │(AS 65001)│(AS 65002)│(AS 65003)│
    └────────┘ └────────┘ └────────┘
```

### Configuration Management

Use infrastructure as code for policy deployment:

```yaml
# kubernetes/agent-router-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: agent-routing-policy
data:
  policy.json: |
    {
      "import": [...],
      "export": [...]
    }
```

````

---

## Implementation Log Template

**File**: `IMPLEMENTATION_LOG.md`
```markdown
# BGP Agent Routing Implementation Log

## Project Overview
Transform mcp-agent-proxy into BGP-inspired agent routing system

**Start Date**: [DATE]
**Target Completion**: [DATE]
**Implementer**: [NAME]

## Phase 1: BGP Foundation (Weeks 1-2)

### Week 1
- [ ] **1.1.1**: Create BGP type definitions
  - **Status**:
  - **Started**:
  - **Completed**:
  - **Challenges**:
  - **Notes**:

- [ ] **1.1.2**: Implement route table management
  - **Status**:
  - **Started**:
  - **Completed**:
  - **Challenges**:
  - **Notes**:

- [ ] **1.2.1**: Extend configuration for AS numbers
  - **Status**:
  - **Started**:
  - **Completed**:
  - **Challenges**:
  - **Notes**:

### Week 2
- [ ] **1.2.2**: Update tools for new configuration
  - **Status**:
  - **Started**:
  - **Completed**:
  - **Challenges**:
  - **Notes**:

- [ ] **1.3.1**: Add AS path tracking
  - **Status**:
  - **Started**:
  - **Completed**:
  - **Challenges**:
  - **Notes**:

- [ ] **1.3.2**: Update resolution logic
  - **Status**:
  - **Started**:
  - **Completed**:
  - **Challenges**:
  - **Notes**:

**Phase 1 Retrospective:**
- **What went well**:
- **What was challenging**:
- **Lessons learned**:
- **Adjustments for Phase 2**:

## Phase 2: Dynamic Discovery & Basic BGP (Weeks 3-4)

### Week 3
- [ ] **2.1.1**: Implement BGP neighbor management
- [ ] **2.1.2**: Add BGP endpoints to MCP server

### Week 4
- [ ] **2.2.1**: Implement agent advertisement system
- [ ] **2.3.1**: Implement path selection algorithm

## Testing Results

### Unit Tests
- **Route Table**: ✅/❌ - Notes:
- **Path Selection**: ✅/❌ - Notes:
- **Policy Engine**: ✅/❌ - Notes:

### Integration Tests
- **BGP Sessions**: ✅/❌ - Notes:
- **Loop Prevention**: ✅/❌ - Notes:
- **Policy Application**: ✅/❌ - Notes:

### Performance Tests
- **Agent Resolution Time**: [X]ms target: <100ms
- **Route Convergence**: [X]s target: <30s
- **Memory Usage**: [X]MB target: <500MB

## Production Checklist

- [ ] Backwards compatibility verified
- [ ] Documentation updated
- [ ] Example policies created
- [ ] Performance benchmarks met
- [ ] Security review completed
- [ ] Operational runbooks created

## Final Notes

**Implementation Highlights**:

**Technical Debt**:

**Future Enhancements**:

**Recommendations**:
````

## Success Criteria

✅ **Functionality**: All current MCP clients work unchanged  
✅ **Performance**: <100ms agent resolution, <30s convergence  
✅ **Scalability**: Handles 100+ agent networks without broadcast storms  
✅ **Reliability**: Zero routing loops, graceful failure handling  
✅ **Security**: Policy-based access control, audit logging  
✅ **Maintainability**: Clear documentation, operational procedures

This implementation plan transforms your elegant 500-line proxy into Internet-scale agent infrastructure while maintaining the simplicity that makes it work. Each phase builds incrementally, ensuring you always have a working system.

Ready to build the Agent Internet? 🚀
