import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { MastraClient } from "@mastra/client-js";
import { loadServerMappings } from "../config.js";

// Enhanced input schema with support for fully qualified agent IDs
const enhancedAgentProxyInputSchema = z.object({
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
const enhancedAgentProxyOutputSchema = z.object({
  success: z.literal(true),
  responseData: z.any(),
  interactionType: z.string(),
  serverUsed: z.string(), // Shows which server was used
  agentIdUsed: z.string(), // Shows the actual agent ID used (without server prefix)
  fullyQualifiedId: z.string(), // Shows the full server:agentId format
});

export const enhancedAgentProxyTool = createTool({
  id: "callMastraAgent",
  description: "Proxies requests to a target Mastra agent using @mastra/client-js. Supports 'generate' and 'stream' interactions. Use 'server:agentId' format for multi-server environments with agent name conflicts.",
  inputSchema: enhancedAgentProxyInputSchema,
  outputSchema: enhancedAgentProxyOutputSchema,
  execute: async (context: any) => {
    const { targetAgentId, interactionType, messages, serverUrl, threadId, resourceId, agentOptions } = context.context;

    try {
      // Load configurable server mappings
      const SERVER_MAP = loadServerMappings();
      
      // Parse targetAgentId to extract server and agent ID
      let serverToUse: string;
      let actualAgentId: string;
      let fullyQualifiedId: string;

      if (targetAgentId.includes(':')) {
        // Handle fully qualified ID (server:agentId)
        const [serverName, agentId] = targetAgentId.split(':', 2);
        actualAgentId = agentId;
        fullyQualifiedId = targetAgentId;
        
        // Resolve server URL from name
        if (SERVER_MAP.has(serverName)) {
          serverToUse = SERVER_MAP.get(serverName)!;
        } else if (serverUrl) {
          serverToUse = serverUrl;
        } else {
          throw new Error(`Unknown server '${serverName}'. Available servers: ${Array.from(SERVER_MAP.keys()).join(', ')}. Or provide serverUrl parameter.`);
        }
      } else {
        // Handle plain agent ID - use first server (server0) as default
        actualAgentId = targetAgentId;
        
        // Use server0 as default, or explicit serverUrl override
        if (serverUrl) {
          serverToUse = serverUrl;
        } else {
          serverToUse = SERVER_MAP.get('server0') || "http://localhost:4111";
        }
        
        // Determine server name for fully qualified ID
        const serverName = Array.from(SERVER_MAP.entries()).find(([_, url]) => url === serverToUse)?.[0] || "server0";
        fullyQualifiedId = `${serverName}:${actualAgentId}`;
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
      };

    } catch (error: any) {
      console.error(`Error interacting with Mastra agent '${targetAgentId}':`, error);
      throw new Error(`Failed to interact with Mastra agent '${targetAgentId}': ${error.message}`);
    }
  },
}); 