import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { MastraClient } from '@mastra/client-js'
import { getServersFromConfig, getRetryConfig, logger } from '../config.js'
import { ServerConfig } from '../bgp/types.js'

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

/**
 * BGP-aware agent resolution: finds which servers contain the given agent ID
 * and provides intelligent routing based on AS numbers, priorities, and regions
 */
async function findAgentServers(
  agentId: string,
  servers: ServerConfig[],
): Promise<ServerConfig[]> {
  const foundServers: ServerConfig[] = []
  const retryConfig = getRetryConfig()

  for (const server of servers) {
    try {
      const clientConfig = {
        baseUrl: server.url,
        retries: retryConfig.discovery.retries,
        backoffMs: retryConfig.discovery.backoffMs,
        maxBackoffMs: retryConfig.discovery.maxBackoffMs,
      }

      const mastraClient = new MastraClient(clientConfig)
      const agentsData = await mastraClient.getAgents()

      if (agentsData && Object.keys(agentsData).includes(agentId)) {
        foundServers.push(server)
      }
    } catch {
      // Server offline or error - skip
      continue
    }
  }

  return foundServers
}

/**
 * BGP-style server selection algorithm
 * Uses BGP-like path selection criteria: priority (like local_pref), AS path length, etc.
 */
function selectBestServer(
  servers: ServerConfig[],
  preferredRegion?: string,
): ServerConfig {
  if (servers.length === 0) {
    throw new Error('No servers available for selection')
  }

  if (servers.length === 1) {
    return servers[0]
  }

  // BGP-style path selection algorithm:
  // 1. Highest priority (like BGP local preference)
  // 2. Preferred region (like BGP communities for region preference)
  // 3. Lowest AS number (like BGP router ID tie-breaking)

  let candidates = [...servers]

  // Step 1: Filter by highest priority
  const maxPriority = Math.max(...candidates.map((s) => s.priority || 0))
  candidates = candidates.filter((s) => (s.priority || 0) === maxPriority)

  if (candidates.length === 1) {
    return candidates[0]
  }

  // Step 2: Prefer region if specified
  if (preferredRegion) {
    const regionMatches = candidates.filter((s) => s.region === preferredRegion)
    if (regionMatches.length > 0) {
      candidates = regionMatches
    }
  }

  if (candidates.length === 1) {
    return candidates[0]
  }

  // Step 3: Use lowest AS number as tie-breaker (like BGP router ID)
  candidates.sort((a, b) => a.asn - b.asn)

  return candidates[0]
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
          // BGP-aware resolution: find which servers contain this agent
          const foundServers = await findAgentServers(actualAgentId, servers)
          availableAlternatives = foundServers.length - 1

          if (foundServers.length === 0) {
            // Agent not found on any server
            const availableServers = servers.map((s) => s.name).join(', ')
            throw new Error(
              `Agent '${actualAgentId}' not found on any configured server. Available servers: ${availableServers}. Use 'server:agentId' format or check agent name.`,
            )
          } else if (foundServers.length === 1) {
            // Agent found on exactly one server - use it automatically
            serverToUse = foundServers[0]
            fullyQualifiedId = `${serverToUse.name}:${actualAgentId}`
            resolutionMethod = 'unique_auto_resolution'
          } else {
            // Agent found on multiple servers - use BGP-style selection
            serverToUse = selectBestServer(foundServers)
            fullyQualifiedId = `${serverToUse.name}:${actualAgentId}`
            resolutionMethod = 'bgp_path_selection'
          }
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
