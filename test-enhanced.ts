// test-enhanced.ts - Test enhanced multi-server functionality
import { spawn } from 'child_process';

async function testEnhancedMCP() {
  console.log('🚀 Enhanced MCP Multi-Server Test');
  console.log('='.repeat(50));

  const child = spawn('node', ['dist/enhanced/mcp-server-enhanced.js'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: process.cwd()
  });

  let output = '';
  
  child.stdout.on('data', (data) => {
    output += data.toString();
  });

  child.stderr.on('data', (data) => {
    console.error('stderr:', data.toString());
  });

  // Initialize
  const initMessage = {
    jsonrpc: "2.0",
    method: "initialize", 
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "enhanced-test", version: "1.0.0" }
    },
    id: 1
  };
  child.stdin.write(JSON.stringify(initMessage) + '\n');

  // Test 1: List multi-server agents (with conflict detection)
  const listMultiServerMessage = {
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      name: "listMultiServerAgents",
      arguments: {}
    },
    id: 2
  };

  setTimeout(() => {
    child.stdin.write(JSON.stringify(listMultiServerMessage) + '\n');
  }, 200);

  // Test 2: Call agent using fully qualified ID
  const callQualifiedAgentMessage = {
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      name: "callMastraAgentEnhanced",
      arguments: {
        targetAgentId: "server1:weatherAgent", // Fully qualified ID
        interactionType: "generate",
        messages: [{ role: "user", content: "Weather in Los Angeles?" }]
      }
    },
    id: 3
  };

  setTimeout(() => {
    child.stdin.write(JSON.stringify(callQualifiedAgentMessage) + '\n');
  }, 1000);

  // Test 3: Call agent with explicit server URL
  const callWithServerUrlMessage = {
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      name: "callMastraAgentEnhanced",
      arguments: {
        targetAgentId: "conversationAgent",
        interactionType: "generate",
        serverUrl: "http://localhost:4111",
        messages: [{ role: "user", content: "Tell me about conflict resolution." }]
      }
    },
    id: 4
  };

  setTimeout(() => {
    child.stdin.write(JSON.stringify(callWithServerUrlMessage) + '\n');
  }, 2000);

  setTimeout(() => {
    child.kill();
    
    // Parse and display results
    console.log('\n📊 Test Results:');
    const responses = output.trim().split('\n');
    
    responses.forEach((response) => {
      if (response.trim()) {
        try {
          const parsed = JSON.parse(response);
          
          if (parsed.id === 2) {
            console.log('\n✅ Multi-Server Agent Discovery:');
            const result = JSON.parse(parsed.result.content[0].text);
            
            result.serverAgents.forEach((server: any) => {
              console.log(`\n  🖥️  ${server.serverName} (${server.status})`);
              console.log(`     URL: ${server.serverUrl}`);
              if (server.agents.length > 0) {
                server.agents.forEach((agent: any) => {
                  console.log(`     📦 ${agent.fullyQualifiedId} - ${agent.name}`);
                });
              } else if (server.error) {
                console.log(`     ❌ Error: ${server.error}`);
              }
            });
            
            if (result.summary.agentConflicts.length > 0) {
              console.log('\n  ⚠️  Agent Conflicts Detected:');
              result.summary.agentConflicts.forEach((conflict: any) => {
                console.log(`     ${conflict.agentId} exists on: ${conflict.servers.join(', ')}`);
              });
            }
            
            console.log(`\n  📈 Summary: ${result.summary.totalAgents} agents across ${result.summary.onlineServers}/${result.summary.totalServers} servers`);
          }
          
          if (parsed.id === 3) {
            console.log('\n✅ Fully Qualified Agent Call:');
            const result = JSON.parse(parsed.result.content[0].text);
            console.log(`     Agent: ${result.fullyQualifiedId}`);
            console.log(`     Server: ${result.serverUsed}`);
            console.log(`     Response: ${result.responseData.text.substring(0, 100)}...`);
          }
          
          if (parsed.id === 4) {
            console.log('\n✅ Server URL Override:');
            const result = JSON.parse(parsed.result.content[0].text);
            console.log(`     Agent: ${result.fullyQualifiedId}`);
            console.log(`     Server: ${result.serverUsed}`);
            console.log(`     Response: ${result.responseData.text.substring(0, 100)}...`);
          }
          
        } catch (e) {
          // Ignore parse errors for non-JSON output
        }
      }
    });
    
    console.log('\n🎉 Enhanced MCP server testing complete!');
    console.log('\n📝 Usage in Cursor:');
    console.log('   - Use listMultiServerAgents to see all agents with conflicts');
    console.log('   - Use server1:agentId or server2:agentId to resolve conflicts');
    console.log('   - Use callMastraAgentEnhanced for advanced features');
    
  }, 4000);
}

testEnhancedMCP().catch(console.error); 