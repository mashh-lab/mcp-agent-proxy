import('./dist/tools/bgp-integration.js')
  .then(async (bgp) => {
    console.log('BGP Available:', bgp.isBGPAvailable())
    const routes = await bgp.getBGPAgentRoutes()
    console.log('BGP Routes:', routes.length)
    const networkAgents = await bgp.getBGPNetworkAgents()
    console.log('Network Agents:', networkAgents.length)
    if (networkAgents.length > 0) {
      console.log('First agent:', JSON.stringify(networkAgents[0], null, 2))
    }
  })
  .catch(console.error)
