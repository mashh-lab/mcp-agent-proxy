# Enhanced Multi-Server MCP Proxy

## Overview

The Enhanced Multi-Server MCP Proxy provides advanced functionality for managing multiple Mastra servers with automatic agent conflict detection and resolution. This is the most flexible option (Option 3) that handles real-world scenarios where multiple servers may have agents with the same ID.

## Key Features

### 🔍 **Multi-Server Agent Discovery**
- Discovers agents across multiple Mastra servers simultaneously
- Identifies agent name conflicts automatically
- Provides fully qualified agent IDs (`server:agentId`) for conflict resolution
- Shows server status (online/offline/error) for each target server

### 🎯 **Smart Agent Targeting**
- Supports fully qualified agent IDs (`server1:weatherAgent`) for precise targeting
- Automatic server resolution from agent ID prefixes
- Fallback to explicit server URL parameters
- Backward compatibility with plain agent IDs

### ⚙️ **Configurable Server Mappings**
- **NEW**: Server mappings configurable via `mcp.json` environment variables
- Support for custom server names and URLs
- Multiple configuration scenarios (dev/staging/prod, regional, etc.)
- Automatic fallback to sensible defaults

### ⚡ **Enhanced Performance**
- Reduced retry counts for faster multi-server discovery
- Concurrent server checks for better performance
- Graceful error handling for offline servers

## Available Tools

### 1. `listMultiServerAgents`
**Purpose**: Discover all agents across multiple servers and detect conflicts

**Input**: 
```json
{
  "servers": [  // Optional - defaults to server1 and server2
    {
      "name": "server1",
      "url": "http://localhost:4111",
      "description": "Main Mastra Server"
    }
  ]
}
```

**Output**:
```json
{
  "serverAgents": [
    {
      "serverName": "server1",
      "serverUrl": "http://localhost:4111",
      "agents": [
        {
          "id": "weatherAgent",
          "name": "Weather Agent",
          "fullyQualifiedId": "server1:weatherAgent"
        }
      ],
      "status": "online"
    }
  ],
  "summary": {
    "totalServers": 2,
    "onlineServers": 2,
    "totalAgents": 4,
    "agentConflicts": [
      {
        "agentId": "weatherAgent",
        "servers": ["server1", "server2"]
      }
    ]
  }
}
```

### 2. `callMastraAgent`
**Purpose**: Call agents with enhanced targeting and conflict resolution

**Key Features**:
- ✅ **Backward Compatible**: Works with plain agent IDs (`weatherAgent`)  
- ✅ **Multi-Server Support**: Supports fully qualified IDs (`server1:weatherAgent`)
- ✅ **Smart Routing**: Automatically resolves server conflicts
- ✅ **Enhanced Output**: Returns detailed server and targeting information

**Input**:
```json
{
  "targetAgentId": "server1:weatherAgent",  // Fully qualified OR plain ID
  "interactionType": "generate",
  "messages": [
    {"role": "user", "content": "Weather in Los Angeles?"}
  ],
  "serverUrl": "http://localhost:4111",  // Optional override
  "threadId": "optional-thread-id",
  "resourceId": "optional-resource-id",
  "agentOptions": {}
}
```

**Output**:
```json
{
  "success": true,
  "responseData": { /* Agent response */ },
  "interactionType": "generate",
  "serverUsed": "http://localhost:4111",
  "agentIdUsed": "weatherAgent",
  "fullyQualifiedId": "server1:weatherAgent"
}
```

### 3. `listMastraAgents`
**Purpose**: List agents from a single server (for backward compatibility)

## Conflict Resolution

### Problem: Agent Name Conflicts
When multiple servers have agents with the same ID (e.g., both `server1` and `server2` have `weatherAgent`), the system needs to know which one to target.

### Solution: Fully Qualified Agent IDs
Use the format `serverName:agentId` to specify exactly which agent you want:

```bash
# Ambiguous - could be either server
targetAgentId: "weatherAgent"

# Precise - targets server1 specifically  
targetAgentId: "server1:weatherAgent"

# Precise - targets server2 specifically
targetAgentId: "server2:weatherAgent"
```

### Server Name Mapping
The system includes a built-in server map:
- `server1` → `http://localhost:4111`
- `server2` → `http://localhost:4222`
- `main` → `http://localhost:4111` (alias)
- `secondary` → `http://localhost:4222` (alias)

### Configurable Server Mappings (NEW! 🎉)
You can now customize server mappings via the `mcp.json` configuration file using a simple array of URLs:

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

