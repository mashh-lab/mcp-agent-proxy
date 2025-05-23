# MCP Agent Proxy

An MCP (Model Context Protocol) proxy server that enables MCP clients to communicate with Mastra agent servers. This proxy exposes Mastra agents as standardized MCP tools, enabling broad integration with MCP-compliant clients like Cursor, Claude Desktop, and others.

## Features

- **Multi-Server Support**: Connect to multiple Mastra servers simultaneously with automatic conflict resolution
- **Smart Agent Resolution**: Automatically resolves agent names to appropriate servers, with support for fully qualified `server:agentId` format
- **Location Agnostic**: Connect to Mastra servers running locally (e.g., `localhost:4111`) or remotely via configurable base URL
- **MCP Compliance**: Exposes Mastra agents as standard MCP tools for broad ecosystem integration
- **Dual Interaction Support**: Supports both `generate` and `stream` interactions with target agents
- **Dynamic Discovery**: Tools to list available agents across all configured servers with conflict detection
- **HTTP/SSE Transport**: Network-accessible via HTTP Server-Sent Events for robust client connections
- **Type Safety**: Full TypeScript implementation with Zod schema validation

## Architecture

```
MCP Client --> Custom MCP Server --> Agent-Proxy Tool --> @mastra/client-js --> Target Mastra Server(s) --> Mastra Agents
```

The proxy server acts as an intermediary layer that:

1. Receives MCP tool calls from clients
2. Intelligently routes them to appropriate Mastra servers
3. Handles agent name conflicts using smart resolution
4. Returns responses in MCP-compliant format

## Quick Start

Install the MCP Agent Proxy globally and add it to your MCP client configuration:

### 1. Install

```bash
# Using pnpm (recommended)
pnpm add -g @mashh/mcp-agent-proxy

# Or using npm
npm install -g @mashh/mcp-agent-proxy
```

### 2. Configure

**Option A: Zero Setup (standard local Mastra server)**

Add this minimal configuration to your MCP client's `mcp.json`:

```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "mcp-agent-proxy"
    }
  }
}
```

That's it! The proxy automatically connects to `http://localhost:4111` - perfect for standard Mastra setups.

**Option B: Custom Configuration**

For multiple servers or custom URLs:

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

For detailed installation options, see [INSTALL.md](INSTALL.md).

## Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd mcp-agent-proxy
```

2. Install dependencies:

```bash
pnpm install
```

3. Build the project:

```bash
pnpm build
```

## Clean Project Structure

This repository has been cleaned up to include only production-ready files:

- **Core functionality**: Located in `src/` directory
- **Single configuration**: Working MCP client configuration examples
- **Comprehensive documentation**: Everything you need is in this README
- **Simple testing**: Run `pnpm test` to verify your setup
- **Multiple distribution methods**: NPM package and source

## Configuration

Configure the proxy server by setting environment variables in your MCP client's configuration file (typically `mcp.json`).

### Environment Variables

All environment variables are optional and have sensible defaults:

- **`MASTRA_SERVERS`** - Mastra server URLs to monitor and proxy to. **Default: `http://localhost:4111`**. Supports multiple formats:
  - Space separated: `http://localhost:4111 http://localhost:4222`
  - Comma separated: `http://localhost:4111,http://localhost:4222`
  - Comma+space: `http://localhost:4111, http://localhost:4222`

### Optional Environment Variables

All other environment variables are optional and have sensible defaults:

- **`MCP_SERVER_PORT`** - Port for the MCP proxy server. Default: `3001`
- **`MASTRA_CLIENT_RETRIES`** - Client retry attempts for Mastra servers. Default: `3`
- **`MASTRA_CLIENT_BACKOFF_MS`** - Initial backoff delay in milliseconds. Default: `300`
- **`MASTRA_CLIENT_MAX_BACKOFF_MS`** - Maximum backoff delay in milliseconds. Default: `5000`
- **`MCP_SSE_PATH`** - SSE endpoint path. Default: `/mcp/sse`
- **`MCP_MESSAGE_PATH`** - Message endpoint path. Default: `/mcp/message`
- **`MCP_TRANSPORT`** - Transport method (stdio or http). Default: `http`

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

## Usage

### 1. Start the MCP Proxy Server

```bash
# Build and start the server
pnpm start

# Or for development with automatic rebuilding
pnpm dev
```

The server will start and display:

