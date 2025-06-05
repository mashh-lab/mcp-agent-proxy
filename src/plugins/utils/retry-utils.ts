import { RetryConfig } from '../base-plugin.js'

/**
 * Interface for operations that can be retried
 */
export interface RetryableOperation<T> {
  /**
   * Execute the operation
   */
  execute(): Promise<T>

  /**
   * Determine if the operation should be retried based on the error
   */
  canRetry(error: Error): boolean

  /**
   * Optional: Get operation name for logging
   */
  getOperationName?(): string
}

/**
 * Utilities for handling retry logic consistently across plugins
 */
export class RetryUtils {
  /**
   * Execute an operation with retry logic
   */
  static async executeWithRetry<T>(
    operation: RetryableOperation<T>,
    retryConfig: RetryConfig,
  ): Promise<T> {
    let lastError: Error

    for (let attempt = 0; attempt <= retryConfig.retries; attempt++) {
      try {
        return await operation.execute()
      } catch (error) {
        lastError = error as Error

        // Don't retry on the last attempt or if operation says not to retry
        if (attempt === retryConfig.retries || !operation.canRetry(lastError)) {
          throw lastError
        }

        // Calculate backoff delay with exponential backoff
        const backoff = Math.min(
          retryConfig.backoffMs * Math.pow(2, attempt),
          retryConfig.maxBackoffMs,
        )

        await new Promise((resolve) => setTimeout(resolve, backoff))
      }
    }

    throw lastError!
  }

  /**
   * Create a retryable operation for network requests
   */
  static createNetworkOperation<T>(
    operationFn: () => Promise<T>,
    operationName = 'network_operation',
  ): RetryableOperation<T> {
    return {
      execute: operationFn,
      canRetry: (error: Error) => {
        // Retry on network errors, timeouts, and temporary server errors
        const retryableErrors = [
          'ECONNRESET',
          'ECONNREFUSED',
          'ETIMEDOUT',
          'ENOTFOUND',
          'EAI_AGAIN',
        ]

        return (
          retryableErrors.some((code) => error.message.includes(code)) ||
          error.message.includes('timeout') ||
          error.message.includes('503') ||
          error.message.includes('502') ||
          error.message.includes('504')
        )
      },
      getOperationName: () => operationName,
    }
  }

  /**
   * Apply retry configuration to client creation when supported
   */
  static applyRetryConfig(
    baseConfig: Record<string, unknown>,
    retryConfig: RetryConfig,
    supportsRetry: boolean,
  ): Record<string, unknown> {
    if (!supportsRetry) {
      return baseConfig
    }

    return {
      ...baseConfig,
      retries: retryConfig.retries,
      backoffMs: retryConfig.backoffMs,
      maxBackoffMs: retryConfig.maxBackoffMs,
    }
  }
}
