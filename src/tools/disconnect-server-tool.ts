import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { removeDynamicServer, getDynamicServers, logger } from '../config.js'

// Input schema for removing a server
const removeServerInputSchema = z.object({
  serverName: z
    .string()
    .min(1)
    .describe('The name of the dynamically connected server to disconnect'),
})

// Output schema
const removeServerOutputSchema = z.object({
  success: z.literal(true),
  serverName: z.string().describe('The name of the removed server'),
  message: z.string().describe('Success message'),
  remainingDynamicServers: z
    .array(z.string())
    .describe('List of remaining dynamically connected server names'),
})

export const disconnectServer = createTool({
  id: 'disconnectServer',
  description: `
    Disconnects from a dynamically connected agent server and removes it from the proxy's server list.
    Only servers that were connected via the connectServer tool can be disconnected - servers configured via AGENT_SERVERS environment variable cannot be removed.
  `.trim(),
  inputSchema: removeServerInputSchema,
  outputSchema: removeServerOutputSchema,
  execute: async (context: {
    context: z.infer<typeof removeServerInputSchema>
  }) => {
    const { serverName } = context.context

    try {
      // Check if the server exists in dynamic servers
      const dynamicServers = await getDynamicServers()
      if (!dynamicServers.has(serverName)) {
        throw new Error(
          `Server '${serverName}' not found in dynamically connected servers. ` +
            `Available connected servers: ${Array.from(dynamicServers.keys()).join(', ') || 'none'}`,
        )
      }

      // Remove the server
      const removed = await removeDynamicServer(serverName)

      if (!removed) {
        throw new Error(`Failed to remove server '${serverName}'`)
      }

      // Get remaining dynamic servers
      const remainingServers = await getDynamicServers()
      const remainingServerNames = Array.from(remainingServers.keys())

      return {
        success: true as const,
        serverName,
        message: `Successfully disconnected from server '${serverName}'`,
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
