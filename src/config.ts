import dotenv from 'dotenv'

dotenv.config() // Load environment variables from .env file

// Global connected server storage
const dynamicServers: Map<string, string> = new Map()

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
 * Learn about a server by attempting to connect and get basic info
 * @param serverUrl - The URL of the agent server to learn about
 * @returns Basic server information or throws if unreachable
 */
export function addDynamicServer(
  serverUrl: string,
  serverName?: string,
): string {
  // Validate URL format
  try {
    new URL(serverUrl)
  } catch {
    throw new Error(`Invalid server URL: ${serverUrl}`)
  }

  // Check if URL already exists
  for (const [existingName, existingUrl] of dynamicServers.entries()) {
    if (existingUrl === serverUrl) {
      logger.log(`Server URL ${serverUrl} already exists as ${existingName}`)
      return existingName
    }
  }

  // Also check static servers from environment
  const staticServers = loadStaticServerMappings()
  for (const [existingName, existingUrl] of staticServers.entries()) {
    if (existingUrl === serverUrl) {
      logger.log(
        `Server URL ${serverUrl} already exists as ${existingName} (from environment)`,
      )
      return existingName
    }
  }

  // Generate server name if not provided
  if (!serverName) {
    const allServers = new Map([...staticServers, ...dynamicServers])
    let index = allServers.size
    do {
      serverName = `server${index}`
      index++
    } while (allServers.has(serverName))
  } else {
    // Check if custom name conflicts with existing servers
    const allServers = new Map([...staticServers, ...dynamicServers])
    if (allServers.has(serverName)) {
      throw new Error(
        `Server name '${serverName}' already exists. Choose a different name or omit to auto-generate.`,
      )
    }
  }

  dynamicServers.set(serverName, serverUrl)
  logger.log(`Connected to server: ${serverName} -> ${serverUrl}`)
  return serverName
}

/**
 * Disconnect from a dynamically connected server
 * @param serverName - The name of the server to disconnect
 * @returns true if disconnected, false if not found
 */
export function removeDynamicServer(serverName: string): boolean {
  const removed = dynamicServers.delete(serverName)
  if (removed) {
    logger.log(`Disconnected from server: ${serverName}`)
  }
  return removed
}

/**
 * Get all dynamically connected servers
 */
export function getDynamicServers(): Map<string, string> {
  return new Map(dynamicServers)
}

/**
 * Clear all dynamically connected servers
 */
export function clearDynamicServers(): void {
  const count = dynamicServers.size
  dynamicServers.clear()
  logger.log(`Disconnected from ${count} connected servers`)
}

/**
 * Load server mappings from environment configuration only
 * This is separated from the main loadServerMappings to allow dynamic additions
 */
function loadStaticServerMappings(): Map<string, string> {
  // Check if custom server configuration is provided
  const serversConfig = process.env.AGENT_SERVERS

  if (serversConfig) {
    try {
      // Parse as space/comma-separated string
      const serverUrls = serversConfig
        .split(/[,\s]+/) // Split by comma and/or whitespace
        .map((url) => url.trim())
        .filter((url) => url.length > 0) // Remove empty strings

      const serverMap = new Map()

      // Auto-generate server names: server0, server1, server2, etc.
      serverUrls.forEach((url, index) => {
        if (typeof url === 'string' && url.trim()) {
          serverMap.set(`server${index}`, url.trim())
        }
      })

      // If no valid URLs found, return empty map
      if (serverMap.size === 0) {
        logger.log('No valid URLs in AGENT_SERVERS, no servers configured')
        return new Map()
      }

      logger.log(
        `Loaded ${serverMap.size} server mappings:`,
        Array.from(serverMap.entries()),
      )
      return serverMap
    } catch (error) {
      logger.error('Failed to parse AGENT_SERVERS:', error)
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
      logger.log('No servers configured due to parsing error')
      return new Map()
    }
  }

  // Return empty map if no custom config provided
  logger.log('No AGENT_SERVERS configured, no servers available')
  return new Map()
}

/**
 * Load server mappings from environment configuration + dynamically connected servers
 * Supports multiple string formats:
 * - Space separated: "http://localhost:4111 http://localhost:4222"
 * - Comma separated: "http://localhost:4111,http://localhost:4222"
 * - Comma+space separated: "http://localhost:4111, http://localhost:4222"
 * Auto-generates names: server0, server1, server2, etc.
 * Includes dynamically connected servers with their assigned names.
 */
export function loadServerMappings(): Map<string, string> {
  const staticServers = loadStaticServerMappings()

  // Merge static and dynamic servers
  const allServers = new Map([...staticServers, ...dynamicServers])

  if (dynamicServers.size > 0) {
    logger.log(
      `Total servers: ${allServers.size} (${staticServers.size} from config, ${dynamicServers.size} learned)`,
    )
  }

  return allServers
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
