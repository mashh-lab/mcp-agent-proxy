/**
 * Common error types for plugin operations
 */
export class PluginError extends Error {
  constructor(
    message: string,
    public readonly serverType: string,
    public readonly serverUrl: string,
    public readonly operation: string,
    public readonly cause?: Error,
  ) {
    super(message)
    this.name = 'PluginError'
  }

  /**
   * Get a formatted error message with context
   */
  getFormattedMessage(): string {
    return `[${this.serverType}] ${this.operation} failed for ${this.serverUrl}: ${this.message}`
  }
}

/**
 * Error for when an agent is not found
 */
export class AgentNotFoundError extends PluginError {
  constructor(
    agentId: string,
    serverType: string,
    serverUrl: string,
    cause?: Error,
  ) {
    super(
      `Agent '${agentId}' not found`,
      serverType,
      serverUrl,
      'agent_lookup',
      cause,
    )
    this.name = 'AgentNotFoundError'
  }
}

/**
 * Error for connection-related issues
 */
export class ConnectionError extends PluginError {
  constructor(serverType: string, serverUrl: string, cause?: Error) {
    super('Connection failed', serverType, serverUrl, 'connection', cause)
    this.name = 'ConnectionError'
  }
}

/**
 * Error for streaming-related issues
 */
export class StreamingError extends PluginError {
  constructor(
    serverType: string,
    serverUrl: string,
    message = 'Streaming failed',
    cause?: Error,
  ) {
    super(message, serverType, serverUrl, 'streaming', cause)
    this.name = 'StreamingError'
  }
}

/**
 * Utilities for consistent error handling across plugins
 */
export class ErrorUtils {
  /**
   * Wrap an unknown error with plugin context
   */
  static wrapError(
    error: unknown,
    serverType: string,
    serverUrl: string,
    operation: string,
  ): PluginError {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new PluginError(
      message,
      serverType,
      serverUrl,
      operation,
      error as Error,
    )
  }

  /**
   * Create an agent not found error
   */
  static agentNotFound(
    agentId: string,
    serverType: string,
    serverUrl: string,
    cause?: Error,
  ): AgentNotFoundError {
    return new AgentNotFoundError(agentId, serverType, serverUrl, cause)
  }

  /**
   * Create a connection error
   */
  static connectionFailed(
    serverType: string,
    serverUrl: string,
    cause?: Error,
  ): ConnectionError {
    return new ConnectionError(serverType, serverUrl, cause)
  }

  /**
   * Create a streaming error
   */
  static streamingFailed(
    serverType: string,
    serverUrl: string,
    message?: string,
    cause?: Error,
  ): StreamingError {
    return new StreamingError(serverType, serverUrl, message, cause)
  }

  /**
   * Check if an error is retryable
   */
  static isRetryableError(error: Error): boolean {
    const retryablePatterns = [
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'timeout',
      '503',
      '502',
      '504',
      'Connection failed',
      'Network error',
    ]

    return retryablePatterns.some((pattern) =>
      error.message.toLowerCase().includes(pattern.toLowerCase()),
    )
  }
}
