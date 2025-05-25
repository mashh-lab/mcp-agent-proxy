// src/mcp-server.ts - BGP-Powered MCP Server with Hybrid Transport
import { MCPServer } from '@mastra/mcp'
import http from 'http'
import { URL } from 'url'
import {
  listMastraAgentsTool,
  getMastraAgentsInfo,
} from './tools/list-mastra-agents-tool.js'
import { agentProxyTool, setPolicyEngine } from './tools/agent-proxy-tool.js'
import { setBGPInfrastructure } from './tools/bgp-integration.js'
import {
  getMCPServerPort,
  getMCPPaths,
  getEnhancedBGPConfig,
  loadPoliciesFromFile,
} from './config.js'

// BGP Infrastructure
import { BGPSession, BGPSessionState } from './bgp/session.js'
import { AgentAdvertisementManager } from './bgp/advertisement.js'
import { RealTimeDiscoveryManager } from './bgp/discovery.js'
import { BGPServer } from './bgp/server.js'
import { PolicyEngine } from './bgp/policy.js'
import { LocalAgentDiscovery } from './bgp/local-discovery.js'

// BGP Infrastructure State
let bgpSession: BGPSession | null = null
let advertisementManager: AgentAdvertisementManager | null = null
let discoveryManager: RealTimeDiscoveryManager | null = null
let localDiscovery: LocalAgentDiscovery | null = null
let bgpServer: BGPServer | null = null
let policyEngine: PolicyEngine | null = null

// Helper function for safe logging in MCP stdio mode
function safeLog(message: string, ...args: any[]) {
  if (process.env.MCP_TRANSPORT !== 'stdio' && process.stdin.isTTY) {
    console.log(message, ...args)
  }
}

function safeError(message: string, ...args: any[]) {
  if (process.env.MCP_TRANSPORT !== 'stdio' && process.stdin.isTTY) {
    console.error(message, ...args)
  }
}

/**
 * Initialize BGP Infrastructure (works in both stdio and HTTP modes)
 */
async function initializeBGPInfrastructure(): Promise<void> {
  try {
    const bgpConfig = getEnhancedBGPConfig()
    safeLog(
      `🚀 BGP Agent Network initializing - AS${bgpConfig.localASN} (${bgpConfig.routerId})`,
    )

    // Initialize BGP Session Manager
    bgpSession = new BGPSession(bgpConfig.localASN, bgpConfig.routerId)

    // Initialize Policy Engine
    policyEngine = new PolicyEngine(bgpConfig.localASN)

    // Load routing policies - use built-in defaults if no file specified
    const policies = bgpConfig.policy.policyFile
      ? loadPoliciesFromFile(bgpConfig.policy.policyFile)
      : bgpConfig.policy.defaultPolicies

    for (const policy of policies) {
      policyEngine.addPolicy(policy)
    }
    safeLog(`🎯 Loaded ${policies.length} routing policies`)

    // Initialize Advertisement Manager
    // Determine the correct Mastra server port based on ASN
    const mastraPort = bgpConfig.localASN === 64512 ? 4111 : 4222
    advertisementManager = new AgentAdvertisementManager(bgpSession, {
      localASN: bgpConfig.localASN,
      routerId: bgpConfig.routerId,
      hostname: 'localhost',
      port: mastraPort, // Use Mastra server port, not MCP server port
      advertisementInterval: 5 * 60 * 1000, // 5 minutes
    })

    // Initialize Local Agent Discovery (bridges MCP → BGP)
    const mastraServers =
      process.env.MASTRA_SERVERS?.split(/[,\s]+/).filter(Boolean) || []
    if (mastraServers.length > 0) {
      localDiscovery = new LocalAgentDiscovery(advertisementManager, {
        localASN: bgpConfig.localASN,
        routerId: bgpConfig.routerId,
        mastraServers: mastraServers,
        discoveryInterval: 30000, // 30 seconds
        healthCheckInterval: 60000, // 1 minute
      })

      await localDiscovery.start()
    }

    // Initialize Real-time Discovery Manager
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

    // Initialize BGP Server
    const bgpPort = 1179 + (bgpConfig.localASN - 64512) // Dynamic port based on ASN
    bgpServer = new BGPServer(
      {
        localASN: bgpConfig.localASN,
        routerId: bgpConfig.routerId,
        port: bgpPort,
        hostname: 'localhost',
      },
      bgpSession,
    ) // Pass the existing BGP session

    // Start BGP HTTP server
    await bgpServer.startListening()

    // Configure policy engine
    if (policyEngine) {
      bgpServer.configurePolicyEngine(policyEngine)
      setPolicyEngine(policyEngine)
    }

    // Configure BGP infrastructure for MCP tools
    setBGPInfrastructure(bgpSession, discoveryManager, advertisementManager)

    // Test BGP integration immediately after setting it up
    try {
      const { isBGPAvailable, getBGPAgentRoutes } = await import(
        './tools/bgp-integration.js'
      )
      const isAvailable = isBGPAvailable()
      const routes = await getBGPAgentRoutes()
      safeLog(
        `🧪 BGP Integration Test: Available=${isAvailable}, Routes=${routes.length}`,
      )
    } catch (error) {
      safeError('BGP Integration Test Failed:', error)
    }

    safeLog('✅ BGP infrastructure ready')

    // Auto-configure BGP peering
    await configureBGPPeering(bgpConfig)
  } catch (error) {
    safeError('Failed to initialize BGP infrastructure:', error)
    throw error
  }
}

