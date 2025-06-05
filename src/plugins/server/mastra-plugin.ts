import { MastraClient } from '@mastra/client-js'
import {
  BaseServerPlugin,
  AgentInfo,
  AgentCallParams,
  RetryConfig,
} from '../base-plugin.js'
import { UrlUtils } from '../utils/url-utils.js'
import { StreamingUtils, StreamChunk } from '../utils/streaming-utils.js'
import { RetryUtils } from '../utils/retry-utils.js'
import { ErrorUtils } from '../utils/error-utils.js'

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
    } catch (error) {
      // Log connection failures for debugging
      if (error instanceof Error) {
        console.debug(
          `Mastra connection failed for ${serverUrl}: ${error.message}`,
        )
      }
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
    const clientConfig = RetryUtils.applyRetryConfig(
      { baseUrl: serverUrl },
      retryConfig,
      true, // Mastra supports retry config
    )
    const client = new MastraClient(clientConfig)

    const agentsData = await client.getAgents()

    return Object.keys(agentsData).map((agentId) => ({
      id: agentId,
      name: agentsData[agentId]?.name || agentId,
      description: undefined, // Mastra agents don't have description in getAgents() response
      fullyQualifiedId: `${UrlUtils.getServerName(serverUrl)}:${agentId}`,
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
    const clientConfig = RetryUtils.applyRetryConfig(
      { baseUrl: serverUrl },
      retryConfig,
      true, // Mastra supports retry config
    )
    const client = new MastraClient(clientConfig)

    const agentsData = await client.getAgents()
    const agentData = agentsData[agentId]

    if (!agentData) {
      throw ErrorUtils.agentNotFound(agentId, this.serverType, serverUrl)
    }

    return {
      id: agentId,
      name: agentData.name || agentId,
      description: undefined, // Mastra agents don't have description in getAgents() response
      fullyQualifiedId: `${UrlUtils.getServerName(serverUrl)}:${agentId}`,
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
    const clientConfig = RetryUtils.applyRetryConfig(
      { baseUrl: serverUrl },
      retryConfig,
      true, // Mastra supports retry config
    )
    const client = new MastraClient(clientConfig)

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
      const chunks: StreamChunk[] = []

      let chunkIndex = 0
      const startTime = new Date()

      try {
        // Get the stream from the agent
        const streamResponse = await agent.stream(interactionParams)

        // Process the data stream using Mastra's API
        await streamResponse.processDataStream({
          onTextPart: (textPart: string) => {
            chunks.push(StreamingUtils.createChunk(textPart, chunkIndex++))
          },
          onDataPart: (dataPart: unknown) => {
            chunks.push(StreamingUtils.createChunk(dataPart, chunkIndex++))
          },
          onErrorPart: (errorPart: unknown) => {
            chunks.push(
              StreamingUtils.createChunk({ error: errorPart }, chunkIndex++),
            )
          },
        })

        const endTime = new Date()

        return StreamingUtils.createStreamResponse(
          'collected_stream',
          chunks,
          startTime,
          endTime,
        )
      } catch (streamError) {
        // If streaming fails, collect what we have so far
        const endTime = new Date()
        const errorMessage =
          streamError instanceof Error
            ? streamError.message
            : 'Unknown streaming error'

        return StreamingUtils.createStreamResponse(
          'partial_stream',
          chunks,
          startTime,
          endTime,
          errorMessage,
        )
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
    } catch (error) {
      // Log connection failures for debugging
      if (error instanceof Error) {
        console.debug(
          `Mastra connection failed for ${serverUrl}: ${error.message}`,
        )
      }
      return false
    }
  }
}
