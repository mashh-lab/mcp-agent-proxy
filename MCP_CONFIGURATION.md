# MCP Client Configuration Guide

This guide shows how to configure the MCP Agent Proxy in your MCP client's configuration file (typically `mcp.json`) for each installation method.

**Important:** All environment variables are set in the `"env"` section of your `mcp.json` configuration. Only `MASTRA_SERVERS` is required - all other variables are optional with sensible defaults.

## Quick Start Examples

### Method 1: NPM/PNPM Global Installation (Recommended)

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "mcp-agent-proxy",
      "env": {
        "MASTRA_SERVERS": "http://localhost:4111 http://localhost:4222"
      }
    }
  }
}
```

### Method 2: NPM Local Installation (with npx)

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "npx",
      "args": ["@mashh/mcp-agent-proxy"],
      "env": {
        "MASTRA_SERVERS": "http://localhost:4111 http://localhost:4222"
      }
    }
  }
}
```

### Method 3: Docker Container

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-p",
        "3001:3001",
        "-e",
        "MASTRA_SERVERS=http://localhost:4111 http://localhost:4222",
        "mashh/mcp-agent-proxy:latest"
      ]
    }
  }
}
```

### Method 4: Docker with Host Network (Linux)

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "--network",
        "host",
        "-e",
        "MASTRA_SERVERS=http://localhost:4111 http://localhost:4222",
        "mashh/mcp-agent-proxy:latest"
      ]
    }
  }
}
```

### Method 5: Standalone Binary

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "/usr/local/bin/mcp-agent-proxy",
      "env": {
        "MASTRA_SERVERS": "http://localhost:4111 http://localhost:4222"
      }
    }
  }
}
```

### Method 6: From Source (Development)

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-agent-proxy/dist/mcp-server.js"],
      "env": {
        "MASTRA_SERVERS": "http://localhost:4111 http://localhost:4222"
      }
    }
  }
}
```

### Method 7: PNPM with Project Directory

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "pnpm",
      "args": ["exec", "@mashh/mcp-agent-proxy"],
      "cwd": "/path/to/your/project",
      "env": {
        "MASTRA_SERVERS": "http://localhost:4111 http://localhost:4222"
      }
    }
  }
}
```

## Advanced Configuration Examples

### Multiple Mastra Servers (Different Ports)

Connect to multiple local Mastra servers running on different ports:

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "mcp-agent-proxy",
      "env": {
        "MASTRA_SERVERS": "http://localhost:4111 http://localhost:4222 http://localhost:4333"
      }
    }
  }
}
```

### Full Configuration with All Options

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "mcp-agent-proxy",
      "env": {
        "MASTRA_SERVERS": "http://localhost:4111 http://localhost:4222",
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

### Docker with Multiple Local Mastra Servers

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-p",
        "3001:3001",
        "-e",
        "MASTRA_SERVERS=http://localhost:4111 http://localhost:4222 http://localhost:4333",
        "mashh/mcp-agent-proxy:latest"
      ]
    }
  }
}
```

### Comma-Separated Format (Alternative)

You can also use comma-separated URLs if you prefer:

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "mcp-agent-proxy",
      "env": {
        "MASTRA_SERVERS": "http://localhost:4111,http://localhost:4222,http://localhost:4333"
      }
    }
  }
}
```

## Platform-Specific Examples

### Windows (PowerShell/CMD)

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "C:\\Users\\Username\\AppData\\Roaming\\npm\\mcp-agent-proxy.cmd",
      "env": {
        "MASTRA_SERVERS": "http://localhost:4111 http://localhost:4222"
      }
    }
  }
}
```

### macOS with Homebrew Node

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "/opt/homebrew/bin/node",
      "args": ["/absolute/path/to/mcp-agent-proxy/dist/mcp-server.js"],
      "env": {
        "MASTRA_SERVERS": "http://localhost:4111 http://localhost:4222"
      }
    }
  }
}
```

### Linux with System Node

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "/usr/bin/node",
      "args": ["/home/user/mcp-agent-proxy/dist/mcp-server.js"],
      "env": {
        "MASTRA_SERVERS": "http://localhost:4111 http://localhost:4222"
      }
    }
  }
}
```

## Environment Variables Reference

### Required Variable

| Variable         | Description        | Example                                       |
| ---------------- | ------------------ | --------------------------------------------- |
| `MASTRA_SERVERS` | Mastra server URLs | `http://localhost:4111 http://localhost:4222` |

