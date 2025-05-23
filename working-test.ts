// working-test.ts - Direct test of our MCP tools
import { agentProxyTool } from "./src/tools/agentProxyTool.js";
import { listMastraAgentsTool } from "./src/tools/listMastraAgentsTool.js";

async function testMCPTools() {
  console.log('🧪 Direct MCP Tools Test');
  console.log('='.repeat(40));

  console.log('\n1. Testing listMastraAgents tool...');
  try {
    const listResult = await listMastraAgentsTool.execute({});
    console.log('✅ listMastraAgents result:', JSON.stringify(listResult, null, 2));
  } catch (error: any) {
    console.log('❌ listMastraAgents error:', error.message);
  }

  console.log('\n2. Testing callMastraAgent tool with weatherAgent...');
  try {
    const callResult = await agentProxyTool.execute({
      targetAgentId: 'weatherAgent',
      interactionType: 'generate',
      messages: [
        { role: 'user', content: 'What is the weather like in San Francisco?' }
      ]
    } as any);
    console.log('✅ callMastraAgent result:', JSON.stringify(callResult, null, 2));
  } catch (error: any) {
    console.log('❌ callMastraAgent error:', error.message);
  }

  console.log('\n3. Testing callMastraAgent tool with conversationAgent...');
  try {
    const callResult = await agentProxyTool.execute({
      targetAgentId: 'conversationAgent',
      interactionType: 'generate',
      messages: [
        { role: 'user', content: 'Hello! How are you today?' }
      ]
    } as any);
    console.log('✅ callMastraAgent result:', JSON.stringify(callResult, null, 2));
  } catch (error: any) {
    console.log('❌ callMastraAgent error:', error.message);
  }
}

testMCPTools().catch(console.error); 