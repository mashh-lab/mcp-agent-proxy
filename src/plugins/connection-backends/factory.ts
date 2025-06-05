import { ConnectionBackend, ConnectionBackendConfig } from './types.js'
import { LocalConnectionBackend } from './local-backend.js'

/**
 * Factory to create connection backends based on configuration
 */
export class ConnectionBackendFactory {
  private static instance: ConnectionBackend | null = null

  /**
   * Create a connection backend instance based on configuration
   */
  static async createBackend(
    config: ConnectionBackendConfig,
  ): Promise<ConnectionBackend> {
    if (ConnectionBackendFactory.instance) {
      return ConnectionBackendFactory.instance
    }

    let backend: ConnectionBackend

    switch (config.type) {
      case 'local':
        backend = new LocalConnectionBackend()
        break

      case 'upstash':
        // Dynamic import to avoid requiring @upstash/redis if not using this backend
        try {
          const { UpstashConnectionBackend } = await import(
            './upstash-backend.js'
          )
          backend = new UpstashConnectionBackend(config.upstash)
        } catch (error) {
          throw new Error(
            `Failed to load Upstash backend. Make sure @upstash/redis is installed: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
          )
        }
        break

      default:
        throw new Error(
          `Unknown connection backend type: ${(config as { type: string }).type}`,
        )
    }

    await backend.initialize()
    ConnectionBackendFactory.instance = backend
    return backend
  }

  /**
   * Get the current backend instance (must be created first)
   */
  static getInstance(): ConnectionBackend {
    if (!ConnectionBackendFactory.instance) {
      throw new Error(
        'Connection backend not initialized. Call createBackend first.',
      )
    }
    return ConnectionBackendFactory.instance
  }

  /**
   * Close the current backend and reset the singleton
   */
  static async closeBackend(): Promise<void> {
    if (ConnectionBackendFactory.instance) {
      await ConnectionBackendFactory.instance.close()
      ConnectionBackendFactory.instance = null
    }
  }

  /**
   * Get backend configuration from environment variables
   */
  static getConfigFromEnv(): ConnectionBackendConfig {
    const backendType = process.env.MCP_CONNECTION_BACKEND || 'local'

    if (backendType === 'upstash') {
      const upstashUrl = process.env.UPSTASH_REDIS_REST_URL
      const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN
      const keyPrefix = process.env.MCP_REDIS_KEY_PREFIX

      if (!upstashUrl || !upstashToken) {
        throw new Error(
          'Upstash backend requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN environment variables',
        )
      }

      return {
        type: 'upstash',
        upstash: {
          url: upstashUrl,
          token: upstashToken,
          keyPrefix,
        },
      }
    }

    return { type: 'local' }
  }
}
