import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { MastraClient } from '@mastra/client-js'
import { getServersFromConfig, getRetryConfig } from '../config.js'

/**
 * Get agent information from all configured Mastra servers with BGP awareness
 * This function can be reused outside of the MCP tool context
 */
export async function getMastraAgentsInfo() {
  const serversToCheck = getServersFromConfig() // Now returns ServerConfig[]
  const retryConfig = getRetryConfig()

  const serverAgents = []
  const agentIdMap = new Map<string, string[]>() // agentId -> [serverNames]
  let totalAgents = 0
  let onlineServers = 0

  // Check each server with BGP awareness
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
        // Track agent conflicts across AS boundaries
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
        serverDescription:
          server.description || `Mastra Server (${server.name})`,
        // BGP-specific information
        asn: server.asn,
        region: server.region,
        priority: server.priority,
        agents,
        status: 'online' as const,
      })

      totalAgents += agents.length
      onlineServers++
    } catch (error: unknown) {
      serverAgents.push({
        serverName: server.name,
        serverUrl: server.url,
        serverDescription:
          server.description || `Mastra Server (${server.name})`,
        // BGP-specific information for error case
        asn: server.asn,
        region: server.region,
        priority: server.priority,
        agents: [],
        status: 'error' as const,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  // Identify conflicts (agents with same ID on multiple servers/ASes)
  const agentConflicts = Array.from(agentIdMap.entries())
    .filter(([, servers]) => servers.length > 1)
    .map(([agentId, servers]) => ({
      agentId,
      servers,
      // Add AS information for conflict resolution
      conflictingASNs: servers
        .map((serverName) => {
          const server = serversToCheck.find((s) => s.name === serverName)
          return server ? server.asn : null
        })
        .filter((asn) => asn !== null) as number[],
    }))

  return {
    serverAgents,
    summary: {
      totalServers: serversToCheck.length,
      onlineServers,
      totalAgents,
      agentConflicts,
      // BGP network summary
      asNumbers: serversToCheck.map((s) => s.asn),
      regions: [
        ...new Set(
          serversToCheck
            .map((s) => s.region)
            .filter((region): region is string => region !== undefined),
        ),
      ],
    },
  }
}

const listAgentsOutputSchema = z.object({
  serverAgents: z.array(
    z.object({
      serverName: z.string(),
      serverUrl: z.string(),
      serverDescription: z.string().optional(),
      // BGP-specific fields
      asn: z.number(),
      region: z.string().optional(),
      priority: z.number().optional(),
      agents: z.array(
        z.object({
          id: z.string(),
          name: z.string().optional(),
          fullyQualifiedId: z.string(), // server:agentId format
        }),
      ),
      status: z.enum(['online', 'offline', 'error']),
      error: z.string().optional(),
    }),
  ),
  summary: z.object({
    totalServers: z.number(),
    onlineServers: z.number(),
    totalAgents: z.number(),
    agentConflicts: z.array(
      z.object({
        agentId: z.string(),
        servers: z.array(z.string()),
        // BGP conflict resolution data
        conflictingASNs: z.array(z.number()),
      }),
    ),
    // BGP network topology summary
    asNumbers: z.array(z.number()),
    regions: z.array(z.string()),
  }),
})

export const listMastraAgentsTool = createTool({
  id: 'listMastraAgents',
  description:
    'Lists available agents on all configured Mastra servers with BGP network awareness. Supports both single and multi-server setups with automatic conflict detection across AS boundaries.',
  inputSchema: z.object({}), // No input needed
  outputSchema: listAgentsOutputSchema,
  execute: async () => {
    return await getMastraAgentsInfo()
  },
})
