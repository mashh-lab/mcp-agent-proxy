import dotenv from 'dotenv'

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
 * Load server mappings from environment configuration
 * Supports multiple string formats:
 * - Space separated: "http://localhost:4111 http://localhost:4222"
 * - Comma separated: "http://localhost:4111,http://localhost:4222"
 * - Comma+space separated: "http://localhost:4111, http://localhost:4222"
 * Auto-generates names: server0, server1, server2, etc.
 */
export function loadServerMappings(): Map<string, string> {
  // Check if custom server configuration is provided
  const serversConfig = process.env.MASTRA_SERVERS

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

      // If no valid URLs found, use defaults
      if (serverMap.size === 0) {
        logger.log('No valid URLs in MASTRA_SERVERS, using defaults')
        return getDefaultMappings()
      }

      logger.log(
        `Loaded ${serverMap.size} server mappings:`,
        Array.from(serverMap.entries()),
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
 * Get default server mappings
 * Uses the standard Mastra default port (4111) for single-server setup
 */
function getDefaultMappings(): Map<string, string> {
  return new Map([['server0', 'http://localhost:4111']])
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
