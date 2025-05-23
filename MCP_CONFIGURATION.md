# MCP Client Configuration Guide

This guide shows how to configure the MCP Agent Proxy in your MCP client's configuration file (typically `mcp.json`) for each installation method.

**Important:** All environment variables are optional and have sensible defaults. The proxy automatically connects to `http://localhost:4111` if no `MASTRA_SERVERS` is specified.

## Quick Start Examples

### Minimal Configuration (Zero Setup!)

Perfect for standard Mastra setups:

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "pnpx",
      "args": ["@mashh/mcp-agent-proxy"]
    }
  }
}
```

This automatically connects to `http://localhost:4111` - no environment variables needed!

### Method 1: PNPX (Recommended - No Installation Required!)

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "pnpx",
      "args": ["@mashh/mcp-agent-proxy"],
      "env": {
        "MASTRA_SERVERS": "http://localhost:4111 http://localhost:4222"
      }
    }
  }
}
```

### Method 2: NPX (Alternative - No Installation Required!)

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

### Method 3: Global Installation (Legacy)

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

### Method 4: From Source (Development)

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

## Advanced Configuration Examples

### Multiple Mastra Servers (Different Ports)

Connect to multiple local Mastra servers running on different ports:

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "pnpx",
      "args": ["@mashh/mcp-agent-proxy"],
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
      "command": "pnpx",
      "args": ["@mashh/mcp-agent-proxy"],
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

### Comma-Separated Format (Alternative)

You can also use comma-separated URLs if you prefer:

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "pnpx",
      "args": ["@mashh/mcp-agent-proxy"],
      "env": {
        "MASTRA_SERVERS": "http://localhost:4111,http://localhost:4222,http://localhost:4333"
      }
    }
  }
}
```

## Network Effect Examples

### 🔗 Recursive Agent Networks

For advanced users wanting to create **agents that can access other agent networks**, see these examples:

- `examples/mastra-server-with-mcp.js` - Mastra server code that connects to other agent networks
- `examples/network-effect-config.json` - MCP client configuration for connecting to network-aware servers

This enables **exponential connectivity** where:

1. Your MCP client connects to one proxy
2. That proxy connects to a Mastra server
3. That server's agents can access other Mastra servers the same way via their own proxy
4. Creating unlimited recursive access to distributed AI capabilities across agent networks.

**Use cases:**

- Cross-environment testing (dev/staging/prod)
- Workflow orchestration across multiple agent networks
- Building the "Internet of Agents" with recursive connectivity

## Cloud/Deployed Server Examples

The MCP Agent Proxy can seamlessly connect to **any Mastra API server**, regardless of where it's deployed. This enables powerful hybrid setups where you can access both development and production agents simultaneously across any combination of local servers, cloud providers, and deployment platforms.

### 📁 Ready-to-Use Examples

**Vercel-Specific Examples:**

- `examples/vercel-config.json` - Single Vercel deployment
- `examples/vercel-localhost-config.json` - Vercel + local development
- `examples/vercel-multi-env-config.json` - Production + staging + local environments

**Generic Cloud Examples:**

- `examples/cloud-config.json` - Any cloud provider
- `examples/cloud-localhost-config.json` - Any cloud + local

### Single Cloud Server

Connect to any deployed Mastra server (examples using different providers):

**Vercel:**

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "pnpx",
      "args": ["@mashh/mcp-agent-proxy"],
      "env": {
        "MASTRA_SERVERS": "https://your-mastra-app.vercel.app"
      }
    }
  }
}
```

**Any Cloud Provider:**

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "pnpx",
      "args": ["@mashh/mcp-agent-proxy"],
      "env": {
        "MASTRA_SERVERS": "https://your-mastra-app.anycloudprovider.com"
      }
    }
  }
}
```

**Custom Domain/Server:**

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "pnpx",
      "args": ["@mashh/mcp-agent-proxy"],
      "env": {
        "MASTRA_SERVERS": "https://api.yourcompany.com"
      }
    }
  }
}
```

### Hybrid: Cloud + Local Development

Perfect for accessing both production agents (any cloud provider) and local development servers:

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "pnpx",
      "args": ["@mashh/mcp-agent-proxy"],
      "env": {
        "MASTRA_SERVERS": "https://your-mastra-app.example.com http://localhost:4111"
      }
    }
  }
}
```

This configuration allows you to:

- Test against production agents while developing
- Compare local vs deployed agent behavior
- Access different agent variants across environments
- Handle agent conflicts gracefully (use fully qualified IDs like `server0:agentName`)

### Multiple Cloud Providers

