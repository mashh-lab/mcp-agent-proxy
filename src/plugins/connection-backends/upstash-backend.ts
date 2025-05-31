import { ConnectionBackend, ConnectionBackendConfig } from './types.js'

/**
 * Upstash Redis connection backend
 * Uses Upstash Redis to store dynamic server connections
 * State persists across serverless function invocations
 */
export class UpstashConnectionBackend implements ConnectionBackend {
  private redis: any // Will be @upstash/redis Redis instance
  private keyPrefix: string
  private initialized = false

  constructor(private config: ConnectionBackendConfig['upstash']) {
    if (!config) {
      throw new Error('Upstash configuration is required')
    }
    this.keyPrefix = config.keyPrefix || 'mcp-proxy:servers:'
  }

  async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      // Dynamic import to avoid requiring @upstash/redis if not using this backend
      const { Redis } = await import('@upstash/redis')

      this.redis = new Redis({
        url: this.config!.url,
        token: this.config!.token,
      })

      // Test the connection
      await this.redis.ping()
      this.initialized = true
    } catch (error) {
      throw new Error(
        `Failed to initialize Upstash Redis backend: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
    }
  }

  async close(): Promise<void> {
    // Upstash Redis connections are stateless, no cleanup needed
    this.initialized = false
  }

  private getKey(serverName: string): string {
    return `${this.keyPrefix}${serverName}`
  }

  private getIndexKey(): string {
    return `${this.keyPrefix}index`
  }

  private getUrlMapKey(): string {
    return `${this.keyPrefix}urlmap`
  }

  async addServer(serverUrl: string, serverName?: string): Promise<string> {
    if (!this.initialized) {
      await this.initialize()
    }

    // Validate URL format
    try {
      new URL(serverUrl)
    } catch {
      throw new Error(`Invalid server URL: ${serverUrl}`)
    }

    // Check if URL already exists using a reverse lookup map
    const existingName = await this.redis.hget(this.getUrlMapKey(), serverUrl)
    if (existingName) {
      return existingName
    }

    // Generate server name if not provided
    if (!serverName) {
      // Get current server count for auto-generation
      const serverCount = (await this.redis.hlen(this.getUrlMapKey())) || 0
      let index = serverCount
      do {
        serverName = `server${index}`
        index++
      } while (await this.redis.hexists(this.getKey('all'), serverName))
    } else {
      // Check if custom name conflicts with existing servers
      const exists = await this.redis.hexists(this.getKey('all'), serverName)
      if (exists) {
        throw new Error(
          `Server name '${serverName}' already exists. Choose a different name or omit to auto-generate.`,
        )
      }
    }

    // Use HSETNX for atomic URL mapping to prevent race conditions
    const wasSet = await this.redis.hsetnx(
      this.getUrlMapKey(),
      serverUrl,
      serverName,
    )

    if (!wasSet) {
      // Someone else connected while we were preparing - get their name
      const raceName = await this.redis.hget(this.getUrlMapKey(), serverUrl)
      return raceName || serverName // Fallback to our generated name if something went wrong
    }

    // We won the race for the URL, now set the main server mapping
    await this.redis.hset(this.getKey('all'), { [serverName]: serverUrl })

    return serverName
  }

  async removeServer(serverName: string): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize()
    }

    // Get the server URL first
    const serverUrl = await this.redis.hget(this.getKey('all'), serverName)
    if (!serverUrl) {
      return false
    }

    // Remove from both maps using pipeline
    const pipeline = this.redis.pipeline()
    pipeline.hdel(this.getKey('all'), serverName)
    pipeline.hdel(this.getUrlMapKey(), serverUrl)
    const results = await pipeline.exec()

    // Return true if the main entry was removed
    return results[0] === 1
  }

  async getServers(): Promise<Map<string, string>> {
    if (!this.initialized) {
      await this.initialize()
    }

    const servers = await this.redis.hgetall(this.getKey('all'))
    return new Map(Object.entries(servers || {}))
  }

  async hasServer(serverName: string): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize()
    }

    return await this.redis.hexists(this.getKey('all'), serverName)
  }

  async clearServers(): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }

    // Clear both the main map and the URL reverse lookup map
    const pipeline = this.redis.pipeline()
    pipeline.del(this.getKey('all'))
    pipeline.del(this.getUrlMapKey())
    await pipeline.exec()
  }
}
