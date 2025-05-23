# MCP Mastra Agent Proxy Server

A location-agnostic MCP (Model Context Protocol) proxy server that allows local agents to communicate with local or remote Mastra servers. This proxy exposes Mastra agents as standardized MCP tools, enabling broad integration with MCP-compliant clients.

## Features

- **Location Agnostic**: Connect to Mastra servers running locally (e.g., `localhost:4111`) or remotely via configurable base URL
- **MCP Compliance**: Exposes Mastra agents as standard MCP tools for broad ecosystem integration
- **Dual Interaction Support**: Supports both `generate` and `stream` interactions with target agents
- **Dynamic Discovery**: Optional tool to list available agents from the target Mastra server
- **HTTP/SSE Transport**: Network-accessible via HTTP Server-Sent Events for robust client connections
- **Type Safety**: Full TypeScript implementation with Zod schema validation

## Architecture

```
MCP Client --> Custom MCP Server --> Agent-Proxy Tool --> @mastra/client-js --> Target Mastra Server --> Mastra Agents
```

The proxy server acts as an intermediary layer that:
1. Receives MCP tool calls from clients
2. Translates them to Mastra agent interactions
3. Returns responses in MCP-compliant format

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd mcp-mastra-agents
```

2. Install dependencies:
```bash
pnpm install
```

3. Configure environment (copy and edit):
```bash
cp .env .env.local  # Edit the values as needed
```

## Configuration

Set the following environment variables in your `.env` file:

```env
# Mastra server configuration
MASTRA_SERVER_BASE_URL=http://localhost:4111
MASTRA_CLIENT_RETRIES=3
MASTRA_CLIENT_BACKOFF_MS=300
MASTRA_CLIENT_MAX_BACKOFF_MS=5000

# MCP server configuration
MCP_SERVER_PORT=3001
MCP_SSE_PATH=/mcp/sse
MCP_MESSAGE_PATH=/mcp/message

# Transport type
MCP_TRANSPORT=http
```

### Key Configuration Options

- **`MASTRA_SERVER_BASE_URL`**: URL of your target Mastra server (local or remote)
- **`MCP_SERVER_PORT`**: Port for the MCP proxy server to listen on
- **Retry Settings**: Configure client resilience for network issues

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
Proxies requests to a target Mastra agent.

**Input Schema:**
```typescript
{
  targetAgentId: string;        // ID of the target Mastra agent
  interactionType: "generate" | "stream";  // Type of interaction
  messages: Array<{            // Conversation messages
    role: "user" | "assistant" | "system";
    content: string;
  }>;
  threadId?: string;           // Optional conversation thread ID
  resourceId?: string;         // Optional resource ID
  agentOptions?: Record<string, any>; // Additional agent options
}
```

**Output Schema:**
```typescript
{
  success: true;
  responseData: any;           // Response from the target agent
  interactionType: string;     // Confirms interaction type used
}
```

#### `listMastraAgents`
Lists available agents on the target Mastra server.

**Input Schema:** `{}` (no input required)

**Output Schema:**
```typescript
{
  agents: Array<{
    id: string;                // Agent ID
    name?: string;             // Optional agent name
  }>;
}
```

### 3. Testing with the Test Client

Run the included test client to verify functionality:

```bash
pnpm test-client
```

This will:
1. Connect to your MCP proxy server
2. List available tools
3. Test the `listMastraAgents` tool
4. Test the `callMastraAgent` tool with a sample request

### 4. Integration with MCP Clients

The server can be integrated with any MCP-compliant client:

#### Example with Mastra MCPClient:
```typescript
import { MCPClient } from '@mastra/mcp';

const mcpClient = new MCPClient({
  servers: {
    mastraProxy: {
      url: new URL('http://localhost:3001/mcp/sse'),
    }
  }
});

// Get available tools
const tools = await mcpClient.getTools();

// Use the proxy tool
const result = await tools.mastraProxy.find(t => t.id === 'callMastraAgent').execute({
  targetAgentId: 'your-agent-id',
  interactionType: 'generate',
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

#### Integration with AI IDEs:
- **Cursor**: Configure MCP server connection
- **Windsurf**: Add as MCP tool provider
- **Other MCP clients**: Use HTTP/SSE endpoint

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

## License

MIT License - see LICENSE file for details.