### Optional Variables (All Have Defaults)

| Variable                       | Description                              | Default        | Example        |
| ------------------------------ | ---------------------------------------- | -------------- | -------------- |
| `MCP_SERVER_PORT`              | Port for MCP proxy server                | `3001`         | `3001`         |
| `MASTRA_CLIENT_RETRIES`        | Client retry attempts for Mastra servers | `3`            | `5`            |
| `MASTRA_CLIENT_BACKOFF_MS`     | Initial backoff delay (milliseconds)     | `300`          | `500`          |
| `MASTRA_CLIENT_MAX_BACKOFF_MS` | Maximum backoff delay (milliseconds)     | `5000`         | `10000`        |
| `MCP_SSE_PATH`                 | SSE endpoint path                        | `/mcp/sse`     | `/mcp/sse`     |
| `MCP_MESSAGE_PATH`             | Message endpoint path                    | `/mcp/message` | `/mcp/message` |
| `MCP_TRANSPORT`                | Transport method (stdio or http)         | `http`         | `stdio`        |

## Configuration Best Practices

### 1. Use Absolute Paths

Always use absolute paths for `command` and file arguments to avoid working directory issues:

✅ **Good:**

```json
"command": "/usr/local/bin/mcp-agent-proxy"
```

❌ **Avoid:**

```json
"command": "mcp-agent-proxy",
"cwd": "/some/relative/path"
```

### 2. Multiple Mastra Servers

Separate multiple server URLs with spaces or commas:

**Space-separated (recommended):**

```json
"MASTRA_SERVERS": "http://localhost:4111 http://localhost:4222 http://localhost:4333"
```

**Comma-separated:**

```json
"MASTRA_SERVERS": "http://localhost:4111,http://localhost:4222,http://localhost:4333"
```

### 3. Docker Networking

- **macOS/Windows**: Use `localhost` to access host services
- **Linux**: Use `--network host` or connect containers to same network

### 4. Port Configuration

The proxy server uses port 3001 by default. Only change this if you have conflicts:

```json
"env": {
  "MASTRA_SERVERS": "http://localhost:4111",
  "MCP_SERVER_PORT": "3002"
}
```

## Troubleshooting

### Common Issues

1. **Command not found**

   - Ensure the command is in PATH or use absolute path
   - For global npm installs, check: `npm config get prefix`

2. **Port conflicts**

   - Change `MCP_SERVER_PORT` if 3001 is in use
   - Check with: `lsof -i :3001`

3. **Docker connection issues**

   - Use `localhost` on macOS/Windows
   - Use `--network host` on Linux
   - Ensure Docker daemon is running

4. **Mastra server connection failures**
   - Verify each server URL in `MASTRA_SERVERS` is accessible
   - Check if Mastra servers are running on specified ports

### Debug Configuration

Enable debug logging:

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "mcp-agent-proxy",
      "env": {
        "MASTRA_SERVERS": "http://localhost:4111",
        "DEBUG": "mastra:*",
        "NODE_ENV": "development"
      }
    }
  }
}
```

## Testing Your Configuration

1. **Verify server starts:**

```bash
mcp-agent-proxy --help
```

2. **Test with environment variables:**

```bash
MASTRA_SERVERS="http://localhost:4111 http://localhost:4222" mcp-agent-proxy
```

3. **Check MCP client logs** for connection status and error messages.

**Note:** In production, environment variables should be set in your `mcp.json` configuration file, not as shell variables.

## Real-World Examples

### Single Mastra Server

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "mcp-agent-proxy",
      "env": {
        "MASTRA_SERVERS": "http://localhost:4111"
      }
    }
  }
}
```

### Multiple Mastra Servers

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "mcp-agent-proxy",
      "env": {
        "MASTRA_SERVERS": "http://localhost:4111 http://localhost:4222"
      }
    }
  }
}
```

### Docker with Multiple Local Servers

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-p",
        "3001:3001",
        "-e",
        "MASTRA_SERVERS=http://localhost:4111 http://localhost:4222",
        "-e",
        "MASTRA_CLIENT_RETRIES=5",
        "mashh/mcp-agent-proxy:latest"
      ]
    }
  }
}
```
