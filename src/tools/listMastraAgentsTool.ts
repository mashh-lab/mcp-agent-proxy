import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { MastraClient } from "@mastra/client-js";
import { loadMastraClientConfig } from "../config.js";

const listAgentsOutputSchema = z.object({
  agents: z.array(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      // Potentially include other relevant agent details if available from getAgents()
    })
  ),
});

export const listMastraAgentsTool = createTool({
  id: "listMastraAgents",
  description: "Lists available agents on the configured target Mastra server.",
  inputSchema: z.object({}), // No input needed, or optional filters
  outputSchema: listAgentsOutputSchema,
  execute: async () => {
    try {
      const clientConfig = loadMastraClientConfig();
      const mastraClient = new MastraClient(clientConfig);

      // Call getAgents() method properly
      const agentsData = await mastraClient.getAgents();

      // Transform the agents object into the expected array format
      const formattedAgents = Object.keys(agentsData).map((agentId) => ({
        id: agentId,
        name: agentsData[agentId]?.name || agentId, // Use name if available, otherwise use ID
      }));

      return {
        agents: formattedAgents,
      };
    } catch (error: any) {
      console.error("Error listing agents:", error);
      throw new Error(`Failed to list Mastra agents: ${error.message}`);
    }
  },
}); 