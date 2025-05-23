// debug-call-agent.ts - Debug test for callMastraAgent
import { spawn } from 'child_process';

async function debugCallAgent() {
  console.log('🔍 Debugging callMastraAgent tool via stdio');
  console.log('='.repeat(50));

  const child = spawn('node', ['dist/mcp-server.js'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: process.cwd()
  });

  let output = '';
  let errors = '';
  
  child.stdout.on('data', (data) => {
    output += data.toString();
  });

  child.stderr.on('data', (data) => {
    errors += data.toString();
  });

  // Send initialize message
  const initMessage = {
    jsonrpc: "2.0",
    method: "initialize", 
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "debug-client", version: "1.0.0" }
    },
    id: 1
  };

  child.stdin.write(JSON.stringify(initMessage) + '\n');

  // Send call callMastraAgent tool
  const callToolMessage = {
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      name: "callMastraAgent",
      arguments: {
        targetAgentId: "weatherAgent",
        interactionType: "generate",
        messages: [
          {
            role: "user",
            content: "What's the weather like in Costa Mesa?"
          }
        ]
      }
    },
    id: 4
  };

  setTimeout(() => {
    child.stdin.write(JSON.stringify(callToolMessage) + '\n');
  }, 200);

  setTimeout(() => {
    child.kill();
    console.log('\n📋 STDOUT Output:');
    console.log(output);
    console.log('\n❌ STDERR Output:');
    console.log(errors);
    
    // Try to parse responses
    console.log('\n🔍 Parsed Responses:');
    const responses = output.trim().split('\n');
    responses.forEach((response, i) => {
      if (response.trim()) {
        try {
          const parsed = JSON.parse(response);
          if (parsed.id === 4) {
            console.log(`\n✅ callMastraAgent result (ID ${parsed.id}):`);
            console.log(JSON.stringify(parsed, null, 2));
          }
        } catch (e) {
          console.log(`${i + 1}. Raw output: ${response}`);
        }
      }
    });
  }, 2000);
}

debugCallAgent().catch(console.error); 