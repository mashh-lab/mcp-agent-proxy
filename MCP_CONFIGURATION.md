# MCP Client Configuration Guide

This guide shows how to configure the MCP Agent Proxy in your MCP client's configuration file (typically `mcp.json`) for each installation method.

## Quick Start Examples

### Method 1: NPM/PNPM Global Installation (Recommended)

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "mcp-agent-proxy",
      "env": {
        "MASTRA_SERVERS_CONFIG": "http://localhost:4111 http://localhost:4222",
        "MCP_SERVER_PORT": "3001"
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
      "args": ["mcp-agent-proxy"],
      "env": {
        "MASTRA_SERVERS_CONFIG": "http://localhost:4111 http://localhost:4222"
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
        "-p", "3001:3001",
        "-e", "MASTRA_SERVERS_CONFIG=http://host.docker.internal:4111",
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
        "--network", "host",
        "-e", "MASTRA_SERVERS_CONFIG=http://localhost:4111 http://localhost:4222",
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
        "MASTRA_SERVERS_CONFIG": "http://localhost:4111"
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
        "MASTRA_SERVERS_CONFIG": "http://localhost:4111 http://localhost:4222"
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
      "args": ["exec", "mcp-agent-proxy"],
      "cwd": "/path/to/your/project",
      "env": {
        "MASTRA_SERVERS_CONFIG": "http://localhost:4111"
      }
    }
  }
}
```

## Advanced Configuration Examples

### Multiple Environment Setup

```json
{
  "mcpServers": {
    "mastra-dev": {
      "command": "mcp-agent-proxy",
      "env": {
        "MASTRA_SERVERS_CONFIG": "http://localhost:4111",
        "MCP_SERVER_PORT": "3001"
      }
    },
    "mastra-staging": {
      "command": "mcp-agent-proxy", 
      "env": {
        "MASTRA_SERVERS_CONFIG": "http://staging-server:4111",
        "MCP_SERVER_PORT": "3002"
      }
    },
    "mastra-prod": {
      "command": "docker",
      "args": [
        "run", "--rm", "-p", "3003:3001",
        "-e", "MASTRA_SERVERS_CONFIG=http://prod-server:4111",
        "mashh/mcp-agent-proxy:latest"
      ]
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
        "MASTRA_SERVERS_CONFIG": "http://localhost:4111 http://production-server:4222",
        "MCP_SERVER_PORT": "3001",
        "MASTRA_CLIENT_RETRIES": "5",
        "MASTRA_CLIENT_BACKOFF_MS": "500",
        "MASTRA_CLIENT_MAX_BACKOFF_MS": "10000",
        "MCP_TRANSPORT": "http",
        "MCP_SSE_PATH": "/mcp/sse",
        "MCP_MESSAGE_PATH": "/mcp/message",
        "NODE_ENV": "production"
      }
    }
  }
}
```

### Docker Compose Integration

If you're using Docker Compose, you can reference the service:

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "docker",
      "args": [
        "exec",
        "mcp-agent-proxy-container",
        "node", "dist/mcp-server.js"
      ]
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
        "MASTRA_SERVERS_CONFIG": "http://localhost:4111"
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
        "MASTRA_SERVERS_CONFIG": "http://localhost:4111"
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
        "MASTRA_SERVERS_CONFIG": "http://localhost:4111"
      }
    }
  }
}
```

## Environment Variables Reference

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `MASTRA_SERVERS_CONFIG` | **Required** - Mastra server URLs | None | `http://localhost:4111 http://localhost:4222` |
| `MCP_SERVER_PORT` | Port for MCP proxy server | `3001` | `3001` |
| `MASTRA_CLIENT_RETRIES` | Client retry attempts | `3` | `5` |
| `MASTRA_CLIENT_BACKOFF_MS` | Initial backoff delay | `300` | `500` |
| `MASTRA_CLIENT_MAX_BACKOFF_MS` | Maximum backoff delay | `5000` | `10000` |
| `MCP_TRANSPORT` | Transport type | `http` | `http` |
| `MCP_SSE_PATH` | SSE endpoint path | `/mcp/sse` | `/mcp/sse` |
| `MCP_MESSAGE_PATH` | Message endpoint path | `/mcp/message` | `/mcp/message` |

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

### 2. Port Management
Ensure each proxy instance uses a different port:

```json
{
  "mcpServers": {
    "proxy-dev": {
      "command": "mcp-agent-proxy",
      "env": { "MCP_SERVER_PORT": "3001" }
    },
    "proxy-prod": {
      "command": "mcp-agent-proxy", 
      "env": { "MCP_SERVER_PORT": "3002" }
    }
  }
}
```

### 3. Docker Networking
- **macOS/Windows**: Use `host.docker.internal` to access host services
- **Linux**: Use `--network host` or connect containers to same network

### 4. Multiple Mastra Servers
Separate multiple server URLs with spaces or commas:

```json
"MASTRA_SERVERS_CONFIG": "http://localhost:4111 http://localhost:4222"
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
   - Use `host.docker.internal` on macOS/Windows
   - Use `--network host` on Linux
   - Ensure Docker daemon is running

4. **Permission denied (binaries)**
   - Make binary executable: `chmod +x /path/to/binary`
   - Check file ownership and permissions

### Debug Configuration

Enable debug logging:

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "mcp-agent-proxy",
      "env": {
        "MASTRA_SERVERS_CONFIG": "http://localhost:4111",
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

2. **Test with environment:**
```bash
MASTRA_SERVERS_CONFIG=http://localhost:4111 mcp-agent-proxy
```

3. **Check MCP client logs** for connection status and error messages. 