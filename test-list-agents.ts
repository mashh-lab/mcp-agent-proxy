// test-list-agents.ts - Test listMastraAgents via stdio
import { spawn } from 'child_process';

async function testListAgentsStdio() {
  console.log('🧪 Testing listMastraAgents via stdio');
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

  // Send initialize message
  const initMessage = {
    jsonrpc: "2.0",
    method: "initialize", 
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" }
    },
    id: 1
  };

  child.stdin.write(JSON.stringify(initMessage) + '\n');

  // Send call listMastraAgents tool
  const callToolMessage = {
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      name: "listMastraAgents",
      arguments: {}
    },
    id: 3
  };

  setTimeout(() => {
    child.stdin.write(JSON.stringify(callToolMessage) + '\n');
  }, 200);

  setTimeout(() => {
    child.kill();
    console.log('\n📋 MCP Server Response:');
    const responses = output.trim().split('\n');
    responses.forEach((response, i) => {
      if (response.trim()) {
        try {
          const parsed = JSON.parse(response);
          if (parsed.id === 3) {
            console.log(`\n✅ listMastraAgents result:`);
            console.log(JSON.stringify(parsed.result, null, 2));
          }
        } catch (e) {
          console.log(`${i + 1}. Raw output: ${response}`);
        }
      }
    });
  }, 800);
}

testListAgentsStdio().catch(console.error); 