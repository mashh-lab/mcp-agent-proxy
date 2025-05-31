# Connection Backends

The MCP Agent Proxy supports pluggable connection backends for managing dynamic server connections. This allows you to choose between local in-memory storage (for development) and persistent Redis storage (for serverless deployments).

## Available Backends

### Local Backend (Default)

- **Type**: `local`
- **Storage**: In-memory Map
- **Persistence**: Lost on restart
- **Use Case**: Local development, testing
- **Requirements**: None

### Upstash Redis Backend

- **Type**: `upstash`
- **Storage**: Upstash Redis (serverless Redis)
- **Persistence**: Survives serverless function restarts
- **Use Case**: Production deployments on Vercel, Netlify, etc.
- **Requirements**: `@upstash/redis` package, Upstash Redis database

## Configuration

### Environment Variables

Set the following environment variables to configure the connection backend:

#### Local Backend (Default)

```bash
# No configuration needed - this is the default
MCP_CONNECTION_BACKEND=local
```

#### Upstash Redis Backend

```bash
MCP_CONNECTION_BACKEND=upstash
UPSTASH_REDIS_REST_URL=https://your-redis-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-redis-token
MCP_REDIS_KEY_PREFIX=mcp-proxy:servers:  # Optional, defaults to this value
```

### Installing Dependencies

#### For Upstash Backend

```bash
npm install @upstash/redis
# or
pnpm add @upstash/redis
```

## Usage Examples

### Local Development

```bash
# Default - no configuration needed
npm start

# Or explicitly set local backend
MCP_CONNECTION_BACKEND=local npm start
```

### Vercel Deployment

```bash
# In your Vercel environment variables:
MCP_CONNECTION_BACKEND=upstash
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token

# In your package.json dependencies:
{
  "dependencies": {
    "@upstash/redis": "^1.28.4"
  }
}
```

### Environment File (.env)

```bash
# For local development with Redis testing
MCP_CONNECTION_BACKEND=upstash
UPSTASH_REDIS_REST_URL=https://your-test-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-test-token
MCP_REDIS_KEY_PREFIX=dev:mcp-proxy:servers:
```

## API

The connection backend API is abstracted, so all tools (`connectServer`, `disconnectServer`, etc.) work the same regardless of which backend you use.

### Functions Affected

- `addDynamicServer(serverUrl, serverName?)` - Now async
- `removeDynamicServer(serverName)` - Now async
- `getDynamicServers()` - Now async
- `clearDynamicServers()` - Now async
- `loadServerMappings()` - Now async

### Tool Compatibility

All existing tools continue to work:

- ✅ `connectServer` - Connects to new agent servers
- ✅ `disconnectServer` - Disconnects from dynamic servers
- ✅ `listAgents` - Lists agents from all servers
- ✅ `callAgent` - Routes calls to appropriate servers

## Implementation Details

### Data Storage

#### Local Backend

- Uses JavaScript `Map<string, string>`
- Data lost on process restart
- Instant read/write operations

#### Upstash Redis Backend

- Uses Redis hash maps with key structure:
  - `mcp-proxy:servers:all` - Main server name -> URL mapping
  - `mcp-proxy:servers:urlmap` - Reverse URL -> name lookup
- Data persists across function invocations
- Network-based operations (minimal latency with Upstash)

### Automatic Initialization

The backend is automatically initialized on first use. No manual setup required in your code.

### Error Handling

- Local backend errors are rare (memory allocation issues)
- Upstash backend handles network failures gracefully
- Automatic fallback behavior maintains system stability

## Troubleshooting

### "Failed to load Upstash backend" Error

- Install `@upstash/redis`: `npm install @upstash/redis`
- Verify environment variables are set correctly
- Test Redis connection independently

### "Connection backend not initialized" Error

- This indicates a race condition in initialization
- Usually resolves on retry
- Check if Redis credentials are valid

### Performance Considerations

- Local backend: ~0ms latency
- Upstash backend: ~10-50ms latency (depending on region)
- For high-frequency operations, consider local backend for development

## Migration

### From In-Memory to Redis

1. Install `@upstash/redis`
2. Set up Upstash Redis database
3. Update environment variables
4. Restart application
5. Previous connections will be lost (expected)

### From Redis to In-Memory

1. Change `MCP_CONNECTION_BACKEND=local`
2. Restart application
3. Previous Redis connections remain in Redis but won't be loaded
