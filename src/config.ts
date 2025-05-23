import { ClientOptions } from '@mastra/client-js'
import dotenv from 'dotenv'

dotenv.config() // Load environment variables from .env file

export function loadMastraClientConfig(): ClientOptions {
  const baseUrl = process.env.MASTRA_SERVER_BASE_URL
  if (!baseUrl) {
    console.warn(
      'MASTRA_SERVER_BASE_URL environment variable not set. Defaulting to http://localhost:4111. This may not be intended for production.',
    )
  }

  return {
    baseUrl: baseUrl || 'http://localhost:4111', // Default if not set
    retries: parseInt(process.env.MASTRA_CLIENT_RETRIES || '3', 10),
    backoffMs: parseInt(process.env.MASTRA_CLIENT_BACKOFF_MS || '300', 10),
    maxBackoffMs: parseInt(
      process.env.MASTRA_CLIENT_MAX_BACKOFF_MS || '5000',
      10,
    ),
    // Other ClientOptions can be added here, loaded from environment variables
  }
}

export function getMCPServerPort(): number {
  const port = parseInt(process.env.MCP_SERVER_PORT || '3001', 10)
  if (isNaN(port) || port <= 0 || port > 65535) {
    console.warn(
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
 * Load server mappings from environment configuration
 * Supports simple array config via MASTRA_SERVERS_CONFIG environment variable
 * Format: ["http://localhost:4111", "http://localhost:4222", ...]
 * Auto-generates names: server0, server1, server2, etc.
 */
export function loadServerMappings(): Map<string, string> {
  // Check if custom server configuration is provided
  const serversConfig = process.env.MASTRA_SERVERS_CONFIG

  if (serversConfig) {
    try {
      const serverUrls = JSON.parse(serversConfig)

      // Validate it's an array
      if (!Array.isArray(serverUrls)) {
        throw new Error('MASTRA_SERVERS_CONFIG must be an array of URLs')
      }

      const serverMap = new Map()

      // Auto-generate server names: server0, server1, server2, etc.
      serverUrls.forEach((url, index) => {
        if (typeof url === 'string' && url.trim()) {
          serverMap.set(`server${index}`, url.trim())
        }
      })

      // If no valid URLs found, use defaults
      if (serverMap.size === 0) {
        // Only log if not using stdio (MCP protocol)
        if (process.env.MCP_TRANSPORT !== 'stdio' && process.stdin.isTTY) {
          console.log('No valid URLs in MASTRA_SERVERS_CONFIG, using defaults')
        }
        return getDefaultMappings()
      }

      // Only log if not using stdio (MCP protocol)
      if (process.env.MCP_TRANSPORT !== 'stdio' && process.stdin.isTTY) {
        console.log(
          `Loaded ${serverMap.size} server mappings:`,
          Array.from(serverMap.entries()),
        )
      }
      return serverMap
    } catch (error) {
      // Only log errors if not using stdio
      if (process.env.MCP_TRANSPORT !== 'stdio' && process.stdin.isTTY) {
        console.error('Failed to parse MASTRA_SERVERS_CONFIG:', error)
        console.log(
          'Expected format: ["http://localhost:4111", "http://localhost:4222"]',
        )
        console.log('Falling back to default server mappings')
      }
      return getDefaultMappings()
    }
  }

  // Use defaults if no custom config provided
  return getDefaultMappings()
}

/**
 * Get default server mappings
 */
function getDefaultMappings(): Map<string, string> {
  return new Map([
    ['server0', 'http://localhost:4111'],
    ['server1', 'http://localhost:4222'],
  ])
}