```
MCP Server with HTTP/SSE transport listening on port 3001
SSE Endpoint: http://localhost:3001/mcp/sse
Message Endpoint: http://localhost:3001/mcp/message
Health Check: http://localhost:3001/health
Status Endpoint: http://localhost:3001/status
Available tools: callMastraAgent, listMastraAgents
```

### 2. Health and Status Endpoints

The proxy server provides monitoring endpoints for operational visibility:

#### `/health` - Quick Health Check

Fast liveness check for container orchestration and load balancers:

```bash
# Using pnpm script
pnpm health:json

# Or directly
curl http://localhost:3001/health | jq .
```

Returns basic service information and uptime (~1ms response time).

#### `/status` - Comprehensive Status

Full system status including agent information from all Mastra servers:

```bash
# Using pnpm script
pnpm status:json

# Or directly
curl http://localhost:3001/status | jq .
```

Returns complete agent listing, server status, and conflict detection (~100-500ms response time).

#### Combined Check

Get both health and status information:

```bash
pnpm check
```

#### One-Shot Checks (No Background Server Required)

For testing without starting a persistent server, use the one-shot scripts that automatically start the server, run checks, and clean up:

```bash
# One-shot health check
pnpm health:oneshot

# One-shot status check
pnpm status:oneshot

# One-shot combined check
pnpm check:oneshot
```

These scripts are perfect for:

- CI/CD pipelines
- Quick testing during development
- Environments where you don't want persistent processes
- Automated health monitoring scripts

#### CI/CD Integration

For CI environments, use the specialized scripts that automatically detect CI and optimize behavior:

```bash
# Fast build validation (recommended for CI)
pnpm build:validate    # Validates build without starting server
pnpm ci:test          # Alias for build:validate

# Environment-aware testing
CI=true pnpm check:oneshot                    # Uses longer timeouts, finds available ports
CI=true MCP_SKIP_SERVER_TESTS=true pnpm check:oneshot  # Skips server, validates build only
```

**CI Environment Detection**: Automatically detects GitHub Actions, GitLab CI, Travis, CircleCI, Jenkins, and other CI environments.

**CI Optimizations**:

- **Random Port Selection**: Finds available ports to avoid conflicts
- **Longer Timeouts**: 30s vs 15s for slower CI environments
- **Build-Only Mode**: Fast validation without network tests
- **Reduced Polling**: Less frequent health checks to reduce load

**Example GitHub Actions**:

```yaml
- name: Fast CI Test (Build Validation)
  run: pnpm ci:test
  env:
    MCP_SKIP_SERVER_TESTS: 'true'

- name: Full CI Test (With Server)
  run: pnpm check:oneshot
  # Automatically uses CI optimizations
```

### 3. Available MCP Tools

#### `callMastraAgent`

Proxies requests to a target Mastra agent with intelligent server resolution.

**Input Schema:**

```typescript
{
  targetAgentId: string;        // Agent ID or "server:agentId" for conflicts
  interactionType: "generate" | "stream";  // Type of interaction
  messages: Array<{            // Conversation messages
    role: "user" | "assistant" | "system";
    content: string;
  }>;
  serverUrl?: string;          // Optional server URL override
  threadId?: string;           // Optional conversation thread ID
  resourceId?: string;         // Optional resource ID
  agentOptions?: Record<string, any>; // Additional agent options
}
```

**Smart Resolution Behavior:**

- **Plain agent ID** (e.g., `"weatherAgent"`): Automatically finds which server(s) contain the agent
  - If found on one server: Uses that server automatically
  - If found on multiple servers: Uses default server (server0) or first available
  - If not found: Returns helpful error with available servers
- **Qualified agent ID** (e.g., `"server1:weatherAgent"`): Directly targets the specified server
- **Server URL override**: Uses provided `serverUrl` parameter

**Output Schema:**

```typescript
{
  success: true
  responseData: any // Response from the target agent
  interactionType: string // Confirms interaction type used
  serverUsed: string // Shows which server was used
  agentIdUsed: string // Shows the actual agent ID used
  fullyQualifiedId: string // Shows the full server:agentId format
  resolutionMethod: string // Shows how the server was resolved
}
```

#### `listMastraAgents`

Lists available agents across all configured Mastra servers with conflict detection.

**Input Schema:** `{}` (no input required)

**Output Schema:**

```typescript
{
  serverAgents: Array<{
    serverName: string // Server identifier (server0, server1, etc.)
    serverUrl: string // Server URL
    status: 'online' | 'offline' | 'error'
    agents: Array<{
      id: string // Agent ID
      name?: string // Optional agent name
    }>
    errorMessage?: string // Error details if status is "error"
  }>
  summary: {
    totalServers: number
    onlineServers: number
    totalAgents: number
    uniqueAgents: number
    agentConflicts: Array<{
      // Agents that exist on multiple servers
      agentId: string
      servers: string[] // List of server names containing this agent
    }>
  }
}
```

