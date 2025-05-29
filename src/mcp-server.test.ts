import './test-setup.js'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { startServer, VERSION } from './mcp-server.js'

const TEST_PORT = 3002
const BASE_URL = `http://localhost:${TEST_PORT}`

// Override the port for testing
process.env.MCP_SERVER_PORT = TEST_PORT.toString()

describe('MCP Agent Proxy Server', () => {
  let cleanup: (() => void) | undefined

  beforeAll(async () => {
    // Start the server in a separate process
    const originalArgv = process.argv
    process.argv = [...process.argv, '--http']

    // Start server and capture cleanup function
    startServer()

    // Wait a bit for server to start
    await new Promise((resolve) => setTimeout(resolve, 1000))

    cleanup = () => {
      process.argv = originalArgv
    }
  })

  afterAll(async () => {
    cleanup?.()
    // The server will be cleaned up by the test process ending
  })

  describe('Health and Status Endpoints', () => {
    it('should return healthy status from /health endpoint', async () => {
      const response = await fetch(`${BASE_URL}/health`)
      expect(response.status).toBe(200)

      const health = await response.json()
      expect(health).toMatchObject({
        status: 'healthy',
        service: 'mcp-agent-proxy',
        version: VERSION,
        compliance: 'MCP 2025-03-26',
        transports: ['stdio', 'streamable-http', 'sse'],
      })

      expect(health.endpoints).toMatchObject({
        mcp: '/mcp',
        sse: '/mcp/sse',
        message: '/mcp/message',
        status: '/status',
      })

      expect(health.security).toMatchObject({
        localhost_binding: true,
        origin_validation: true,
        session_management: true,
      })
    })

    it('should return detailed status from /status endpoint', async () => {
      const response = await fetch(`${BASE_URL}/status`)
      expect(response.status).toBe(200)

      const status = await response.json()
      expect(status).toMatchObject({
        status: 'healthy',
        service: 'mcp-agent-proxy',
        compliance: 'MCP 2025-03-26',
        tools: [
          'callAgent',
          'listAgents',
          'connectServer',
          'disconnectServer',
          'describeAgent',
        ],
      })

      expect(typeof status.active_sessions).toBe('number')
    })
  })

  describe('MCP Protocol Compliance', () => {
    it('should handle MCP initialize request via streamable HTTP', async () => {
      const initRequest = {
        jsonrpc: '2.0',
        id: '1',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          clientInfo: { name: 'test-client', version: VERSION },
        },
      }

      const response = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify(initRequest),
      })

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('text/event-stream')
      expect(response.headers.get('mcp-session-id')).toBeTruthy()

      const sessionId = response.headers.get('mcp-session-id')!
      const text = await response.text()

      expect(text).toContain('event: message')
      expect(text).toContain('"result"')
      expect(text).toContain('"protocolVersion":"2024-11-05"')
      expect(text).toContain('"name":"mcp-agent-proxy"')

      return sessionId // Return for next test
    })

    it('should list tools via MCP protocol', async () => {
      // First initialize to get session
      const initResponse = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: '1',
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            clientInfo: { name: 'test-client', version: VERSION },
          },
        }),
      })

      const sessionId = initResponse.headers.get('mcp-session-id')!

      // Then list tools
      const toolsResponse = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'Mcp-Session-Id': sessionId,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: '2',
          method: 'tools/list',
          params: {},
        }),
      })

      expect(toolsResponse.status).toBe(200)
      const text = await toolsResponse.text()

      expect(text).toContain('event: message')
      expect(text).toContain('"result"')
      expect(text).toContain('"tools"')
      expect(text).toContain('callAgent')
    })

    it('should execute tools via MCP protocol', async () => {
      // Initialize session
      const initResponse = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: '1',
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            clientInfo: { name: 'test-client', version: VERSION },
          },
        }),
      })

      const sessionId = initResponse.headers.get('mcp-session-id')!

      // Execute listAgents tool
      const executeResponse = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'Mcp-Session-Id': sessionId,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: '3',
          method: 'tools/call',
          params: {
            name: 'listAgents',
            arguments: {},
          },
        }),
      })

      expect(executeResponse.status).toBe(200)
      const text = await executeResponse.text()

      expect(text).toContain('event: message')
      expect(text).toContain('"result"')
      expect(text).toContain('"content"')
      expect(text).toContain('serverAgents')
    })
  })

  describe('Session Management', () => {
    it('should create and reuse sessions correctly', async () => {
      // First request creates session
      const response1 = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: '1',
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            clientInfo: { name: 'test-client', version: VERSION },
          },
        }),
      })

      const sessionId = response1.headers.get('mcp-session-id')!
      expect(sessionId).toBeTruthy()

      // Second request reuses session
      const response2 = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'Mcp-Session-Id': sessionId,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: '2',
          method: 'tools/list',
          params: {},
        }),
      })

      expect(response2.status).toBe(200)
      expect(response2.headers.get('mcp-session-id')).toBe(sessionId)
    })

    it('should terminate sessions via DELETE', async () => {
      // Create session
      const initResponse = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: '1',
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            clientInfo: { name: 'test-client', version: VERSION },
          },
        }),
      })

      const sessionId = initResponse.headers.get('mcp-session-id')!

      // Terminate session
      const deleteResponse = await fetch(`${BASE_URL}/mcp`, {
        method: 'DELETE',
        headers: {
          'Mcp-Session-Id': sessionId,
        },
      })

      expect(deleteResponse.status).toBe(200)
      const text = await deleteResponse.text()
      expect(text).toBe('Session terminated')
    })

    it('should handle GET requests properly', async () => {
      const response = await fetch(`${BASE_URL}/mcp`, {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
        },
      })

      // GET requests should either work (200) or be not implemented (400/405)
      // depending on the MCP transport implementation
      expect(response.status).toBeOneOf([200, 400, 405])
    })
  })

  describe('Security Features', () => {
    it('should block requests with invalid origins', async () => {
      const response = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Origin: 'https://evil-site.com',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: '1',
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            clientInfo: { name: 'test-client', version: VERSION },
          },
        }),
      })

      expect(response.status).toBe(403)
      const text = await response.text()
      expect(text).toBe('Forbidden: Invalid origin')
    })

    it('should allow requests with valid localhost origins', async () => {
      const response = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: '1',
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            clientInfo: { name: 'test-client', version: VERSION },
          },
        }),
      })

      expect(response.status).toBe(200)
    })

    it('should require Accept header for GET requests', async () => {
      const response = await fetch(`${BASE_URL}/mcp`, {
        method: 'GET',
      })

      expect(response.status).toBe(405)
      const text = await response.text()
      expect(text).toBe(
        'Method Not Allowed: GET requires Accept: text/event-stream',
      )
    })

    it('should return 405 for unsupported methods', async () => {
      const response = await fetch(`${BASE_URL}/mcp`, {
        method: 'PUT',
      })

      expect(response.status).toBe(405)
      const text = await response.text()
      expect(text).toBe('Method Not Allowed')
    })
  })

  describe('Legacy Compatibility', () => {
    it('should handle requests to legacy SSE endpoint', async () => {
      const response = await fetch(`${BASE_URL}/mcp/sse`)

      // This should trigger the legacy SSE handler
      // The exact response depends on the Mastra implementation
      expect(response.status).toBeOneOf([200, 400, 404, 405])
    })

    it('should return 404 for unknown paths', async () => {
      const response = await fetch(`${BASE_URL}/unknown-path`)

      expect(response.status).toBe(404)
      const text = await response.text()
      expect(text).toBe('Not Found')
    })
  })
})