**Configuration Benefits**:
- ✅ **Super Simple**: Just an array of URLs - no complex naming needed
- ✅ **Auto-Named**: Servers automatically become `server0`, `server1`, `server2`, etc.
- ✅ **Zero Config**: Works with sensible defaults if not configured
- ✅ **Flexible**: Add as many servers as you need
- ✅ **No Code Changes**: All configuration via `mcp.json`

**Examples**:
- `weatherAgent` → routes to `server0` (first server)
- `server0:weatherAgent` → routes to `server0` explicitly
- `server1:weatherAgent` → routes to `server1` (second server)
- `server2:weatherAgent` → routes to `server2` (third server)

**Default Behavior**: If no config provided, defaults to `server0` (localhost:4111) and `server1` (localhost:4222).

## Usage Examples

### 1. Discover All Agents and Conflicts
```javascript
// In Cursor, use the listMultiServerAgents tool
// This will show all agents across servers and highlight conflicts
```

### 2. Call Agent with Plain ID (Backward Compatible)
```javascript
// Works exactly like before, routes to first server (server0)
targetAgentId: "weatherAgent"
// → Routes to server0, returns enhanced output with server details
```

### 3. Call Agent with Server Index (Multi-Server)
```javascript
// Use server index to target specific servers
targetAgentId: "server0:weatherAgent"  // First server
targetAgentId: "server1:weatherAgent"  // Second server
targetAgentId: "server2:weatherAgent"  // Third server (if configured)
```

### 4. Call Agent with Server URL Override
```javascript
// Override server URL explicitly
targetAgentId: "weatherAgent"
serverUrl: "http://localhost:4333"
// → Routes to specified server regardless of configuration
```

## Setup and Configuration

### 1. Build and Start Enhanced Server
```bash
# Build the enhanced version
pnpm build:enhanced

# Start the enhanced server
pnpm start:enhanced
```

### 2. Configure Cursor IDE
Add to your Cursor MCP configuration (`mcp-enhanced.json`):
```json
{
  "mcpServers": {
    "mastra-enhanced-proxy": {
      "command": "node",
      "args": ["dist/enhanced/mcp-server-enhanced.js"],
      "cwd": "/path/to/mcp-mastra-agents",
      "env": {
        "MASTRA_SERVER_BASE_URL": "http://localhost:4111"
      }
    }
  }
}
```

### 3. Test Multi-Server Functionality
```bash
# Run the comprehensive test
pnpm tsx test-enhanced.ts
```

## Real-World Scenarios

### Scenario 1: Development vs Production
```
server1 (dev):  weatherAgent, conversationAgent
server2 (prod): weatherAgent, conversationAgent, analyticsAgent
```

**Solution**: Use `dev:weatherAgent` vs `prod:weatherAgent` to be explicit

### Scenario 2: Regional Servers
```
us-east:  weatherAgent (US weather data)
eu-west:  weatherAgent (EU weather data)
```

**Solution**: Use `us-east:weatherAgent` vs `eu-west:weatherAgent`

### Scenario 3: Version Testing
```
v1: chatAgent (stable version)
v2: chatAgent (beta version)
```

**Solution**: Use `v1:chatAgent` vs `v2:chatAgent`

## Benefits over Other Options

### vs Option 1 (Simple Switch)
- ✅ No need to restart server to switch targets
- ✅ Can target multiple servers in same session
- ✅ Automatic conflict detection

### vs Option 2 (Multiple Proxies)
- ✅ Single proxy instance (simpler management)
- ✅ Unified agent discovery
- ✅ Better resource efficiency
- ✅ Easier Cursor configuration

## Advanced Features

### Server Status Monitoring
The `listMultiServerAgents` tool provides real-time server status:
- 🟢 `online` - Server responsive with agents available
- 🔴 `error` - Server unreachable or error occurred  
- ⚪ `offline` - Server explicitly marked as offline

### Conflict Detection
Automatically identifies when multiple servers have agents with the same ID and warns users about potential conflicts.

### Performance Optimizations
- Reduced retry counts for faster discovery
- Concurrent server checks
- Intelligent fallback mechanisms

## Troubleshooting

### Agent Not Found Error
```
Error: Unknown server 'server3'. Available servers: server1, server2, main, secondary
```
**Solution**: Use a valid server name or provide explicit `serverUrl`

### Server Unreachable
```
Error: Failed to interact with Mastra agent 'server2:weatherAgent': connect ECONNREFUSED
```
**Solution**: Ensure target Mastra server is running on the specified port

### Agent Conflict Warning
```
Agent Conflicts Detected:
  weatherAgent exists on: server1, server2
```
**Solution**: Use fully qualified IDs like `server1:weatherAgent` or `server2:weatherAgent`

---

*This enhanced solution provides the most flexible and production-ready approach for managing multiple Mastra servers with automatic conflict resolution.* 