/**
 * Common interfaces and utilities for streaming operations
 */

export interface StreamChunk {
  content: unknown
  timestamp: string
  index: number
}

export interface StreamSummary {
  totalChunks: number
  startTime: string
  endTime: string
  durationMs: number
  note: string
  error?: string
}

export interface StreamResponse {
  type: 'collected_stream' | 'partial_stream'
  chunks: StreamChunk[]
  summary: StreamSummary
}

/**
 * Utilities for creating consistent streaming responses
 */
export class StreamingUtils {
  /**
   * Create a standardized stream response
   */
  static createStreamResponse(
    type: 'collected_stream' | 'partial_stream',
    chunks: StreamChunk[],
    startTime: Date,
    endTime: Date,
    error?: string,
  ): StreamResponse {
    return {
      type,
      chunks,
      summary: {
        totalChunks: chunks.length,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        durationMs: endTime.getTime() - startTime.getTime(),
        note:
          type === 'collected_stream'
            ? 'Stream was collected in real-time with timestamps. Each chunk was processed as it arrived from the agent.'
            : 'Stream was partially collected before encountering an error.',
        ...(error && { error }),
      },
    }
  }

  /**
   * Create a new stream chunk with timestamp
   */
  static createChunk(content: unknown, index: number): StreamChunk {
    return {
      content,
      timestamp: new Date().toISOString(),
      index,
    }
  }
}