### 4. Smart Agent Resolution Examples

```typescript
// Unique agent - auto-resolves to the only server containing it
await callMastraAgent({
  targetAgentId: 'uniqueAgent',
  // ... other params
})
// Result: server0:uniqueAgent (if uniqueAgent only exists on server0)

// Conflicted agent - uses default server
await callMastraAgent({
  targetAgentId: 'weatherAgent', // Exists on multiple servers
  // ... other params
})
// Result: server0:weatherAgent (uses default server)

// Explicit qualification - targets specific server
await callMastraAgent({
  targetAgentId: 'server1:weatherAgent',
  // ... other params
})
// Result: server1:weatherAgent (explicit targeting)
```

### 5. Testing with the Test Client

Run the included test client to verify functionality:

```bash
pnpm test
```

This will:

1. Connect to your MCP proxy server
2. List available tools
3. Test the `listMastraAgents` tool
4. Test the `callMastraAgent` tool with a sample request

### 6. Integration with MCP Clients

The server can be integrated with any MCP-compliant client:

#### Example with Mastra MCPClient:

```typescript
import { MCPClient } from '@mastra/mcp'

const mcpClient = new MCPClient({
  servers: {
    mastraProxy: {
      url: new URL('http://localhost:3001/mcp/sse'),
    },
  },
})

// Get available tools
const tools = await mcpClient.getTools()

// Use the proxy tool
const result = await tools.mastraProxy
  .find((t) => t.id === 'callMastraAgent')
  .execute({
    targetAgentId: 'your-agent-id',
    interactionType: 'generate',
    messages: [{ role: 'user', content: 'Hello!' }],
  })
```

### 7. MCP Client Configuration

For comprehensive MCP client configuration examples covering all installation methods, see **[MCP_CONFIGURATION.md](MCP_CONFIGURATION.md)**.

#### Quick Example (NPM Global Install):

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

**📖 For detailed configuration examples including:**

- NPM/PNPM installations (global & local)
- Source builds
- Platform-specific configurations
- Multi-environment setups
- Troubleshooting tips

**→ See [MCP_CONFIGURATION.md](MCP_CONFIGURATION.md)**

## Development

### Project Structure

```
src/
├── tools/
│   ├── agentProxyTool.ts      # Core proxy tool implementation
│   └── listMastraAgentsTool.ts # Agent discovery tool
├── mcp-server.ts              # Main MCP server setup
└── config.ts                  # Configuration management
```

### Building

```bash
# Build the project
pnpm build

# The compiled output will be in dist/
```

### Error Handling

The proxy implements comprehensive error handling:

- **Network Issues**: Automatic retries with exponential backoff
- **Agent Errors**: Proper error propagation from target agents
- **Validation Errors**: Zod schema validation for type safety
- **MCP Compliance**: Standard error formats for MCP clients

## Use Cases

1. **AI IDE Integration**: Expose Mastra agents to coding assistants
2. **Development/Production Separation**: Point to different Mastra servers per environment
3. **Agent Standardization**: Provide consistent MCP interface to diverse agents
4. **Microservice Architecture**: Decouple agent consumers from implementations
5. **Cross-Platform Access**: Enable any MCP client to use Mastra agents

## Troubleshooting

### Common Issues

1. **Connection Refused**: Ensure target Mastra server is running and accessible
2. **Agent Not Found**: Verify `targetAgentId` exists on target server
3. **Port Conflicts**: Change `MCP_SERVER_PORT` if 3001 is in use
4. **Type Errors**: Ensure all dependencies are properly installed

### Debug Mode

Enable detailed logging by setting:

```bash
DEBUG=mastra:* pnpm start
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Publishing (Maintainers)

### Prerequisites

```bash
# Login to npm registry (works with pnpm too)
npm login

# Ensure you have access to the package
npm whoami
```

### Release Process

```bash
# 1. Update version
pnpm version patch  # or minor/major

# 2. Build and publish (prepublishOnly script handles build/lint)
pnpm publish

# 3. Push tag to trigger GitHub Actions
git push origin main --tags
```

The GitHub Actions workflow will automatically:

- Build and test the package
- Publish to NPM (using pnpm)
- Create a GitHub release

## License

MIT License - see LICENSE file for details.
