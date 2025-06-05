import { Client } from '@langchain/langgraph-sdk'
import {
  BaseServerPlugin,
  AgentInfo,
  AgentCallParams,
  RetryConfig,
} from '../base-plugin.js'
import { UrlUtils } from '../utils/url-utils.js'
import { StreamingUtils, StreamChunk } from '../utils/streaming-utils.js'
import { ErrorUtils } from '../utils/error-utils.js'

/**
 * Plugin for LangGraph agent servers
 */
export class LangGraphPlugin extends BaseServerPlugin {
  readonly serverType = 'langgraph'

  /**
   * Detect if a server is a LangGraph server by trying to connect and list assistants
   */
  async detectServerType(serverUrl: string): Promise<boolean> {
    try {
      const client = new Client({ apiUrl: serverUrl })

      // Try to search assistants - this is the LangGraph-specific endpoint
      await client.assistants.search({ limit: 1 })
      return true
    } catch (error) {
      // Log connection failures for debugging
      if (error instanceof Error) {
        console.debug(
          `LangGraph connection failed for ${serverUrl}: ${error.message}`,
        )
      }
      return false
    }
  }

  /**
   * Get agents (assistants) from a LangGraph server
   */
  async getAgents(
    serverUrl: string,
    // Note: LangGraph SDK doesn't currently support retry configuration
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _retryConfig: RetryConfig,
  ): Promise<AgentInfo[]> {
    const client = new Client({ apiUrl: serverUrl })

    // Get all assistants from the LangGraph server
    const assistants = await client.assistants.search({
      limit: 100, // Get up to 100 assistants
      offset: 0,
    })

    return assistants
      .filter((assistant) => assistant != null)
      .map((assistant) => {
        // Use graph_id as the agent ID since that's what we call in LangGraph
        const agentId = assistant.graph_id || assistant.assistant_id
        const description = assistant.metadata?.description
        return {
          id: agentId,
          name: assistant.name || agentId,
          description:
            typeof description === 'string' ? description : undefined,
          fullyQualifiedId: `${UrlUtils.getServerName(serverUrl)}:${agentId}`,
        }
      })
  }

  /**
   * Get detailed information about a specific agent (assistant)
   */
  async getAgentDescription(
    serverUrl: string,
    agentId: string,
    // Note: LangGraph SDK doesn't currently support retry configuration
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _retryConfig: RetryConfig,
  ): Promise<AgentInfo> {
    const client = new Client({ apiUrl: serverUrl })

    // Find the assistant by graph_id or assistant_id
    const assistantId = await this.findAssistantId(client, agentId)

    if (!assistantId) {
      throw ErrorUtils.agentNotFound(agentId, this.serverType, serverUrl)
    }

    const assistant = await client.assistants.get(assistantId)
    const description = assistant.metadata?.description

    return {
      id: agentId,
      name: assistant.name || agentId,
      description: typeof description === 'string' ? description : undefined,
      fullyQualifiedId: `${UrlUtils.getServerName(serverUrl)}:${agentId}`,
    }
  }

