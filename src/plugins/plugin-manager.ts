import {
  BaseServerPlugin,
  AgentInfo,
  AgentCallParams,
  RetryConfig,
  ServerStatus,
} from './base-plugin.js'
import { MastraPlugin } from './mastra-plugin.js'
import { LangGraphPlugin } from './langgraph-plugin.js'
import { logger } from '../config.js'

/**
 * Plugin manager that handles multiple server types transparently
 */
export class PluginManager {
  private plugins: BaseServerPlugin[]
  private serverTypeCache: Map<string, string> = new Map() // serverUrl -> serverType

  constructor() {
    this.plugins = [new MastraPlugin(), new LangGraphPlugin()]
  }

  /**
   * Detect the server type for a given URL
   */
  async detectServerType(serverUrl: string): Promise<string | null> {
    // Check cache first
    if (this.serverTypeCache.has(serverUrl)) {
      return this.serverTypeCache.get(serverUrl)!
    }

    // Try each plugin to detect the server type
    for (const plugin of this.plugins) {
      try {
        const isCompatible = await plugin.detectServerType(serverUrl)
        if (isCompatible) {
          this.serverTypeCache.set(serverUrl, plugin.serverType)
          logger.log(
            `Detected server type '${plugin.serverType}' for ${serverUrl}`,
          )
          return plugin.serverType
        }
      } catch (error) {
        logger.error(
          `Error detecting server type with ${plugin.serverType} plugin:`,
          error,
        )
        continue
      }
    }

    logger.error(`Could not detect server type for ${serverUrl}`)
    return null
  }

  /**
   * Get the appropriate plugin for a server URL
   */
  async getPlugin(serverUrl: string): Promise<BaseServerPlugin | null> {
    const serverType = await this.detectServerType(serverUrl)
    if (!serverType) {
      return null
    }

    return (
      this.plugins.find((plugin) => plugin.serverType === serverType) || null
    )
  }

  /**
   * Get agents from a server using the appropriate plugin
   */
  async getAgents(
    serverUrl: string,
    retryConfig: RetryConfig,
  ): Promise<AgentInfo[]> {
    const plugin = await this.getPlugin(serverUrl)
    if (!plugin) {
      throw new Error(`No plugin found for server: ${serverUrl}`)
    }

    return await plugin.getAgents(serverUrl, retryConfig)
  }

  /**
   * Get detailed information about a specific agent
   */
  async getAgentDescription(
    serverUrl: string,
    agentId: string,
    retryConfig: RetryConfig,
  ): Promise<AgentInfo> {
    const plugin = await this.getPlugin(serverUrl)
    if (!plugin) {
      throw new Error(`No plugin found for server: ${serverUrl}`)
    }

    return await plugin.getAgentDescription(serverUrl, agentId, retryConfig)
  }

  /**
   * Call an agent using the appropriate plugin
   */
  async callAgent(
    serverUrl: string,
    params: AgentCallParams,
    retryConfig: RetryConfig,
  ): Promise<unknown> {
    const plugin = await this.getPlugin(serverUrl)
    if (!plugin) {
      throw new Error(`No plugin found for server: ${serverUrl}`)
    }

    return await plugin.callAgent(serverUrl, params, retryConfig)
  }

  /**
   * Validate connection to a server using the appropriate plugin
   */
  async validateConnection(serverUrl: string): Promise<boolean> {
    const plugin = await this.getPlugin(serverUrl)
    if (!plugin) {
      return false
    }

    return await plugin.validateConnection(serverUrl)
  }

  /**
   * Get server status with plugin information
   */
  async getServerStatus(
    serverName: string,
    serverUrl: string,
    retryConfig: RetryConfig,
    isDynamic: boolean = false,
  ): Promise<ServerStatus> {
    try {
      const plugin = await this.getPlugin(serverUrl)
      if (!plugin) {
        return {
          serverName,
          serverUrl,
          serverType: 'unknown',
          serverDescription: `Unknown server type`,
          agents: [],
          status: 'error',
          error: 'No compatible plugin found',
          isDynamic,
        }
      }

      const agents = await plugin.getAgents(serverUrl, retryConfig)

      return {
        serverName,
        serverUrl,
        serverType: plugin.serverType,
        serverDescription: `${plugin.serverType.charAt(0).toUpperCase() + plugin.serverType.slice(1)} Server (${serverName})`,
        agents,
        status: 'online',
        isDynamic,
      }
    } catch (error: unknown) {
      return {
        serverName,
        serverUrl,
        serverType: 'unknown',
        serverDescription: `Server (${serverName})`,
        agents: [],
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        isDynamic,
      }
    }
  }

  /**
   * Clear the server type cache (useful for testing or when servers change)
   */
  clearCache(): void {
    this.serverTypeCache.clear()
  }

  /**
   * Get all supported server types
   */
  getSupportedServerTypes(): string[] {
    return this.plugins.map((plugin) => plugin.serverType)
  }
}
