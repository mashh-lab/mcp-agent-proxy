import { describe, it, expect, beforeEach } from 'vitest'
import { LocalConnectionBackend } from './local-backend.js'

describe('LocalConnectionBackend', () => {
  let backend: LocalConnectionBackend

  beforeEach(() => {
    backend = new LocalConnectionBackend()
  })

  describe('initialization and cleanup', () => {
    it('should initialize without error', async () => {
      await expect(backend.initialize()).resolves.toBeUndefined()
    })

    it('should close without error', async () => {
      await expect(backend.close()).resolves.toBeUndefined()
    })

    it('should work immediately without initialization', async () => {
      // Local backend should work without explicit initialization
      const serverName = await backend.addServer('http://localhost:4111')
      expect(serverName).toBe('server0')
    })
  })

  describe('addServer', () => {
    beforeEach(async () => {
      await backend.initialize()
    })

    it('should add server with auto-generated name', async () => {
      const serverName = await backend.addServer('http://localhost:4111')

      expect(serverName).toBe('server0')
      expect(await backend.hasServer('server0')).toBe(true)

      const servers = await backend.getServers()
      expect(servers.get('server0')).toBe('http://localhost:4111')
    })

    it('should add server with custom name', async () => {
      const serverName = await backend.addServer(
        'http://localhost:4111',
        'myServer',
      )

      expect(serverName).toBe('myServer')
      expect(await backend.hasServer('myServer')).toBe(true)

      const servers = await backend.getServers()
      expect(servers.get('myServer')).toBe('http://localhost:4111')
    })

    it('should auto-generate sequential names', async () => {
      const name1 = await backend.addServer('http://localhost:4111')
      const name2 = await backend.addServer('http://localhost:4112')
      const name3 = await backend.addServer('http://localhost:4113')

      expect(name1).toBe('server0')
      expect(name2).toBe('server1')
      expect(name3).toBe('server2')
    })

    it('should return existing server name if URL already exists', async () => {
      const name1 = await backend.addServer('http://localhost:4111', 'first')
      const name2 = await backend.addServer('http://localhost:4111', 'second')

      expect(name1).toBe('first')
      expect(name2).toBe('first') // Should return existing name

      // Only one server should exist
      const servers = await backend.getServers()
      expect(servers.size).toBe(1)
      expect(servers.get('first')).toBe('http://localhost:4111')
      expect(servers.has('second')).toBe(false)
    })

    it('should handle complex URLs', async () => {
      const complexUrls = [
        'https://api.example.com:8443/path?query=value#fragment',
        'http://192.168.1.100:3000',
        'https://subdomain.domain.co.uk/api/v2',
        'http://localhost:4111/webhook?token=abc123',
      ]

      for (let i = 0; i < complexUrls.length; i++) {
        const serverName = await backend.addServer(complexUrls[i])
        expect(serverName).toBe(`server${i}`)

        const servers = await backend.getServers()
        expect(servers.get(`server${i}`)).toBe(complexUrls[i])
      }
    })

    it('should reject invalid URLs', async () => {
      const invalidUrls = [
        'not-a-url',
        '',
        'http://',
        'just-text',
        'http:// space-in-url.com',
      ]

      for (const invalidUrl of invalidUrls) {
        await expect(backend.addServer(invalidUrl)).rejects.toThrow(
          `Invalid server URL: ${invalidUrl}`,
        )
      }
    })

    it('should reject duplicate server names', async () => {
      await backend.addServer('http://localhost:4111', 'myServer')

      await expect(
        backend.addServer('http://localhost:4112', 'myServer'),
      ).rejects.toThrow(
        "Server name 'myServer' already exists. Choose a different name or omit to auto-generate.",
      )
    })

    it('should handle name generation when some names are taken', async () => {
      // Add servers with custom names that would conflict with auto-generation
      await backend.addServer('http://localhost:4111', 'server0')
      await backend.addServer('http://localhost:4112', 'server2')

      // Auto-generation should skip taken names
      const name1 = await backend.addServer('http://localhost:4113')
      const name2 = await backend.addServer('http://localhost:4114')

      expect(name1).toBe('server1') // server0 taken, so next available is server1
      expect(name2).toBe('server3') // server2 taken, so next available is server3
    })
  })

  describe('removeServer', () => {
    beforeEach(async () => {
      await backend.initialize()
    })

    it('should remove existing server', async () => {
      await backend.addServer('http://localhost:4111', 'testServer')

      const removed = await backend.removeServer('testServer')
      expect(removed).toBe(true)
      expect(await backend.hasServer('testServer')).toBe(false)

      const servers = await backend.getServers()
      expect(servers.size).toBe(0)
    })

    it('should return false for non-existent server', async () => {
      const removed = await backend.removeServer('nonExistent')
      expect(removed).toBe(false)
    })

    it('should handle removing from populated backend', async () => {
      await backend.addServer('http://localhost:4111', 'server1')
      await backend.addServer('http://localhost:4112', 'server2')
      await backend.addServer('http://localhost:4113', 'server3')

      const removed = await backend.removeServer('server2')
      expect(removed).toBe(true)

      const servers = await backend.getServers()
      expect(servers.size).toBe(2)
      expect(servers.has('server1')).toBe(true)
      expect(servers.has('server2')).toBe(false)
      expect(servers.has('server3')).toBe(true)
    })
  })

  describe('getServers', () => {
    beforeEach(async () => {
      await backend.initialize()
    })

    it('should return empty map when no servers', async () => {
      const servers = await backend.getServers()
      expect(servers).toBeInstanceOf(Map)
      expect(servers.size).toBe(0)
    })

    it('should return all servers', async () => {
      await backend.addServer('http://localhost:4111', 'server1')
      await backend.addServer('http://localhost:4112', 'server2')

      const servers = await backend.getServers()
      expect(servers.size).toBe(2)
      expect(servers.get('server1')).toBe('http://localhost:4111')
      expect(servers.get('server2')).toBe('http://localhost:4112')
    })

    it('should return independent copy of servers map', async () => {
      await backend.addServer('http://localhost:4111', 'server1')

      const servers1 = await backend.getServers()
      const servers2 = await backend.getServers()

      // Should be different instances
      expect(servers1).not.toBe(servers2)

      // But with same content
      expect(servers1.size).toBe(servers2.size)
      expect(servers1.get('server1')).toBe(servers2.get('server1'))

      // Modifying one shouldn't affect the other
      servers1.set('newServer', 'http://test.com')
      expect(servers2.has('newServer')).toBe(false)
    })
  })

  describe('hasServer', () => {
    beforeEach(async () => {
      await backend.initialize()
    })

    it('should return false for non-existent server', async () => {
      expect(await backend.hasServer('nonExistent')).toBe(false)
    })

    it('should return true for existing server', async () => {
      await backend.addServer('http://localhost:4111', 'testServer')
      expect(await backend.hasServer('testServer')).toBe(true)
    })

    it('should return false after server removal', async () => {
      await backend.addServer('http://localhost:4111', 'testServer')
      await backend.removeServer('testServer')
      expect(await backend.hasServer('testServer')).toBe(false)
    })
  })

  describe('clearServers', () => {
    beforeEach(async () => {
      await backend.initialize()
    })

    it('should clear empty backend', async () => {
      await backend.clearServers()
      const servers = await backend.getServers()
      expect(servers.size).toBe(0)
    })

    it('should clear all servers', async () => {
      await backend.addServer('http://localhost:4111', 'server1')
      await backend.addServer('http://localhost:4112', 'server2')
      await backend.addServer('http://localhost:4113', 'server3')

      await backend.clearServers()

      const servers = await backend.getServers()
      expect(servers.size).toBe(0)

      expect(await backend.hasServer('server1')).toBe(false)
      expect(await backend.hasServer('server2')).toBe(false)
      expect(await backend.hasServer('server3')).toBe(false)
    })

    it('should allow adding servers after clear', async () => {
      await backend.addServer('http://localhost:4111', 'server1')
      await backend.clearServers()

      const newServerName = await backend.addServer(
        'http://localhost:4112',
        'newServer',
      )
      expect(newServerName).toBe('newServer')
      expect(await backend.hasServer('newServer')).toBe(true)
    })
  })

  describe('concurrent operations', () => {
    beforeEach(async () => {
      await backend.initialize()
    })

    it('should handle concurrent addServer calls', async () => {
      const promises = [
        backend.addServer('http://localhost:4111'),
        backend.addServer('http://localhost:4112'),
        backend.addServer('http://localhost:4113'),
        backend.addServer('http://localhost:4114'),
        backend.addServer('http://localhost:4115'),
      ]

      const results = await Promise.all(promises)

      // All should succeed with unique names
      expect(new Set(results).size).toBe(5) // All unique

      const servers = await backend.getServers()
      expect(servers.size).toBe(5)
    })

    it('should handle concurrent operations on same URL', async () => {
      const promises = [
        backend.addServer('http://localhost:4111'),
        backend.addServer('http://localhost:4111'),
        backend.addServer('http://localhost:4111'),
      ]

      const results = await Promise.all(promises)

      // All should return the same server name
      expect(results[0]).toBe(results[1])
      expect(results[1]).toBe(results[2])

      const servers = await backend.getServers()
      expect(servers.size).toBe(1) // Only one server should exist
    })
  })
})
