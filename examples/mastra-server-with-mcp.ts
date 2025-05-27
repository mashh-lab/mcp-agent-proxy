// @ts-nocheck
/**
 * Example: Mastra Server with MCP Agent Proxy Integration
 *
 * This example shows how to configure a Mastra server to use the mcp-agent-proxy
 * as an MCP client, enabling the "network effect" where your agents can access
 * entire networks of other agents through recursive proxy connections.
 *
 * Architecture:
 * MCP Client (Cursor) → mcp-agent-proxy → Mastra Server (this one) → MCPClient → mcp-agent-proxy → Other Mastra Servers
 */

import { MCPClient } from '@mastra/mcp'
import { Agent } from '@mastra/core'
import { createConversationAgent } from '@mastra/core'

// Initialize MCP client to connect to other agent networks
const mcpClient = new MCPClient({
  servers: {
    mcpAgentProxy: {
      command: 'npx',
      args: ['mcp-agent-proxy'],
      env: {
        AGENT_SERVERS: 'http://localhost:4222',
      },
      logger: (logMessage) => {
        console.log(`[${logMessage.level}] ${logMessage.message}`)
      },
    },
  },
})

// Create agents that have access to the entire agent network
const networkAwareAgent = new Agent({
  name: 'NetworkAwareAgent',
  instructions: `
    You are a powerful agent with access to other agent networks through MCP.
    
    You can:
    - Access agents on other Mastra servers (localhost:4222)
    - Coordinate workflows across multiple agent networks
    - Delegate specialized tasks to appropriate agents
    
    When users ask for help, consider which agents in your network would be best suited for the task.
    You can call agents using their IDs or fully qualified names like "server0:weatherAgent".
  `,

  // This gives the agent access to ALL tools from ALL connected networks
  tools: await mcpClient.getTools(),

  model: {
    provider: 'openai',
    name: 'gpt-4',
  },
})

// Create a conversation agent that also has network access
const conversationAgent = await createConversationAgent({
  name: 'ConversationAgent',
  instructions: `
    You are a helpful conversation agent with access to specialized agents across networks.
    
    You can delegate tasks to specialized agents on connected servers and coordinate 
    responses across different agent networks through MCP.
  `,

  // Automatically includes MCP tools when using createConversationAgent()
  tools: await mcpClient.getTools(),

  model: {
    provider: 'openai',
    name: 'gpt-4',
  },
})

// Example: Agent that can orchestrate across networks
const orchestratorAgent = new Agent({
  name: 'OrchestratorAgent',
  instructions: `
    You specialize in coordinating tasks across multiple agent networks.
    
    Your workflow:
    1. Understand the user's request
    2. Identify which agents on which servers can help
    3. Coordinate calls to multiple agents as needed
    4. Synthesize results into a coherent response
    
    You have access to agents on localhost:4222 through the MCP proxy.
  `,

  tools: await mcpClient.getTools(),

  model: {
    provider: 'openai',
    name: 'gpt-4',
  },
})

// Export agents for your Mastra server
export { networkAwareAgent, conversationAgent, orchestratorAgent }

/*
 * Usage Notes:
 *
 * 1. The MCP Client configuration above connects this Mastra server to other agent networks
 * 2. All agents created here automatically have access to agents from those networks
 * 3. Users can access this server's agents AND the networked agents through a single interface
 * 4. This creates exponential connectivity - one proxy connection unlocks entire ecosystems
 *
 * Example workflow:
 * - User asks Cursor: "What's the weather and analyze the data?"
 * - Cursor → mcp-agent-proxy → This Mastra Server → conversationAgent
 * - conversationAgent → MCPClient → mcp-agent-proxy → Other Mastra Server → weatherAgent
 * - conversationAgent → MCPClient → mcp-agent-proxy → Other Mastra Server → analysisAgent
 * - Results flow back through the chain to the user
 *
 * This is the "network effect" in action!
 */
