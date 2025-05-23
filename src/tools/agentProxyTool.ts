import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { MastraClient } from "@mastra/client-js";
import { loadMastraClientConfig } from "../config.js";

// Input schema defines the contract for MCP clients invoking this proxy tool
const agentProxyInputSchema = z.object({
  targetAgentId: z.string().min(1, "Target agent ID is required."),
  interactionType: z.enum(['generate', 'stream'], {
    errorMap: () => ({ message: "interactionType must be 'generate' or 'stream'." })
  }),
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string(),
    })
  ).min(1, "At least one message is required."),
  threadId: z.string().optional(),
  resourceId: z.string().optional(),
  agentOptions: z.record(z.any()).optional(),
});

// Output schema defines the structure of a successful response
const agentProxyOutputSchema = z.object({
  success: z.literal(true),
  responseData: z.any(), // This can be refined if the structure of agent responses is known
  interactionType: z.string(),
});

export const agentProxyTool = createTool({
  id: "mastraAgentProxy", // Unique ID for this MCP tool
  description: "Proxies requests to a target Mastra agent using @mastra/client-js. Supports 'generate' and 'stream' interactions.",
  inputSchema: agentProxyInputSchema,
  outputSchema: agentProxyOutputSchema, // Schema for successful execution
  execute: async (context: any) => {
    // Extract parameters from context.context where they are actually located
    const { targetAgentId, interactionType, messages, threadId, resourceId, agentOptions } = context.context;

    try {
      const clientConfig = loadMastraClientConfig(); // Loads baseUrl, retries, etc.
      const mastraClient = new MastraClient(clientConfig);

      const agent = mastraClient.getAgent(targetAgentId);

      let responseData: any;
      const interactionParams: any = { // Type appropriately based on MastraClient's generate/stream options
        messages,
       ...(threadId && { threadId }),
       ...(resourceId && { resourceId }),
       ...agentOptions,
      };

      if (interactionType === 'generate') {
        responseData = await agent.generate(interactionParams);
      } else if (interactionType === 'stream') {
        // For stream interactions, we'll collect the response
        // Note: This is a simplified implementation for demonstration
        console.warn("Streaming via agent.stream() is simplified to collect full content. True real-time proxying to MCP client is an advanced topic.");
        const streamResult = await agent.stream(interactionParams);

        // Since we don't know the exact structure of the stream response,
        // we'll return the stream result as-is for now
        responseData = { 
          type: "streamResult", 
          content: streamResult, 
          streamInfo: "Stream result from target agent - structure may vary based on agent implementation." 
        };
      } else {
        // This case should ideally be prevented by Zod's enum validation
        throw new Error(`Invalid interaction type: ${interactionType}`);
      }

      return {
        success: true as const,
        responseData,
        interactionType,
      };

    } catch (error: any) {
      console.error(`Error interacting with Mastra agent '${targetAgentId}':`, error);
      // For errors, we need to throw an error that can be handled by the MCP framework
      throw new Error(`Failed to interact with Mastra agent '${targetAgentId}': ${error.message}`);
    }
  },
}); 