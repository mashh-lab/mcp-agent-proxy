// src/mcp-server.ts - BGP-Powered MCP Server
import { MCPServer } from '@mastra/mcp'
import http from 'http'
import { URL } from 'url'
import {
  listMastraAgentsTool,
  getMastraAgentsInfo,
} from './tools/list-mastra-agents-tool.js'
import { agentProxyTool, setPolicyEngine } from './tools/agent-proxy-tool.js'
import {
  getMCPServerPort,
  getMCPPaths,
  getBGPConfig,
  getEnhancedBGPConfig,
  loadPoliciesFromFile,
  logger,
} from './config.js'

// BGP Infrastructure
import { BGPSession } from './bgp/session.js'
import { AgentAdvertisementManager } from './bgp/advertisement.js'
import { RealTimeDiscoveryManager } from './bgp/discovery.js'
import { BGPServer } from './bgp/server.js'
import { PolicyEngine } from './bgp/policy.js'

// Global BGP infrastructure instances
let bgpSession: BGPSession | null = null
let advertisementManager: AgentAdvertisementManager | null = null
let discoveryManager: RealTimeDiscoveryManager | null = null
let bgpServer: BGPServer | null = null
let policyEngine: PolicyEngine | null = null

/**
 * Initialize BGP infrastructure components
 */
async function initializeBGPInfrastructure() {
  logger.log('🚀 Initializing BGP-powered agent network...')

  const bgpConfig = getBGPConfig()
  const enhancedConfig = getEnhancedBGPConfig()

  logger.log(`📍 Local AS: ${bgpConfig.localASN}`)
  logger.log(`🆔 Router ID: ${bgpConfig.routerId}`)

  // 1. Initialize BGP Session Manager
  bgpSession = new BGPSession(bgpConfig.localASN, bgpConfig.routerId)

  // 2. Initialize Policy Engine
  if (enhancedConfig.policy.enabled) {
    logger.log('🧠 Initializing BGP policy engine...')
    policyEngine = new PolicyEngine(enhancedConfig.policy.maxHistorySize)

    // Load policies from configuration
    const policiesToLoad = [...enhancedConfig.policy.defaultPolicies]

    // Load additional policies from file if specified
    if (enhancedConfig.policy.policyFile) {
      const filePolicies = loadPoliciesFromFile(
        enhancedConfig.policy.policyFile,
      )
      policiesToLoad.push(...filePolicies)
    }

    if (policiesToLoad.length > 0) {
      policyEngine.loadPolicies(policiesToLoad)
      logger.log(`🎯 Loaded ${policiesToLoad.length} routing policies`)
    } else {
      logger.log('⚠️ No policies loaded - using default accept behavior')
    }
  } else {
    logger.log('⚠️ Policy engine disabled by configuration')
  }

  // 3. Initialize Agent Advertisement Manager
  advertisementManager = new AgentAdvertisementManager(bgpSession, {
    localASN: bgpConfig.localASN,
    routerId: bgpConfig.routerId,
    hostname: 'localhost',
    port: getMCPServerPort(),
    advertisementInterval: 5 * 60 * 1000, // 5 minutes
  })

  // 4. Initialize Real-Time Discovery Manager
  discoveryManager = new RealTimeDiscoveryManager(
    bgpSession,
    advertisementManager,
    {
      localASN: bgpConfig.localASN,
      routerId: bgpConfig.routerId,
      realTimeUpdates: true,
      discoveryInterval: 30 * 1000, // 30 seconds
      healthThreshold: 'degraded',
      maxHops: 5,
      enableBroadcast: true,
    },
  )

  // 5. Initialize BGP Server (for inter-AS communication)
  bgpServer = new BGPServer({
    localASN: bgpConfig.localASN,
    routerId: bgpConfig.routerId,
    port: 1179, // BGP port
    hostname: 'localhost',
  })

  // Configure BGP server with policy engine if available
  if (policyEngine) {
    bgpServer.configurePolicyEngine(policyEngine)

    // Configure agent routing tools to use the policy engine
    setPolicyEngine(policyEngine)
    logger.log('🎯 Policy engine connected to agent routing tools')
  }

  logger.log('✅ BGP infrastructure initialized successfully!')

  return {
    session: bgpSession,
    advertisement: advertisementManager,
    discovery: discoveryManager,
    server: bgpServer,
    policy: policyEngine,
  }
}

/**
 * Get the initialized BGP discovery manager
 * This function provides access to BGP discovery for the tools
 */
export function getBGPDiscovery(): RealTimeDiscoveryManager | null {
  return discoveryManager
}

/**
 * Get the initialized BGP advertisement manager
 * This function provides access to BGP advertisement for the tools
 */
export function getBGPAdvertisement(): AgentAdvertisementManager | null {
  return advertisementManager
}

/**
 * Get BGP network statistics
 */
