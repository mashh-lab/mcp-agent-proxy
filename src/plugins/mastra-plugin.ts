import { MastraClient } from '@mastra/client-js'
import {
  BaseServerPlugin,
  AgentInfo,
  AgentCallParams,
  RetryConfig,
} from './base-plugin.js'

/**
 * Plugin for Mastra agent servers
 */
export class MastraPlugin extends BaseServerPlugin {
  readonly serverType = 'mastra'

  /**
   * Detect if a server is a Mastra server by trying to connect and get agents
   */
  async detectServerType(serverUrl: string): Promise<boolean> {
    try {
      const client = new MastraClient({
        baseUrl: serverUrl,
        retries: 1,
        backoffMs: 100,
        maxBackoffMs: 500,
      })

      // Try to get agents - this is the Mastra-specific endpoint
      await client.getAgents()
      return true
    } catch {
      return false
    }
  }

  /**
   * Get agents from a Mastra server
   */
  async getAgents(
    serverUrl: string,
    retryConfig: RetryConfig,
  ): Promise<AgentInfo[]> {
    const client = new MastraClient({
      baseUrl: serverUrl,
      retries: retryConfig.retries,
      backoffMs: retryConfig.backoffMs,
      maxBackoffMs: retryConfig.maxBackoffMs,
    })

    const agentsData = await client.getAgents()

    return Object.keys(agentsData).map((agentId) => ({
      id: agentId,
      name: agentsData[agentId]?.name || agentId,
      description: undefined, // Mastra agents don't have description in getAgents() response
      fullyQualifiedId: `${this.getServerName(serverUrl)}:${agentId}`,
    }))
  }

  /**
   * Get detailed information about a specific agent
   */
  async getAgentDescription(
    serverUrl: string,
    agentId: string,
    retryConfig: RetryConfig,
  ): Promise<AgentInfo> {
    const client = new MastraClient({
      baseUrl: serverUrl,
      retries: retryConfig.retries,
      backoffMs: retryConfig.backoffMs,
      maxBackoffMs: retryConfig.maxBackoffMs,
    })

    const agentsData = await client.getAgents()
    const agentData = agentsData[agentId]

    if (!agentData) {
      throw new Error(`Agent '${agentId}' not found on Mastra server`)
    }

    return {
      id: agentId,
      name: agentData.name || agentId,
      description: undefined, // Mastra agents don't have description in getAgents() response
      fullyQualifiedId: `${this.getServerName(serverUrl)}:${agentId}`,
    }
  }

  /**
   * Call a Mastra agent
   */
  async callAgent(
    serverUrl: string,
    params: AgentCallParams,
    retryConfig: RetryConfig,
  ): Promise<unknown> {
    const client = new MastraClient({
      baseUrl: serverUrl,
      retries: retryConfig.retries,
      backoffMs: retryConfig.backoffMs,
      maxBackoffMs: retryConfig.maxBackoffMs,
    })

    const agent = client.getAgent(params.agentId)

    const interactionParams = {
      messages: params.messages,
      ...(params.threadId && { threadId: params.threadId }),
      ...(params.resourceId && { resourceId: params.resourceId }),
      ...params.agentOptions,
    }

    if (params.interactionType === 'generate') {
      return await agent.generate(interactionParams)
    } else if (params.interactionType === 'stream') {
      // Proper streaming implementation - collect chunks as they arrive
      const chunks: Array<{
        content: unknown
        timestamp: string
        index: number
      }> = []

      let chunkIndex = 0
      const startTime = new Date()

      try {
        // Get the stream from the agent
        const streamResponse = await agent.stream(interactionParams)

        // Process the data stream using Mastra's API
        await streamResponse.processDataStream({
          onTextPart: (textPart: string) => {
            chunks.push({
              content: textPart,
              timestamp: new Date().toISOString(),
              index: chunkIndex++,
            })
          },
          onDataPart: (dataPart: unknown) => {
            chunks.push({
              content: dataPart,
              timestamp: new Date().toISOString(),
              index: chunkIndex++,
            })
          },
          onErrorPart: (errorPart: unknown) => {
            chunks.push({
              content: { error: errorPart },
              timestamp: new Date().toISOString(),
              index: chunkIndex++,
            })
          },
        })

        const endTime = new Date()
        const totalDuration = endTime.getTime() - startTime.getTime()

        return {
          type: 'collected_stream',
          chunks,
          summary: {
            totalChunks: chunks.length,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            durationMs: totalDuration,
            note: 'Stream was collected in real-time with timestamps. Each chunk was processed as it arrived from the agent.',
          },
        }
      } catch (streamError) {
        // If streaming fails, collect what we have so far
        const endTime = new Date()
        return {
          type: 'partial_stream',
          chunks,
          summary: {
            totalChunks: chunks.length,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            durationMs: endTime.getTime() - startTime.getTime(),
            error:
              streamError instanceof Error
                ? streamError.message
                : 'Unknown streaming error',
            note: 'Stream was partially collected before encountering an error.',
          },
        }
      }
    } else {
      throw new Error(`Invalid interaction type: ${params.interactionType}`)
    }
  }

  /**
   * Validate connection to a Mastra server
   */
  async validateConnection(serverUrl: string): Promise<boolean> {
    try {
      const client = new MastraClient({
        baseUrl: serverUrl,
        retries: 1,
        backoffMs: 100,
        maxBackoffMs: 500,
      })

      await client.getAgents()
      return true
    } catch {
      return false
    }
  }

  /**
   * Helper to extract server name from URL for qualified IDs
   */
  private getServerName(serverUrl: string): string {
    // This is a simplified approach - in practice, this would be resolved
    // from the server mappings in the config
    try {
      const url = new URL(serverUrl)
      return `${url.hostname}:${url.port || '80'}`
    } catch {
      return 'unknown'
    }
  }
}
