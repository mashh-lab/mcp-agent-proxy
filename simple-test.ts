// simple-test.ts - Simple test to check MCP server connectivity

async function testMCPServer() {
  console.log('🧪 Simple MCP Server Test');
  console.log('=' .repeat(30));

  try {
    // Test basic HTTP connectivity
    console.log('1. Testing basic HTTP connectivity...');
    const response = await fetch('http://localhost:3001/mcp/sse');
    console.log(`✅ HTTP Status: ${response.status}`);
    console.log(`✅ Headers:`, Object.fromEntries(response.headers));
    
    // Read initial SSE data
    const reader = response.body?.getReader();
    if (reader) {
      console.log('2. Reading SSE stream...');
      const { value } = await reader.read();
      const data = new TextDecoder().decode(value);
      console.log(`✅ SSE Data: ${data}`);
      reader.releaseLock();
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testMCPServer().catch(console.error); 