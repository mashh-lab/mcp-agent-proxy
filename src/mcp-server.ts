// src/mcp-server.ts
import { MCPServer } from "@mastra/mcp";
import http from 'http';
import { URL } from 'url';
import { agentProxyTool } from "./tools/agentProxyTool.js";
import { listMastraAgentsTool } from "./tools/listMastraAgentsTool.js";
import { getMCPServerPort, getMCPPaths } from "./config.js";

// Instantiate MCPServer with a name, version, and the tools it will expose
const mcpServerInstance = new MCPServer({
  name: "MastraAgentProxyMCPServer",
  version: "1.0.0",
  tools: {
    callMastraAgent: agentProxyTool,
    listMastraAgents: listMastraAgentsTool, // Register the optional discovery tool
  },
});

// Check if we should use stdio transport
// This happens when:
// 1. Explicitly requested via --stdio flag
// 2. stdin is not a TTY (running as subprocess)
// 3. MCP_TRANSPORT is set to stdio
const useStdio = 
  process.argv.includes('--stdio') || 
  process.env.MCP_TRANSPORT === 'stdio' ||
  (!process.stdin.isTTY && process.env.NODE_ENV !== 'development');

if (useStdio) {
  // Use stdio transport for MCP clients
  async function startStdioServer() {
    try {
      await mcpServerInstance.startStdio();
    } catch (err) {
      process.exit(1);
    }
  }
  
  startStdioServer();
} else {
  // Use HTTP/SSE transport for direct testing
  const PORT = getMCPServerPort();
  const { ssePath: SSE_PATH, messagePath: MESSAGE_PATH } = getMCPPaths();

  const httpServer = http.createServer(async (req, res) => {
    if (!req.url) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request: URL is missing');
      return;
    }
    const requestUrl = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);

    // Route requests to MCPServer's SSE handler if paths match
    if (requestUrl.pathname === SSE_PATH || requestUrl.pathname === MESSAGE_PATH) {
      try {
        await mcpServerInstance.startSSE({
          url: requestUrl,
          ssePath: SSE_PATH,
          messagePath: MESSAGE_PATH,
          req,
          res,
        });
      } catch (error) {
        console.error(`Error in MCPServer startSSE for ${requestUrl.pathname}:`, error);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal Server Error handling MCP request');
        }
      }
    } else {
      // Handle other HTTP routes or return 404
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });

  httpServer.listen(PORT, () => {
    console.log(`MCP Server with HTTP/SSE transport listening on port ${PORT}`);
    console.log(`SSE Endpoint: http://localhost:${PORT}${SSE_PATH}`);
    console.log(`Message Endpoint: http://localhost:${PORT}${MESSAGE_PATH}`);
    console.log('Available tools: callMastraAgent, listMastraAgents');
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down MCP server...');
    httpServer.close(() => {
      console.log('MCP server shut down complete.');
      process.exit(0);
    });
  });

  process.on('SIGTERM', () => {
    console.log('\nShutting down MCP server...');
    httpServer.close(() => {
      console.log('MCP server shut down complete.');
      process.exit(0);
    });
  });
} 