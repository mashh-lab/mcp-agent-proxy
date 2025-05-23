// manual-test.ts - Manual test using MastraClient directly
import { MastraClient } from "@mastra/client-js";
import { loadMastraClientConfig } from "./src/config.js";

async function testMastraConnection() {
  console.log('🧪 Manual Mastra Connection Test');
  console.log('='.repeat(40));

  try {
    console.log('\n1. Loading configuration...');
    const config = loadMastraClientConfig();
    console.log('📍 Base URL:', config.baseUrl);

    console.log('\n2. Creating MastraClient...');
    const client = new MastraClient(config);

    console.log('\n3. Listing agents...');
    const agents = await client.getAgents();
    console.log('✅ Agents found:', Object.keys(agents));

    console.log('\n4. Testing weatherAgent...');
    const weatherAgent = client.getAgent('weatherAgent');
    const weatherResult = await weatherAgent.generate({
      messages: [
        { role: 'user', content: 'What is the weather like in New York?' }
      ]
    });
    console.log('✅ Weather agent response:', weatherResult);

    console.log('\n5. Testing conversationAgent...');
    const conversationAgent = client.getAgent('conversationAgent');
    const conversationResult = await conversationAgent.generate({
      messages: [
        { role: 'user', content: 'Hello! Tell me something interesting.' }
      ]
    });
    console.log('✅ Conversation agent response:', conversationResult);

    console.log('\n🎉 All tests passed! Your Mastra connection is working.');

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testMastraConnection().catch(console.error); 