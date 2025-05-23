// src/test-client.ts
import { MCPClient } from '@mastra/mcp';
import { URL } from 'url';
import dotenv from 'dotenv';

dotenv.config();

async function testAgentProxyMCPServer() {
  const mcpClient = new MCPClient({
    servers: {
      mastraProxy: { // An arbitrary name for this client's connection config
        // Configuration for HTTP/SSE transport
        url: new URL(`http://localhost:${process.env.MCP_SERVER_PORT || 3001}${process.env.MCP_SSE_PATH || '/mcp/sse'}`),
      }
    }
  });

  try {
    console.log("Fetching tools from MCP server...");
    const toolsByServer = await mcpClient.getTools();
    const proxyTools = toolsByServer.mastraProxy; // Use the key defined above

    if (!proxyTools || proxyTools.length === 0) {
      console.error("No tools found from 'mastraProxy' server.");
      return;
    }
    console.log("Available MCP Tools from mastraProxy:", proxyTools.map((t: any) => t.id));

    // Test listMastraAgents tool if available
    const listAgentsTool = proxyTools.find((t: any) => t.id === 'listMastraAgents');
    if (listAgentsTool) {
        console.log("\nTesting 'listMastraAgents' tool...");
        try {
          const listResult = await listAgentsTool.execute({});
          console.log("Result from 'listMastraAgents':", JSON.stringify(listResult, null, 2));
        } catch (error) {
          console.error("Error testing listMastraAgents:", error);
        }
    }

    // Test callMastraAgent tool if available
    const callAgentTool = proxyTools.find((t: any) => t.id === 'callMastraAgent');
    if (callAgentTool) {
      console.log("\nTesting 'callMastraAgent' tool...");
      try {
        const result = await callAgentTool.execute({
          targetAgentId: 'test-agent', // Replace with a valid agent ID on your target Mastra server
          interactionType: 'generate',
          messages: [{ role: 'user', content: 'Hello from MCP test client!' }],
        });
        console.log("Result from 'callMastraAgent':", JSON.stringify(result, null, 2));
      } catch (error) {
        console.error("Error testing callMastraAgent:", error);
      }
    } else {
      console.error("'callMastraAgent' tool not found.");
    }

  } catch (error) {
    console.error("Error during MCP client test:", error);
  }
}

// Run the test
testAgentProxyMCPServer().catch(console.error); 