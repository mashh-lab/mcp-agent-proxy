import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { MastraClient } from '@mastra/client-js'
import { loadServerMappings, getRetryConfig, logger } from '../config.js'

/**
 * Smart agent resolution: finds which server(s) contain the given agent ID
 */
async function findAgentServers(
  agentId: string,
  serverMap: Map<string, string>,
): Promise<Map<string, string>> {
  const foundServers = new Map<string, string>() // serverName -> serverUrl
  const retryConfig = getRetryConfig()

  for (const [serverName, serverUrl] of serverMap.entries()) {
    try {
      const clientConfig = {
        baseUrl: serverUrl,
        retries: retryConfig.discovery.retries,
        backoffMs: retryConfig.discovery.backoffMs,
        maxBackoffMs: retryConfig.discovery.maxBackoffMs,
      }

      const mastraClient = new MastraClient(clientConfig)
      const agentsData = await mastraClient.getAgents()

      if (agentsData && Object.keys(agentsData).includes(agentId)) {
        foundServers.set(serverName, serverUrl)
      }
    } catch {
      // Server offline or error - skip
      continue
    }
  }

  return foundServers
}

const getAgentDescriptionInputSchema = z.object({
  agentId: z
    .string()
    .min(1, "Agent ID is required. Use 'server:agentId' format for conflicts."),
  serverUrl: z.string().url().optional(), // Optional server URL override
})

const getAgentDescriptionOutputSchema = z.object({
  success: z.literal(true),
  agentId: z.string(),
  fullyQualifiedId: z.string(),
  serverUsed: z.string(),
  serverName: z.string(),
  agentDetails: z
    .record(z.any())
    .describe(
      'All available agent data including name, instructions, and other metadata',
    ),
  resolutionMethod: z.string(),
})

export const getAgentDescription = createTool({
  id: 'getAgentDescription',
  description:
    'Gets detailed information about a specific Mastra agent, including its instructions/description. This provides the agent-to-agent capability information that can be used for intelligent routing and collaboration. Use this after discovering agents with listAgents to understand their specific capabilities.',
  inputSchema: getAgentDescriptionInputSchema,
  outputSchema: getAgentDescriptionOutputSchema,
  execute: async (context: {
    context: z.infer<typeof getAgentDescriptionInputSchema>
  }) => {
    const { agentId, serverUrl } = context.context

    try {
      // Load configurable server mappings
      const SERVER_MAP = loadServerMappings()

      // Parse agentId to extract server and agent ID
      let serverToUse: string
      let actualAgentId: string
      let fullyQualifiedId: string
      let resolutionMethod: string
      let serverName: string

      if (agentId.includes(':')) {
        // Handle fully qualified ID (server:agentId)
        const [serverNamePart, agentIdPart] = agentId.split(':', 2)
        actualAgentId = agentIdPart
        fullyQualifiedId = agentId
        serverName = serverNamePart
        resolutionMethod = 'explicit_qualification'

        // Resolve server URL from name
        if (SERVER_MAP.has(serverNamePart)) {
          serverToUse = SERVER_MAP.get(serverNamePart)!
        } else if (serverUrl) {
          serverToUse = serverUrl
          resolutionMethod = 'explicit_url_override'
        } else {
          throw new Error(
            `Unknown server '${serverNamePart}'. Available servers: ${Array.from(SERVER_MAP.keys()).join(', ')}. Or provide serverUrl parameter.`,
          )
        }
      } else {
        // Handle plain agent ID - use smart resolution
        actualAgentId = agentId

        if (serverUrl) {
          // Explicit server URL override
          serverToUse = serverUrl
          resolutionMethod = 'explicit_url_override'
          serverName =
            Array.from(SERVER_MAP.entries()).find(
              ([, url]) => url === serverToUse,
            )?.[0] || 'custom'
          fullyQualifiedId = `${serverName}:${actualAgentId}`
        } else {
          // Smart resolution: find which server(s) contain this agent
          const foundServers = await findAgentServers(actualAgentId, SERVER_MAP)

          if (foundServers.size === 0) {
            // Agent not found on any server
            const availableServers = Array.from(SERVER_MAP.keys()).join(', ')
            throw new Error(
              `Agent '${actualAgentId}' not found on any configured server. Available servers: ${availableServers}. Use 'server:agentId' format or check agent name.`,
            )
          } else if (foundServers.size === 1) {
            // Agent found on exactly one server - use it automatically
            const [foundServerName, foundServerUrl] = Array.from(
              foundServers.entries(),
            )[0]
            serverToUse = foundServerUrl
            serverName = foundServerName
            fullyQualifiedId = `${serverName}:${actualAgentId}`
            resolutionMethod = 'unique_auto_resolution'
          } else {
            // Agent found on multiple servers - use default server (server0)
            const defaultServerName = 'server0'
            if (foundServers.has(defaultServerName)) {
              serverToUse = foundServers.get(defaultServerName)!
              serverName = defaultServerName
              fullyQualifiedId = `${serverName}:${actualAgentId}`
              resolutionMethod = 'conflict_default_server'
            } else {
              // Default server doesn't have the agent, use first found server
              const [firstServerName, firstServerUrl] = Array.from(
                foundServers.entries(),
              )[0]
              serverToUse = firstServerUrl
              serverName = firstServerName
              fullyQualifiedId = `${serverName}:${actualAgentId}`
              resolutionMethod = 'conflict_first_available'
            }
          }
        }
      }

      const retryConfig = getRetryConfig()

      const clientConfig = {
        baseUrl: serverToUse,
        retries: retryConfig.interaction.retries,
        backoffMs: retryConfig.interaction.backoffMs,
        maxBackoffMs: retryConfig.interaction.maxBackoffMs,
      }

      const mastraClient = new MastraClient(clientConfig)

      // Get detailed agent information using the agent's details method
      const agent = mastraClient.getAgent(actualAgentId)
      const agentData = await agent.details()

      return {
        success: true as const,
        agentId: actualAgentId,
        fullyQualifiedId,
        serverUsed: serverToUse,
        serverName,
        agentDetails: {
          // Include all fields from agentData
          ...agentData,
        },
        resolutionMethod,
      }
    } catch (error: unknown) {
      logger.error(`Error getting agent description for '${agentId}':`, error)
      throw new Error(
        `Failed to get agent description for '${agentId}': ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  },
})