  /**
   * Call a LangGraph agent (assistant)
   */
  async callAgent(
    serverUrl: string,
    params: AgentCallParams,
    // Note: LangGraph SDK doesn't currently support retry configuration
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _retryConfig: RetryConfig,
  ): Promise<unknown> {
    // Validate interaction type first
    if (
      params.interactionType !== 'generate' &&
      params.interactionType !== 'stream'
    ) {
      throw new Error(`Invalid interaction type: ${params.interactionType}`)
    }

    const client = new Client({ apiUrl: serverUrl })

    // Find the assistant ID for the given agent name
    const assistantId = await this.findAssistantId(client, params.agentId)

    if (!assistantId) {
      throw new Error(`Agent '${params.agentId}' not found on LangGraph server`)
    }

    // Create a thread if threadId is not provided
    let threadId = params.threadId
    if (!threadId) {
      const thread = await client.threads.create()
      threadId = thread.thread_id
    }

    // Convert messages to LangGraph format
    const langGraphMessages = params.messages.map((msg) => ({
      role:
        msg.role === 'user'
          ? 'human'
          : msg.role === 'assistant'
            ? 'ai'
            : 'system',
      content: msg.content,
    }))

    if (params.interactionType === 'generate') {
      // Create a run and wait for completion
      const run = await client.runs.create(threadId, assistantId, {
        input: {
          messages: langGraphMessages,
        },
        ...params.agentOptions,
      })

      // Poll for completion
      const maxAttempts = 30 // 30 seconds timeout
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const result = await client.runs.get(threadId, run.run_id)

        if (result.status === 'success') {
          // Get the thread state to retrieve messages
          const threadState = await client.threads.getState(threadId)
          if (threadState?.values && Array.isArray(threadState.values)) {
            // Handle case where values is an array
            const messages = threadState.values as Array<
              Record<string, unknown>
            >
            // Find the last AI message
            for (let i = messages.length - 1; i >= 0; i--) {
              const msg = messages[i]
              if (msg?.type === 'ai' || msg?.role === 'assistant') {
                return (msg.content as string) || 'No content'
              }
            }
          } else if (
            threadState?.values &&
            typeof threadState.values === 'object'
          ) {
            // Handle case where values is an object with messages property
            const valuesObj = threadState.values as Record<string, unknown>
            if (valuesObj.messages && Array.isArray(valuesObj.messages)) {
              const messages = valuesObj.messages as Array<
                Record<string, unknown>
              >
              // Find the last AI message
              for (let i = messages.length - 1; i >= 0; i--) {
                const msg = messages[i]
                if (msg?.type === 'ai' || msg?.role === 'assistant') {
                  return (msg.content as string) || 'No content'
                }
              }
            }
          }
          return 'No response content found'
        } else if (result.status === 'error') {
          // Handle error status - the error property might not exist in the type but could be present at runtime
          const errorMsg =
            (result as unknown as Record<string, unknown>).error ||
            'Unknown error'
          throw new Error(`Run failed: ${errorMsg}`)
        } else if (result.status === 'pending' || result.status === 'running') {
          // Wait 1 second before checking again
          await new Promise((resolve) => setTimeout(resolve, 1000))
          continue
        } else {
          throw new Error(`Unknown status: ${result.status}`)
        }
      }

      throw new Error('Timeout waiting for response')
    } else if (params.interactionType === 'stream') {
      // Streaming implementation
      const chunks: StreamChunk[] = []

      let chunkIndex = 0
      const startTime = new Date()

      try {
        // Create a streaming run
        const stream = client.runs.stream(threadId, assistantId, {
          input: {
            messages: langGraphMessages,
          },
          streamMode: 'values',
          ...params.agentOptions,
        })

        let responseContent = ''

        // Process the stream
        for await (const chunk of stream) {
          if (chunk.event === 'values' && chunk.data) {
            const data = chunk.data as Record<string, unknown>
            let messages: Array<Record<string, unknown>> = []

            if (Array.isArray(data)) {
              messages = data as Array<Record<string, unknown>>
            } else if (data.messages && Array.isArray(data.messages)) {
              messages = data.messages as Array<Record<string, unknown>>
            }

            // Find the last AI message
            for (let i = messages.length - 1; i >= 0; i--) {
              const msg = messages[i]
              if (msg?.type === 'ai' || msg?.role === 'assistant') {
                const newContent = (msg.content as string) || ''
                if (newContent.length > responseContent.length) {
                  // Add only the new part
                  const newPart = newContent.slice(responseContent.length)
                  chunks.push(StreamingUtils.createChunk(newPart, chunkIndex++))
                  responseContent = newContent
                }
                break
              }
            }
          }
        }

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
    }
  }

  /**
   * Validate connection to a LangGraph server
   */
  async validateConnection(serverUrl: string): Promise<boolean> {
    try {
      const client = new Client({ apiUrl: serverUrl })
      await client.assistants.search({ limit: 1 })
      return true
    } catch (error) {
      // Log connection failures for debugging
      if (error instanceof Error) {
        console.debug(
          `LangGraph connection failed for ${serverUrl}: ${error.message}`,
        )
      }
      return false
    }
  }

  /**
   * Helper to find assistant ID by agent name (graph_id)
   */
  private async findAssistantId(
    client: Client,
    agentName: string,
  ): Promise<string | null> {
    const assistants = await client.assistants.search()
    for (const assistant of assistants) {
      if (
        assistant.graph_id === agentName ||
        assistant.assistant_id === agentName
      ) {
        return assistant.assistant_id
      }
    }
    return null
  }
}
