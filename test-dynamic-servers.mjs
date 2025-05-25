import {
  addDynamicServer,
  removeDynamicServer,
  getDynamicServers,
  loadServerMappings,
  clearDynamicServers,
} from './dist/mcp-server.js'

console.log('🎯 Testing Dynamic Server Management')

// Clear any existing dynamic servers for clean test
clearDynamicServers()

// Test initial state
console.log('\n📋 Initial server state...')
const initialServers = loadServerMappings()
console.log('✅ Initial servers:', Array.from(initialServers.entries()))

// Test learning a new server
console.log('\n📚 Learning about a new server...')
try {
  const serverName = addDynamicServer('http://localhost:4222', 'test-server')
  console.log('✅ Learned server:', serverName)

  // Check dynamic servers
  const dynamicServers = getDynamicServers()
  console.log('✅ Dynamic servers:', Array.from(dynamicServers.entries()))

  // Check all servers
  const allServers = loadServerMappings()
  console.log('✅ All servers now:', Array.from(allServers.entries()))
} catch (error) {
  console.log('❌ Error learning server:', error.message)
}

// Test learning another server with auto-generated name
console.log('\n📚 Learning about another server (auto-name)...')
try {
  const serverName = addDynamicServer('http://localhost:4333')
  console.log('✅ Learned server with auto-name:', serverName)

  const allServers = loadServerMappings()
  console.log('✅ All servers now:', Array.from(allServers.entries()))
} catch (error) {
  console.log('❌ Error learning server:', error.message)
}

// Test duplicate server (should return existing name)
console.log('\n📚 Trying to learn about same server again...')
try {
  const serverName = addDynamicServer('http://localhost:4222', 'duplicate-test')
  console.log('✅ Duplicate server result:', serverName)
} catch (error) {
  console.log('❌ Error with duplicate:', error.message)
}

// Test forgetting a server
console.log('\n🧠 Forgetting about test-server...')
try {
  const removed = removeDynamicServer('test-server')
  console.log('✅ Forgot server:', removed)

  const remainingDynamic = getDynamicServers()
  console.log(
    '✅ Remaining dynamic servers:',
    Array.from(remainingDynamic.entries()),
  )

  const allServers = loadServerMappings()
  console.log('✅ All servers now:', Array.from(allServers.entries()))
} catch (error) {
  console.log('❌ Error forgetting server:', error.message)
}

// Test forgetting non-existent server
console.log('\n🧠 Trying to forget non-existent server...')
try {
  const removed = removeDynamicServer('non-existent')
  console.log('✅ Forgot non-existent server:', removed)
} catch (error) {
  console.log('❌ Error forgetting non-existent:', error.message)
}

// Test invalid URL
console.log('\n📚 Testing invalid URL...')
try {
  const serverName = addDynamicServer('not-a-url')
  console.log('✅ Added invalid URL:', serverName)
} catch (error) {
  console.log('✅ Correctly rejected invalid URL:', error.message)
}

// Final state
console.log('\n📋 Final state...')
const finalDynamic = getDynamicServers()
const finalAll = loadServerMappings()
console.log('✅ Final dynamic servers:', Array.from(finalDynamic.entries()))
console.log('✅ Final all servers:', Array.from(finalAll.entries()))

console.log('\n🎉 Dynamic server management tests completed!')
