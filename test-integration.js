import('./dist/tools/bgp-integration.js')
  .then(async (bgp) => {
    console.log('BGP Available:', bgp.isBGPAvailable())
    const routes = await bgp.getBGPAgentRoutes()
    console.log('Routes:', routes.length)
  })
  .catch(console.error)
