/**
 * URL utilities for plugin operations
 */
export class UrlUtils {
  /**
   * Extract server name from URL for qualified IDs
   */
  static getServerName(serverUrl: string): string {
    try {
      const url = new URL(serverUrl)
      return `${url.hostname}:${url.port || (url.protocol === 'https:' ? '443' : '80')}`
    } catch {
      return 'unknown'
    }
  }

  /**
   * Validate URL format
   */
  static validateUrl(serverUrl: string): void {
    try {
      new URL(serverUrl)
    } catch {
      throw new Error(`Invalid server URL: ${serverUrl}`)
    }
  }
}
