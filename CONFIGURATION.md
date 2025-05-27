# Configuration Guide

Advanced configuration options for the MCP Mastra Agent Proxy.

## Environment Variables

### Core Variables

| Variable          | Default                 | Description                       |
| ----------------- | ----------------------- | --------------------------------- |
| `AGENT_SERVERS`   | `http://localhost:4111` | Space/comma-separated server URLs |
| `MCP_SERVER_PORT` | `3001`                  | Proxy server port                 |
| `MCP_TRANSPORT`   | `http`                  | Transport method (stdio/http)     |

### Advanced Variables

| Variable                       | Default        | Description                             |
| ------------------------------ | -------------- | --------------------------------------- |
| `MASTRA_CLIENT_RETRIES`        | `3`            | Client retry attempts for agent servers |
| `MASTRA_CLIENT_BACKOFF_MS`     | `300`          | Initial backoff delay (milliseconds)    |
| `MASTRA_CLIENT_MAX_BACKOFF_MS` | `5000`         | Maximum backoff delay (milliseconds)    |
| `MCP_SSE_PATH`                 | `/mcp/sse`     | SSE endpoint path                       |
| `MCP_MESSAGE_PATH`             | `/mcp/message` | Message endpoint path                   |

## Server URL Formats

The `AGENT_SERVERS` environment variable supports multiple formats:

**Space-separated (recommended):**

```bash
AGENT_SERVERS="http://localhost:4111 http://localhost:4222"
```

**Comma-separated:**

```bash
AGENT_SERVERS="http://localhost:4111,http://localhost:4222"
```

**Mixed:**

```bash
AGENT_SERVERS="http://localhost:4111, http://localhost:4222"
```

## Platform-Specific Notes

### Windows

Use standard NPX configuration - no special setup required:

```json
{
  "mcpServers": {
    "mcpAgentProxy": {
      "command": "npx",
      "args": ["@mashh/mcp-agent-proxy"],
      "env": {
        "AGENT_SERVERS": "http://localhost:4111"
      }
    }
  }
}
```

### macOS/Linux

Same as Windows - NPX works consistently across platforms.

## Advanced Configuration

### Full Configuration Example

```json
{
  "mcpServers": {
    "mcpAgentProxy": {
      "command": "npx",
      "args": ["@mashh/mcp-agent-proxy"],
      "env": {
        "AGENT_SERVERS": "http://localhost:4111 http://localhost:4222",
        "MCP_SERVER_PORT": "3001",
        "MASTRA_CLIENT_RETRIES": "5",
        "MASTRA_CLIENT_BACKOFF_MS": "500",
        "MASTRA_CLIENT_MAX_BACKOFF_MS": "10000",
        "MCP_SSE_PATH": "/mcp/sse",
        "MCP_MESSAGE_PATH": "/mcp/message",
        "MCP_TRANSPORT": "http"
      }
    }
  }
}
```

### Debug Configuration

Enable debug logging:

```json
{
  "mcpServers": {
    "mcpAgentProxy": {
      "command": "npx",
      "args": ["@mashh/mcp-agent-proxy"],
      "env": {
        "AGENT_SERVERS": "http://localhost:4111",
        "DEBUG": "mastra:*",
        "NODE_ENV": "development"
      }
    }
  }
}
```

## Health Monitoring

The proxy provides monitoring endpoints:

```bash
# Quick health check
curl http://localhost:3001/health | jq .

# Full status with agent information
curl http://localhost:3001/status | jq .
```

## Troubleshooting

### Common Issues

1. **Port conflicts** - Change `MCP_SERVER_PORT` if 3001 is in use
2. **Connection failures** - Verify agent servers are running and accessible
3. **NPX issues** - Clear cache with `npx clear-npx-cache`

### Testing Configuration

```bash
# Test server starts
npx @mashh/mcp-agent-proxy --help

# Test with environment variables
AGENT_SERVERS="http://localhost:4111" npx @mashh/mcp-agent-proxy
```

### Debug Mode

```bash
DEBUG=mastra:* npx @mashh/mcp-agent-proxy
```
