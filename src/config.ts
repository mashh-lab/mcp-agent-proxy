import dotenv from 'dotenv'
import fs from 'fs'
import { ServerConfig, PRIVATE_ASN_RANGES } from './bgp/types.js'
import { PolicyConfig } from './bgp/policy.js'

dotenv.config() // Load environment variables from .env file

export function getMCPServerPort(): number {
  const port = parseInt(process.env.MCP_SERVER_PORT || '3001', 10)
  if (isNaN(port) || port <= 0 || port > 65535) {
    logger.warn(
      `Invalid MCP_SERVER_PORT: ${process.env.MCP_SERVER_PORT}. Defaulting to 3001.`,
    )
    return 3001
  }
  return port
}

export function getMCPPaths() {
  return {
    ssePath: process.env.MCP_SSE_PATH || '/mcp/sse',
    messagePath: process.env.MCP_MESSAGE_PATH || '/mcp/message',
  }
}

/**
 * Get retry configuration for Mastra client operations
 */
export function getRetryConfig() {
  return {
    // For agent discovery (fast checks across multiple servers)
    discovery: {
      retries: parseInt(process.env.MASTRA_DISCOVERY_RETRIES || '1', 10),
      backoffMs: parseInt(process.env.MASTRA_DISCOVERY_BACKOFF_MS || '100', 10),
      maxBackoffMs: parseInt(
        process.env.MASTRA_DISCOVERY_MAX_BACKOFF_MS || '500',
        10,
      ),
    },
    // For agent listing operations
    listing: {
      retries: parseInt(process.env.MASTRA_LISTING_RETRIES || '2', 10),
      backoffMs: parseInt(process.env.MASTRA_LISTING_BACKOFF_MS || '100', 10),
      maxBackoffMs: parseInt(
        process.env.MASTRA_LISTING_MAX_BACKOFF_MS || '1000',
        10,
      ),
    },
    // For agent interaction (main operations)
    interaction: {
      retries: parseInt(process.env.MASTRA_CLIENT_RETRIES || '3', 10),
      backoffMs: parseInt(process.env.MASTRA_CLIENT_BACKOFF_MS || '300', 10),
      maxBackoffMs: parseInt(
        process.env.MASTRA_CLIENT_MAX_BACKOFF_MS || '5000',
        10,
      ),
    },
  }
}

/**
 * Load server mappings with BGP AS numbers for agent routing
 *
 * Supports multiple string formats:
 * - Space separated: "http://localhost:4111 http://localhost:4222"
 * - Comma separated: "http://localhost:4111,http://localhost:4222"
 * - Comma+space separated: "http://localhost:4111, http://localhost:4222"
 *
 * Auto-generates:
 * - Server names: server0, server1, server2, etc.
 * - AS numbers: 65001, 65002, 65003, etc. (private AS range)
 */
export function loadServerMappings(): Map<string, ServerConfig> {
  // Check if custom server configuration is provided
  const serversConfig = process.env.MASTRA_SERVERS

  if (serversConfig) {
    try {
      // Parse as space/comma-separated string
      const serverUrls = serversConfig
        .split(/[,\s]+/) // Split by comma and/or whitespace
        .map((url) => url.trim())
        .filter((url) => url.length > 0) // Remove empty strings

      const serverMap = new Map<string, ServerConfig>()

      // Auto-generate server names and AS numbers
      serverUrls.forEach((url, index) => {
        if (typeof url === 'string' && url.trim()) {
          const serverName = `server${index}`
          const asn = PRIVATE_ASN_RANGES.TWO_BYTE.min + index // Start from 65001

          // Validate AS number is within private range
          if (asn > PRIVATE_ASN_RANGES.TWO_BYTE.max) {
            logger.warn(
              `Server ${serverName} would get ASN ${asn} which exceeds private AS range. ` +
                `Consider using fewer servers or implementing 4-byte AS numbers.`,
            )
          }

          const serverConfig: ServerConfig = {
            name: serverName,
            url: url.trim(),
            asn: asn,
            description: `Mastra Server (${serverName})`,
            region: 'default', // Could be enhanced with region detection
            priority: 100 + index, // Lower priority for higher indices
          }

          serverMap.set(serverName, serverConfig)
        }
      })

      // If no valid URLs found, use defaults
      if (serverMap.size === 0) {
        logger.log('No valid URLs in MASTRA_SERVERS, using defaults')
        return getDefaultMappings()
      }

      logger.log(
        `Loaded ${serverMap.size} server mappings with AS numbers:`,
        Array.from(serverMap.entries()).map(
          ([name, config]) => `${name} (AS${config.asn}): ${config.url}`,
        ),
      )
      return serverMap
    } catch (error) {
      logger.error('Failed to parse MASTRA_SERVERS:', error)
      logger.log('Supported formats:')
      logger.log(
        '  Space separated: "http://localhost:4111 http://localhost:4222"',
      )
      logger.log(
        '  Comma separated: "http://localhost:4111,http://localhost:4222"',
      )
      logger.log(
        '  Comma+space: "http://localhost:4111, http://localhost:4222"',
      )
      logger.log('Falling back to default server mappings')
      return getDefaultMappings()
    }
  }

  // Use defaults if no custom config provided
  return getDefaultMappings()
}

