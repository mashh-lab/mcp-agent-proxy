#!/usr/bin/env node

// BGP Route Reflection Sanity Check Demo
const { BGPRouteReflector } = await import('./src/bgp/route-reflection.ts')

console.log('🚀 BGP Route Reflection Demo\n')

// Create route reflector
const config = {
  reflectorId: 'demo-rr-1',
  localASN: 65000,
  clusterId: 'demo-cluster',
  isRouteReflector: true,
}

const routeReflector = new BGPRouteReflector(config)

// Set up event listeners
routeReflector.on('routeReflected', (event) => {
  console.log(
    `   ✅ Route ${event.route.agentId} reflected to ${event.targetPeer.address}`,
  )
})

routeReflector.on('clientAdded', (client) => {
  console.log(`   📋 Added ${client.clientType} client: AS${client.peer.asn}`)
})

// Sample peers
const peers = [
  {
    asn: 65001,
    address: 'http://ibgp-client.example.com',
    status: 'established',
    lastUpdate: new Date(),
    routesReceived: 0,
    routesSent: 0,
  },
  {
    asn: 65002,
    address: 'http://ibgp-non-client.example.com',
    status: 'established',
    lastUpdate: new Date(),
    routesReceived: 0,
    routesSent: 0,
  },
  {
    asn: 65003,
    address: 'http://ebgp-peer.example.com',
    status: 'established',
    lastUpdate: new Date(),
    routesReceived: 0,
    routesSent: 0,
  },
]

// Sample route
const route = {
  agentId: 'external-agent-1',
  capabilities: ['coding', 'analysis'],
  asPath: [65003, 65200],
  nextHop: 'http://external.example.com',
  localPref: 100,
  med: 10,
  communities: ['external:route'],
  originTime: new Date(),
  pathAttributes: new Map([['source', 'external']]),
}

console.log('📋 Setting up BGP Route Reflection scenario:')

// Add clients of different types
console.log('\n   Adding clients:')
routeReflector.addClient(peers[0], 'ibgp-client')
routeReflector.addClient(peers[1], 'ibgp-non-client')
routeReflector.addClient(peers[2], 'ebgp')

console.log('\n   Processing route from EBGP peer:')
console.log(`   📤 Route ${route.agentId} from AS${peers[2].asn} (EBGP)`)

// Process route from EBGP peer (should reflect to all IBGP peers)
routeReflector.processIncomingRoute(route, peers[2])

// Get reflection stats
const stats = routeReflector.getReflectorStats()
console.log('\n📊 Route Reflection Stats:')
console.log(`   Total Clients: ${stats.totalClients}`)
console.log(`   IBGP Clients: ${stats.clientsByType['ibgp-client']}`)
console.log(`   IBGP Non-clients: ${stats.clientsByType['ibgp-non-client']}`)
console.log(`   EBGP Peers: ${stats.clientsByType['ebgp']}`)
console.log(`   Total Reflected Routes: ${stats.totalReflectedRoutes}`)
console.log(`   Total Decisions: ${stats.totalDecisions}`)

// Get recent decisions
const decisions = routeReflector.getRecentDecisions(5)
console.log('\n📋 Recent Reflection Decisions:')
decisions.forEach((decision, i) => {
  console.log(
    `   ${i + 1}. ${decision.reason} -> ${decision.reflectToClients.length} clients`,
  )
})

await routeReflector.shutdown()
console.log('\n✅ Route Reflection Demo Complete!')
