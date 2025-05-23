# Installation Guide

This guide covers installation methods and basic setup for the MCP Agent Proxy.

## Quick Start

Choose your preferred installation method:

### Method 1: PNPX (Recommended - No Installation Required!)

**Zero installation needed!** Just add the configuration:

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "pnpx",
      "args": ["@mashh/mcp-agent-proxy"],
      "env": {
        "MASTRA_SERVERS": "http://localhost:4111"
      }
    }
  }
}
```

**Or use minimal configuration (zero setup):**

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

### Method 2: NPX (Alternative - No Installation Required!)

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

### Method 3: Global Installation (Legacy)

If you prefer global installation:

```bash
# Using pnpm
pnpm add -g @mashh/mcp-agent-proxy

# Or using npm
npm install -g @mashh/mcp-agent-proxy
```

**Configuration:**

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

### Method 4: From Source

### Clone and build

```bash
git clone https://github.com/mashh-lab/mcp-agent-proxy.git
cd mcp-agent-proxy
pnpm install
pnpm build
```

### Run from source

```bash
pnpm start
```

### MCP Client Configuration (Source)

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-agent-proxy/dist/mcp-server.js"],
      "env": {
        "MASTRA_SERVERS": "http://localhost:4111"
      }
    }
  }
}
```

## Environment Variables

All environment variables are optional and have sensible defaults:

- **`MASTRA_SERVERS`** - Mastra server URLs (multiple formats supported). **Default: `http://localhost:4111`**

### Format Options

### MASTRA_SERVERS Format Options

The `MASTRA_SERVERS` environment variable supports multiple formats for flexibility:

**Space-separated (recommended):**

```json
"MASTRA_SERVERS": "http://localhost:4111 http://localhost:4222"
```

**Comma-separated:**

```json
"MASTRA_SERVERS": "http://localhost:4111,http://localhost:4222"
```

**Mixed (comma + space):**

```json
"MASTRA_SERVERS": "http://localhost:4111, http://localhost:4222"
```

## Next Steps

1. **Start your Mastra servers** on the configured ports
2. **Add the configuration** to your MCP client's `mcp.json`
3. **Test the connection** by using MCP client features

## Testing Your Installation

You can test your installation using the built-in health and status checks:

```bash
# Quick one-shot tests (no background server needed)
pnpm health:oneshot  # Test basic server functionality
pnpm status:oneshot  # Test server + agent connectivity
pnpm check:oneshot   # Test both health and status

# Traditional tests (requires running server)
pnpm start &         # Start server in background
pnpm health:json     # Test health endpoint
pnpm status:json     # Test status endpoint
pnpm check           # Test both endpoints
```

The one-shot scripts are perfect for quick testing as they automatically start the server, run the tests, and clean up without leaving background processes.

## Getting Help

- Check our [MCP Configuration Guide](MCP_CONFIGURATION.md) for detailed examples
- Review [Contributing Guidelines](CONTRIBUTING.md) for development setup
- Open an issue on [GitHub](https://github.com/mashh-lab/mcp-agent-proxy/issues) for support

---

## Command Line Usage

For quick testing, you can run directly:

```bash
# Zero configuration (uses default http://localhost:4111)
mcp-agent-proxy

# Or with custom servers
MASTRA_SERVERS="http://localhost:4111" mcp-agent-proxy
```

## Method 1: PNPX Package (Recommended)

### Global Installation

```bash
pnpm add -g @mashh/mcp-agent-proxy
```

### Local Installation

```bash
pnpm add @mashh/mcp-agent-proxy
```

### Usage after PNPX installation

```bash
# Global installation
mcp-agent-proxy

# Local installation (use scoped name with pnpm exec)
pnpm exec @mashh/mcp-agent-proxy

# Or in package.json scripts
{
  "scripts": {
    "start-proxy": "mcp-agent-proxy"
  }
}
```

### MCP Client Configuration (PNPX)

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "pnpx",
      "args": ["@mashh/mcp-agent-proxy"],
      "env": {
        "MASTRA_SERVERS": "http://localhost:4111"
      }
    }
  }
}
```

## Method 2: NPX Package (Alternative)

**No installation required!** Use `npx` to run the package directly.

### MCP Client Configuration (NPX)

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

## Method 3: Global Installation (Legacy)

Only use this if you need global installation for some reason:

### Global Installation

```bash
# Using pnpm
pnpm add -g @mashh/mcp-agent-proxy

# Or using npm
npm install -g @mashh/mcp-agent-proxy
```

### MCP Client Configuration (Global)

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

## Environment Configuration

Configure environment variables in your MCP client's configuration file (typically `mcp.json`):

### Environment Variables (All Optional)

- **`MASTRA_SERVERS`** - Mastra server URLs (multiple formats supported). **Default: `http://localhost:4111`**

### Other Optional Variables (All Have Defaults)

- **`MCP_SERVER_PORT`** - MCP proxy server port (default: `3001`)
- **`MASTRA_CLIENT_RETRIES`** - Client retry attempts (default: `3`)
- **`MASTRA_CLIENT_BACKOFF_MS`** - Initial backoff delay (default: `300`)
- **`MASTRA_CLIENT_MAX_BACKOFF_MS`** - Maximum backoff delay (default: `5000`)
- **`MCP_SSE_PATH`** - SSE endpoint path (default: `/mcp/sse`)
- **`MCP_MESSAGE_PATH`** - Message endpoint path (default: `/mcp/message`)
- **`MCP_TRANSPORT`** - Transport method (default: `http`)

### Example Configuration

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

## Verification

Test your installation:

```bash
# Check if server starts
mcp-agent-proxy --help

# Test with default configuration (no env vars needed)
mcp-agent-proxy

# Test with custom environment variables
MASTRA_SERVERS="http://localhost:4111" mcp-agent-proxy

# Check health and status (if server is running)
pnpm health:json     # Quick health check
curl http://localhost:3001/status | jq .
```

## Troubleshooting

### Common Issues

1. **Network connection failures**

   - Ensure target Mastra servers are running and accessible
   - Check firewall settings and network connectivity

2. **Port conflicts**

   - Change `MCP_SERVER_PORT` if 3001 is in use
   - Check with: `lsof -i :3001`

3. **Mastra server connection failures**
   - Verify each server URL in `MASTRA_SERVERS` is accessible
   - Check if Mastra servers are running on specified ports

### Legacy Installation Issues

If you're using the legacy global installation method and get command not found errors:

1. **Find the absolute path** to your global installation:

   ```bash
   which mcp-agent-proxy
   ```

2. **Use the absolute path** in your MCP configuration:
   ```json
   {
     "mcpServers": {
       "mastra-agent-proxy": {
         "command": "/absolute/path/to/mcp-agent-proxy"
       }
     }
   }
   ```

**Recommendation:** Switch to the `pnpx` method to avoid these issues entirely.

**→ For detailed troubleshooting see [MCP_CONFIGURATION.md](MCP_CONFIGURATION.md#troubleshooting)**
