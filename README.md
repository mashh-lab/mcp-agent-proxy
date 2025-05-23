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

3. Configure environment (copy and edit):

```bash
cp .env .env.local  # Edit the values as needed
```

## Clean Project Structure

This repository has been cleaned up to include only production-ready files:

- **Core functionality**: Located in `src/` directory
- **Single configuration**: Working MCP client configuration examples
- **Comprehensive documentation**: Everything you need is in this README
- **Simple testing**: Run `pnpm test` to verify your setup
- **Multiple distribution methods**: NPM package, Docker, binaries, and source

## Configuration

Set the following environment variables in your `.env` file:

```env
# Multi-server configuration (space or comma separated URLs)
MASTRA_SERVERS_CONFIG=http://localhost:4111 http://localhost:4222

# Client configuration
MASTRA_CLIENT_RETRIES=3
MASTRA_CLIENT_BACKOFF_MS=300
MASTRA_CLIENT_MAX_BACKOFF_MS=5000

# MCP server configuration (optional)
# MCP_SERVER_PORT=3001  # Default: 3001
MCP_SSE_PATH=/mcp/sse
MCP_MESSAGE_PATH=/mcp/message

# Transport type
MCP_TRANSPORT=http
```

### Key Configuration Options

- **`MASTRA_SERVERS_CONFIG`**: Mastra server URLs to monitor and proxy to. Supports multiple formats:
  - Space separated: `http://localhost:4111 http://localhost:4222`
  - Comma separated: `http://localhost:4111,http://localhost:4222`
  - Comma+space: `http://localhost:4111, http://localhost:4222`
- **`MCP_SERVER_PORT`**: (Optional) Port for the MCP proxy server to listen on. Default: **3001**
- **Retry Settings**: Configure client resilience for network issues when connecting to Mastra servers

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
Available tools: callMastraAgent, listMastraAgents
```

### 2. Available MCP Tools

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

### 3. Smart Agent Resolution Examples

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

### 4. Testing with the Test Client

Run the included test client to verify functionality:

```bash
pnpm test
```

This will:

1. Connect to your MCP proxy server
2. List available tools
3. Test the `listMastraAgents` tool
4. Test the `callMastraAgent` tool with a sample request

### 5. Integration with MCP Clients

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

### 6. MCP Client Configuration

For comprehensive MCP client configuration examples covering all installation methods, see **[MCP_CONFIGURATION.md](MCP_CONFIGURATION.md)**.

#### Quick Example (NPM Global Install):
```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "mcp-agent-proxy",
      "env": {
        "MASTRA_SERVERS_CONFIG": "http://localhost:4111 http://localhost:4222"
      }
    }
  }
}
```

#### Quick Example (Docker):
```json
{
  "mcpServers": {
    "mastra-agent-proxy": {
      "command": "docker",
      "args": [
        "run", "--rm", "-p", "3001:3001",
        "-e", "MASTRA_SERVERS_CONFIG=http://host.docker.internal:4111",
        "mashh/mcp-agent-proxy:latest"
      ]
    }
  }
}
```

**📖 For detailed configuration examples including:**
- NPM/PNPM installations (global & local)
- Docker containers (standard & host network)
- Standalone binaries
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
├── config.ts                  # Configuration management
└── test-client.ts             # Test client script
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
- Build Docker images for multiple platforms
- Create standalone binaries for Linux, macOS, and Windows
- Create a GitHub release with all artifacts

## License

MIT License - see LICENSE file for details.
