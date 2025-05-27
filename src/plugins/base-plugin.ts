import { z } from 'zod'

// Common agent information schema
export const AgentInfoSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  fullyQualifiedId: z.string(), // server:agentId format
})

export type AgentInfo = z.infer<typeof AgentInfoSchema>

// Server status schema
export const ServerStatusSchema = z.object({
  serverName: z.string(),
  serverUrl: z.string(),
  serverType: z.string(), // 'mastra' | 'langgraph' | etc.
  serverDescription: z.string().optional(),
  agents: z.array(AgentInfoSchema),
  status: z.enum(['online', 'offline', 'error']),
  error: z.string().optional(),
  isDynamic: z.boolean(),
})

export type ServerStatus = z.infer<typeof ServerStatusSchema>

// Agent call parameters
export const AgentCallParamsSchema = z.object({
  agentId: z.string(),
  interactionType: z.enum(['generate', 'stream']),
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string(),
    }),
  ),
  threadId: z.string().optional(),
  resourceId: z.string().optional(),
  agentOptions: z.record(z.any()).optional(),
})

export type AgentCallParams = z.infer<typeof AgentCallParamsSchema>

// Agent call response
export const AgentCallResponseSchema = z.object({
  success: z.literal(true),
  responseData: z.any(),
  interactionType: z.string(),
  serverUsed: z.string(),
  agentIdUsed: z.string(),
  fullyQualifiedId: z.string(),
  resolutionMethod: z.string(),
  serverType: z.string(),
})

export type AgentCallResponse = z.infer<typeof AgentCallResponseSchema>

// Retry configuration
export interface RetryConfig {
  retries: number
  backoffMs: number
  maxBackoffMs: number
}

/**
 * Base plugin interface that all server type plugins must implement
 */
export abstract class BaseServerPlugin {
  abstract readonly serverType: string

  /**
   * Detect if a server URL is compatible with this plugin
   * @param serverUrl - The server URL to check
   * @returns Promise<boolean> - true if this plugin can handle the server
   */
  abstract detectServerType(serverUrl: string): Promise<boolean>

  /**
   * Get agents from the server
   * @param serverUrl - The server URL
   * @param retryConfig - Retry configuration
   * @returns Promise<AgentInfo[]> - List of agents
   */
  abstract getAgents(
    serverUrl: string,
    retryConfig: RetryConfig,
  ): Promise<AgentInfo[]>

  /**
   * Get detailed information about a specific agent
   * @param serverUrl - The server URL
   * @param agentId - The agent ID
   * @param retryConfig - Retry configuration
   * @returns Promise<AgentInfo> - Agent information
   */
  abstract getAgentDescription(
    serverUrl: string,
    agentId: string,
    retryConfig: RetryConfig,
  ): Promise<AgentInfo>

  /**
   * Call an agent with the given parameters
   * @param serverUrl - The server URL
   * @param params - Agent call parameters
   * @param retryConfig - Retry configuration
   * @returns Promise<any> - Agent response
   */
  abstract callAgent(
    serverUrl: string,
    params: AgentCallParams,
    retryConfig: RetryConfig,
  ): Promise<unknown>

  /**
   * Validate server connectivity
   * @param serverUrl - The server URL to validate
   * @returns Promise<boolean> - true if server is accessible
   */
  abstract validateConnection(serverUrl: string): Promise<boolean>
}
