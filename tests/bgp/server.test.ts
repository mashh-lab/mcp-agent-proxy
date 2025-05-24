// Tests for BGP HTTP Server
// Ensures all BGP endpoints work correctly

import {
  BGPServer,
  BGPServerConfig,
  BGPEndpointRequest,
} from '../../src/bgp/server.js'
import { BGPUpdate } from '../../src/bgp/types.js'

// Helper interface for typed response bodies
interface ResponseBodyWithMessage {
  message: string
  [key: string]: unknown
}

interface ResponseBodyWithArray {
  [key: string]: unknown
  peers?: unknown[]
  routes?: unknown[]
  agents?: unknown[]
  peerDetails?: unknown[]
}

describe('BGPServer', () => {
  let bgpServer: BGPServer
  const serverConfig: BGPServerConfig = {
    port: 4444,
    hostname: 'localhost',
    localASN: 65000,
    routerId: 'test-server-65000',
  }

  beforeEach(() => {
    bgpServer = new BGPServer(serverConfig)
  })

  afterEach(async () => {
    await bgpServer.shutdown()
  })

  describe('Server Configuration', () => {
    it('should initialize with correct configuration', () => {
      const config = bgpServer.getConfig()
      expect(config.port).toBe(4444)
      expect(config.hostname).toBe('localhost')
      expect(config.localASN).toBe(65000)
      expect(config.routerId).toBe('test-server-65000')
    })

    it('should provide access to BGP session', () => {
      const session = bgpServer.getBGPSession()
      expect(session).toBeDefined()
    })
  })

  describe('Peer Management Endpoints', () => {
    it('GET /bgp/peers - should list peers', async () => {
      const request: BGPEndpointRequest = {
        method: 'GET',
        path: '/bgp/peers',
        headers: {},
      }

      const response = await bgpServer.handleRequest(request)

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('localASN', 65000)
      expect(response.body).toHaveProperty('routerId', 'test-server-65000')
      expect(response.body).toHaveProperty('peers')
      expect(
        Array.isArray((response.body as ResponseBodyWithArray).peers),
      ).toBe(true)
    })

    it('POST /bgp/peers - should add peer', async () => {
      const request: BGPEndpointRequest = {
        method: 'POST',
        path: '/bgp/peers',
        headers: { 'Content-Type': 'application/json' },
        body: {
          asn: 65001,
          address: 'http://localhost:4445',
        },
      }

      const response = await bgpServer.handleRequest(request)

      expect(response.status).toBe(201)
      expect(response.body).toHaveProperty('message')
      expect((response.body as ResponseBodyWithMessage).message).toContain(
        'AS65001 added successfully',
      )
    })

    it('POST /bgp/peers - should reject invalid peer data', async () => {
      const request: BGPEndpointRequest = {
        method: 'POST',
        path: '/bgp/peers',
        headers: { 'Content-Type': 'application/json' },
        body: {
          asn: 65001,
          // Missing address
        },
      }

      const response = await bgpServer.handleRequest(request)

      expect(response.status).toBe(400)
      expect(response.body).toHaveProperty('error')
    })

    it('DELETE /bgp/peers/:asn - should remove peer', async () => {
      // First add a peer
      await bgpServer.getBGPSession().addPeer(65001, 'http://localhost:4445')

      const request: BGPEndpointRequest = {
        method: 'DELETE',
        path: '/bgp/peers/65001',
        headers: {},
      }

      const response = await bgpServer.handleRequest(request)

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('message')
      expect((response.body as ResponseBodyWithMessage).message).toContain(
        'AS65001 removed successfully',
      )
    })

    it('DELETE /bgp/peers/:asn - should handle invalid ASN', async () => {
      const request: BGPEndpointRequest = {
        method: 'DELETE',
        path: '/bgp/peers/invalid',
        headers: {},
      }

      const response = await bgpServer.handleRequest(request)

      expect(response.status).toBe(400)
      expect(response.body).toHaveProperty('error', 'Invalid ASN parameter')
    })
  })

  describe('Route Management Endpoints', () => {
    it('GET /bgp/routes - should list routes', async () => {
      const request: BGPEndpointRequest = {
        method: 'GET',
        path: '/bgp/routes',
        headers: {},
      }

      const response = await bgpServer.handleRequest(request)

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('localASN', 65000)
      expect(response.body).toHaveProperty('totalRoutes')
      expect(response.body).toHaveProperty('routes')
      expect(
        Array.isArray((response.body as ResponseBodyWithArray).routes),
      ).toBe(true)
    })

    it('POST /bgp/routes/update - should process BGP UPDATE', async () => {
      const update: BGPUpdate = {
        type: 'UPDATE',
        timestamp: new Date(),
        senderASN: 65001,
        advertisedRoutes: [
          {
            agentId: 'test-agent-1',
            capabilities: ['coding', 'debugging'],
            asPath: [65001],
            nextHop: 'http://localhost:4445',
            localPref: 100,
            med: 0,
            communities: [],
            originTime: new Date(),
            pathAttributes: new Map(),
          },
        ],
      }

      const request: BGPEndpointRequest = {
        method: 'POST',
        path: '/bgp/routes/update',
        headers: { 'Content-Type': 'application/json' },
        body: update,
      }

      const response = await bgpServer.handleRequest(request)

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty(
        'message',
        'BGP UPDATE processed successfully',
      )
      expect(response.body).toHaveProperty('advertisedRoutes', 1)
      expect(response.body).toHaveProperty('withdrawnRoutes', 0)
    })

    it('POST /bgp/routes/update - should reject invalid UPDATE', async () => {
      const request: BGPEndpointRequest = {
        method: 'POST',
        path: '/bgp/routes/update',
        headers: { 'Content-Type': 'application/json' },
        body: {
          type: 'UPDATE',
          // Missing senderASN
        },
      }

      const response = await bgpServer.handleRequest(request)

      expect(response.status).toBe(400)
      expect(response.body).toHaveProperty(
        'error',
        'Invalid BGP UPDATE message',
      )
    })

    it('POST /bgp/routes/withdraw - should withdraw routes', async () => {
      const request: BGPEndpointRequest = {
        method: 'POST',
        path: '/bgp/routes/withdraw',
        headers: { 'Content-Type': 'application/json' },
        body: {
          senderASN: 65001,
          agentIds: ['test-agent-1', 'test-agent-2'],
        },
      }

      const response = await bgpServer.handleRequest(request)

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('message')
      expect((response.body as ResponseBodyWithMessage).message).toContain(
        'Withdrew 2 routes from AS65001',
      )
    })
  })

  describe('Session Management Endpoints', () => {
    it('GET /bgp/sessions - should return session statistics', async () => {
      const request: BGPEndpointRequest = {
        method: 'GET',
        path: '/bgp/sessions',
        headers: {},
      }

      const response = await bgpServer.handleRequest(request)

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('localASN', 65000)
      expect(response.body).toHaveProperty('routerId', 'test-server-65000')
      expect(response.body).toHaveProperty('sessionStats')
    })

    it('POST /bgp/sessions/:asn/keepalive - should accept keepalive', async () => {
      const request: BGPEndpointRequest = {
        method: 'POST',
        path: '/bgp/sessions/65001/keepalive',
        headers: {},
      }

      const response = await bgpServer.handleRequest(request)

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty(
        'message',
        'Keepalive received from AS65001',
      )
    })
  })

  describe('BGP Protocol Endpoints', () => {
    it('POST /bgp/open - should handle BGP OPEN message', async () => {
      const request: BGPEndpointRequest = {
        method: 'POST',
        path: '/bgp/open',
        headers: { 'Content-Type': 'application/json' },
        body: {
          asn: 65001,
          routerId: 'peer-router-65001',
          holdTime: 90,
          capabilities: ['agent-routing'],
        },
      }

      const response = await bgpServer.handleRequest(request)

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('message', 'BGP OPEN accepted')
      expect(response.body).toHaveProperty('localASN', 65000)
      expect(response.body).toHaveProperty('capabilities')
    })

    it('POST /bgp/notification - should handle BGP NOTIFICATION', async () => {
      const request: BGPEndpointRequest = {
        method: 'POST',
        path: '/bgp/notification',
        headers: { 'Content-Type': 'application/json' },
        body: {
          senderASN: 65001,
          reason: 'Session termination',
        },
      }

      const response = await bgpServer.handleRequest(request)

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty(
        'message',
        'BGP NOTIFICATION received',
      )
    })
  })

  describe('Agent Discovery Endpoints', () => {
    it('GET /bgp/agents - should list agents', async () => {
      const request: BGPEndpointRequest = {
        method: 'GET',
        path: '/bgp/agents',
        headers: {},
      }

      const response = await bgpServer.handleRequest(request)

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('localASN', 65000)
      expect(response.body).toHaveProperty('totalAgents')
      expect(response.body).toHaveProperty('agents')
      expect(
        Array.isArray((response.body as ResponseBodyWithArray).agents),
      ).toBe(true)
    })

    it('GET /bgp/agents - should filter by capability', async () => {
      const request: BGPEndpointRequest = {
        method: 'GET',
        path: '/bgp/agents',
        headers: {},
        query: { capability: 'coding' },
      }

      const response = await bgpServer.handleRequest(request)

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('capabilityFilter', 'coding')
    })

    it('POST /bgp/agents/advertise - should advertise agent', async () => {
      const request: BGPEndpointRequest = {
        method: 'POST',
        path: '/bgp/agents/advertise',
        headers: { 'Content-Type': 'application/json' },
        body: {
          agentId: 'local-agent-1',
          capabilities: ['coding', 'debugging'],
          localPref: 110,
        },
      }

      const response = await bgpServer.handleRequest(request)

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('message')
      expect((response.body as ResponseBodyWithMessage).message).toContain(
        'local-agent-1 advertised successfully',
      )
      expect(response.body).toHaveProperty('advertisedTo')
      expect(response.body).toHaveProperty('route')
    })

    it('POST /bgp/agents/advertise - should reject invalid agent data', async () => {
      const request: BGPEndpointRequest = {
        method: 'POST',
        path: '/bgp/agents/advertise',
        headers: { 'Content-Type': 'application/json' },
        body: {
          agentId: 'local-agent-1',
          // Missing capabilities
        },
      }

      const response = await bgpServer.handleRequest(request)

      expect(response.status).toBe(400)
      expect(response.body).toHaveProperty('error')
    })
  })

  describe('Health and Status Endpoints', () => {
    it('GET /bgp/status - should return server status', async () => {
      const request: BGPEndpointRequest = {
        method: 'GET',
        path: '/bgp/status',
        headers: {},
      }

      const response = await bgpServer.handleRequest(request)

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('server', 'BGP Agent Router')
      expect(response.body).toHaveProperty('version', '1.0.0')
      expect(response.body).toHaveProperty('localASN', 65000)
      expect(response.body).toHaveProperty('status', 'healthy')
      expect(response.body).toHaveProperty('bgp')
    })

    it('GET /bgp/stats - should return detailed statistics', async () => {
      const request: BGPEndpointRequest = {
        method: 'GET',
        path: '/bgp/stats',
        headers: {},
      }

      const response = await bgpServer.handleRequest(request)

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('localASN', 65000)
      expect(response.body).toHaveProperty('routerId', 'test-server-65000')
      expect(response.body).toHaveProperty('sessionStats')
      expect(response.body).toHaveProperty('peerDetails')
      expect(
        Array.isArray((response.body as ResponseBodyWithArray).peerDetails),
      ).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should return 404 for unknown endpoints', async () => {
      const request: BGPEndpointRequest = {
        method: 'GET',
        path: '/bgp/unknown',
        headers: {},
      }

      const response = await bgpServer.handleRequest(request)

      expect(response.status).toBe(404)
      expect(response.body).toHaveProperty('error', 'BGP endpoint not found')
      expect(response.body).toHaveProperty('path', '/bgp/unknown')
    })

    it('should handle malformed requests gracefully', async () => {
      const request: BGPEndpointRequest = {
        method: 'POST',
        path: '/bgp/peers',
        headers: {},
        body: 'invalid-json',
      }

      // This should not throw an error, just return appropriate response
      const response = await bgpServer.handleRequest(request)
      expect(response.status).toBeGreaterThanOrEqual(400)
    })
  })

  describe('Pattern Matching', () => {
    it('should match parameterized routes correctly', async () => {
      const request: BGPEndpointRequest = {
        method: 'DELETE',
        path: '/bgp/peers/12345',
        headers: {},
      }

      const response = await bgpServer.handleRequest(request)

      // Should match the pattern even with different ASN
      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('message')
      expect((response.body as ResponseBodyWithMessage).message).toContain(
        'AS12345 removed successfully',
      )
    })

    it('should extract parameters correctly from URLs', async () => {
      const request: BGPEndpointRequest = {
        method: 'POST',
        path: '/bgp/sessions/99999/keepalive',
        headers: {},
      }

      const response = await bgpServer.handleRequest(request)

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty(
        'message',
        'Keepalive received from AS99999',
      )
    })
  })
})
