import { multiServerAgentsTool } from './src/tools/multiServerAgentsTool.js';

// Test environment variables are properly loaded
console.log('Environment variables:');
console.log('MASTRA_SERVERS_CONFIG:', process.env.MASTRA_SERVERS_CONFIG);
console.log('MASTRA_SERVER_BASE_URL:', process.env.MASTRA_SERVER_BASE_URL);

async function testMultiServerTool() {
  try {
    console.log('\n=== Testing listMultiServerAgents tool ===');
    
    // Call the tool (should use env vars now)
    const result = await multiServerAgentsTool.execute({
      context: {} // No servers provided, should use env defaults
    });
    
    console.log('\nResult:');
    console.log(JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('Error testing multi-server tool:', error);
  }
}

testMultiServerTool(); 