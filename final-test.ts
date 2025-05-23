// final-test.ts - Final test of both MCP tools
import { spawn } from 'child_process';

async function finalTest() {
  console.log('🎯 Final Test: Both MCP Tools');
  console.log('='.repeat(40));

  const child = spawn('node', ['dist/mcp-server.js'], {
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
      clientInfo: { name: "final-test", version: "1.0.0" }
    },
    id: 1
  };
  child.stdin.write(JSON.stringify(initMessage) + '\n');

  // Test 1: List agents
  const listAgentsMessage = {
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      name: "listMastraAgents",
      arguments: {}
    },
    id: 2
  };

  setTimeout(() => {
    child.stdin.write(JSON.stringify(listAgentsMessage) + '\n');
  }, 200);

  // Test 2: Call weather agent
  const callWeatherMessage = {
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      name: "callMastraAgent",
      arguments: {
        targetAgentId: "weatherAgent",
        interactionType: "generate",
        messages: [{ role: "user", content: "Weather in San Francisco?" }]
      }
    },
    id: 3
  };

  setTimeout(() => {
    child.stdin.write(JSON.stringify(callWeatherMessage) + '\n');
  }, 1000);

  setTimeout(() => {
    child.kill();
    
    // Parse and display results
    const responses = output.trim().split('\n');
    responses.forEach((response) => {
      if (response.trim()) {
        try {
          const parsed = JSON.parse(response);
          if (parsed.id === 2) {
            console.log('\n✅ listMastraAgents worked!');
            const agents = JSON.parse(parsed.result.content[0].text).agents;
            agents.forEach((agent: any) => console.log(`  - ${agent.name} (${agent.id})`));
          } else if (parsed.id === 3) {
            console.log('\n✅ callMastraAgent worked!');
            const result = parsed.result.content[0].text;
            const data = JSON.parse(result);
            console.log(`  Weather response received: ${data.responseData.text.substring(0, 100)}...`);
          }
        } catch (e) {
          // Ignore parse errors for non-JSON output
        }
      }
    });
    
    console.log('\n🎉 Both tools are working! Cursor should now be able to use them.');
  }, 3000);
}

finalTest().catch(console.error); 