/**
 * Auto-configure BGP peering based on local ASN
 */
async function configureBGPPeering(bgpConfig: {
  localASN: number
  routerId: string
}): Promise<void> {
  if (!bgpSession) {
    throw new Error('BGP session not initialized')
  }

  // Determine peer ASN based on local ASN
  const peerASN = bgpConfig.localASN === 64512 ? 64513 : 64512
  const peerPort = peerASN === 64512 ? 1179 : 1180
  const peerAddress = `localhost:${peerPort}`

  try {
    // Add BGP peer (this automatically attempts to establish the session)
    await bgpSession.addPeer(peerASN, peerAddress)
    safeLog(`🤝 BGP peering configured with AS${peerASN}`)

    // Show peering status
    const peeringStatus = {
      localASN: bgpConfig.localASN,
      routerId: bgpConfig.routerId,
      peers: Array.from(bgpSession.getPeers().values()).map((peer) => ({
        asn: peer.asn,
        address: peer.address,
        status: peer.status,
        lastUpdate: new Date().toISOString(),
        routesReceived: 0,
        routesSent: 0,
      })),
    }

    safeLog('📊 BGP Peering Status:', JSON.stringify(peeringStatus, null, 2))

    safeLog(
      `🌐 BGP peering established! Local AS${bgpConfig.localASN} ↔ Remote AS${peerASN}`,
    )
  } catch (error) {
    safeError(`Failed to configure BGP peering:`, error)
  }
}

// Handle graceful shutdown
async function gracefulShutdown(): Promise<void> {
  safeLog('🛑 Shutting down BGP-powered MCP server...')

  try {
    // Shutdown local discovery
    if (localDiscovery) {
      await localDiscovery.stop()
    }

    // Shutdown discovery manager
    if (discoveryManager) {
      await discoveryManager.shutdown()
    }

    // Shutdown advertisement manager
    if (advertisementManager) {
      await advertisementManager.shutdown()
    }

    // Shutdown BGP server
    if (bgpServer) {
      await bgpServer.shutdown()
    }

    // Shutdown BGP sessions
    if (bgpSession) {
      bgpSession.shutdown()
    }

    safeLog('✅ BGP-powered MCP server shutdown complete.')
  } catch (error) {
    safeError('Error during shutdown:', error)
  }
}

// Handle process signals
process.on('SIGINT', gracefulShutdown)
process.on('SIGTERM', gracefulShutdown)

/**
 * Start MCP Server with BGP Infrastructure
 */
async function startServer(): Promise<void> {
  // Initialize BGP infrastructure first (works in both modes)
  await initializeBGPInfrastructure()

  // Determine transport mode
  const args = process.argv.slice(2)
  const useHttpMode = args.includes('--http') || args.includes('--sse')

  if (useHttpMode) {
    // HTTP/SSE Mode (for testing and direct HTTP access)
    await startHttpServer()
  } else {
    // Stdio Mode (for MCP clients like Cursor/Claude)
    // BGP infrastructure runs as background services in the same process
    await startStdioServer()
  }
}

/**
 * Start MCP Server in HTTP/SSE mode
 */
