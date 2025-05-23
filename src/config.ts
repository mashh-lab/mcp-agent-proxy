import { ClientOptions } from "@mastra/client-js";
import dotenv from 'dotenv';

dotenv.config(); // Load environment variables from .env file

export function loadMastraClientConfig(): ClientOptions {
  const baseUrl = process.env.MASTRA_SERVER_BASE_URL;
  if (!baseUrl) {
    console.warn("MASTRA_SERVER_BASE_URL environment variable not set. Defaulting to http://localhost:4111. This may not be intended for production.");
  }

  return {
    baseUrl: baseUrl || "http://localhost:4111", // Default if not set
    retries: parseInt(process.env.MASTRA_CLIENT_RETRIES || "3", 10),
    backoffMs: parseInt(process.env.MASTRA_CLIENT_BACKOFF_MS || "300", 10),
    maxBackoffMs: parseInt(process.env.MASTRA_CLIENT_MAX_BACKOFF_MS || "5000", 10),
    // Other ClientOptions can be added here, loaded from environment variables
  };
}

export function getMCPServerPort(): number {
    const port = parseInt(process.env.MCP_SERVER_PORT || "3001", 10);
    if (isNaN(port) || port <= 0 || port > 65535) {
        console.warn(`Invalid MCP_SERVER_PORT: ${process.env.MCP_SERVER_PORT}. Defaulting to 3001.`);
        return 3001;
    }
    return port;
}

export function getMCPPaths() {
    return {
        ssePath: process.env.MCP_SSE_PATH || '/mcp/sse',
        messagePath: process.env.MCP_MESSAGE_PATH || '/mcp/message'
    };
} 