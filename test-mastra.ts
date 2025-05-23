// test-mastra.ts - Test direct connection to Mastra server
import { MastraClient } from "@mastra/client-js";

async function testMastraServer() {
  console.log('🧪 Testing direct connection to Mastra server...');
  
  // Test both possible URLs
  const urlsToTest = [
    'http://localhost:4111',
    'http://localhost:4111/api'
  ];
  
  for (const baseUrl of urlsToTest) {
    console.log(`\n📍 Testing URL: ${baseUrl}`);
    
    try {
      const client = new MastraClient({
        baseUrl: baseUrl
      });
      
      console.log('📋 Attempting to list agents...');
      const agents = await client.getAgents();
      console.log('✅ Success! Agents found:', Object.keys(agents));
      
      // If we found agents, test getting one
      const agentIds = Object.keys(agents);
      if (agentIds.length > 0) {
        console.log(`🎯 Testing agent: ${agentIds[0]}`);
        const agent = client.getAgent(agentIds[0]);
        console.log('✅ Agent retrieved successfully');
      }
      
      // This URL worked, so let's use it
      console.log(`\n🎉 SUCCESS! Use this base URL: ${baseUrl}`);
      return baseUrl;
      
    } catch (error: any) {
      console.log(`❌ Failed with ${baseUrl}:`, error.message);
    }
  }
  
  console.log('\n💡 Neither URL worked. Check your Mastra server configuration.');
}

testMastraServer().catch(console.error); 