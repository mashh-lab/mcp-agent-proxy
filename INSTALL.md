# Installation Guide

## Method 1: PNPM Package (Recommended)

### Global Installation
```bash
pnpm add -g mcp-agent-proxy
```

### Local Installation
```bash
pnpm add mcp-agent-proxy
```

### Usage after PNPM installation
```bash
# Global installation
mcp-agent-proxy

# Local installation
pnpm exec mcp-agent-proxy

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
        "MASTRA_SERVERS_CONFIG": "http://localhost:4111"
      }
    }
  }
}
```

## Method 2: NPM Package (Alternative)

### Global Installation
```bash
npm install -g mcp-agent-proxy
```

### Local Installation
```bash
npm install mcp-agent-proxy
```

### Usage after NPM installation
```bash
# Global installation
mcp-agent-proxy

# Local installation
npx mcp-agent-proxy

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
        "MASTRA_SERVERS_CONFIG": "http://localhost:4111"
      }
    }
  }
}
```

## Method 3: Docker (Containerized)

### Pull from registry
```bash
docker pull mashh/mcp-agent-proxy:latest
```

### Run with environment variables
```bash
docker run -d \
  --name mcp-agent-proxy \
  -p 3001:3001 \
  -e MASTRA_SERVERS_CONFIG=http://host.docker.internal:4111 \
  mashh/mcp-agent-proxy:latest
```

### Docker Compose
```yaml
version: '3.8'
services:
  mcp-agent-proxy:
    image: mashh/mcp-agent-proxy:latest
    ports:
      - "3001:3001"
    environment:
      - MASTRA_SERVERS_CONFIG=http://host.docker.internal:4111
    restart: unless-stopped
```

## Method 4: Standalone Binary

### Download and install
```bash
# Download latest release
curl -L https://github.com/mashh-lab/mcp-agent-proxy/releases/latest/download/mcp-agent-proxy-linux -o mcp-agent-proxy

# Make executable
chmod +x mcp-agent-proxy

# Move to PATH
sudo mv mcp-agent-proxy /usr/local/bin/
```

### MCP Client Configuration (Binary)
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

## Method 5: From Source

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
        "MASTRA_SERVERS_CONFIG": "http://localhost:4111"
      }
    }
  }
}
```

## Environment Configuration

Create a `.env` file or set environment variables:

```env
# Required - Mastra server configuration (multiple formats supported)
MASTRA_SERVERS_CONFIG=http://localhost:4111 http://localhost:4222

# Optional - Server configuration
# MCP_SERVER_PORT=3001  # Default: 3001
MCP_SSE_PATH=/mcp/sse
MCP_MESSAGE_PATH=/mcp/message

# Optional - Client configuration
MASTRA_CLIENT_RETRIES=3
MASTRA_CLIENT_BACKOFF_MS=300
MASTRA_CLIENT_MAX_BACKOFF_MS=5000
```

### MASTRA_SERVERS_CONFIG Format Options

The `MASTRA_SERVERS_CONFIG` environment variable supports multiple formats for flexibility:

- **Space separated** (recommended): `http://localhost:4111 http://localhost:4222`
- **Comma separated**: `http://localhost:4111,http://localhost:4222`
- **Comma + space**: `http://localhost:4111, http://localhost:4222`

## Verification

Test your installation:

```bash
# Check if server starts
mcp-agent-proxy --help

# Test with environment variables
MASTRA_SERVERS_CONFIG=http://localhost:4111 mcp-agent-proxy
```

## Troubleshooting

### Permission Issues (Binary)
```bash
chmod +x mcp-agent-proxy
```

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