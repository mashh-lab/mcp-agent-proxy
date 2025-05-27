import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { disconnectServer } from './disconnect-server-tool.js'
import * as config from '../config.js'

// Mock the dependencies
vi.mock('../config.js')

const mockConfig = vi.mocked(config)

// Define types for better type safety
type DisconnectServerInput = {
  serverName: string
}

type DisconnectServerOutput = {
  success: true
  serverName: string
  message: string
  remainingDynamicServers: string[]
}

describe('disconnect-server-tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock implementations
    mockConfig.logger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      forceError: vi.fn(),
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('tool configuration', () => {
    it('should have correct tool configuration', () => {
      expect(disconnectServer.id).toBe('disconnectServer')
      expect(disconnectServer.description).toContain(
        'Disconnects from a dynamically connected Mastra server',
      )
      expect(disconnectServer.description).toContain(
        'Only servers that were connected via the connectServer tool can be disconnected',
      )
      expect(disconnectServer.description).toContain(
        'MASTRA_SERVERS environment variable cannot be removed',
      )
      expect(disconnectServer.inputSchema).toBeDefined()
      expect(disconnectServer.outputSchema).toBeDefined()
    })
  })

  describe('successful server disconnection', () => {
    it('should successfully disconnect an existing dynamic server', async () => {
      const mockDynamicServers = new Map([
        ['server1', 'http://server1.example.com'],
        ['server2', 'http://server2.example.com'],
        ['targetServer', 'http://target.example.com'],
      ])

      const mockRemainingServers = new Map([
        ['server1', 'http://server1.example.com'],
        ['server2', 'http://server2.example.com'],
      ])

      mockConfig.getDynamicServers
        .mockReturnValueOnce(mockDynamicServers) // First call to check existence
        .mockReturnValueOnce(mockRemainingServers) // Second call to get remaining servers

      mockConfig.removeDynamicServer.mockReturnValue(true)

      const input: DisconnectServerInput = {
        serverName: 'targetServer',
      }

      const mockContext = {
        context: input,
      }

      const result = (await disconnectServer.execute(
        mockContext as any,
      )) as DisconnectServerOutput

      expect(result.success).toBe(true)
      expect(result.serverName).toBe('targetServer')
      expect(result.message).toBe(
        "Successfully disconnected from server 'targetServer'",
      )
      expect(result.remainingDynamicServers).toEqual(['server1', 'server2'])

      expect(mockConfig.getDynamicServers).toHaveBeenCalledTimes(2)
      expect(mockConfig.removeDynamicServer).toHaveBeenCalledWith(
        'targetServer',
      )
    })

    it('should handle disconnecting the last dynamic server', async () => {
      const mockDynamicServers = new Map([
        ['lastServer', 'http://last.example.com'],
      ])

      const mockEmptyServers = new Map()

      mockConfig.getDynamicServers
        .mockReturnValueOnce(mockDynamicServers) // First call to check existence
        .mockReturnValueOnce(mockEmptyServers) // Second call to get remaining servers

      mockConfig.removeDynamicServer.mockReturnValue(true)

      const input: DisconnectServerInput = {
        serverName: 'lastServer',
      }

      const mockContext = {
        context: input,
      }

      const result = (await disconnectServer.execute(
        mockContext as any,
      )) as DisconnectServerOutput

      expect(result.success).toBe(true)
      expect(result.serverName).toBe('lastServer')
      expect(result.message).toBe(
        "Successfully disconnected from server 'lastServer'",
      )
      expect(result.remainingDynamicServers).toEqual([])

      expect(mockConfig.removeDynamicServer).toHaveBeenCalledWith('lastServer')
    })

    it('should handle disconnecting from servers with special characters in names', async () => {
      const mockDynamicServers = new Map([
        ['special-server_123', 'http://special.example.com'],
        ['another-server', 'http://another.example.com'],
      ])

      const mockRemainingServers = new Map([
        ['another-server', 'http://another.example.com'],
      ])

      mockConfig.getDynamicServers
        .mockReturnValueOnce(mockDynamicServers)
        .mockReturnValueOnce(mockRemainingServers)

      mockConfig.removeDynamicServer.mockReturnValue(true)

      const input: DisconnectServerInput = {
        serverName: 'special-server_123',
      }

      const mockContext = {
        context: input,
      }

      const result = (await disconnectServer.execute(
        mockContext as any,
      )) as DisconnectServerOutput

      expect(result.success).toBe(true)
      expect(result.serverName).toBe('special-server_123')
      expect(result.remainingDynamicServers).toEqual(['another-server'])
    })
  })

  describe('server not found errors', () => {
    it('should handle server not found with no dynamic servers', async () => {
      const mockEmptyServers = new Map()

      mockConfig.getDynamicServers.mockReturnValue(mockEmptyServers)

      const input: DisconnectServerInput = {
        serverName: 'nonexistentServer',
      }

      const mockContext = {
        context: input,
      }

      await expect(
        disconnectServer.execute(mockContext as any),
      ).rejects.toThrow(
        "Failed to remove server nonexistentServer: Server 'nonexistentServer' not found in dynamically connected servers. Available connected servers: none",
      )

      expect(mockConfig.logger.error).toHaveBeenCalledWith(
        'Error removing server nonexistentServer:',
        expect.any(Error),
      )
      expect(mockConfig.removeDynamicServer).not.toHaveBeenCalled()
    })

    it('should handle server not found with existing dynamic servers', async () => {
      const mockDynamicServers = new Map([
        ['server1', 'http://server1.example.com'],
        ['server2', 'http://server2.example.com'],
        ['server3', 'http://server3.example.com'],
      ])

      mockConfig.getDynamicServers.mockReturnValue(mockDynamicServers)

      const input: DisconnectServerInput = {
        serverName: 'nonexistentServer',
      }

      const mockContext = {
        context: input,
      }

      await expect(
        disconnectServer.execute(mockContext as any),
      ).rejects.toThrow(
        "Failed to remove server nonexistentServer: Server 'nonexistentServer' not found in dynamically connected servers. Available connected servers: server1, server2, server3",
      )

      expect(mockConfig.logger.error).toHaveBeenCalledWith(
        'Error removing server nonexistentServer:',
        expect.any(Error),
      )
      expect(mockConfig.removeDynamicServer).not.toHaveBeenCalled()
    })

    it('should handle case-sensitive server name matching', async () => {
      const mockDynamicServers = new Map([
        ['MyServer', 'http://myserver.example.com'],
        ['anotherServer', 'http://another.example.com'],
      ])

      mockConfig.getDynamicServers.mockReturnValue(mockDynamicServers)

      const input: DisconnectServerInput = {
        serverName: 'myserver', // Different case
      }

      const mockContext = {
        context: input,
      }

      await expect(
        disconnectServer.execute(mockContext as any),
      ).rejects.toThrow(
        "Failed to remove server myserver: Server 'myserver' not found in dynamically connected servers. Available connected servers: MyServer, anotherServer",
      )

      expect(mockConfig.removeDynamicServer).not.toHaveBeenCalled()
    })
  })

  describe('removal failure errors', () => {
    it('should handle removeDynamicServer returning false', async () => {
      const mockDynamicServers = new Map([
        ['existingServer', 'http://existing.example.com'],
      ])

      mockConfig.getDynamicServers.mockReturnValue(mockDynamicServers)
      mockConfig.removeDynamicServer.mockReturnValue(false) // Removal failed

      const input: DisconnectServerInput = {
        serverName: 'existingServer',
      }

      const mockContext = {
        context: input,
      }

      await expect(
        disconnectServer.execute(mockContext as any),
      ).rejects.toThrow(
        "Failed to remove server existingServer: Failed to remove server 'existingServer'",
      )

      expect(mockConfig.logger.error).toHaveBeenCalledWith(
        'Error removing server existingServer:',
        expect.any(Error),
      )
      expect(mockConfig.removeDynamicServer).toHaveBeenCalledWith(
        'existingServer',
      )
    })

    it('should handle removeDynamicServer throwing an error', async () => {
      const mockDynamicServers = new Map([
        ['problematicServer', 'http://problematic.example.com'],
      ])

      mockConfig.getDynamicServers.mockReturnValue(mockDynamicServers)
      mockConfig.removeDynamicServer.mockImplementation(() => {
        throw new Error('Internal removal error')
      })

      const input: DisconnectServerInput = {
        serverName: 'problematicServer',
      }

      const mockContext = {
        context: input,
      }

      await expect(
        disconnectServer.execute(mockContext as any),
      ).rejects.toThrow(
        'Failed to remove server problematicServer: Internal removal error',
      )

      expect(mockConfig.logger.error).toHaveBeenCalledWith(
        'Error removing server problematicServer:',
        expect.any(Error),
      )
    })

    it('should handle removeDynamicServer throwing non-Error exceptions', async () => {
      const mockDynamicServers = new Map([
        ['stringErrorServer', 'http://stringerror.example.com'],
      ])

      mockConfig.getDynamicServers.mockReturnValue(mockDynamicServers)
      mockConfig.removeDynamicServer.mockImplementation(() => {
        throw 'String error from removal'
      })

      const input: DisconnectServerInput = {
        serverName: 'stringErrorServer',
      }

      const mockContext = {
        context: input,
      }

      await expect(
        disconnectServer.execute(mockContext as any),
      ).rejects.toThrow(
        'Failed to remove server stringErrorServer: Unknown error',
      )

      expect(mockConfig.logger.error).toHaveBeenCalledWith(
        'Error removing server stringErrorServer:',
        'String error from removal',
      )
    })
  })

  describe('getDynamicServers errors', () => {
    it('should handle getDynamicServers throwing an error during initial check', async () => {
      mockConfig.getDynamicServers.mockImplementation(() => {
        throw new Error('Failed to get dynamic servers')
      })

      const input: DisconnectServerInput = {
        serverName: 'anyServer',
      }

      const mockContext = {
        context: input,
      }

      await expect(
        disconnectServer.execute(mockContext as any),
      ).rejects.toThrow(
        'Failed to remove server anyServer: Failed to get dynamic servers',
      )

      expect(mockConfig.logger.error).toHaveBeenCalledWith(
        'Error removing server anyServer:',
        expect.any(Error),
      )
    })

    it('should handle getDynamicServers throwing an error during final check', async () => {
      const mockDynamicServers = new Map([
        ['workingServer', 'http://working.example.com'],
      ])

      mockConfig.getDynamicServers
        .mockReturnValueOnce(mockDynamicServers) // First call succeeds
        .mockImplementationOnce(() => {
          // Second call fails
          throw new Error('Failed to get remaining servers')
        })

      mockConfig.removeDynamicServer.mockReturnValue(true)

      const input: DisconnectServerInput = {
        serverName: 'workingServer',
      }

      const mockContext = {
        context: input,
      }

      await expect(
        disconnectServer.execute(mockContext as any),
      ).rejects.toThrow(
        'Failed to remove server workingServer: Failed to get remaining servers',
      )

      expect(mockConfig.removeDynamicServer).toHaveBeenCalledWith(
        'workingServer',
      )
    })
  })

  describe('input validation', () => {
    it('should handle empty server name', async () => {
      const input: DisconnectServerInput = {
        serverName: '',
      }

      const mockContext = {
        context: input,
      }

      // This should be caught by the schema validation, but let's test the behavior
      // if it somehow gets through
      const mockEmptyServers = new Map()
      mockConfig.getDynamicServers.mockReturnValue(mockEmptyServers)

      await expect(
        disconnectServer.execute(mockContext as any),
      ).rejects.toThrow(
        "Failed to remove server : Server '' not found in dynamically connected servers. Available connected servers: none",
      )
    })

    it('should handle server names with whitespace', async () => {
      const mockDynamicServers = new Map([
        ['server with spaces', 'http://spaces.example.com'],
      ])

      const mockRemainingServers = new Map()

      mockConfig.getDynamicServers
        .mockReturnValueOnce(mockDynamicServers)
        .mockReturnValueOnce(mockRemainingServers)

      mockConfig.removeDynamicServer.mockReturnValue(true)

      const input: DisconnectServerInput = {
        serverName: 'server with spaces',
      }

      const mockContext = {
        context: input,
      }

      const result = (await disconnectServer.execute(
        mockContext as any,
      )) as DisconnectServerOutput

      expect(result.success).toBe(true)
      expect(result.serverName).toBe('server with spaces')
      expect(result.remainingDynamicServers).toEqual([])
    })
  })

  describe('edge cases', () => {
    it('should handle very long server names', async () => {
      const longServerName =
        'very-long-server-name-that-exceeds-normal-length-expectations-and-continues-for-a-very-long-time-to-test-edge-cases'

      const mockDynamicServers = new Map([
        [longServerName, 'http://long.example.com'],
      ])

      const mockRemainingServers = new Map()

      mockConfig.getDynamicServers
        .mockReturnValueOnce(mockDynamicServers)
        .mockReturnValueOnce(mockRemainingServers)

      mockConfig.removeDynamicServer.mockReturnValue(true)

      const input: DisconnectServerInput = {
        serverName: longServerName,
      }

      const mockContext = {
        context: input,
      }

      const result = (await disconnectServer.execute(
        mockContext as any,
      )) as DisconnectServerOutput

      expect(result.success).toBe(true)
      expect(result.serverName).toBe(longServerName)
      expect(result.message).toBe(
        `Successfully disconnected from server '${longServerName}'`,
      )
    })

    it('should handle large number of remaining servers', async () => {
      const targetServer = 'targetServer'
      const mockDynamicServers = new Map()
      const mockRemainingServers = new Map()

      // Add target server
      mockDynamicServers.set(targetServer, 'http://target.example.com')

      // Add many remaining servers
      for (let i = 0; i < 100; i++) {
        const serverName = `server${i}`
        mockDynamicServers.set(serverName, `http://server${i}.example.com`)
        mockRemainingServers.set(serverName, `http://server${i}.example.com`)
      }

      mockConfig.getDynamicServers
        .mockReturnValueOnce(mockDynamicServers)
        .mockReturnValueOnce(mockRemainingServers)

      mockConfig.removeDynamicServer.mockReturnValue(true)

      const input: DisconnectServerInput = {
        serverName: targetServer,
      }

      const mockContext = {
        context: input,
      }

      const result = (await disconnectServer.execute(
        mockContext as any,
      )) as DisconnectServerOutput

      expect(result.success).toBe(true)
      expect(result.serverName).toBe(targetServer)
      expect(result.remainingDynamicServers).toHaveLength(100)
      expect(result.remainingDynamicServers).toContain('server0')
      expect(result.remainingDynamicServers).toContain('server99')
      expect(result.remainingDynamicServers).not.toContain(targetServer)
    })

    it('should handle servers with unicode characters in names', async () => {
      const unicodeServerName = 'server-测试-🚀-émoji'

      const mockDynamicServers = new Map([
        [unicodeServerName, 'http://unicode.example.com'],
        ['normalServer', 'http://normal.example.com'],
      ])

      const mockRemainingServers = new Map([
        ['normalServer', 'http://normal.example.com'],
      ])

      mockConfig.getDynamicServers
        .mockReturnValueOnce(mockDynamicServers)
        .mockReturnValueOnce(mockRemainingServers)

      mockConfig.removeDynamicServer.mockReturnValue(true)

      const input: DisconnectServerInput = {
        serverName: unicodeServerName,
      }

      const mockContext = {
        context: input,
      }

      const result = (await disconnectServer.execute(
        mockContext as any,
      )) as DisconnectServerOutput

      expect(result.success).toBe(true)
      expect(result.serverName).toBe(unicodeServerName)
      expect(result.remainingDynamicServers).toEqual(['normalServer'])
    })

    it('should handle null/undefined values from getDynamicServers', async () => {
      // Test with null return value
      mockConfig.getDynamicServers.mockReturnValue(null as any)

      const input: DisconnectServerInput = {
        serverName: 'anyServer',
      }

      const mockContext = {
        context: input,
      }

      await expect(
        disconnectServer.execute(mockContext as any),
      ).rejects.toThrow('Failed to remove server anyServer:')

      expect(mockConfig.logger.error).toHaveBeenCalled()
    })
  })

  describe('integration scenarios', () => {
    it('should handle disconnecting multiple servers in sequence', async () => {
      // First disconnection
      const mockServersBeforeFirst = new Map([
        ['server1', 'http://server1.example.com'],
        ['server2', 'http://server2.example.com'],
        ['server3', 'http://server3.example.com'],
      ])

      const mockServersAfterFirst = new Map([
        ['server2', 'http://server2.example.com'],
        ['server3', 'http://server3.example.com'],
      ])

      mockConfig.getDynamicServers
        .mockReturnValueOnce(mockServersBeforeFirst)
        .mockReturnValueOnce(mockServersAfterFirst)

      mockConfig.removeDynamicServer.mockReturnValue(true)

      const firstInput: DisconnectServerInput = {
        serverName: 'server1',
      }

      const firstResult = (await disconnectServer.execute({
        context: firstInput,
      } as any)) as DisconnectServerOutput

      expect(firstResult.success).toBe(true)
      expect(firstResult.serverName).toBe('server1')
      expect(firstResult.remainingDynamicServers).toEqual([
        'server2',
        'server3',
      ])

      // Reset mocks for second disconnection
      vi.clearAllMocks()
      mockConfig.logger = {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        forceError: vi.fn(),
      }

      // Second disconnection
      const mockServersAfterSecond = new Map([
        ['server3', 'http://server3.example.com'],
      ])

      mockConfig.getDynamicServers
        .mockReturnValueOnce(mockServersAfterFirst)
        .mockReturnValueOnce(mockServersAfterSecond)

      mockConfig.removeDynamicServer.mockReturnValue(true)

      const secondInput: DisconnectServerInput = {
        serverName: 'server2',
      }

      const secondResult = (await disconnectServer.execute({
        context: secondInput,
      } as any)) as DisconnectServerOutput

      expect(secondResult.success).toBe(true)
      expect(secondResult.serverName).toBe('server2')
      expect(secondResult.remainingDynamicServers).toEqual(['server3'])
    })

    it('should provide helpful error messages for troubleshooting', async () => {
      const mockDynamicServers = new Map([
        ['production-server', 'http://prod.example.com'],
        ['staging-server', 'http://staging.example.com'],
        ['development-server', 'http://dev.example.com'],
      ])

      mockConfig.getDynamicServers.mockReturnValue(mockDynamicServers)

      const input: DisconnectServerInput = {
        serverName: 'prod-server', // Similar but not exact
      }

      const mockContext = {
        context: input,
      }

      await expect(
        disconnectServer.execute(mockContext as any),
      ).rejects.toThrow(
        "Failed to remove server prod-server: Server 'prod-server' not found in dynamically connected servers. Available connected servers: production-server, staging-server, development-server",
      )

      // The error message should help users identify the correct server name
      expect(mockConfig.logger.error).toHaveBeenCalledWith(
        'Error removing server prod-server:',
        expect.any(Error),
      )
    })
  })
})
