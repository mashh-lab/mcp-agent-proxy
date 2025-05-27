# Configuration Examples

Ready-to-use MCP configurations for different scenarios.

## Basic Configurations

### [`minimal-config.json`](minimal-config.json)

Zero setup - just add to your MCP client and go.

### [`multi-server-config.json`](multi-server-config.json)

Connect to multiple local Mastra servers running on different ports.

### [`mcp-config.json`](mcp-config.json)

Standard single-server configuration with environment variables.

## Cloud Deployments

### [`cloud-config.json`](cloud-config.json)

Connect to any cloud-deployed Mastra server.

### [`vercel-config.json`](vercel-config.json)

Specific configuration for Vercel deployments.

### [`vercel-localhost-config.json`](vercel-localhost-config.json)

Hybrid setup: Vercel production + local development.

### [`vercel-multi-env-config.json`](vercel-multi-env-config.json)

Multi-environment setup: production + staging + local.

### [`cloud-localhost-config.json`](cloud-localhost-config.json)

Generic cloud + local development setup.

## Advanced Configurations

### [`network-effect-config.json`](network-effect-config.json)

Recursive agent networks - agents that can access other agent networks.

### [`mastra-server-with-mcp.js`](mastra-server-with-mcp.js)

Example Mastra server code that connects to other agent networks.

## Usage

1. **Copy** the configuration that matches your setup
2. **Paste** into your MCP client's configuration file (usually `mcp.json`)
3. **Modify** server URLs to match your environment
4. **Restart** your MCP client

## Need Help?

- Check the main [README](../README.md) for quick start
- See [CONFIGURATION.md](../CONFIGURATION.md) for advanced options
- Open an [issue](https://github.com/mastra-ai/mcp-agent-proxy/issues) if you're stuck
