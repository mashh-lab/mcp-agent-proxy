import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { removeDynamicServer, getDynamicServers, logger } from '../config.js'

// Input schema for removing a server
const removeServerInputSchema = z.object({
  serverName: z
    .string()
    .min(1)
    .describe('The name of the dynamically learned server to forget'),
})

// Output schema
const removeServerOutputSchema = z.object({
  success: z.literal(true),
  serverName: z.string().describe('The name of the removed server'),
  message: z.string().describe('Success message'),
  remainingDynamicServers: z
    .array(z.string())
    .describe('List of remaining dynamically learned server names'),
})

export const forgetMastraServerTool = createTool({
  id: 'forgetMastraServer',
  description:
    "Forgets about a dynamically learned Mastra server and removes it from the proxy's server list. Only servers that were learned via the learnMastraServer tool can be forgotten - servers configured via MASTRA_SERVERS environment variable cannot be removed.",
  inputSchema: removeServerInputSchema,
  outputSchema: removeServerOutputSchema,
  execute: async (context: {
    context: z.infer<typeof removeServerInputSchema>
  }) => {
    const { serverName } = context.context

    try {
      // Check if the server exists in dynamic servers
      const dynamicServers = getDynamicServers()
      if (!dynamicServers.has(serverName)) {
        throw new Error(
          `Server '${serverName}' not found in dynamically learned servers. ` +
            `Available learned servers: ${Array.from(dynamicServers.keys()).join(', ') || 'none'}`,
        )
      }

      // Remove the server
      const removed = removeDynamicServer(serverName)

      if (!removed) {
        throw new Error(`Failed to remove server '${serverName}'`)
      }

      // Get remaining dynamic servers
      const remainingServers = getDynamicServers()
      const remainingServerNames = Array.from(remainingServers.keys())

      return {
        success: true as const,
        serverName,
        message: `Successfully forgot server '${serverName}' from learned server list`,
        remainingDynamicServers: remainingServerNames,
      }
    } catch (error: unknown) {
      logger.error(`Error removing server ${serverName}:`, error)
      throw new Error(
        `Failed to remove server ${serverName}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
    }
  },
})
