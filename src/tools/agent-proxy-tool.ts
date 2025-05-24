import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { MastraClient } from '@mastra/client-js'
import {
  getServersFromConfig,
  getRetryConfig,
  getBGPConfig,
  logger,
} from '../config.js'
import { ServerConfig } from '../bgp/types.js'
import { AgentPathTracker } from '../bgp/path-tracking.js'
import { AgentRoute } from '../bgp/types.js'

// Global reference to policy engine (set by BGP infrastructure)
let globalPolicyEngine: import('../bgp/policy.js').PolicyEngine | null = null

/**
 * Set the global policy engine for use in agent routing
 * Called by BGP infrastructure during initialization
 */
export function setPolicyEngine(
  policyEngine: import('../bgp/policy.js').PolicyEngine | null,
): void {
  globalPolicyEngine = policyEngine
  if (policyEngine) {
    logger.log('BGP: Policy engine configured for agent routing')
  }
}

// Input schema with support for fully qualified agent IDs
const agentProxyInputSchema = z.object({
  targetAgentId: z
    .string()
    .min(
      1,
      "Target agent ID is required. Use 'server:agentId' format for conflicts.",
    ),
  interactionType: z.enum(['generate', 'stream'], {
    errorMap: () => ({
      message: "interactionType must be 'generate' or 'stream'.",
    }),
  }),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string(),
      }),
    )
    .min(1, 'At least one message is required.'),
  serverUrl: z.string().url().optional(), // Optional server URL override
  threadId: z.string().optional(),
  resourceId: z.string().optional(),
  agentOptions: z.record(z.any()).optional(),
})

// Enhanced output schema with BGP routing information
const agentProxyOutputSchema = z.object({
  success: z.literal(true),
  responseData: z.any(),
  interactionType: z.string(),
  serverUsed: z.string(), // Shows which server was used
  agentIdUsed: z.string(), // Shows the actual agent ID used (without server prefix)
  fullyQualifiedId: z.string(), // Shows the full server:agentId format
  resolutionMethod: z.string(), // Shows how the server was resolved
  // BGP routing information
  routingInfo: z.object({
    asn: z.number(), // AS number of chosen server
    region: z.string().optional(), // Region of chosen server
    priority: z.number().optional(), // Priority of chosen server
    availableAlternatives: z.number(), // Number of other servers with this agent
  }),
})

// BGP-aware agent resolution with path tracking and policy filtering
async function findBestAgentRoute(
  agentId: string,
  requiredCapabilities: string[] = [],
): Promise<AgentRoute | null> {
  const servers = getServersFromConfig()
  const bgpConfig = getBGPConfig()

  // Create path tracker for BGP-style discovery
  const pathTracker = new AgentPathTracker(bgpConfig.localASN, servers)

  // Discover agent with AS path tracking (prevents loops)
  let routes = await pathTracker.discoverAgentWithPath(agentId)

  if (routes.length === 0) {
    return null
  }

  // Apply policy engine filtering if available
  if (globalPolicyEngine) {
    logger.log(
      `BGP: Applying ${globalPolicyEngine.getPolicies().length} policies to ${routes.length} candidate routes`,
    )

    const originalCount = routes.length
    routes = globalPolicyEngine.applyPolicies(routes)

    if (routes.length === 0) {
      logger.log(
        `BGP: All ${originalCount} routes rejected by policies for agent ${agentId}`,
      )
      return null
    }

    if (routes.length < originalCount) {
      logger.log(
        `BGP: Policies filtered ${originalCount - routes.length} routes, accepting ${routes.length} for agent ${agentId}`,
      )
    }
  } else {
    logger.log(
      'BGP: No policy engine configured, using default route selection',
    )
  }

  // Apply BGP-style path selection algorithm to remaining routes
  const bestRoute = selectBestRoute(routes, requiredCapabilities)

  logger.log(
    `BGP: Selected route for ${agentId} through AS path [${bestRoute.asPath.join(' → ')}] ` +
      `with local pref ${bestRoute.localPref}, MED ${bestRoute.med}`,
  )

  return bestRoute
}

