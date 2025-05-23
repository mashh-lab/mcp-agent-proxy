import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { MastraClient } from "@mastra/client-js";
import { loadServerMappings } from "../config.js";

// Input schema with support for fully qualified agent IDs
const agentProxyInputSchema = z.object({
  targetAgentId: z.string().min(1, "Target agent ID is required. Use 'server:agentId' format for conflicts."),
  interactionType: z.enum(['generate', 'stream'], {
    errorMap: () => ({ message: "interactionType must be 'generate' or 'stream'." })
  }),
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string(),
    })
  ).min(1, "At least one message is required."),
  serverUrl: z.string().url().optional(), // Optional server URL override
  threadId: z.string().optional(),
  resourceId: z.string().optional(),
  agentOptions: z.record(z.any()).optional(),
});

// Output schema with enhanced information
const agentProxyOutputSchema = z.object({
  success: z.literal(true),
  responseData: z.any(),
  interactionType: z.string(),
  serverUsed: z.string(), // Shows which server was used
  agentIdUsed: z.string(), // Shows the actual agent ID used (without server prefix)
  fullyQualifiedId: z.string(), // Shows the full server:agentId format
  resolutionMethod: z.string(), // Shows how the server was resolved
});

/**
 * Smart agent resolution: finds which server(s) contain the given agent ID
 */
async function findAgentServers(agentId: string, serverMap: Map<string, string>): Promise<Map<string, string>> {
  const foundServers = new Map<string, string>(); // serverName -> serverUrl

  for (const [serverName, serverUrl] of serverMap.entries()) {
    try {
      const clientConfig = {
        baseUrl: serverUrl,
        retries: 1, // Quick check
        backoffMs: 100,
        maxBackoffMs: 500,
      };

      const mastraClient = new MastraClient(clientConfig);
      const agentsData = await mastraClient.getAgents();

      if (agentsData && Object.keys(agentsData).includes(agentId)) {
        foundServers.set(serverName, serverUrl);
      }
    } catch (error) {
      // Server offline or error - skip
      continue;
    }
  }

  return foundServers;
}

export const agentProxyTool = createTool({
  id: "callMastraAgent",
  description: "Proxies requests to a target Mastra agent using @mastra/client-js. Supports 'generate' and 'stream' interactions. Use 'server:agentId' format for multi-server environments with agent name conflicts.",
  inputSchema: agentProxyInputSchema,
  outputSchema: agentProxyOutputSchema,
  execute: async (context: any) => {
    const { targetAgentId, interactionType, messages, serverUrl, threadId, resourceId, agentOptions } = context.context;

    try {
      // Load configurable server mappings
      const SERVER_MAP = loadServerMappings();
      
      // Parse targetAgentId to extract server and agent ID
      let serverToUse: string;
      let actualAgentId: string;
      let fullyQualifiedId: string;
      let resolutionMethod: string;

      if (targetAgentId.includes(':')) {
        // Handle fully qualified ID (server:agentId)
        const [serverName, agentId] = targetAgentId.split(':', 2);
        actualAgentId = agentId;
        fullyQualifiedId = targetAgentId;
        resolutionMethod = "explicit_qualification";
        
        // Resolve server URL from name
        if (SERVER_MAP.has(serverName)) {
          serverToUse = SERVER_MAP.get(serverName)!;
        } else if (serverUrl) {
          serverToUse = serverUrl;
          resolutionMethod = "explicit_url_override";
        } else {
          throw new Error(`Unknown server '${serverName}'. Available servers: ${Array.from(SERVER_MAP.keys()).join(', ')}. Or provide serverUrl parameter.`);
        }
      } else {
        // Handle plain agent ID - use smart resolution
        actualAgentId = targetAgentId;
        
        if (serverUrl) {
          // Explicit server URL override
          serverToUse = serverUrl;
          resolutionMethod = "explicit_url_override";
          const serverName = Array.from(SERVER_MAP.entries()).find(([_, url]) => url === serverToUse)?.[0] || "custom";
          fullyQualifiedId = `${serverName}:${actualAgentId}`;
        } else {
          // Smart resolution: find which server(s) contain this agent
          const foundServers = await findAgentServers(actualAgentId, SERVER_MAP);
          
          if (foundServers.size === 0) {
            // Agent not found on any server
            const availableServers = Array.from(SERVER_MAP.keys()).join(', ');
            throw new Error(`Agent '${actualAgentId}' not found on any configured server. Available servers: ${availableServers}. Use 'server:agentId' format or check agent name.`);
          } else if (foundServers.size === 1) {
            // Agent found on exactly one server - use it automatically
            const [serverName, serverUrl] = Array.from(foundServers.entries())[0];
            serverToUse = serverUrl;
            fullyQualifiedId = `${serverName}:${actualAgentId}`;
            resolutionMethod = "unique_auto_resolution";
          } else {
            // Agent found on multiple servers - use default server (server0)
            const defaultServerName = 'server0';
            if (foundServers.has(defaultServerName)) {
              serverToUse = foundServers.get(defaultServerName)!;
              fullyQualifiedId = `${defaultServerName}:${actualAgentId}`;
              resolutionMethod = "conflict_default_server";
            } else {
              // Default server doesn't have the agent, use first found server
              const [firstServerName, firstServerUrl] = Array.from(foundServers.entries())[0];
              serverToUse = firstServerUrl;
              fullyQualifiedId = `${firstServerName}:${actualAgentId}`;
              resolutionMethod = "conflict_first_available";
            }
          }
        }
      }

      const clientConfig = {
        baseUrl: serverToUse,
        retries: parseInt(process.env.MASTRA_CLIENT_RETRIES || "3", 10),
        backoffMs: parseInt(process.env.MASTRA_CLIENT_BACKOFF_MS || "300", 10),
        maxBackoffMs: parseInt(process.env.MASTRA_CLIENT_MAX_BACKOFF_MS || "5000", 10),
      };

      const mastraClient = new MastraClient(clientConfig);
      const agent = mastraClient.getAgent(actualAgentId);

      let responseData: any;
      const interactionParams: any = {
        messages,
        ...(threadId && { threadId }),
        ...(resourceId && { resourceId }),
        ...agentOptions,
      };

      if (interactionType === 'generate') {
        responseData = await agent.generate(interactionParams);
      } else if (interactionType === 'stream') {
        console.warn("Streaming via agent.stream() is simplified to collect full content.");
        const streamResult = await agent.stream(interactionParams);
        responseData = { 
          type: "streamResult", 
          content: streamResult, 
          streamInfo: "Stream result from target agent." 
        };
      } else {
        throw new Error(`Invalid interaction type: ${interactionType}`);
      }

      return {
        success: true as const,
        responseData,
        interactionType,
        serverUsed: serverToUse,
        agentIdUsed: actualAgentId,
        fullyQualifiedId,
        resolutionMethod,
      };

    } catch (error: any) {
      console.error(`Error interacting with Mastra agent '${targetAgentId}':`, error);
      throw new Error(`Failed to interact with Mastra agent '${targetAgentId}': ${error.message}`);
    }
  },
}); 