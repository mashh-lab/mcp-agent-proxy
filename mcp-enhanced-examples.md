# MCP Enhanced Server Configuration Examples

## Basic Configuration (Default)

```json
{
  "mcpServers": {
    "mastra-enhanced-proxy": {
      "command": "node",
      "args": ["dist/enhanced/mcp-server-enhanced.js"],
      "cwd": "/path/to/your/mcp-mastra-agents",
      "env": {
        "MCP_SERVER_PORT": "3001"
      }
    }
  }
}
```
**Default servers**: `server0` → `http://localhost:4111`, `server1` → `http://localhost:4222`

## Configuration Scenarios

### 1. Simple Multi-Server Setup
```json
{
  "mcpServers": {
    "mastra-enhanced-proxy": {
      "command": "node",
      "args": ["dist/enhanced/mcp-server-enhanced.js"],
      "cwd": "/path/to/your/mcp-mastra-agents",
      "env": {
        "MASTRA_SERVERS_CONFIG": "[\"http://localhost:4111\", \"http://localhost:4222\"]"
      }
    }
  }
}
```

**Usage**: 
- `weatherAgent` → routes to `server0` (http://localhost:4111)
- `server0:weatherAgent` → routes to `server0` (http://localhost:4111) 
- `server1:weatherAgent` → routes to `server1` (http://localhost:4222)

### 2. Three Server Setup
```json
{
  "mcpServers": {
    "mastra-enhanced-proxy": {
      "command": "node", 
      "args": ["dist/enhanced/mcp-server-enhanced.js"],
      "cwd": "/path/to/your/mcp-mastra-agents",
      "env": {
        "MASTRA_SERVERS_CONFIG": "[\"http://localhost:4111\", \"http://localhost:4222\", \"http://localhost:4333\"]"
      }
    }
  }
}
```

**Usage**:
- `chatAgent` → routes to `server0` (first server)
- `server0:chatAgent` → routes to `server0` (http://localhost:4111)
- `server1:chatAgent` → routes to `server1` (http://localhost:4222)  
- `server2:chatAgent` → routes to `server2` (http://localhost:4333)

### 3. Production Environment Setup
```json
{
  "mcpServers": {
    "mastra-enhanced-proxy": {
      "command": "node",
      "args": ["dist/enhanced/mcp-server-enhanced.js"], 
      "cwd": "/path/to/your/mcp-mastra-agents",
      "env": {
        "MASTRA_SERVERS_CONFIG": "[\"http://main.company.com:4111\", \"http://backup.company.com:4111\"]"
      }
    }
  }
}
```

**Usage**:
- `weatherAgent` → routes to `server0` (main server)
- `server1:weatherAgent` → routes to `server1` (backup server)

### 4. Multi-Region Setup
```json
{
  "mcpServers": {
    "mastra-enhanced-proxy": {
      "command": "node",
      "args": ["dist/enhanced/mcp-server-enhanced.js"],
      "cwd": "/path/to/your/mcp-mastra-agents", 
      "env": {
        "MASTRA_SERVERS_CONFIG": "[\"http://us-east.example.com:4111\", \"http://us-west.example.com:4111\", \"http://eu.example.com:4111\"]"
      }
    }
  }
}
```

**Usage**:
- `assistantAgent` → routes to `server0` (US East)
- `server0:assistantAgent` → routes to `server0` (US East) 
- `server1:assistantAgent` → routes to `server1` (US West)
- `server2:assistantAgent` → routes to `server2` (EU)

## Configuration Notes

### Environment Variable Format
The `MASTRA_SERVERS_CONFIG` should be a JSON array of server URLs:
```json
["http://url1:port", "http://url2:port", "http://url3:port"]
```

### Auto-Generated Server Names
- Servers are automatically named `server0`, `server1`, `server2`, etc.
- Based on their position in the array (0-indexed)

### Default Behavior
- If `MASTRA_SERVERS_CONFIG` is not provided, defaults to:
  - `server0` → `http://localhost:4111`
  - `server1` → `http://localhost:4222`
- Plain agent IDs route to the first server (`server0`)

### Backward Compatibility
- Plain agent IDs (e.g., `weatherAgent`) route to `server0` (first server)
- Fully qualified IDs (e.g., `server1:weatherAgent`) route to specific servers

### Error Handling
- Invalid JSON in `MASTRA_SERVERS_CONFIG` falls back to defaults
- Unknown server names show available server0, server1, server2, etc. 