// BGP path selection algorithm for agents
function selectBestRoute(
  routes: AgentRoute[],
  requiredCapabilities: string[] = [],
): AgentRoute {
  if (routes.length === 1) return routes[0]

  let candidates = [...routes]

  // Filter by required capabilities first
  if (requiredCapabilities.length > 0) {
    const capabilityMatches = candidates.filter((route) =>
      requiredCapabilities.every((reqCap) =>
        route.capabilities.some((routeCap) =>
          routeCap.toLowerCase().includes(reqCap.toLowerCase()),
        ),
      ),
    )

    if (capabilityMatches.length > 0) {
      candidates = capabilityMatches
    }
  }

  // BGP path selection process

  // 1. Highest local preference (prefer local/priority servers)
  candidates = filterByMaxLocalPref(candidates)
  if (candidates.length === 1) return candidates[0]

  // 2. Shortest AS path (prefer fewer hops)
  candidates = filterByShortestASPath(candidates)
  if (candidates.length === 1) return candidates[0]

  // 3. Lowest MED (prefer better performance)
  candidates = filterByLowestMED(candidates)
  if (candidates.length === 1) return candidates[0]

  // 4. Prefer newer routes (more recently discovered)
  candidates = filterByNewestRoute(candidates)

  // Return best candidate
  return candidates[0]
}

function filterByMaxLocalPref(routes: AgentRoute[]): AgentRoute[] {
  const maxPref = Math.max(...routes.map((r) => r.localPref))
  return routes.filter((r) => r.localPref === maxPref)
}

function filterByShortestASPath(routes: AgentRoute[]): AgentRoute[] {
  const minLength = Math.min(...routes.map((r) => r.asPath.length))
  return routes.filter((r) => r.asPath.length === minLength)
}

function filterByLowestMED(routes: AgentRoute[]): AgentRoute[] {
  const minMED = Math.min(...routes.map((r) => r.med))
  return routes.filter((r) => r.med === minMED)
}

function filterByNewestRoute(routes: AgentRoute[]): AgentRoute[] {
  const newestTime = Math.max(...routes.map((r) => r.originTime.getTime()))
  return routes.filter((r) => r.originTime.getTime() === newestTime)
}

/**
 * Extract required capabilities from messages
 */
function extractRequiredCapabilities(
  messages: { role: string; content: string }[],
): string[] {
  const capabilities: string[] = []

  // Analyze message content for capability hints
  const allContent = messages.map((m) => m.content.toLowerCase()).join(' ')

  if (
    allContent.includes('code') ||
    allContent.includes('program') ||
    allContent.includes('debug')
  ) {
    capabilities.push('coding')
  }
  if (allContent.includes('weather') || allContent.includes('forecast')) {
    capabilities.push('weather')
  }
  if (
    allContent.includes('analy') ||
    allContent.includes('data') ||
    allContent.includes('insight')
  ) {
    capabilities.push('analysis')
  }
  if (
    allContent.includes('write') ||
    allContent.includes('content') ||
    allContent.includes('blog')
  ) {
    capabilities.push('writing')
  }

  return capabilities
}

