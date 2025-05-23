// Core BGP-inspired types for agent routing
// This forms the foundation of the Agent Internet infrastructure

/**
 * AgentRoute represents a route to an agent through the BGP-style network
 * Similar to BGP routes, but adapted for agent capabilities and routing
 */
export interface AgentRoute {
  agentId: string // Unique agent identifier
  capabilities: string[] // What the agent can do (coding, weather, etc.)
  asPath: number[] // BGP path vector for loop prevention
  nextHop: string // URL of next router/server in path
  localPref: number // Local preference (higher = better)
  med: number // Multi-exit discriminator (lower = better)
  communities: string[] // BGP communities for policy control
  originTime: Date // When route was first learned
  pathAttributes: Map<string, unknown> // Additional BGP-style attributes
}

/**
 * AgentPeer represents a BGP neighbor in the agent network
 */
export interface AgentPeer {
  asn: number // Autonomous System Number
  address: string // URL/address of the peer
  status: 'idle' | 'connect' | 'active' | 'established' // BGP session state
  lastUpdate: Date // Last communication time
  routesReceived: number // Statistics: routes learned from peer
  routesSent: number // Statistics: routes advertised to peer
}

/**
 * AgentRoutingTable mirrors BGP's three-table structure
 * This is the core of our distributed agent routing system
 */
export interface AgentRoutingTable {
  // BGP Adj-RIB-In: Routes received from peers (before policy application)
  adjRibIn: Map<number, Map<string, AgentRoute>>

  // BGP Loc-RIB: Best routes after path selection algorithm
  locRib: Map<string, AgentRoute>

  // BGP Adj-RIB-Out: Routes sent to peers (after policy application)
  adjRibOut: Map<number, Map<string, AgentRoute>>
}

/**
 * RoutingPolicy defines import/export rules for agent routes
 * Enables enterprise-grade access control between agent networks
 */
export interface RoutingPolicy {
  import: PolicyStatement[] // Rules for accepting routes from peers
  export: PolicyStatement[] // Rules for advertising routes to peers
}

/**
 * PolicyStatement defines a single routing policy rule
 */
export interface PolicyStatement {
  name: string // Human-readable policy name
  match: MatchCondition // When this policy applies
  action: PolicyAction // What to do when matched
}

/**
 * MatchCondition defines criteria for policy application
 */
export interface MatchCondition {
  asPath?: number[] // Match specific AS numbers in path
  capabilities?: string[] // Match agent capabilities
  communities?: string[] // Match BGP communities
  agentPrefixes?: string[] // Match agent ID patterns (supports *)
  performance?: PerformanceThreshold // Match performance characteristics
}

/**
 * PolicyAction defines what to do when a policy matches
 */
export interface PolicyAction {
  action: 'accept' | 'reject' | 'modify' // Basic action
  setLocalPref?: number // Modify local preference
  setCommunities?: string[] // Add BGP communities
  setMED?: number // Set MED value
  prependCount?: number // AS path prepending for de-preference
}

/**
 * PerformanceThreshold for performance-based routing policies
 */
export interface PerformanceThreshold {
  maxResponseTime?: number // Maximum acceptable response time (ms)
  minSuccessRate?: number // Minimum success rate (0.0-1.0)
  maxQueueDepth?: number // Maximum queue depth
  maxCpuUsage?: number // Maximum CPU usage (0.0-1.0)
}

/**
 * ServerConfig represents a Mastra server with BGP awareness
 * Extended from the original simple URL configuration
 */
export interface ServerConfig {
  name: string // Server identifier (server0, server1, etc.)
  url: string // Server URL
  asn: number // Autonomous System Number for BGP
  description?: string // Human-readable description
  region?: string // Geographic region for routing
  priority?: number // Priority for server selection
}

/**
 * CapabilityPrefix for capability-based routing
 * Allows routing by capability patterns instead of exact agent names
 */
export interface CapabilityPrefix {
  prefix: string // e.g., "coding/*", "analysis/financial/*"
  capabilities: string[] // Required capabilities
  constraints: CapabilityConstraint[] // Performance, security, etc.
}

/**
 * CapabilityConstraint for advanced capability matching
 */
export interface CapabilityConstraint {
  type: 'performance' | 'security' | 'compliance' | 'region'
  value: string | number
  operator: 'eq' | 'gt' | 'lt' | 'contains' | 'matches'
}

/**
 * AgentHealthMetrics for health-based routing decisions
 */
export interface AgentHealthMetrics {
  responseTime: number // Average response time (ms)
  successRate: number // Success rate (0.0-1.0)
  queueDepth: number // Current request queue depth
  cpuUsage: number // CPU usage (0.0-1.0)
  errorRate: number // Error rate (0.0-1.0)
  lastCheck: Date // When metrics were last updated
  availability: number // Uptime percentage
}

/**
 * BGPMessage types for communication between routers
 */
export interface BGPMessage {
  type: 'OPEN' | 'UPDATE' | 'NOTIFICATION' | 'KEEPALIVE' | 'ROUTE_REFRESH'
  timestamp: Date
  senderASN: number
  data?: unknown
}

/**
 * BGPUpdate message for route advertisement/withdrawal
 */
export interface BGPUpdate extends BGPMessage {
  type: 'UPDATE'
  withdrawnRoutes?: string[] // Agent IDs being withdrawn
  advertisedRoutes?: AgentRoute[] // New routes being advertised
}

/**
 * MultiPathConfig for load balancing across equivalent paths
 */
export interface MultiPathConfig {
  enableMultiPath: boolean
  maxPaths: number // Maximum paths to use for load balancing
  loadBalancingMethod:
    | 'round-robin'
    | 'capability-aware'
    | 'latency-based'
    | 'weighted'
}

