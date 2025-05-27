import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import {
  loadServerMappings,
  getRetryConfig,
  getDynamicServers,
} from '../config.js'
import { PluginManager } from '../plugins/index.js'

/**
 * Generate servers from configurable server mappings
 */
function getServersFromConfig() {
  const serverMappings = loadServerMappings()
  const dynamicServers = getDynamicServers()

  return Array.from(serverMappings.entries()).map(([name, url]) => ({
    name,
    url,
    description: `Agent Server (${name})`,
    isDynamic: dynamicServers.has(name),
  }))
}

/**
 * Get agent information from all configured servers (Mastra, LangGraph, etc.)
 * This function can be reused outside of the MCP tool context
 */
export async function getAgentsInfo() {
  const serversToCheck = getServersFromConfig()
  const retryConfig = getRetryConfig()
  const pluginManager = new PluginManager()

  const serverAgents = []
  const agentIdMap = new Map<string, string[]>() // agentId -> [serverNames]
  let totalAgents = 0
  let onlineServers = 0

  // Check each server using the plugin manager
  for (const server of serversToCheck) {
    try {
      const serverStatus = await pluginManager.getServerStatus(
        server.name,
        server.url,
        retryConfig.listing,
        server.isDynamic,
      )

      // Update description with actual server type
      serverStatus.serverDescription = `${serverStatus.serverType.charAt(0).toUpperCase() + serverStatus.serverType.slice(1)} Server (${server.name})`

      // Track agent conflicts
      for (const agent of serverStatus.agents) {
        if (!agentIdMap.has(agent.id)) {
          agentIdMap.set(agent.id, [])
        }
        agentIdMap.get(agent.id)!.push(server.name)
      }

      serverAgents.push(serverStatus)

      if (serverStatus.status === 'online') {
        totalAgents += serverStatus.agents.length
        onlineServers++
      }
    } catch (error: unknown) {
      serverAgents.push({
        serverName: server.name,
        serverUrl: server.url,
        serverType: 'unknown',
        serverDescription: `Unknown Server (${server.name})`,
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
          'Whether this server was connected dynamically via connectServer tool',
        ),
    }),
  ),
  summary: z.object({
    totalServers: z.number(),
    staticServers: z
      .number()
      .describe('Servers configured via AGENT_SERVERS environment variable'),
    dynamicServers: z
      .number()
      .describe('Servers connected dynamically via connectServer tool'),
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

export const listAgents = createTool({
  id: 'listAgents',
  description:
    'Lists available agents on all configured agent servers. Supports both single and multi-server setups with automatic conflict detection. Shows both static servers (from environment config) and dynamic servers (connected via connectServer). Use this to discover what agents are available across your network, and pay attention to agent descriptions that might mention other agent networks you could connect to.',
  inputSchema: z.object({}), // No input needed
  outputSchema: listAgentsOutputSchema,
  execute: async () => {
    return await getAgentsInfo()
  },
})
