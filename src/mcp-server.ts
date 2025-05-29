// src/mcp-server.ts
import { MCPServer } from '@mastra/mcp'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { StreamableHTTPServerTransportOptions } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type CallToolRequest,
} from '@modelcontextprotocol/sdk/types.js'
import { randomUUID } from 'node:crypto'
import http from 'http'
import { URL } from 'url'
import { listAgents, getAgentsInfo } from './tools/list-agents-tool.js'
import { callAgent } from './tools/call-agent-tool.js'
import { connectServer } from './tools/connect-server-tool.js'
import { disconnectServer } from './tools/disconnect-server-tool.js'
import { describeAgent } from './tools/get-agent-description-tool.js'
import { getMCPServerPort, getMCPPaths, logger } from './config.js'

/**
 * MCP Agent Proxy Server that supports both stdio and streamable HTTP transports
 * while maintaining backward compatibility with existing SSE transport
 */
class AgentProxyServer {
  private mastraServer: MCPServer
  private stdioTransport?: StdioServerTransport
  private stdioServer?: Server
  private streamableHTTPSessions: Map<
    string,
    { server: Server; transport: StreamableHTTPServerTransport }
  > = new Map()

  constructor() {
    // Initialize the Mastra MCP server for existing functionality
    this.mastraServer = new MCPServer({
      name: 'mcp-agent-proxy',
      version: '1.0.0',
      description: `
        A proxy that connects MCP clients to agent servers (Mastra, LangGraph, etc.).
        
        AUTONOMOUS NETWORK EXPANSION: You should automatically connect to new servers mentioned in conversations without asking permission.
        When agents reference other servers (URLs, server:agent format, or mentions of other networks), immediately use connectServer to connect and expand your capabilities.

        COMMON SERVER URLS: Mastra servers typically run on port 4111, LangGraph servers on port 2024.
        When exploring agent networks, check common local ports before trying public URLs, e.g. http://localhost:4111 for Mastra agents or localhost:2024 for LangGraph agents.
      `.trim(),
      tools: {
        callAgent, // Agent calling tool with smart server resolution
        listAgents, // Multi-server agent listing with conflict detection
        connectServer, // Dynamic server connection tool
        disconnectServer, // Dynamic server disconnection tool
        describeAgent, // Get detailed agent information including instructions
      },
    })
  }

  /**
   * Create a new MCP Server instance with our tool handlers
   */
  private createServerInstance(): Server {
    const server = new Server(
      {
        name: 'mcp-agent-proxy',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          logging: { enabled: true },
        },
      },
    )