/**
 * Get default server mappings with BGP AS numbers
 * Uses the standard Mastra default port (4111) for single-server setup
 */
function getDefaultMappings(): Map<string, ServerConfig> {
  const defaultConfig: ServerConfig = {
    name: 'server0',
    url: 'http://localhost:4111',
    asn: PRIVATE_ASN_RANGES.TWO_BYTE.min, // 65001
    description: 'Default Mastra Server',
    region: 'local',
    priority: 100,
  }

  return new Map([['server0', defaultConfig]])
}

/**
 * Legacy function for backwards compatibility
 * Returns just the URL mapping for existing code
 * @deprecated Use loadServerMappings() for BGP-aware configuration
 */
export function loadServerMappingsLegacy(): Map<string, string> {
  const serverConfigs = loadServerMappings()
  const legacyMap = new Map<string, string>()

  for (const [name, config] of serverConfigs.entries()) {
    legacyMap.set(name, config.url)
  }

  return legacyMap
}

/**
 * BGP Policy Configuration
 */
export interface BGPPolicyConfig {
  enabled: boolean
  defaultPolicies: PolicyConfig[]
  policyFile?: string // Path to JSON policy file
  maxHistorySize: number
}

/**
 * Enhanced BGP Configuration with Policy Support
 */
export interface EnhancedBGPConfig {
  localASN: number
  routerId: string
  keepaliveTime: number
  holdTime: number
  connectRetryTime: number
  policy: BGPPolicyConfig
}

/**
 * Get BGP configuration for the proxy itself
 */
export function getBGPConfig() {
  return {
    localASN: parseInt(process.env.BGP_ASN || '65000', 10), // Our proxy's AS number
    routerId: process.env.BGP_ROUTER_ID || generateRouterID(),
    holdTime: parseInt(process.env.BGP_HOLD_TIME || '90', 10), // seconds
    keepAliveInterval: parseInt(process.env.BGP_KEEPALIVE_INTERVAL || '30', 10), // seconds
    connectRetryTime: parseInt(process.env.BGP_CONNECT_RETRY_TIME || '30', 10), // seconds
  }
}

/**
 * Generate a router ID based on local configuration
 * In real BGP, this is typically an IP address, but we'll use a hash-based approach
 */
function generateRouterID(): string {
  // Use hostname or a default identifier
  const hostname = process.env.HOSTNAME || 'mcp-agent-proxy'
  const port = getMCPServerPort()
  return `${hostname}:${port}`
}

/**
 * Get enhanced BGP configuration including policy support
 */
export function getEnhancedBGPConfig(): EnhancedBGPConfig {
  const basicConfig = getBGPConfig()

  return {
    localASN: basicConfig.localASN,
    routerId: basicConfig.routerId,
    keepaliveTime: basicConfig.keepAliveInterval,
    holdTime: basicConfig.holdTime,
    connectRetryTime: basicConfig.connectRetryTime,
    policy: getBGPPolicyConfig(),
  }
}

/**
 * Get BGP policy configuration from environment
 */
export function getBGPPolicyConfig(): BGPPolicyConfig {
  const enabled = process.env.BGP_POLICY_ENABLED !== 'false' // Default to enabled
  const policyFile = process.env.BGP_POLICY_FILE
  const maxHistorySize = parseInt(
    process.env.BGP_POLICY_HISTORY_SIZE || '1000',
    10,
  )

  let defaultPolicies: PolicyConfig[] = []

  // Load default policies from environment or use sensible defaults
  if (process.env.BGP_DEFAULT_POLICIES) {
    try {
      defaultPolicies = JSON.parse(process.env.BGP_DEFAULT_POLICIES)
    } catch (error) {
      logger.warn(
        'Failed to parse BGP_DEFAULT_POLICIES, using built-in defaults:',
        error,
      )
      defaultPolicies = getBuiltInDefaultPolicies()
    }
  } else {
    defaultPolicies = getBuiltInDefaultPolicies()
  }

  return {
    enabled,
    defaultPolicies,
    policyFile,
    maxHistorySize,
  }
}

