import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { MastraClient } from '@mastra/client-js'
import { getServersFromConfig, getRetryConfig } from '../config.js'
import {
  getBGPNetworkAgents,
  getBGPLocalAgents,
  isBGPAvailable,
  getBGPNetworkStatus,
} from './bgp-integration.js'
import { logger } from '../config.js'

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

  // Add BGP-discovered agents if BGP infrastructure is available
  if (isBGPAvailable()) {
    try {
      const bgpNetworkAgents = await getBGPNetworkAgents()
      const bgpLocalAgents = await getBGPLocalAgents()
      const bgpStatus = await getBGPNetworkStatus()

      // Add BGP network agents as virtual servers
      if (bgpNetworkAgents.length > 0) {
        // Group agents by source ASN
        const agentsByASN = new Map<number, typeof bgpNetworkAgents>()

        for (const networkAgent of bgpNetworkAgents) {
          if (!agentsByASN.has(networkAgent.sourceASN)) {
            agentsByASN.set(networkAgent.sourceASN, [])
          }
          agentsByASN.get(networkAgent.sourceASN)!.push(networkAgent)
        }

        // Create virtual server entries for each BGP AS
        for (const [asn, agents] of agentsByASN.entries()) {
          const bgpAgents = agents.map((networkAgent) => {
            const agentId = networkAgent.agent.agentId

            // Track BGP agent conflicts
            if (!agentIdMap.has(agentId)) {
              agentIdMap.set(agentId, [])
            }
            agentIdMap.get(agentId)!.push(`bgp-as${asn}`)

            return {
              id: agentId,
              name: agentId, // BGP agents don't have separate names
              fullyQualifiedId: `bgp-as${asn}:${agentId}`,
              // BGP-specific metadata
              bgpRoute: {
                asPath: networkAgent.route.asPath,
                nextHop: networkAgent.route.nextHop,
                localPref: networkAgent.route.localPref,
                med: networkAgent.route.med,
              },
            }
          })

          serverAgents.push({
            serverName: `bgp-as${asn}`,
            serverUrl: agents[0]?.agent.serverUrl || `bgp://as${asn}`,
            serverDescription: `BGP-discovered agents from AS${asn}`,
            asn: asn,
            region: 'bgp-network',
            priority: 200, // Lower priority than direct servers
            agents: bgpAgents,
            status: 'online' as const,
            // BGP-specific metadata
            bgpDiscovered: true,
            bgpMetrics: {
              totalRoutes: agents.length,
              avgPathLength:
                agents.reduce((sum, a) => sum + a.route.asPath.length, 0) /
                agents.length,
            },
          })

          totalAgents += bgpAgents.length
          onlineServers++
        }
      }

      // Add BGP status information to summary
      if (bgpStatus) {
        // Add BGP network summary to the response
        const bgpSummary = {
          bgpEnabled: true,
          localASN: bgpStatus.localASN,
          peersConnected: bgpStatus.peersConnected,
          routesLearned: bgpStatus.routesLearned,
          localAgentsAdvertised: bgpStatus.localAgentsAdvertised,
          networkAgentsDiscovered: bgpStatus.networkAgentsDiscovered,
        }

        // We'll add this to the summary below
        Object.assign(serverAgents, { bgpSummary })
      }
    } catch (error) {
      logger.error('Failed to get BGP agents:', error)
      // Continue without BGP agents - don't fail the entire operation
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
          if (server) return server.asn

          // Handle BGP virtual servers
          const bgpMatch = serverName.match(/^bgp-as(\d+)$/)
          if (bgpMatch) return parseInt(bgpMatch[1])

          return null
        })
        .filter((asn) => asn !== null) as number[],
    }))

  const summary = {
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
  }

  // Add BGP summary if available
  if (isBGPAvailable()) {
    try {
      const bgpStatus = await getBGPNetworkStatus()
      if (bgpStatus) {
        Object.assign(summary, {
          bgp: {
            enabled: true,
            localASN: bgpStatus.localASN,
            peersConnected: bgpStatus.peersConnected,
            routesLearned: bgpStatus.routesLearned,
            localAgentsAdvertised: bgpStatus.localAgentsAdvertised,
            networkAgentsDiscovered: bgpStatus.networkAgentsDiscovered,
          },
        })
      }
    } catch (error) {
      logger.error('Failed to get BGP status for summary:', error)
    }
  }

  return {
    serverAgents,
    summary,
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
