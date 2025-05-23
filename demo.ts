#!/usr/bin/env tsx
// demo.ts - Standalone demo for the MCP Mastra Agent Proxy

import { MCPClient } from '@mastra/mcp';
import { URL } from 'url';

async function demonstrateMCPProxy() {
  console.log('🚀 MCP Mastra Agent Proxy Demo');
  console.log('=' .repeat(50));

  try {
    // Create an MCP client to connect to our proxy server
    const mcpClient = new MCPClient({
      servers: {
        mastraProxy: {
          url: new URL('http://localhost:3001/mcp/sse'),
        }
      }
    });

    console.log('\n📋 Fetching available tools from MCP proxy server...');
    
    const toolsByServer = await mcpClient.getTools();
    const proxyTools = toolsByServer.mastraProxy;

    if (!proxyTools || proxyTools.length === 0) {
      console.error('❌ No tools found from MCP proxy server');
      console.log('💡 Make sure the MCP server is running with: pnpm start');
      return;
    }

    console.log('✅ Available MCP Tools:');
    proxyTools.forEach((tool: any, index: number) => {
      console.log(`  ${index + 1}. ${tool.id} - ${tool.description || 'No description'}`);
    });

    // Test 1: List available Mastra agents (if the tool exists)
    console.log('\n🔍 Testing listMastraAgents tool...');
    const listAgentsTool = proxyTools.find((t: any) => t.id === 'listMastraAgents');
    
    if (listAgentsTool) {
      try {
        const agentsList = await listAgentsTool.execute({});
        console.log('✅ Available agents on target Mastra server:');
        if (agentsList.agents && agentsList.agents.length > 0) {
          agentsList.agents.forEach((agent: any, index: number) => {
            console.log(`  ${index + 1}. ${agent.id}${agent.name ? ` (${agent.name})` : ''}`);
          });
        } else {
          console.log('  📭 No agents found on target server');
        }
      } catch (error: any) {
        console.log('⚠️  Could not list agents:', error.message);
        console.log('💡 This is expected if the target Mastra server is not running');
      }
    } else {
      console.log('⚠️  listMastraAgents tool not found');
    }

    // Test 2: Call a Mastra agent (if the tool exists)
    console.log('\n💬 Testing callMastraAgent tool...');
    const callAgentTool = proxyTools.find((t: any) => t.id === 'callMastraAgent');
    
    if (callAgentTool) {
      try {
        console.log('📤 Sending test message to agent...');
        const result = await callAgentTool.execute({
          targetAgentId: 'test-agent', // This would need to be a real agent ID
          interactionType: 'generate',
          messages: [
            { role: 'user', content: 'Hello! This is a test message from the MCP proxy demo.' }
          ],
        });
        
        console.log('✅ Agent response received:');
        console.log('📋 Response data:', JSON.stringify(result.responseData, null, 2));
      } catch (error: any) {
        console.log('⚠️  Could not call agent:', error.message);
        console.log('💡 This is expected if:');
        console.log('   - The target Mastra server is not running');
        console.log('   - The agent "test-agent" does not exist');
        console.log('   - The target server is not accessible');
      }
    } else {
      console.log('❌ callMastraAgent tool not found');
    }

    console.log('\n✨ Demo completed!');
    console.log('\n📝 Next steps:');
    console.log('1. Start a Mastra server with agents at http://localhost:4111');
    console.log('2. Update MASTRA_SERVER_BASE_URL in .env if using a different URL');
    console.log('3. Replace "test-agent" with actual agent IDs from your Mastra server');
    console.log('4. Integrate with MCP-compliant clients like Cursor or Windsurf');

  } catch (error: any) {
    console.error('❌ Demo failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('- Ensure the MCP proxy server is running: pnpm start');
    console.log('- Check that port 3001 is not in use by another service');
    console.log('- Verify network connectivity to localhost:3001');
  }
}

// Export for use as a module
export { demonstrateMCPProxy };

// Run directly if this file is executed
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateMCPProxy().catch(console.error);
} 