/**
 * Get built-in default policies for common scenarios
 */
function getBuiltInDefaultPolicies(): PolicyConfig[] {
  return [
    {
      name: 'prefer-healthy-agents',
      description: 'Prefer healthy agents over degraded ones',
      enabled: true,
      priority: 100,
      match: {
        healthStatus: 'healthy',
      },
      action: {
        action: 'modify',
        setLocalPref: 150, // Boost preference for healthy agents
        logDecision: false,
      },
    },
    {
      name: 'avoid-unhealthy-agents',
      description: 'Reject unhealthy agents to prevent routing failures',
      enabled: true,
      priority: 200,
      match: {
        healthStatus: 'unhealthy',
      },
      action: {
        action: 'reject',
        logDecision: true,
        alertOnMatch: true,
      },
    },
    {
      name: 'limit-long-paths',
      description: 'Reject routes with too many AS hops to prevent loops',
      enabled: true,
      priority: 150,
      match: {
        maxASPathLength: 10, // Prevent excessively long paths
      },
      action: {
        action: 'reject',
        logDecision: true,
      },
    },
  ]
}

/**
 * Load policies from a JSON file
 */
export function loadPoliciesFromFile(filePath: string): PolicyConfig[] {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8')
    const policies = JSON.parse(fileContent) as PolicyConfig[]

    logger.log(`Loaded ${policies.length} policies from ${filePath}`)
    return policies
  } catch (error) {
    logger.error(`Failed to load policies from ${filePath}:`, error)
    return []
  }
}

/**
 * Save policies to a JSON file
 */
export function savePolicesToFile(
  policies: PolicyConfig[],
  filePath: string,
): boolean {
  try {
    const fileContent = JSON.stringify(policies, null, 2)
    fs.writeFileSync(filePath, fileContent, 'utf8')

    logger.log(`Saved ${policies.length} policies to ${filePath}`)
    return true
  } catch (error) {
    logger.error(`Failed to save policies to ${filePath}:`, error)
    return false
  }
}

/**
 * Validate server configuration
 */
export function validateServerConfig(config: ServerConfig): string[] {
  const issues: string[] = []

  // Validate URL
  try {
    new URL(config.url)
  } catch {
    issues.push(`Invalid URL: ${config.url}`)
  }

  // Validate AS number
  if (config.asn <= 0 || config.asn > 4294967295) {
    issues.push(`Invalid AS number: ${config.asn}`)
  }

  // Check if AS number is in private range (recommended)
  const isPrivateASN =
    (config.asn >= PRIVATE_ASN_RANGES.TWO_BYTE.min &&
      config.asn <= PRIVATE_ASN_RANGES.TWO_BYTE.max) ||
    (config.asn >= PRIVATE_ASN_RANGES.FOUR_BYTE.min &&
      config.asn <= PRIVATE_ASN_RANGES.FOUR_BYTE.max)

  if (!isPrivateASN) {
    issues.push(
      `AS number ${config.asn} is not in private range. Consider using private AS numbers for agent networks.`,
    )
  }

  return issues
}

/**
 * Get servers from configuration as array for convenience
 */
export function getServersFromConfig(): ServerConfig[] {
  const serverMappings = loadServerMappings()
  return Array.from(serverMappings.values())
}

/**
 * Centralized logging utility that respects MCP transport mode
 * Prevents console output interference with stdio transport
 */
export const logger = {
  log: (message: string, ...args: unknown[]) => {
    if (process.env.MCP_TRANSPORT !== 'stdio' && process.stdin.isTTY) {
      console.log(message, ...args)
    }
  },
  warn: (message: string, ...args: unknown[]) => {
    if (process.env.MCP_TRANSPORT !== 'stdio' && process.stdin.isTTY) {
      console.warn(message, ...args)
    }
  },
  error: (message: string, ...args: unknown[]) => {
    if (process.env.MCP_TRANSPORT !== 'stdio' && process.stdin.isTTY) {
      console.error(message, ...args)
    }
  },
  // Always log errors to stderr regardless of transport (for debugging)
  forceError: (message: string, ...args: unknown[]) => {
    console.error(message, ...args)
  },
}
