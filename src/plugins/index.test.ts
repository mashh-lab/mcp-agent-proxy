import { describe, it, expect } from 'vitest'

describe('plugins index exports', () => {
  it('should export BaseServerPlugin', async () => {
    const { BaseServerPlugin } = await import('./index.js')
    expect(BaseServerPlugin).toBeDefined()
    expect(typeof BaseServerPlugin).toBe('function')
  })

  it('should export MastraPlugin', async () => {
    const { MastraPlugin } = await import('./index.js')
    expect(MastraPlugin).toBeDefined()
    expect(typeof MastraPlugin).toBe('function')
  })

  it('should export LangGraphPlugin', async () => {
    const { LangGraphPlugin } = await import('./index.js')
    expect(LangGraphPlugin).toBeDefined()
    expect(typeof LangGraphPlugin).toBe('function')
  })

  it('should export PluginManager', async () => {
    const { PluginManager } = await import('./index.js')
    expect(PluginManager).toBeDefined()
    expect(typeof PluginManager).toBe('function')
  })

  it('should export all types', async () => {
    const exports = await import('./index.js')

    // Check that the module exports the expected items
    expect(exports).toHaveProperty('BaseServerPlugin')
    expect(exports).toHaveProperty('MastraPlugin')
    expect(exports).toHaveProperty('LangGraphPlugin')
    expect(exports).toHaveProperty('PluginManager')
  })

  it('should have correct export structure', async () => {
    const exports = await import('./index.js')
    const exportKeys = Object.keys(exports)

    expect(exportKeys).toContain('BaseServerPlugin')
    expect(exportKeys).toContain('MastraPlugin')
    expect(exportKeys).toContain('LangGraphPlugin')
    expect(exportKeys).toContain('PluginManager')

    // Should only export the expected items
    expect(exportKeys).toHaveLength(4)
  })

  it('should allow creating instances of exported classes', async () => {
    const { MastraPlugin, LangGraphPlugin, PluginManager } = await import(
      './index.js'
    )

    // Should be able to create instances
    expect(() => new MastraPlugin()).not.toThrow()
    expect(() => new LangGraphPlugin()).not.toThrow()
    expect(() => new PluginManager()).not.toThrow()
  })

  it('should have BaseServerPlugin as abstract class', async () => {
    const { BaseServerPlugin } = await import('./index.js')

    // BaseServerPlugin should be a constructor function (abstract class)
    expect(typeof BaseServerPlugin).toBe('function')
    expect(BaseServerPlugin.name).toBe('BaseServerPlugin')
  })

  it('should export classes with correct inheritance', async () => {
    const { BaseServerPlugin, MastraPlugin, LangGraphPlugin } = await import(
      './index.js'
    )

    const mastraInstance = new MastraPlugin()
    const langGraphInstance = new LangGraphPlugin()

    expect(mastraInstance).toBeInstanceOf(BaseServerPlugin)
    expect(langGraphInstance).toBeInstanceOf(BaseServerPlugin)
  })

  it('should export classes with correct server types', async () => {
    const { MastraPlugin, LangGraphPlugin } = await import('./index.js')

    const mastraInstance = new MastraPlugin()
    const langGraphInstance = new LangGraphPlugin()

    expect(mastraInstance.serverType).toBe('mastra')
    expect(langGraphInstance.serverType).toBe('langgraph')
  })

  it('should export PluginManager with correct plugins', async () => {
    const { PluginManager } = await import('./index.js')

    const manager = new PluginManager()
    const supportedTypes = manager.getSupportedServerTypes()

    expect(supportedTypes).toContain('mastra')
    expect(supportedTypes).toContain('langgraph')
    expect(supportedTypes).toHaveLength(2)
  })
})
