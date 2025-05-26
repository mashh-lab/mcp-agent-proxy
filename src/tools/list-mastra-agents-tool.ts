import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { MastraClient } from '@mastra/client-js'
import {
  loadServerMappings,
  getRetryConfig,
  getDynamicServers,
} from '../config.js'

/**
 * Generate servers from configurable server mappings
 */
function getServersFromConfig() {
  const serverMappings = loadServerMappings()
  const dynamicServers = getDynamicServers()

  return Array.from(serverMappings.entries()).map(([name, url]) => ({
    name,
    url,
    description: `Mastra Server (${name})`,
    isDynamic: dynamicServers.has(name),
  }))
}

/**
 * Get agent information from all configured Mastra servers
 * This function can be reused outside of the MCP tool context
 */
export async function getMastraAgentsInfo() {
  const serversToCheck = getServersFromConfig()
  const retryConfig = getRetryConfig()

  const serverAgents = []
  const agentIdMap = new Map<string, string[]>() // agentId -> [serverNames]
  let totalAgents = 0
  let onlineServers = 0

  // Check each server
  for (const server of serversToCheck) {
    try {
      const clientConfig = {
        baseUrl: server.url,
        retries: retryConfig.listing.retries,
        backoffMs: retryConfig.listing.backoffMs,
        maxBackoffMs: retryConfig.listing.maxBackoffMs,
      }

      const mastraClient = new MastraClient(clientConfig)
      const agentsData = await mastraClient.getAgents()

      const agents = Object.keys(agentsData).map((agentId) => {
        // Track agent conflicts
        if (!agentIdMap.has(agentId)) {
          agentIdMap.set(agentId, [])
        }
        agentIdMap.get(agentId)!.push(server.name)

        return {
          id: agentId,
          name: agentsData[agentId]?.name || agentId,
          fullyQualifiedId: `${server.name}:${agentId}`,
        }
      })

      serverAgents.push({
        serverName: server.name,
        serverUrl: server.url,
        serverDescription: server.description,
        agents,
        status: 'online' as const,
        isDynamic: server.isDynamic,
      })

      totalAgents += agents.length
      onlineServers++
    } catch (error: unknown) {
      serverAgents.push({
        serverName: server.name,
        serverUrl: server.url,
        serverDescription: server.description,
        agents: [],
        status: 'error' as const,
        error: error instanceof Error ? error.message : 'Unknown error',
        isDynamic: server.isDynamic,
      })
    }
  }

  // Identify conflicts (agents with same ID on multiple servers)
  const agentConflicts = Array.from(agentIdMap.entries())
    .filter(([, servers]) => servers.length > 1)
    .map(([agentId, servers]) => ({
      agentId,
      servers,
    }))

  // Count dynamic vs static servers
  const dynamicServerCount = serversToCheck.filter((s) => s.isDynamic).length
  const staticServerCount = serversToCheck.length - dynamicServerCount

  return {
    serverAgents,
    summary: {
      totalServers: serversToCheck.length,
      staticServers: staticServerCount,
      dynamicServers: dynamicServerCount,
      onlineServers,
      totalAgents,
      agentConflicts,
    },
  }
}

const listAgentsOutputSchema = z.object({
  serverAgents: z.array(
    z.object({
      serverName: z.string(),
      serverUrl: z.string(),
      serverDescription: z.string().optional(),
      agents: z.array(
        z.object({
          id: z.string(),
          name: z.string().optional(),
          fullyQualifiedId: z.string(), // server:agentId format
        }),
      ),
      status: z.enum(['online', 'offline', 'error']),
      error: z.string().optional(),
      isDynamic: z
        .boolean()
        .describe(
          'Whether this server was learned dynamically via learnMastraServer tool',
        ),
    }),
  ),
  summary: z.object({
    totalServers: z.number(),
    staticServers: z
      .number()
      .describe('Servers configured via MASTRA_SERVERS environment variable'),
    dynamicServers: z
      .number()
      .describe('Servers learned dynamically via learnMastraServer tool'),
    onlineServers: z.number(),
    totalAgents: z.number(),
    agentConflicts: z.array(
      z.object({
        agentId: z.string(),
        servers: z.array(z.string()),
      }),
    ),
  }),
})

export const listMastraAgentsTool = createTool({
  id: 'listMastraAgents',
  description:
    'Lists available agents on all configured Mastra servers. Supports both single and multi-server setups with automatic conflict detection. Shows both static servers (from environment config) and dynamic servers (learned via learnMastraServer). Use this to discover what agents are available across your network, and pay attention to agent descriptions that might mention other agent networks you could learn about.',
  inputSchema: z.object({}), // No input needed
  outputSchema: listAgentsOutputSchema,
  execute: async () => {
    return await getMastraAgentsInfo()
  },
})
