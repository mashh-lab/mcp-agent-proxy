// src/mcp-server.ts
import { MCPServer } from '@mastra/mcp'
import http from 'http'
import { URL } from 'url'
import { listMastraAgentsTool } from './tools/list-mastra-agents-tool.js'
import { agentProxyTool } from './tools/agent-proxy-tool.js'
import { getMCPServerPort, getMCPPaths } from './config.js'

// Instantiate MCPServer with tools
const mcpServerInstance = new MCPServer({
  name: 'mcp-agent-proxy',
  version: '1.0.0',
  tools: {
    callMastraAgent: agentProxyTool, // Agent proxy tool with smart server resolution
    listMastraAgents: listMastraAgentsTool, // Multi-server agent listing with conflict detection
  },
})

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
        console.error(
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
    console.log(`MCP Server with HTTP/SSE transport listening on port ${PORT}`)
    console.log(`SSE Endpoint: http://localhost:${PORT}${SSE_PATH}`)
    console.log(`Message Endpoint: http://localhost:${PORT}${MESSAGE_PATH}`)
    console.log('Available tools: callMastraAgent, listMastraAgents')
  })

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down MCP server...')
    httpServer.close(() => {
      console.log('MCP server shut down complete.')
      process.exit(0)
    })
  })

  process.on('SIGTERM', () => {
    console.log('\nShutting down MCP server...')
    httpServer.close(() => {
      console.log('MCP server shut down complete.')
      process.exit(0)
    })
  })
}