export function getBGPNetworkStats() {
  if (!discoveryManager || !advertisementManager || !bgpSession) {
    return { status: 'not_initialized' }
  }

  const discoveryStats = discoveryManager.getDiscoveryStats()
  const advertisementStats = advertisementManager.getAdvertisementStats()
  const sessionStats = bgpSession.getSessionStats()

  return {
    status: 'active',
    localAS: getBGPConfig().localASN,
    discovery: discoveryStats,
    advertisement: advertisementStats,
    sessions: sessionStats,
    timestamp: new Date().toISOString(),
  }
}

// Instantiate MCPServer with BGP-aware tools
const mcpServerInstance = new MCPServer({
  name: 'mcp-agent-proxy',
  version: '1.0.0',
  tools: {
    callMastraAgent: agentProxyTool, // BGP-aware agent proxy with intelligent routing
    listMastraAgents: listMastraAgentsTool, // Multi-server agent listing with BGP conflict detection
  },
})

/**
 * Main server startup function
 * Only executes when called directly, not when imported
 */
async function startServer() {
  // Initialize BGP infrastructure first
  try {
    const bgpInfrastructure = await initializeBGPInfrastructure()

    // Store global references for tool access
    bgpSession = bgpInfrastructure.session
    advertisementManager = bgpInfrastructure.advertisement
    discoveryManager = bgpInfrastructure.discovery
    bgpServer = bgpInfrastructure.server

    logger.log(`🌐 BGP Agent Network ready!`)
  } catch (error) {
    logger.error('Failed to initialize BGP infrastructure:', error)
    process.exit(1)
  }

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
            bgp: {
              enabled: true,
              localAS: getBGPConfig().localASN,
              routerId: getBGPConfig().routerId,
            },
            endpoints: {
              sse: SSE_PATH,
              message: MESSAGE_PATH,
              status: '/status',
              bgpStatus: '/bgp-status',
            },
          }),
        )
        return
      }

      // BGP Status endpoint (BGP network information)
      if (requestUrl.pathname === '/bgp-status') {
        try {
          const bgpStats = getBGPNetworkStats()

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              status: 'healthy',
              service: 'mcp-agent-proxy-bgp',
              version: '1.0.0',
              timestamp: new Date().toISOString(),
              bgp: bgpStats,
            }),
          )
        } catch (error) {
          res.writeHead(503, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              status: 'degraded',
              service: 'mcp-agent-proxy-bgp',
              error: 'Failed to retrieve BGP status',
              details: error instanceof Error ? error.message : 'Unknown error',
            }),
          )
        }
        return
      }

      // Status endpoint (comprehensive, includes agent information)
      if (requestUrl.pathname === '/status') {
        try {
          // Get current agent status from all Mastra servers
          const agentListResult = await getMastraAgentsInfo()
          const bgpStats = getBGPNetworkStats()

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
                bgpStatus: '/bgp-status',
              },
              agents: agentListResult,
              bgp: bgpStats,
              tools: ['callMastraAgent', 'listMastraAgents'],
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
      logger.log(
        `🚀 MCP Server with BGP-powered agent networking listening on port ${PORT}`,
      )
      logger.log(`📡 SSE Endpoint: http://localhost:${PORT}${SSE_PATH}`)
      logger.log(`📨 Message Endpoint: http://localhost:${PORT}${MESSAGE_PATH}`)
      logger.log(`❤️ Health Check: http://localhost:${PORT}/health`)
      logger.log(`📊 Status Endpoint: http://localhost:${PORT}/status`)
      logger.log(`🌐 BGP Status: http://localhost:${PORT}/bgp-status`)
      logger.log(
        `🛠️ Available tools: callMastraAgent (BGP-aware), listMastraAgents (BGP-aware)`,
      )
      logger.log(
        `🎯 Local AS: ${getBGPConfig().localASN} | Router ID: ${getBGPConfig().routerId}`,
      )
    })

    // Enhanced graceful shutdown with BGP cleanup
    const gracefulShutdown = async () => {
      logger.log('\n🛑 Shutting down BGP-powered MCP server...')

      try {
        // Shutdown BGP infrastructure first
        if (discoveryManager) {
          logger.log('📡 Shutting down discovery manager...')
          await discoveryManager.shutdown()
        }

        if (advertisementManager) {
          logger.log('📢 Shutting down advertisement manager...')
          await advertisementManager.shutdown()
        }

        if (bgpServer) {
          logger.log('🌐 Shutting down BGP server...')
          await bgpServer.shutdown()
        }

        if (bgpSession) {
          logger.log('🤝 Shutting down BGP sessions...')
          await bgpSession.shutdown()
        }

        // Then shutdown HTTP server
        httpServer.close(() => {
          logger.log('✅ BGP-powered MCP server shutdown complete.')
          process.exit(0)
        })
      } catch (error) {
        logger.error('❌ Error during shutdown:', error)
        process.exit(1)
      }
    }

    process.on('SIGINT', gracefulShutdown)
    process.on('SIGTERM', gracefulShutdown)
  }
}

// Export the server instance and startup function for programmatic use
export { mcpServerInstance, startServer }

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
