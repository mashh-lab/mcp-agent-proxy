// test-stdio.ts - Test stdio MCP communication
import { spawn } from 'child_process';

async function testStdioMCP() {
  console.log('🧪 Testing MCP Server via stdio (like Cursor does)');
  console.log('='.repeat(50));

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

  // Send list tools message
  const listToolsMessage = {
    jsonrpc: "2.0",
    method: "tools/list",
    params: {},
    id: 2
  };

  setTimeout(() => {
    child.stdin.write(JSON.stringify(listToolsMessage) + '\n');
  }, 100);

  setTimeout(() => {
    child.kill();
    console.log('\n📋 MCP Server Response:');
    const responses = output.trim().split('\n');
    responses.forEach((response, i) => {
      if (response.trim()) {
        try {
          const parsed = JSON.parse(response);
          console.log(`\n${i + 1}. ${parsed.method || 'Response to ID ' + parsed.id}:`);
          console.log(JSON.stringify(parsed, null, 2));
        } catch (e) {
          console.log(`${i + 1}. Raw output: ${response}`);
        }
      }
    });
  }, 500);
}

testStdioMCP().catch(console.error); 