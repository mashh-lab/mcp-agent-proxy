#!/usr/bin/env node

// src/mcp-server.ts
import { MCPServer } from '@mastra/mcp'
import http from 'http'
import { URL } from 'url'
import {
  listMastraAgentsTool,
  getMastraAgentsInfo,
} from './tools/list-mastra-agents-tool.js'
import { agentProxyTool } from './tools/agent-proxy-tool.js'
import { learnMastraServerTool } from './tools/add-server-tool.js'
import { forgetMastraServerTool } from './tools/remove-server-tool.js'
import { getMCPServerPort, getMCPPaths, logger } from './config.js'

// Instantiate MCPServer with tools
const mcpServerInstance = new MCPServer({
  name: 'mcp-agent-proxy',
  version: '1.0.0',
  tools: {
    callMastraAgent: agentProxyTool, // Agent proxy tool with smart server resolution
    listMastraAgents: listMastraAgentsTool, // Multi-server agent listing with conflict detection
    learnMastraServer: learnMastraServerTool, // Dynamic server learning tool
    forgetMastraServer: forgetMastraServerTool, // Dynamic server forgetting tool
  },
})

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
    // Use stdio transport for MCP clients - no console logging to avoid JSON protocol interference
    async function startStdioServer() {
      try {
        await mcpServerInstance.startStdio()
      } catch {
        process.exit(1)
      }
    }

    startStdioServer()
  } else {
    // Use HTTP/SSE transport for direct testing
    const PORT = getMCPServerPort()
    const { ssePath: SSE_PATH, messagePath: MESSAGE_PATH } = getMCPPaths()

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
            endpoints: {
              sse: SSE_PATH,
              message: MESSAGE_PATH,
              status: '/status', // Enhanced status with agent information
            },
          }),
        )
        return
      }

      // Status endpoint (comprehensive, includes agent information)
      if (requestUrl.pathname === '/status') {
        try {
          // Get current agent status from all Mastra servers
          const agentListResult = await getMastraAgentsInfo()

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              status: 'healthy',
              service: 'mcp-agent-proxy',
              version: '1.0.0',
              timestamp: new Date().toISOString(),
              uptime: process.uptime(),
              endpoints: {
                sse: SSE_PATH,
                message: MESSAGE_PATH,
              },
              agents: agentListResult,
              tools: [
                'callMastraAgent',
                'listMastraAgents',
                'learnMastraServer',
                'forgetMastraServer',
              ],
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

      // Route requests to MCPServer's SSE handler if paths match
      if (
        requestUrl.pathname === SSE_PATH ||
        requestUrl.pathname === MESSAGE_PATH
      ) {
        try {
          await mcpServerInstance.startSSE({
            url: requestUrl,
            ssePath: SSE_PATH,
            messagePath: MESSAGE_PATH,
            req,
            res,
          })
        } catch (error) {
          logger.error(
            `Error in MCPServer startSSE for ${requestUrl.pathname}:`,
            error,
          )
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/plain' })
            res.end('Internal Server Error handling MCP request')
          }
        }
      } else {
        // Handle other HTTP routes or return 404
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end('Not Found')
      }
    })

    httpServer.listen(PORT, () => {
      logger.log(`MCP Server with HTTP/SSE transport listening on port ${PORT}`)
      logger.log(`SSE Endpoint: http://localhost:${PORT}${SSE_PATH}`)
      logger.log(`Message Endpoint: http://localhost:${PORT}${MESSAGE_PATH}`)
      logger.log(`Health Check: http://localhost:${PORT}/health`)
      logger.log(`Status Endpoint: http://localhost:${PORT}/status`)
      logger.log(
        'Available tools: callMastraAgent, listMastraAgents, learnMastraServer, forgetMastraServer',
      )
    })

    // Graceful shutdown
    process.on('SIGINT', () => {
      logger.log('\nShutting down MCP server...')
      httpServer.close(() => {
        logger.log('MCP server shut down complete.')
        process.exit(0)
      })
    })

    process.on('SIGTERM', () => {
      logger.log('\nShutting down MCP server...')
      httpServer.close(() => {
        logger.log('MCP server shut down complete.')
        process.exit(0)
      })
    })
  }
}

// Export the server instance and startup function for programmatic use
export { mcpServerInstance, startServer }

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
