/**
 * Abstract interface for connection backends that manage dynamic server state
 * Supports both local (in-memory) and remote (Redis) storage implementations
 */
export interface ConnectionBackend {
  /**
   * Add a new dynamic server connection
   * @param serverUrl - The URL of the server
   * @param serverName - Optional custom name (auto-generated if not provided)
   * @returns Promise resolving to the assigned server name
   */
  addServer(serverUrl: string, serverName?: string): Promise<string>

  /**
   * Remove a dynamic server connection
   * @param serverName - The name of the server to remove
   * @returns Promise resolving to true if removed, false if not found
   */
  removeServer(serverName: string): Promise<boolean>

  /**
   * Get all dynamic server connections
   * @returns Promise resolving to a Map of serverName -> serverUrl
   */
  getServers(): Promise<Map<string, string>>

  /**
   * Check if a server exists
   * @param serverName - The name of the server to check
   * @returns Promise resolving to true if server exists
   */
  hasServer(serverName: string): Promise<boolean>

  /**
   * Clear all dynamic server connections
   * @returns Promise resolving when all servers are cleared
   */
  clearServers(): Promise<void>

  /**
   * Initialize the backend (connect to Redis, etc.)
   * @returns Promise resolving when backend is ready
   */
  initialize(): Promise<void>

  /**
   * Cleanup the backend (close connections, etc.)
   * @returns Promise resolving when cleanup is complete
   */
  close(): Promise<void>
}

/**
 * Configuration options for connection backends
 */
export interface ConnectionBackendConfig {
  type: 'local' | 'upstash'

  // Upstash Redis configuration
  upstash?: {
    url: string
    token: string
    keyPrefix?: string // Prefix for Redis keys (default: 'mcp-proxy:servers:')
  }
}