async function startHttpServer(): Promise<void> {
  const mcpPort = getMCPServerPort()
  const server = new MCPServer({
    name: 'bgp-agent-proxy',
    version: '1.0.0',
    tools: {
      listMastraAgents: listMastraAgentsTool,
      callMastraAgent: agentProxyTool,
    },
  })

  // Create HTTP server for MCP
  const httpServer = http.createServer()

  // Add BGP status endpoints to MCP HTTP server
  httpServer.on('request', async (req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`)

    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          bgp: {
            localASN: bgpSession?.getLocalASN(),
            routerId: bgpSession?.getRouterID(),
            peersConnected: bgpSession?.getPeers().size || 0,
            agentsRegistered: advertisementManager?.getLocalAgents().size || 0,
          },
        }),
      )
      return
    }

    if (url.pathname === '/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          server: 'BGP-powered MCP Server',
          status: 'running',
          timestamp: new Date().toISOString(),
          transport: 'http',
          agents: getMastraAgentsInfo(),
          bgp: {
            localASN: bgpSession?.getLocalASN(),
            routerId: bgpSession?.getRouterID(),
            peers: Array.from(bgpSession?.getPeers().values() || []),
            registeredAgents: Array.from(
              advertisementManager?.getLocalAgents().values() || [],
            ),
          },
        }),
      )
      return
    }

    if (url.pathname === '/bgp-status') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          bgp: {
            localASN: bgpSession?.getLocalASN(),
            routerId: bgpSession?.getRouterID(),
            session: {
              peersTotal: bgpSession?.getPeers().size || 0,
              peersEstablished: Array.from(
                bgpSession?.getSessions().values() || [],
              ).filter((s) => s.state === BGPSessionState.ESTABLISHED).length,
              sessionsActive: bgpSession?.getSessions().size || 0,
            },
            advertisement: {
              totalLocalAgents:
                advertisementManager?.getLocalAgents().size || 0,
              capabilities: Array.from(
                new Set(
                  Array.from(
                    advertisementManager?.getLocalAgents().values() || [],
                  ).flatMap((a) => a.capabilities),
                ),
              ),
              lastAdvertisement: null, // Add if needed
            },
            discovery: {
              totalRemoteAgents: discoveryManager?.getNetworkAgents().size || 0,
              remoteCapabilities: Array.from(
                new Set(
                  Array.from(
                    discoveryManager?.getNetworkAgents().values() || [],
                  ).flatMap((a) => a.agent.capabilities),
                ),
              ),
              lastDiscovery: null, // Add if needed
            },
          },
        }),
      )
      return
    }

    // Handle MCP SSE and message endpoints
    const { ssePath, messagePath } = getMCPPaths()
    if (url.pathname === ssePath || url.pathname === messagePath) {
      try {
        await server.startSSE({
          url,
          ssePath,
          messagePath,
          req,
          res,
        })
      } catch (error) {
        safeError('Error handling MCP request:', error)
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain' })
          res.end('Internal Server Error')
        }
      }
      return
    }

    // 404 for other paths
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
  })

  // Start HTTP server
  httpServer.listen(mcpPort, 'localhost', () => {
    safeLog(`🚀 BGP-powered MCP Server running on http://localhost:${mcpPort}`)
    safeLog(
      `🌐 BGP Router ID: ${bgpSession?.getRouterID()} (AS${bgpSession?.getLocalASN()})`,
    )
    safeLog(`📡 BGP Listener: ${bgpSession?.getRouterID()}:${mcpPort}`)
    safeLog(`❤️ Health Check: http://localhost:${mcpPort}/health`)
    safeLog(`📊 Status Endpoint: http://localhost:${mcpPort}/status`)
    safeLog(`🌐 BGP Status: http://localhost:${mcpPort}/bgp-status`)
    safeLog(`📚 Documentation: https://github.com/your-org/mcp-agent-proxy`)
    safeLog(`🎯 Ready for agent discovery and BGP-powered routing! 🚀`)
  })
}

/**
 * Start MCP Server in stdio mode (for MCP clients like Cursor/Claude)
 * BGP infrastructure runs as background services within the same process
 */
async function startStdioServer(): Promise<void> {
  // Set transport mode for logging suppression
  process.env.MCP_TRANSPORT = 'stdio'

  const server = new MCPServer({
    name: 'bgp-agent-proxy',
    version: '1.0.0',
    tools: {
      listMastraAgents: listMastraAgentsTool,
      callMastraAgent: agentProxyTool,
    },
  })

  // Start BGP HTTP servers as background services within this process
  // This allows the MCP tools to access the BGP infrastructure directly
  const bgpConfig = getEnhancedBGPConfig()

  // Start BGP HTTP server for this AS (for peer communication)
  const bgpPort = 1179 + (bgpConfig.localASN - 64512)
  if (bgpServer) {
    // BGP server is already initialized, just make sure it's listening
    if (!bgpServer.isServerListening()) {
      await bgpServer.startListening()
    }
  }

  // Start MCP server with stdio transport
  await server.startStdio()

  safeLog(`🚀 MCP Server with BGP-powered agent networking (stdio mode)`)
  safeLog(
    `🌐 BGP Router: AS${bgpSession?.getLocalASN()} (${bgpSession?.getRouterID()})`,
  )
  safeLog(`📡 BGP Listener: ${bgpSession?.getRouterID()}:${bgpPort}`)
  safeLog(
    `🎯 Routing Policies: ${policyEngine?.getPolicies().length || 0} active`,
  )
  safeLog(`📡 Ready for MCP client connections (Cursor, Claude, etc.)`)
  safeLog(`🎯 NEW AGENT INTERNET ACTIVATED! 🚀`)
}

// Start the server
startServer().catch((error) => {
  safeError('Failed to start BGP-powered MCP server:', error)
  process.exit(1)
})