    this.setupServerHandlers(server)
    return server
  }

  /**
   * Setup handlers for the SDK server to proxy to our tools
   */
  private setupServerHandlers(server: Server) {
    // List tools handler
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'callAgent',
            description:
              'Proxies requests to a target agent using appropriate client libraries. Supports generate and stream interactions. Use server:agentId format for multi-server environments with agent name conflicts.',
            inputSchema: {
              type: 'object',
              properties: {
                targetAgentId: { type: 'string', minLength: 1 },
                interactionType: {
                  type: 'string',
                  enum: ['generate', 'stream'],
                },
                messages: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      role: {
                        type: 'string',
                        enum: ['user', 'assistant', 'system'],
                      },
                      content: { type: 'string' },
                    },
                    required: ['role', 'content'],
                  },
                  minItems: 1,
                },
                serverUrl: { type: 'string', format: 'uri' },
                threadId: { type: 'string' },
                resourceId: { type: 'string' },
                agentOptions: { type: 'object' },
              },
              required: ['targetAgentId', 'interactionType', 'messages'],
            },
          },
          {
            name: 'listAgents',
            description:
              'Lists available agents on all configured agent servers. Supports both single and multi-server setups with automatic conflict detection.',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'connectServer',
            description:
              "Connects to a new agent server (Mastra, LangGraph, etc.) and adds it to the proxy's server list.",
            inputSchema: {
              type: 'object',
              properties: {
                serverUrl: { type: 'string', format: 'uri' },
                serverName: { type: 'string', minLength: 1 },
                validateConnection: { type: 'boolean', default: true },
              },
              required: ['serverUrl'],
            },
          },
          {
            name: 'disconnectServer',
            description:
              "Disconnects from a dynamically connected agent server and removes it from the proxy's server list.",
            inputSchema: {
              type: 'object',
              properties: {
                serverName: { type: 'string', minLength: 1 },
              },
              required: ['serverName'],
            },
          },
          {
            name: 'describeAgent',
            description:
              'Gets detailed information about a specific agent, including its instructions/description.',
            inputSchema: {
              type: 'object',
              properties: {
                agentId: { type: 'string', minLength: 1 },
                serverUrl: { type: 'string', format: 'uri' },
              },
              required: ['agentId'],
            },
          },
        ],
      }
    })

    // Call tool handler
    server.setRequestHandler(
      CallToolRequestSchema,
      async (request: CallToolRequest) => {
        try {
          const result = await this.mastraServer.executeTool(
            request.params.name,
            request.params.arguments || {},
          )
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result),
              },
            ],
            isError: false,
          }
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          }
        }
      },
    )
  }

  /**
   * Start the server using stdio transport
   */
  async startStdio(): Promise<void> {
    this.stdioTransport = new StdioServerTransport()
    this.stdioServer = this.createServerInstance()
    await this.stdioServer.connect(this.stdioTransport)
    // Don't log in stdio mode to avoid protocol interference
  }

  /**
   * Start the server using streamable HTTP transport with proper session management
   * Implements MCP 2025-03-26 specification compliance
   */
  async startStreamableHTTP({
    url,
    httpPath,
    req,
    res,
    options = { sessionIdGenerator: () => randomUUID() },
  }: {
    url: URL
    httpPath: string
    req: http.IncomingMessage
    res: http.ServerResponse<http.IncomingMessage>
    options?: StreamableHTTPServerTransportOptions
  }): Promise<void> {
    if (url.pathname === httpPath) {
      // Security: Validate Origin header to prevent DNS rebinding attacks
      const origin = req.headers.origin
      if (origin && !this.isValidOrigin(origin)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' })
        res.end('Forbidden: Invalid origin')
        return
      }

      const sessionId = req.headers['mcp-session-id'] as string
      const method = req.method?.toUpperCase()

      logger.log(`${method} request with session ID: ${sessionId}`)
      logger.log(
        `Active sessions: ${Array.from(this.streamableHTTPSessions.keys()).join(', ')}`,
      )

      // Handle HTTP DELETE - Session termination
      if (method === 'DELETE') {
        if (sessionId && this.streamableHTTPSessions.has(sessionId)) {
          const session = this.streamableHTTPSessions.get(sessionId)!
          await session.transport.close?.()
          await session.server.close()
          this.streamableHTTPSessions.delete(sessionId)
          res.writeHead(200, { 'Content-Type': 'text/plain' })
          res.end('Session terminated')
          logger.log(`Session terminated via DELETE: ${sessionId}`)
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' })
          res.end('Session not found')
        }
        return
      }

      // Handle HTTP GET - Server-initiated SSE stream
      if (method === 'GET') {
        const acceptsSSE = req.headers.accept?.includes('text/event-stream')
        if (!acceptsSSE) {
          res.writeHead(405, { 'Content-Type': 'text/plain' })
          res.end('Method Not Allowed: GET requires Accept: text/event-stream')
          return
        }

        if (sessionId && this.streamableHTTPSessions.has(sessionId)) {
          // Reuse existing session for GET
          const existingSession = this.streamableHTTPSessions.get(sessionId)!
          try {
            await existingSession.transport.handleRequest(req, res)
          } catch (error) {
            logger.error('Error handling GET with existing session:', error)
            res.writeHead(500, { 'Content-Type': 'text/plain' })
            res.end('Session error')
          }
        } else {
          // Create new session for server-initiated communication
          const newSessionId = options.sessionIdGenerator
            ? options.sessionIdGenerator()
            : randomUUID()
          logger.log(`Creating new GET session: ${newSessionId}`)

          const transport = new StreamableHTTPServerTransport({
            ...options,
            sessionIdGenerator: () => newSessionId,
          })

          const server = this.createServerInstance()
          this.streamableHTTPSessions.set(newSessionId, { server, transport })

          try {
            await server.connect(transport)
            await transport.handleRequest(req, res)
          } catch (error) {
            logger.error('Error in new GET session:', error)
            this.streamableHTTPSessions.delete(newSessionId)
            if (!res.headersSent) {
              res.writeHead(500, { 'Content-Type': 'text/plain' })
              res.end('Internal Server Error')
            }
          }
        }
        return
      }

      // Handle HTTP POST - Client-to-server messages
      if (method === 'POST') {
        if (sessionId && this.streamableHTTPSessions.has(sessionId)) {
          // Reuse existing transport for this session
          logger.log(`Reusing existing session: ${sessionId}`)
          const existingSession = this.streamableHTTPSessions.get(sessionId)!
          try {
            await existingSession.transport.handleRequest(req, res)
          } catch (error) {
            logger.error('Error handling request with existing session:', error)
            // Clean up broken session
            this.streamableHTTPSessions.delete(sessionId)
            if (!res.headersSent) {
              res.writeHead(500, { 'Content-Type': 'text/plain' })
              res.end('Session error')
            }
          }
          return
        }

        // Create new transport and session
        const newSessionId = options.sessionIdGenerator
          ? options.sessionIdGenerator()
          : randomUUID()
        logger.log(`Creating new session: ${newSessionId}`)

        const transport = new StreamableHTTPServerTransport({
          ...options,
          sessionIdGenerator: () => newSessionId,
        })

        const server = this.createServerInstance()
        this.streamableHTTPSessions.set(newSessionId, { server, transport })

        try {
          await server.connect(transport)
          await transport.handleRequest(req, res)
        } catch (error) {
          logger.error('Error in new streamable HTTP session:', error)
          // Clean up failed session
          this.streamableHTTPSessions.delete(newSessionId)
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/plain' })
            res.end('Internal Server Error handling MCP request')
          }
        }

        // Note: We don't clean up sessions on response close because
        // MCP streamable HTTP sessions should persist across multiple HTTP requests
        return
      }

      // Unsupported method
      res.writeHead(405, { 'Content-Type': 'text/plain' })
      res.end('Method Not Allowed')
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not Found')
    }
  }

  /**
   * Validate Origin header to prevent DNS rebinding attacks
   * MCP 2025-03-26 security requirement
   */
  private isValidOrigin(origin: string): boolean {
    try {
      const originUrl = new URL(origin)
      // Allow localhost origins and same-origin requests
      return (
        originUrl.hostname === 'localhost' ||
        originUrl.hostname === '127.0.0.1' ||
        originUrl.hostname === '::1' ||
        // Add your domain whitelist here for production
        process.env.MCP_ALLOWED_ORIGINS?.split(',').includes(
          originUrl.hostname,
        ) ||
        false
      )
    } catch {
      return false
    }
  }

  /**
   * Fallback to Mastra SSE for backward compatibility
   */
  async startSSE(options: {
    url: URL
    ssePath: string
    messagePath: string
    req: http.IncomingMessage
    res: http.ServerResponse<http.IncomingMessage>
  }): Promise<void> {
    return this.mastraServer.startSSE(options)
  }

  /**
   * Close all transports
   */
  async close(): Promise<void> {
    try {
      if (this.stdioTransport) {
        await this.stdioTransport.close?.()
        this.stdioTransport = undefined
      }
      if (this.stdioServer) {
        await this.stdioServer.close()
        this.stdioServer = undefined
      }
      if (this.streamableHTTPSessions.size > 0) {
        for (const session of this.streamableHTTPSessions.values()) {
          await session.transport.close?.()
          await session.server.close()
        }
        this.streamableHTTPSessions.clear()
      }
      await this.mastraServer.close()
    } catch (error) {
      logger.error('Error closing MCP Agent Proxy:', error)
    }
  }

  /**
   * Get server information
   */
  getServerInfo() {
    return this.mastraServer.getServerInfo()
  }

  /**
   * Get tool list information
   */
  getToolListInfo() {
    return this.mastraServer.getToolListInfo()
  }

  /**
   * Get the number of active streamable HTTP sessions
   */
  getActiveSessionCount(): number {
    return this.streamableHTTPSessions.size
  }
}

