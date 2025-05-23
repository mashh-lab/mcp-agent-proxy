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

### Method 3: Docker

```bash
docker pull mashh/mcp-agent-proxy:latest
```

**Configuration:**

```json
{
  "mcpServers": {
    "mcp-agent-proxy": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-p",
        "3001:3001",
        "-e",
        "MASTRA_SERVERS=http://localhost:4111",
        "mashh/mcp-agent-proxy:latest"
      ]
    }
  }
}
```

### Method 4: Docker Compose

Create `docker-compose.yml`:

```yaml
services:
  mcp-agent-proxy:
    image: mashh/mcp-agent-proxy:latest
    ports:
      - '3001:3001'
    environment:
      - MASTRA_SERVERS=http://localhost:4111
```

### Method 5: Download Binary

Download platform-specific binaries from [GitHub Releases](https://github.com/mashh-lab/mcp-agent-proxy/releases):

**Configuration:**

```json
{
  "mcpServers": {
    "mcp-agent-proxy": {
      "command": "/path/to/mcp-agent-proxy",
      "env": {
        "MASTRA_SERVERS": "http://localhost:4111"
      }
    }
  }
}
```

## Environment Variables

After installation, configure the required environment variables:

- **`MASTRA_SERVERS`** - Mastra server URLs (multiple formats supported)

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

## Getting Help

- Check our [MCP Configuration Guide](MCP_CONFIGURATION.md) for detailed examples
- Review [Contributing Guidelines](CONTRIBUTING.md) for development setup
- Open an issue on [GitHub](https://github.com/mashh-lab/mcp-agent-proxy/issues) for support

---

## Command Line Usage

For quick testing, you can run directly:

```bash
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
  -e MASTRA_SERVERS=http://localhost:4111 \
  mashh/mcp-agent-proxy:latest
```

### Docker Compose

```yaml
version: '3.8'
services:
  mcp-agent-proxy:
    image: mashh/mcp-agent-proxy:latest
    ports:
      - '3001:3001'
    environment:
      - MASTRA_SERVERS=http://localhost:4111
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
        "MASTRA_SERVERS": "http://localhost:4111"
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
        "MASTRA_SERVERS": "http://localhost:4111"
      }
    }
  }
}
```

## Environment Configuration

Configure environment variables in your MCP client's configuration file (typically `mcp.json`):

### Required Variable

- **`MASTRA_SERVERS`** - Mastra server URLs (multiple formats supported)

### Optional Variables (All Have Defaults)

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

# Test with environment variables
MASTRA_SERVERS="http://localhost:4111" mcp-agent-proxy
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

### MASTRA_SERVERS Format Options

The `MASTRA_SERVERS` environment variable supports multiple formats for flexibility:

- **Space separated** (recommended): `http://localhost:4111 http://localhost:4222`
- **Comma separated**: `http://localhost:4111,http://localhost:4222`
- **Comma + space**: `http://localhost:4111, http://localhost:4222`
