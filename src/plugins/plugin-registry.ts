import { BaseServerPlugin } from './base-plugin.js'

/**
 * Plugin registration information
 */
export interface PluginRegistration {
  pluginClass: new () => BaseServerPlugin
  dependencies?: string[]
  description?: string
  priority?: number
}

/**
 * Registry for managing plugin types and their instantiation
 */
export class PluginRegistry {
  private static registrations = new Map<string, PluginRegistration>()

  /**
   * Register a plugin type
   */
  static register(serverType: string, registration: PluginRegistration): void {
    this.registrations.set(serverType, registration)
  }

  /**
   * Create a plugin instance for a server type
   */
  static async createPlugin(serverType: string): Promise<BaseServerPlugin> {
    const registration = this.registrations.get(serverType)
    if (!registration) {
      throw new Error(`No plugin registered for server type: ${serverType}`)
    }

    // Check dependencies before creating (in a real implementation, this would
    // check if the required packages are available in node_modules)
    await this.checkDependencies(registration.dependencies)

    return new registration.pluginClass()
  }

  /**
   * Get all registered server types
   */
  static getRegisteredTypes(): string[] {
    return Array.from(this.registrations.keys())
  }

  /**
   * Get registration information for a server type
   */
  static getRegistration(serverType: string): PluginRegistration | undefined {
    return this.registrations.get(serverType)
  }

  /**
   * Create all registered plugins
   */
  static async createAllPlugins(): Promise<BaseServerPlugin[]> {
    const plugins: BaseServerPlugin[] = []
    const sortedTypes = this.getSortedPluginTypes()

    for (const serverType of sortedTypes) {
      try {
        const plugin = await this.createPlugin(serverType)
        plugins.push(plugin)
      } catch (error) {
        console.warn(`Failed to create plugin for ${serverType}:`, error)
        // Continue with other plugins even if one fails
      }
    }

    return plugins
  }

  /**
   * Clear all registrations (useful for testing)
   */
  static clear(): void {
    this.registrations.clear()
  }

  /**
   * Check if dependencies are available (simplified implementation)
   */
  private static async checkDependencies(
    dependencies?: string[],
  ): Promise<void> {
    if (!dependencies || dependencies.length === 0) {
      return
    }

    // In a real implementation, this would check if the packages are installed
    // For now, we'll assume they are available if the registration exists
    for (const dep of dependencies) {
      try {
        // This would be a dynamic import check in practice
        // await import(dep)
      } catch {
        throw new Error(`Required dependency not available: ${dep}`)
      }
    }
  }

  /**
   * Get plugin types sorted by priority (higher priority first)
   */
  private static getSortedPluginTypes(): string[] {
    return Array.from(this.registrations.entries())
      .sort((a, b) => (b[1].priority || 0) - (a[1].priority || 0))
      .map(([type]) => type)
  }
}