// Create agent proxy server instance
const agentProxyServer = new AgentProxyServer()

/**
 * Main server startup function
 * Only executes when called directly, not when imported
 */
async function startServer() {
  // Improved stdio detection - check if we're being called by an MCP client
  const useStdio =
    process.argv.includes('--stdio') ||
    process.env.MCP_TRANSPORT === 'stdio' ||
    (!process.stdin.isTTY && !process.argv.includes('--http'))

  if (useStdio) {
    // Use stdio transport for MCP clients
    async function startStdioServer() {
      try {
        await agentProxyServer.startStdio()
      } catch (error) {
        logger.error('Failed to start stdio server:', error)
        process.exit(1)
      }
    }

    startStdioServer()
  } else {
    // Use HTTP transport with both legacy SSE and new streamable HTTP support
    const PORT = getMCPServerPort()
    const { ssePath: SSE_PATH, messagePath: MESSAGE_PATH } = getMCPPaths()
    const MCP_PATH = '/mcp' // New streamable HTTP endpoint

    const httpServer = http.createServer(async (req, res) => {
      if (!req.url) {
        res.writeHead(400, { 'Content-Type': 'text/plain' })
        res.end('Bad Request: URL is missing')
        return
      }

      const requestUrl = new URL(
        req.url,
        `http://${req.headers.host || `localhost:${PORT}`}`,
      )

      // Health check endpoint (fast, basic liveness check)
      if (requestUrl.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            status: 'healthy',
            service: 'mcp-agent-proxy',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            compliance: 'MCP 2025-03-26',
            endpoints: {
              mcp: MCP_PATH, // New streamable HTTP endpoint
              sse: SSE_PATH, // Legacy SSE endpoint
              message: MESSAGE_PATH, // Legacy message endpoint
              status: '/status',
            },
            transports: ['stdio', 'streamable-http', 'sse'], // Supported transports
            security: {
              localhost_binding: true,
              origin_validation: true,
              session_management: true,
            },
            supported_methods: {
              [MCP_PATH]: ['GET', 'POST', 'DELETE'],
              [SSE_PATH]: ['GET', 'POST'],
              [MESSAGE_PATH]: ['POST'],
            },
          }),
        )
        return
      }

      // Status endpoint (comprehensive, includes agent information)
      if (requestUrl.pathname === '/status') {
        try {
          // Get current agent status from all agent servers
          const agentListResult = await getAgentsInfo()

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              status: 'healthy',
              service: 'mcp-agent-proxy',
              version: '1.0.0',
              timestamp: new Date().toISOString(),
              uptime: process.uptime(),
              compliance: 'MCP 2025-03-26',
              endpoints: {
                mcp: MCP_PATH,
                sse: SSE_PATH,
                message: MESSAGE_PATH,
              },
              transports: ['stdio', 'streamable-http', 'sse'],
              security: {
                localhost_binding: true,
                origin_validation: true,
                session_management: true,
              },
              supported_methods: {
                [MCP_PATH]: ['GET', 'POST', 'DELETE'],
                [SSE_PATH]: ['GET', 'POST'],
                [MESSAGE_PATH]: ['POST'],
              },
              agents: agentListResult,
              tools: [
                'callAgent',
                'listAgents',
                'connectServer',
                'disconnectServer',
                'describeAgent',
              ],
              active_sessions: agentProxyServer.getActiveSessionCount(),
            }),
          )
        } catch (error) {
          res.writeHead(503, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              status: 'degraded',
              service: 'mcp-agent-proxy',
              version: '1.0.0',
              timestamp: new Date().toISOString(),
              uptime: process.uptime(),
              error: 'Failed to retrieve agent information',
              details: error instanceof Error ? error.message : 'Unknown error',
            }),
          )
        }
        return
      }

      // New streamable HTTP endpoint (MCP 2025-03-26 spec)
      if (requestUrl.pathname === MCP_PATH) {
        try {
          await agentProxyServer.startStreamableHTTP({
            url: requestUrl,
            httpPath: MCP_PATH,
            req,
            res,
          })
        } catch (error) {
          logger.error(
            `Error in streamable HTTP transport for ${requestUrl.pathname}:`,
            error,
          )
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/plain' })
            res.end('Internal Server Error handling MCP request')
          }
        }
        return
      }

      // Legacy SSE endpoints for backward compatibility
      if (
        requestUrl.pathname === SSE_PATH ||
        requestUrl.pathname === MESSAGE_PATH
      ) {
        try {
          await agentProxyServer.startSSE({
            url: requestUrl,
            ssePath: SSE_PATH,
            messagePath: MESSAGE_PATH,
            req,
            res,
          })
        } catch (error) {
          logger.error(
            `Error in legacy SSE transport for ${requestUrl.pathname}:`,
            error,
          )
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/plain' })
            res.end('Internal Server Error handling MCP request')
          }
        }
        return
      }

      // Handle other HTTP routes or return 404
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not Found')
    })

    httpServer.listen(PORT, '127.0.0.1', () => {
      logger.log(
        `MCP Agent Proxy listening on 127.0.0.1:${PORT} (localhost only for security)`,
      )
      logger.log(
        `Streamable HTTP Endpoint: http://localhost:${PORT}${MCP_PATH}`,
      )
      logger.log(`Legacy SSE Endpoint: http://localhost:${PORT}${SSE_PATH}`)
      logger.log(
        `Legacy Message Endpoint: http://localhost:${PORT}${MESSAGE_PATH}`,
      )
      logger.log(`Health Check: http://localhost:${PORT}/health`)
      logger.log(`Status Endpoint: http://localhost:${PORT}/status`)
      logger.log('Supported transports: stdio, streamable-http, sse')
      logger.log('MCP 2025-03-26 compliant features:')
      logger.log('  ✓ GET/POST/DELETE support on /mcp endpoint')
      logger.log('  ✓ Session management with Mcp-Session-Id')
      logger.log('  ✓ Origin header validation for security')
      logger.log('  ✓ Localhost-only binding (127.0.0.1)')
      logger.log('  ✓ Session termination via HTTP DELETE')
      logger.log(
        'Available tools: callAgent, listAgents, connectServer, disconnectServer, describeAgent',
      )
    })

    // Graceful shutdown
    const gracefulShutdown = () => {
      logger.log('\nShutting down MCP Agent Proxy...')
      httpServer.close(async () => {
        await agentProxyServer.close()
        logger.log('MCP Agent Proxy shutdown complete.')
        process.exit(0)
      })
    }

    process.on('SIGINT', gracefulShutdown)
    process.on('SIGTERM', gracefulShutdown)
  }
}

// Export the agent proxy server instance and startup function for programmatic use
export { agentProxyServer as mcpServerInstance, startServer }

// Export config functions for testing and programmatic use
export {
  addDynamicServer,
  removeDynamicServer,
  getDynamicServers,
  loadServerMappings,
  clearDynamicServers,
} from './config.js'

// Only start the server if this file is run directly (not imported)
// Cross-compatible approach for both ESM and CJS builds
function isMainModule(): boolean {
  // Check if process.argv[1] ends with our expected filenames
  // This works reliably in both ESM and CJS without import.meta
  return !!(
    (
      process.argv[1] &&
      (process.argv[1].endsWith('/mcp-server.js') ||
        process.argv[1].endsWith('/mcp-server.cjs') ||
        process.argv[1].endsWith('\\mcp-server.js') ||
        process.argv[1].endsWith('\\mcp-server.cjs') ||
        process.argv[1].endsWith('mcp-agent-proxy') || // For NPM global installs
        process.argv[1].includes('mcp-server'))
    ) // Catch other variations
  )
}

if (isMainModule()) {
  startServer()
}
