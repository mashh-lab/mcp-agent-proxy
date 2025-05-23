# Installation Guide

This guide covers installation methods and basic setup for the MCP Agent Proxy.

## Quick Start

Choose your preferred installation method:

### Method 1: PNPM (Recommended)

```bash
pnpm add -g @mashh/mcp-agent-proxy
```

**Configuration:**

```json
{
  "mcpServers": {
    "mcp-agent-proxy": {
      "command": "mcp-agent-proxy",
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
    "mcp-agent-proxy": {
      "command": "mcp-agent-proxy"
    }
  }
}
```

### Method 2: NPM

```bash
npm install -g @mashh/mcp-agent-proxy
```

**Configuration:**

```json
{
  "mcpServers": {
    "mcp-agent-proxy": {
      "command": "npx",
      "args": ["@mashh/mcp-agent-proxy"],
      "env": {
        "MASTRA_SERVERS": "http://localhost:4111"
      }
    }
  }
}
```

### Method 3: From Source

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

## Method 1: PNPM Package (Recommended)

### Global Installation

```bash
pnpm add -g @mashh/mcp-agent-proxy
```

### Local Installation

```bash
pnpm add @mashh/mcp-agent-proxy
```

### Usage after PNPM installation

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

### MCP Client Configuration (PNPM)

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

## Method 2: NPM Package (Alternative)

### Global Installation

```bash
npm install -g @mashh/mcp-agent-proxy
```

### Local Installation

```bash
npm install @mashh/mcp-agent-proxy
```

### Usage after NPM installation

```bash
# Global installation
mcp-agent-proxy

# Local installation (use scoped name with npx)
npx @mashh/mcp-agent-proxy

# Or in package.json scripts
{
  "scripts": {
    "start-proxy": "mcp-agent-proxy"
  }
}
```

### MCP Client Configuration (NPM)

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
pnpm status:json     # Full status with agent info
pnpm check           # Both health and status

# Or use curl directly
curl http://localhost:3001/health | jq .
curl http://localhost:3001/status | jq .
```

## Troubleshooting

### Port Conflicts

```bash
MCP_SERVER_PORT=3002 mcp-agent-proxy
```

### Path Issues (Global Installation)

```bash
# For PNPM
pnpm config get prefix
echo $PATH

# For NPM
npm config get prefix
echo $PATH
```

### MASTRA_SERVERS Format Options

The `MASTRA_SERVERS` environment variable supports multiple formats for flexibility:

- **Space separated** (recommended): `http://localhost:4111 http://localhost:4222`
- **Comma separated**: `http://localhost:4111,http://localhost:4222`
- **Comma + space**: `http://localhost:4111, http://localhost:4222`