export const agentProxyTool = createTool({
  id: 'callMastraAgent',
  description:
    "BGP-aware proxy for Mastra agents with intelligent routing. Supports 'generate' and 'stream' interactions with automatic server selection based on AS numbers, priorities, and regions. Use 'server:agentId' format for multi-server environments with agent conflicts.",
  inputSchema: agentProxyInputSchema,
  outputSchema: agentProxyOutputSchema,
  execute: async (context: {
    context: z.infer<typeof agentProxyInputSchema>
  }) => {
    const {
      targetAgentId,
      interactionType,
      messages,
      serverUrl,
      threadId,
      resourceId,
      agentOptions,
    } = context.context

    try {
      // Load BGP-aware server configuration
      const servers = getServersFromConfig()
      const serverMap = new Map(servers.map((s) => [s.name, s]))

      // Parse targetAgentId to extract server and agent ID
      let serverToUse: ServerConfig
      let actualAgentId: string
      let fullyQualifiedId: string
      let resolutionMethod: string
      let availableAlternatives = 0

      if (targetAgentId.includes(':')) {
        // Handle fully qualified ID (server:agentId)
        const [serverName, agentId] = targetAgentId.split(':', 2)
        actualAgentId = agentId
        fullyQualifiedId = targetAgentId
        resolutionMethod = 'explicit_qualification'

        // Resolve server from name
        if (serverMap.has(serverName)) {
          serverToUse = serverMap.get(serverName)!
        } else if (serverUrl) {
          // Create temporary server config for explicit URL
          serverToUse = {
            name: 'custom',
            url: serverUrl,
            asn: 0, // Unknown AS
            description: 'Custom URL override',
          }
          resolutionMethod = 'explicit_url_override'
        } else {
          throw new Error(
            `Unknown server '${serverName}'. Available servers: ${Array.from(serverMap.keys()).join(', ')}. Or provide serverUrl parameter.`,
          )
        }
      } else {
        // Handle plain agent ID - use BGP-aware smart resolution
        actualAgentId = targetAgentId

        if (serverUrl) {
          // Explicit server URL override
          serverToUse = {
            name: 'custom',
            url: serverUrl,
            asn: 0, // Unknown AS
            description: 'Custom URL override',
          }
          resolutionMethod = 'explicit_url_override'
          fullyQualifiedId = `custom:${actualAgentId}`
        } else {
          // BGP-aware resolution with AS path tracking
          const requiredCapabilities = extractRequiredCapabilities(messages)
          const bestRoute = await findBestAgentRoute(
            actualAgentId,
            requiredCapabilities,
          )

          if (!bestRoute) {
            // Agent not found on any server
            const servers = getServersFromConfig()
            const availableServers = servers.map((s) => s.name).join(', ')
            throw new Error(
              `Agent '${actualAgentId}' not found on any configured server. Available servers: ${availableServers}. Use 'server:agentId' format or check agent name.`,
            )
          }

          // Use BGP-selected route
          const serverName =
            (bestRoute.pathAttributes.get('server_name') as string) || 'unknown'
          const matchingServer = servers.find((s) => s.name === serverName)

          if (!matchingServer) {
            throw new Error(
              `Internal error: Could not find server config for ${serverName}`,
            )
          }

          serverToUse = matchingServer
          fullyQualifiedId = `${serverName}:${actualAgentId}`
          resolutionMethod = `bgp_path_[${bestRoute.asPath.join('→')}]_pref_${bestRoute.localPref}_med_${bestRoute.med}`
          availableAlternatives = 0 // BGP selects single best path
        }
      }

      const retryConfig = getRetryConfig()

      const clientConfig = {
        baseUrl: serverToUse.url,
        retries: retryConfig.interaction.retries,
        backoffMs: retryConfig.interaction.backoffMs,
        maxBackoffMs: retryConfig.interaction.maxBackoffMs,
      }

      const mastraClient = new MastraClient(clientConfig)
      const agent = mastraClient.getAgent(actualAgentId)

      let responseData: unknown
      const interactionParams = {
        messages,
        ...(threadId && { threadId }),
        ...(resourceId && { resourceId }),
        ...agentOptions,
      }

      if (interactionType === 'generate') {
        responseData = await agent.generate(interactionParams)
      } else if (interactionType === 'stream') {
        // Proper streaming implementation - collect chunks as they arrive
        const chunks: Array<{
          content: unknown
          timestamp: string
          index: number
        }> = []

        let chunkIndex = 0
        const startTime = new Date()

        try {
          // Get the stream from the agent
          const streamResponse = await agent.stream(interactionParams)

          // Process the data stream using Mastra's API
          await streamResponse.processDataStream({
            onTextPart: (textPart: string) => {
              chunks.push({
                content: textPart,
                timestamp: new Date().toISOString(),
                index: chunkIndex++,
              })
            },
            onDataPart: (dataPart: unknown) => {
              chunks.push({
                content: dataPart,
                timestamp: new Date().toISOString(),
                index: chunkIndex++,
              })
            },
            onErrorPart: (errorPart: unknown) => {
              chunks.push({
                content: { error: errorPart },
                timestamp: new Date().toISOString(),
                index: chunkIndex++,
              })
            },
          })

          const endTime = new Date()
          const totalDuration = endTime.getTime() - startTime.getTime()

          responseData = {
            type: 'collected_stream',
            chunks,
            summary: {
              totalChunks: chunks.length,
              startTime: startTime.toISOString(),
              endTime: endTime.toISOString(),
              durationMs: totalDuration,
              note: 'Stream was collected in real-time with timestamps. Each chunk was processed as it arrived from the agent.',
            },
          }
        } catch (streamError) {
          // If streaming fails, collect what we have so far
          const endTime = new Date()
          responseData = {
            type: 'partial_stream',
            chunks,
            summary: {
              totalChunks: chunks.length,
              startTime: startTime.toISOString(),
              endTime: endTime.toISOString(),
              durationMs: endTime.getTime() - startTime.getTime(),
              error:
                streamError instanceof Error
                  ? streamError.message
                  : 'Unknown streaming error',
              note: 'Stream was partially collected before encountering an error.',
            },
          }
        }
      } else {
        throw new Error(`Invalid interaction type: ${interactionType}`)
      }

      return {
        success: true as const,
        responseData,
        interactionType,
        serverUsed: serverToUse.url,
        agentIdUsed: actualAgentId,
        fullyQualifiedId,
        resolutionMethod,
        // BGP routing information
        routingInfo: {
          asn: serverToUse.asn,
          region: serverToUse.region,
          priority: serverToUse.priority,
          availableAlternatives,
        },
      }
    } catch (error: unknown) {
      logger.error(
        `Error interacting with Mastra agent '${targetAgentId}':`,
        error,
      )
      throw new Error(
        `Failed to interact with Mastra agent '${targetAgentId}': ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  },
})