Mix any combination of cloud providers and deployment platforms:

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "pnpx",
      "args": ["@mashh/mcp-agent-proxy"],
      "env": {
        "MASTRA_SERVERS": "https://prod.vercel.app https://staging.vercel.app https://dev.yourcompany.com http://localhost:4111"
      }
    }
  }
}
```

### Production vs Staging vs Development

Organize multiple environments across any hosting providers:

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "pnpx",
      "args": ["@mashh/mcp-agent-proxy"],
      "env": {
        "MASTRA_SERVERS": "https://prod.yourcompany.com https://staging.yourcompany.com http://localhost:4111"
      }
    }
  }
}
```

### Self-Hosted/Private Server Scenarios

Works with any self-hosted or private Mastra deployments:

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "pnpx",
      "args": ["@mashh/mcp-agent-proxy"],
      "env": {
        "MASTRA_SERVERS": "https://agents.internal.company.com:8443 http://localhost:4111"
      }
    }
  }
}
```

**Key Point:** The proxy works with **any HTTP-accessible Mastra server**. Whether it's deployed on Vercel, AWS, Google Cloud, Azure, a private server, or running locally - if it exposes the Mastra API over HTTP/HTTPS, the proxy can connect to it. Vercel is used in our examples, but any cloud provider or hosting solution will work.

**Note:** When connecting to multiple servers with the same agent names, the proxy automatically detects conflicts and provides fully qualified agent IDs (e.g., `server0:weatherAgent`, `server1:weatherAgent`) to avoid ambiguity.

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

### Environment Variables (All Optional)

| Variable         | Description        | Default                 | Example                                              |
| ---------------- | ------------------ | ----------------------- | ---------------------------------------------------- |
| `MASTRA_SERVERS` | Mastra server URLs | `http://localhost:4111` | `https://your-api.example.com http://localhost:4111` |

### Other Optional Variables (All Have Defaults)

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

### 3. Port Configuration

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

3. **Mastra server connection failures**
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

### Health and Status Endpoints

The proxy provides monitoring endpoints for troubleshooting:

```bash
# Quick health check (fast, basic liveness)
curl http://localhost:3001/health | jq .

# Full status with agent information (slower, comprehensive)
curl http://localhost:3001/status | jq .

# Using pnpm scripts (if in project directory)
pnpm health:json     # Health check
pnpm status:json     # Status check
pnpm check           # Both
```

Use the `/status` endpoint to verify:

- Mastra server connectivity
- Available agents and conflicts
- Server response times
- Configuration issues

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

### Minimal Configuration (Zero Setup)

Perfect for standard local Mastra development:

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "mcp-agent-proxy"
    }
  }
}
```

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

### Cloud Deployed Server

Connect to any deployed Mastra server (works with any cloud provider):

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "mcp-agent-proxy",
      "env": {
        "MASTRA_SERVERS": "https://your-mastra-app.example.com"
      }
    }
  }
}
```

### Hybrid: Production + Development

Access both your deployed agents and local development servers:

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "mcp-agent-proxy",
      "env": {
        "MASTRA_SERVERS": "https://your-mastra-app.example.com http://localhost:4111"
      }
    }
  }
}
```

### Command Not Found (`spawn mcp-agent-proxy ENOENT`)

If you see errors like `spawn mcp-agent-proxy ENOENT` in your MCP client logs, it means the client can't find the `mcp-agent-proxy` command. This is common with Claude Desktop.

#### **Solution: Use Absolute Path (Recommended)**

Find the absolute path to your globally installed package:

```bash
# For npm global installs
which mcp-agent-proxy

# For pnpm global installs
which mcp-agent-proxy
```

Then use the absolute path in your `mcp.json`:

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "/Users/yourusername/.pnpm/mcp-agent-proxy",
      "env": {
        "MASTRA_SERVERS": "http://localhost:4111"
      }
    }
  }
}
```

This method works reliably across all MCP clients because it doesn't depend on PATH configuration.

#### **Alternative: Local Installation (If needed)**

If global installation doesn't work, install locally:

```bash
# In your MCP client directory
npm install @mashh/mcp-agent-proxy
```

Then use:

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "npx",
      "args": ["@mashh/mcp-agent-proxy"],
      "env": {
        "MASTRA_SERVERS": "http://localhost:4111"
      }
    }
  }
}
```

### Port Conflicts

If port 3001 is in use:

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "mcp-agent-proxy",
      "env": {
        "MASTRA_SERVERS": "http://localhost:4111",
        "MCP_SERVER_PORT": "3002"
      }
    }
  }
}
```
