import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { MastraClient } from "@mastra/client-js";
import { loadServerMappings } from "../config.js";

/**
 * Generate default servers from configurable server mappings
 */
function getDefaultServers() {
  const serverMappings = loadServerMappings();
  return Array.from(serverMappings.entries()).map(([name, url]) => ({
    name,
    url,
    description: `Mastra Server (${name})`,
  }));
}

const multiServerInputSchema = z.object({
  servers: z.array(
    z.object({
      name: z.string(),
      url: z.string().url(),
      description: z.string().optional(),
    })
  ).optional(), // If not provided, use configurable defaults
});

const multiServerOutputSchema = z.object({
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
        })
      ),
      status: z.enum(["online", "offline", "error"]),
      error: z.string().optional(),
    })
  ),
  summary: z.object({
    totalServers: z.number(),
    onlineServers: z.number(),
    totalAgents: z.number(),
    agentConflicts: z.array(
      z.object({
        agentId: z.string(),
        servers: z.array(z.string()),
      })
    ),
  }),
});

export const multiServerAgentsTool = createTool({
  id: "listMultiServerAgents",
  description: "Lists agents from multiple Mastra servers and identifies name conflicts. Returns fully qualified agent IDs (server:agentId) to avoid conflicts.",
  inputSchema: multiServerInputSchema,
  outputSchema: multiServerOutputSchema,
  execute: async (context: any) => {
    const { servers } = context.context || {};
    
    // Use provided servers or defaults
    const serversToCheck = servers || getDefaultServers();
    
    const serverAgents = [];
    const agentIdMap = new Map<string, string[]>(); // agentId -> [serverNames]
    let totalAgents = 0;
    let onlineServers = 0;

    // Check each server
    for (const server of serversToCheck) {
      try {
        const clientConfig = {
          baseUrl: server.url,
          retries: 2, // Reduced retries for faster multi-server checks
          backoffMs: 100,
          maxBackoffMs: 1000,
        };

        const mastraClient = new MastraClient(clientConfig);
        const agentsData = await mastraClient.getAgents();

        const agents = Object.keys(agentsData).map((agentId) => {
          // Track agent conflicts
          if (!agentIdMap.has(agentId)) {
            agentIdMap.set(agentId, []);
          }
          agentIdMap.get(agentId)!.push(server.name);

          return {
            id: agentId,
            name: agentsData[agentId]?.name || agentId,
            fullyQualifiedId: `${server.name}:${agentId}`,
          };
        });

        serverAgents.push({
          serverName: server.name,
          serverUrl: server.url,
          serverDescription: server.description,
          agents,
          status: "online" as const,
        });

        totalAgents += agents.length;
        onlineServers++;

      } catch (error: any) {
        serverAgents.push({
          serverName: server.name,
          serverUrl: server.url,
          serverDescription: server.description,
          agents: [],
          status: "error" as const,
          error: error.message,
        });
      }
    }

    // Identify conflicts (agents with same ID on multiple servers)
    const agentConflicts = Array.from(agentIdMap.entries())
      .filter(([_, servers]) => servers.length > 1)
      .map(([agentId, servers]) => ({
        agentId,
        servers,
      }));

    return {
      serverAgents,
      summary: {
        totalServers: serversToCheck.length,
        onlineServers,
        totalAgents,
        agentConflicts,
      },
    };
  },
}); 