/**
 * RouteReflectorConfig for hierarchical scaling
 */
export interface RouteReflectorConfig {
  clusterId: string // Unique cluster identifier
  clients: number[] // Client AS numbers
  nonClients: number[] // Non-client peer AS numbers
}

/**
 * ASPathFilter for complex AS path matching in policies
 */
export interface ASPathFilter {
  from?: number[] // Routes originating from these ASNs
  notFrom?: number[] // Routes NOT from these ASNs
  through?: number[] // Routes passing through these ASNs
  length?: {
    // AS path length constraints
    min?: number
    max?: number
    exact?: number
  }
  regexp?: string // Regular expression for AS path
}

/**
 * Advanced MatchCondition with ASPathFilter
 */
export interface AdvancedMatchCondition extends Omit<MatchCondition, 'asPath'> {
  asPath?: ASPathFilter // More sophisticated AS path matching
}

/**
 * Policy statement with advanced matching
 */
export interface AdvancedPolicyStatement
  extends Omit<PolicyStatement, 'match'> {
  match: AdvancedMatchCondition
}

/**
 * Full routing policy with advanced features
 */
export interface AdvancedRoutingPolicy {
  import: AdvancedPolicyStatement[]
  export: AdvancedPolicyStatement[]
  version?: string // Policy version for updates
  metadata?: {
    // Policy metadata
    author?: string
    description?: string
    created?: Date
    updated?: Date
  }
}

/**
 * Agent capabilities with structured metadata
 */
export interface StructuredCapability {
  name: string // Capability name (e.g., "coding")
  version?: string // Capability version
  subcapabilities?: string[] // Sub-capabilities (e.g., ["typescript", "python"])
  metadata?: Record<string, unknown> // Additional capability metadata
}

/**
 * Enhanced AgentRoute with structured capabilities
 */
export interface EnhancedAgentRoute extends Omit<AgentRoute, 'capabilities'> {
  capabilities: StructuredCapability[] // Structured capability information
  metadata?: {
    // Route metadata
    source?: string // Where route was learned
    confidence?: number // Confidence in route (0.0-1.0)
    lastValidated?: Date // When route was last validated
  }
}

/**
 * Network topology information for advanced routing
 */
export interface NetworkTopology {
  nodes: Map<number, TopologyNode> // AS number -> node info
  edges: TopologyEdge[] // Connections between nodes
  regions: Map<string, number[]> // Region -> AS numbers
}

export interface TopologyNode {
  asn: number
  name: string
  region?: string
  nodeType: 'edge' | 'transit' | 'route-reflector' | 'client'
  capabilities?: string[]
  metadata?: Record<string, unknown>
}

export interface TopologyEdge {
  fromASN: number
  toASN: number
  metric: number // Link cost/preference
  bandwidth?: number // Available bandwidth
  latency?: number // Link latency
  reliability?: number // Link reliability (0.0-1.0)
}

// Type guards for runtime type checking
export function isAgentRoute(obj: unknown): obj is AgentRoute {
  return (
    !!obj &&
    typeof obj === 'object' &&
    'agentId' in obj &&
    typeof (obj as Record<string, unknown>).agentId === 'string' &&
    'capabilities' in obj &&
    Array.isArray((obj as Record<string, unknown>).capabilities) &&
    'asPath' in obj &&
    Array.isArray((obj as Record<string, unknown>).asPath) &&
    'nextHop' in obj &&
    typeof (obj as Record<string, unknown>).nextHop === 'string' &&
    'localPref' in obj &&
    typeof (obj as Record<string, unknown>).localPref === 'number' &&
    'med' in obj &&
    typeof (obj as Record<string, unknown>).med === 'number'
  )
}

export function isAgentPeer(obj: unknown): obj is AgentPeer {
  return (
    !!obj &&
    typeof obj === 'object' &&
    'asn' in obj &&
    typeof (obj as Record<string, unknown>).asn === 'number' &&
    'address' in obj &&
    typeof (obj as Record<string, unknown>).address === 'string' &&
    'status' in obj &&
    ['idle', 'connect', 'active', 'established'].includes(
      (obj as Record<string, unknown>).status as string,
    )
  )
}

export function isBGPMessage(obj: unknown): obj is BGPMessage {
  return (
    !!obj &&
    typeof obj === 'object' &&
    'type' in obj &&
    ['OPEN', 'UPDATE', 'NOTIFICATION', 'KEEPALIVE', 'ROUTE_REFRESH'].includes(
      (obj as Record<string, unknown>).type as string,
    ) &&
    'timestamp' in obj &&
    (obj as Record<string, unknown>).timestamp instanceof Date &&
    'senderASN' in obj &&
    typeof (obj as Record<string, unknown>).senderASN === 'number'
  )
}

// Utility types for common patterns
export type ASN = number
export type AgentID = string
export type ServerURL = string
export type CommunityString = string

// Constants for BGP-style defaults
export const BGP_DEFAULTS = {
  LOCAL_PREF: 100,
  MED: 0,
  KEEPALIVE_INTERVAL: 30000, // 30 seconds
  HOLD_TIME: 90000, // 90 seconds
  CONNECT_RETRY_TIME: 30000, // 30 seconds
  ROUTE_FLAP_DAMPING: true,
  MAX_AS_PATH_LENGTH: 10, // Prevent extremely long paths
} as const

// Private AS number ranges (RFC 6996)
export const PRIVATE_ASN_RANGES = {
  TWO_BYTE: { min: 64512, max: 65534 },
  FOUR_BYTE: { min: 4200000000, max: 4294967294 },
} as const
