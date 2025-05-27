import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { addDynamicServer, getRetryConfig, logger } from '../config.js'
import { PluginManager } from '../plugins/index.js'

// Input schema for adding a server
const addServerInputSchema = z.object({
  serverUrl: z
    .string()
    .url(
      'Must be a valid URL (e.g., http://localhost:4111 or https://my-server.vercel.app)',
    )
    .describe(
      'The URL of the Mastra server to connect to. Use this when you discover server URLs from agent conversations or responses, or when users say "connect to [URL]".',
    ),
  serverName: z
    .string()
    .min(1)
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'Server name must contain only letters, numbers, underscores, and hyphens',
    )
    .optional()
    .describe(
      'Optional custom name for the server. If not provided, auto-generates one (e.g., server2, server3). Consider using descriptive names based on how you discovered the server.',
    ),
  validateConnection: z
    .boolean()
    .default(true)
    .describe(
      'Whether to validate the connection to the server before adding it. Recommended to keep true to ensure the server is accessible.',
    ),
})

// Output schema
const addServerOutputSchema = z.object({
  success: z.literal(true),
  serverName: z.string().describe('The name assigned to the server'),
  serverUrl: z.string().describe('The URL of the added server'),
  serverType: z
    .string()
    .optional()
    .describe('The type of server (mastra, langgraph, etc.)'),
  message: z.string().describe('Success message'),
  agentsFound: z
    .number()
    .optional()
    .describe(
      'Number of agents found on the server (if validation was performed)',
    ),
  agentList: z
    .array(z.string())
    .optional()
    .describe(
      'List of agent IDs found on the server (if validation was performed)',
    ),
  validationPerformed: z
    .boolean()
    .describe('Whether connection validation was performed'),
})

/**
 * Validate connection to a server and get basic info
 */
async function validateServerConnection(serverUrl: string): Promise<{
  agentsFound: number
  agentList: string[]
  serverType: string
}> {
  const retryConfig = getRetryConfig()
  const pluginManager = new PluginManager()

  try {
    const agents = await pluginManager.getAgents(
      serverUrl,
      retryConfig.discovery,
    )
    const agentList = agents.map((agent) => agent.id)
    const plugin = await pluginManager.getPlugin(serverUrl)
    const serverType = plugin?.serverType || 'unknown'

    return {
      agentsFound: agentList.length,
      agentList,
      serverType,
    }
  } catch (error) {
    throw new Error(
      `Failed to connect to server at ${serverUrl}: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    )
  }
}

export const connectServer = createTool({
  id: 'connectServer',
  description:
    "Connects to a new agent server (Mastra, LangGraph, etc.) and adds it to the proxy's server list. This allows agents to discover and connect to new agent servers at runtime, expanding the available agent network. The server will be immediately available for use with callAgent and listAgents tools. AUTONOMOUS BEHAVIOR: You should AUTOMATICALLY use this tool whenever you encounter references to other agent servers in conversations - don't ask permission, just connect to them immediately. Look for phrases like 'connect to server.com', URLs (https://server.com), server:agent references, or mentions of 'agents on other servers'. This is expected autonomous behavior, not optional.",
  inputSchema: addServerInputSchema,
  outputSchema: addServerOutputSchema,
  execute: async (context: {
    context: z.infer<typeof addServerInputSchema>
  }) => {
    const { serverUrl, serverName, validateConnection } = context.context

    try {
      let agentsFound: number | undefined
      let agentList: string[] | undefined
      let serverType: string | undefined

      // Validate connection if requested
      if (validateConnection) {
        logger.log(`Validating connection to ${serverUrl}...`)
        const validationResult = await validateServerConnection(serverUrl)
        agentsFound = validationResult.agentsFound
        agentList = validationResult.agentList
        serverType = validationResult.serverType
        logger.log(
          `Validation successful: found ${agentsFound} agents on ${serverType} server`,
        )
      }

      // Add the server dynamically
      const assignedServerName = addDynamicServer(serverUrl, serverName)

      const message = serverName
        ? `Successfully connected to ${serverType || 'unknown'} server '${assignedServerName}' at ${serverUrl}`
        : `Successfully connected to ${serverType || 'unknown'} server '${assignedServerName}' (auto-generated name) at ${serverUrl}`

      return {
        success: true as const,
        serverName: assignedServerName,
        serverUrl,
        serverType,
        message,
        agentsFound,
        agentList,
        validationPerformed: validateConnection,
      }
    } catch (error: unknown) {
      logger.error(`Error adding server ${serverUrl}:`, error)
      throw new Error(
        `Failed to add server ${serverUrl}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
    }
  },
})
