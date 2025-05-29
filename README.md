# MCP Agent Proxy

[![npm version](https://badge.fury.io/js/@mashh%2Fmcp-agent-proxy.svg)](https://badge.fury.io/js/@mashh%2Fmcp-agent-proxy)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/mashh-lab/mcp-agent-proxy/actions/workflows/ci.yml/badge.svg)](https://github.com/mashh-lab/mcp-agent-proxy/actions)

**Connect any MCP client to any agent server - creating an "Internet of Agents" through simple, composable primitives.**

> Supports [Mastra](https://github.com/mastra-ai/mastra) ❤️ and [LangGraph](https://github.com/langchain-ai/langgraph) 🦜🕸️ servers! 🎉

## Quick Start

Add this to your MCP client's configuration:

```json
{
  "mcpServers": {
    "mcpAgentProxy": {
      "command": "npx",
      "args": ["mcp-agent-proxy@latest"]
    }
  }
}
```

**That's it!** The proxy lets your MCP client connect to different agent servers and exposes agent interactions as MCP tools. It automatically detects agent server types and adapts accordingly.

https://github.com/user-attachments/assets/9eaf1d36-298f-430f-b9e8-37e921cce2d1

## What This Does

Instead of building complex protocols, we provide **5 simple tools** that let agents discover, connect, and orchestrate across unlimited networks:

| Tool               | Purpose                                                 |
| ------------------ | ------------------------------------------------------- |
| `listAgents`       | Discover available agents across all servers            |
| `describeAgent`    | Get detailed agent capabilities for intelligent routing |
| `callAgent`        | Execute any agent with smart conflict resolution        |
| `connectServer`    | Dynamically add new agent servers at runtime            |
| `disconnectServer` | Remove dynamically connected servers                    |

### Supported Server Types

- **Mastra**: Support for local and remote Mastra servers
- **LangGraph**: Support for local and remote LangGraph instances
- **Extensible**: Plugin architecture makes it easy to add support for other agent frameworks

### The Network Effect

**Agent servers can be MCP clients themselves**, creating recursive agent networks:

```
Your MCP Client → MCP Proxy → Agent Server (Mastra/LangGraph) → Agents -> MCP Proxy -> Other Agent Servers → 🚀 Agents
```

One configuration line unlocks entire ecosystems of AI capabilities.

## MCP Compliance & Features

**✅ Fully MCP 2025-03-26 Compliant**

- Complete implementation of the latest Model Context Protocol specification

**🚀 Multi-Transport Support**

- **Stdio Transport**: Standard MCP client integration (`npx mcp-agent-proxy`)
- **Streamable HTTP**: Modern HTTP-based transport with session management
- **Legacy SSE**: Backward compatibility with existing SSE implementations
- **Automatic Detection**: Seamlessly switches between transports based on client capabilities

## Common Configurations

### Multiple Servers (Mixed Types)

```json
{
  "mcpServers": {
    "mcpAgentProxy": {
      "command": "npx",
      "args": ["mcp-agent-proxy"],
      "env": {
        "AGENT_SERVERS": "http://localhost:4111 http://localhost:2024"
      }
    }
  }
}
```

### Cloud + Local (Mixed Mastra and LangGraph)

```json
{
  "mcpServers": {
    "mcpAgentProxy": {
      "command": "npx",
      "args": ["mcp-agent-proxy"],
      "env": {
        "AGENT_SERVERS": "https://my-mastra.vercel.app http://localhost:2024"
      }
    }
  }
}
```

### From Source (Development)

```json
{
  "mcpServers": {
    "mcpAgentProxy": {
      "command": "node",
      "args": ["/path/to/mcp-agent-proxy/dist/mcp-server.js"],
      "env": {
        "AGENT_SERVERS": "http://localhost:4111"
      }
    }
  }
}
```

## Usage Examples

**Basic Agent Call:**

```
Can you call the weatherAgent to get the current weather in New York City?
```

**Network Exploration**

```
Explore the agents you're connected to
```

**Smart Conflict Resolution:**

```
I need to use the weatherAgent from server1 specifically, not the default one
```

**Dynamic Network Expansion:**

```
Connect to the ML specialists at https://ml-specialists.vercel.app and then use their modelTrainer agent
```

## Environment Variables

| Variable          | Default  | Description                                                       |
| ----------------- | -------- | ----------------------------------------------------------------- |
| `AGENT_SERVERS`   | _(none)_ | Space/comma-separated server URLs (supports Mastra and LangGraph) |
| `MCP_SERVER_PORT` | `3001`   | Proxy server port                                                 |
| `MCP_TRANSPORT`   | `http`   | Transport method (stdio/http)                                     |

## Examples & Advanced Usage

Ready-to-use configurations in the [`examples/`](examples/) directory:

- **[`mcp.json`](examples/minimal-config.json)** - Zero setup
- **[`multi-server-config.json`](examples/multi-server-config.json)** - Multiple local servers
- **[`vercel-config.json`](examples/vercel-config.json)** - Cloud deployment
- **[`mastra-server-with-mcp.js`](examples/mastra-server-with-mcp.ts)** - Network-aware server

For advanced configuration options, see [CONFIGURATION.md](CONFIGURATION.md).

## Troubleshooting

**NPX Issues:**

```bash
npx clear-npx-cache
npx mcp-agent-proxy@latest
```

**Port Conflicts:**

```json
"env": { "MCP_SERVER_PORT": "3002" }
```

**Connection Issues:**

- Ensure agent servers are running and accessible
- Check firewall settings and server URLs
- For LangGraph: Default port is usually 2024 (`langgraph dev`)
- For Mastra: Default port is usually 4111

**Debug Mode:**

```bash
DEBUG=mastra:* npx mcp-agent-proxy
```

## Development & Testing

### Validation Workflows

We've implemented comprehensive validation workflows to ensure code quality and MCP protocol compliance:

#### Quick Commands

```bash
# Quick validation (build + test + lint + format)
pnpm validate:quick

# Full validation (includes integration tests + health checks)
pnpm validate:full

# CI validation (includes coverage + dead code analysis)
pnpm validate:ci
```

#### Individual Commands

```bash
# Build and test
pnpm build
pnpm test
pnpm test:integration

# Code quality
pnpm lint
pnpm format
pnpm format:check
```

#### MCP Protocol Testing

```bash
# Test MCP protocol compliance
pnpm mcp:test

# Test security features
pnpm security:test

# Manual server testing
pnpm start           # Start server
pnpm check          # Check running server (requires jq)
```

#### Test Coverage

- **355 total tests** covering all components
- **Unit tests** for all tools, plugins, and configuration
- **Integration tests** for MCP protocol compliance
- **Security tests** for origin validation and session management
- **Health checks** for server monitoring

### Available Scripts

Use `pnpm run` to see all available scripts, or use these common ones:

```bash
pnpm dev             # Build and start development server
pnpm test            # Run all tests
pnpm test:watch      # Run tests in watch mode
pnpm build           # Build for production
pnpm lint            # Run ESLint
pnpm format          # Format code with Prettier
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

<div align="center">

**[📖 Configuration Guide](CONFIGURATION.md) • [🚀 Examples](examples/) • [🐛 Issues](https://github.com/mastra-ai/mcp-agent-proxy/issues) • [💬 Discussions](https://github.com/mastra-ai/mcp-agent-proxy/discussions)**

_Building the Internet of Agents, one connection at a time._

</div>
