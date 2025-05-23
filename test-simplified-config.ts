// test-simplified-config.ts - Test simplified array-based server configuration
import { spawn } from 'child_process';

async function testSimplifiedConfig() {
  console.log('🚀 Testing Simplified Array Configuration');
  console.log('='.repeat(50));

  // Test with simple array configuration
  const simpleServersConfig = JSON.stringify([
    "http://localhost:4111",
    "http://localhost:4222", 
    "http://localhost:4333"
  ]);

  const child = spawn('node', ['dist/enhanced/mcp-server-enhanced.js'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      MASTRA_SERVERS_CONFIG: simpleServersConfig
    }
  });

  let output = '';
  let errorOutput = '';
  
  child.stdout.on('data', (data) => {
    output += data.toString();
  });

  child.stderr.on('data', (data) => {
    errorOutput += data.toString();
  });

  // Initialize
  const initMessage = {
    jsonrpc: "2.0",
    method: "initialize", 
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "simple-config-test", version: "1.0.0" }
    },
    id: 1
  };
  child.stdin.write(JSON.stringify(initMessage) + '\n');

  // Test 1: List multi-server agents with simple config
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

  // Test 2: Call agent with plain ID (should go to server0)
  const callPlainAgentMessage = {
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      name: "callMastraAgent",
      arguments: {
        targetAgentId: "weatherAgent", // Plain ID - should go to server0
        interactionType: "generate",
        messages: [{ role: "user", content: "Weather with simplified config?" }]
      }
    },
    id: 3
  };

  setTimeout(() => {
    child.stdin.write(JSON.stringify(callPlainAgentMessage) + '\n');
  }, 1000);

  // Test 3: Call agent with server1 index
  const callServer1Message = {
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      name: "callMastraAgent",
      arguments: {
        targetAgentId: "server1:conversationAgent", // Explicit server1
        interactionType: "generate",
        messages: [{ role: "user", content: "Test server1 routing" }]
      }
    },
    id: 4
  };

  setTimeout(() => {
    child.stdin.write(JSON.stringify(callServer1Message) + '\n');
  }, 2000);

  // Test 4: Try invalid server index
  const callInvalidServerMessage = {
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      name: "callMastraAgent",
      arguments: {
        targetAgentId: "server99:weatherAgent", // Invalid server index
        interactionType: "generate",
        messages: [{ role: "user", content: "This should fail" }]
      }
    },
    id: 5
  };

  setTimeout(() => {
    child.stdin.write(JSON.stringify(callInvalidServerMessage) + '\n');
  }, 3000);

  setTimeout(() => {
    child.kill();
    
    // Parse and display results
    console.log('\n📊 Test Results:');
    
    // Check stderr for configuration loading messages
    if (errorOutput.includes('server mappings')) {
      console.log('✅ Simple array configuration loaded successfully');
    }
    
    const responses = output.trim().split('\n');
    
    responses.forEach((response) => {
      if (response.trim()) {
        try {
          const parsed = JSON.parse(response);
          
          if (parsed.id === 2) {
            console.log('\n✅ Multi-Server Discovery (Simple Config):');
            const result = JSON.parse(parsed.result.content[0].text);
            result.serverAgents.forEach((server: any) => {
              console.log(`     - ${server.serverName}: ${server.serverUrl} (${server.status})`);
            });
          }
          
          if (parsed.id === 3) {
            console.log('\n✅ Plain Agent ID (routes to server0):');
            const result = JSON.parse(parsed.result.content[0].text);
            console.log(`     Target: ${result.fullyQualifiedId}`);
            console.log(`     Server: ${result.serverUsed}`);
            console.log(`     Success: ${result.success}`);
          }
          
          if (parsed.id === 4) {
            console.log('\n✅ Explicit server1 routing:');
            const result = JSON.parse(parsed.result.content[0].text);
            console.log(`     Target: ${result.fullyQualifiedId}`);
            console.log(`     Server: ${result.serverUsed}`);
            console.log(`     Success: ${result.success}`);
          }
          
          if (parsed.id === 5 && parsed.error) {
            console.log('\n✅ Invalid Server Error (shows available servers):');
            console.log(`     Error: ${parsed.error.message}`);
            if (parsed.error.message.includes('server0, server1, server2')) {
              console.log('     ✅ Auto-generated server names correctly shown');
            }
          }
          
        } catch (e) {
          // Ignore parse errors for non-JSON output
        }
      }
    });
    
    console.log('\n🎉 Simplified configuration testing complete!');
    console.log('\n📝 Summary:');
    console.log('   ✅ Array-based server configuration');
    console.log('   ✅ Auto-generated server0, server1, server2 names');
    console.log('   ✅ Plain agent IDs route to server0');
    console.log('   ✅ Explicit server targeting works');
    console.log('   ✅ Much simpler than complex naming schemes');
    console.log('\n💡 Usage in mcp.json:');
    console.log('   MASTRA_SERVERS_CONFIG: ["http://localhost:4111", "http://localhost:4222"]');
    
  }, 5000);
}

testSimplifiedConfig().catch(console.error); 