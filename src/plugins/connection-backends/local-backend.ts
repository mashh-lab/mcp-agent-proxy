import { ConnectionBackend } from './types.js'

/**
 * Local in-memory connection backend
 * Uses a Map to store dynamic server connections in memory
 * State is lost when the process restarts (suitable for local development)
 */
export class LocalConnectionBackend implements ConnectionBackend {
  private dynamicServers: Map<string, string> = new Map()

  async initialize(): Promise<void> {
    // No initialization needed for local backend
  }

  async close(): Promise<void> {
    // No cleanup needed for local backend
  }

  async addServer(serverUrl: string, serverName?: string): Promise<string> {
    // Validate URL format
    try {
      new URL(serverUrl)
    } catch {
      throw new Error(`Invalid server URL: ${serverUrl}`)
    }

    // Check if URL already exists
    for (const [existingName, existingUrl] of this.dynamicServers.entries()) {
      if (existingUrl === serverUrl) {
        // Import logger dynamically to avoid circular dependency
        const { logger } = await import('../../config.js')
        logger.log(`Server URL ${serverUrl} already exists as ${existingName}`)
        return existingName
      }
    }

    // Generate server name if not provided
    if (!serverName) {
      // Use a more robust name generation that handles concurrent operations
      let index = 0
      do {
        serverName = `server${index}`
        index++
      } while (this.dynamicServers.has(serverName))
    } else {
      // Check if custom name conflicts with existing servers
      if (this.dynamicServers.has(serverName)) {
        throw new Error(
          `Server name '${serverName}' already exists. Choose a different name or omit to auto-generate.`,
        )
      }
    }

    this.dynamicServers.set(serverName, serverUrl)
    return serverName
  }

  async removeServer(serverName: string): Promise<boolean> {
    return this.dynamicServers.delete(serverName)
  }

  async getServers(): Promise<Map<string, string>> {
    return new Map(this.dynamicServers)
  }

  async hasServer(serverName: string): Promise<boolean> {
    return this.dynamicServers.has(serverName)
  }

  async clearServers(): Promise<void> {
    this.dynamicServers.clear()
  }
}
