import { MastraClient } from "@mastra/client-js";
import { enhancedAgentProxyTool } from "./src/tools/enhancedAgentProxyTool.js";
import { listMastraAgentsTool } from "./src/tools/listMastraAgentsTool.js";

async function testSmartResolution() {
  console.log("🧪 Testing Smart Agent Resolution\n");

  try {
    // First, list all agents to see what's available
    console.log("📋 Listing available agents across all servers...");
    const agentsList = await listMastraAgentsTool.execute({
      runtimeContext: {},
      context: {}
    });
    
    console.log("\n📊 Agent Distribution:");
    agentsList.serverAgents.forEach(server => {
      console.log(`  ${server.serverName} (${server.status}): ${server.agents.map(a => a.id).join(', ')}`);
    });

    if (agentsList.summary.agentConflicts.length > 0) {
      console.log("\n⚠️  Agent Conflicts Detected:");
      agentsList.summary.agentConflicts.forEach(conflict => {
        console.log(`  - ${conflict.agentId} exists on: ${conflict.servers.join(', ')}`);
      });
    }

    console.log("\n🔍 Testing Smart Resolution Scenarios:\n");

    // Test 1: Agent that exists on only one server (should auto-resolve)
    const uniqueAgents = agentsList.serverAgents
      .flatMap(server => server.agents.map(agent => ({ agentId: agent.id, serverName: server.serverName })))
      .reduce((acc, item) => {
        if (!acc[item.agentId]) acc[item.agentId] = [];
        acc[item.agentId].push(item.serverName);
        return acc;
      }, {} as Record<string, string[]>);

    const uniqueAgent = Object.entries(uniqueAgents).find(([_, servers]) => servers.length === 1);
    
    if (uniqueAgent) {
      const [agentId, servers] = uniqueAgent;
      console.log(`1️⃣ Testing unique agent '${agentId}' (only on ${servers[0]}):`);
      
      try {
        const result = await enhancedAgentProxyTool.execute({
          runtimeContext: {},
          context: {
            targetAgentId: agentId,
            interactionType: "generate",
            messages: [{ role: "user", content: "Hello! Please introduce yourself briefly." }]
          }
        });
        
        console.log(`   ✅ SUCCESS: Auto-resolved to ${result.fullyQualifiedId}`);
        console.log(`   📡 Server used: ${result.serverUsed}`);
        console.log(`   🎯 Resolution method: ${result.resolutionMethod}`);
        console.log(`   💬 Response: ${JSON.stringify(result.responseData).substring(0, 100)}...`);
      } catch (error: any) {
        console.log(`   ❌ FAILED: ${error.message}`);
      }
    } else {
      console.log("1️⃣ No unique agents found to test auto-resolution");
    }

    // Test 2: Agent that exists on multiple servers (should use default server)
    const conflictAgent = agentsList.summary.agentConflicts[0];
    if (conflictAgent) {
      console.log(`\n2️⃣ Testing conflicted agent '${conflictAgent.agentId}' (exists on: ${conflictAgent.servers.join(', ')}):`);
      
      try {
        const result = await enhancedAgentProxyTool.execute({
          runtimeContext: {},
          context: {
            targetAgentId: conflictAgent.agentId,
            interactionType: "generate",
            messages: [{ role: "user", content: "Hello! Which server are you on?" }]
          }
        });
        
        console.log(`   ✅ SUCCESS: Resolved to ${result.fullyQualifiedId}`);
        console.log(`   📡 Server used: ${result.serverUsed}`);
        console.log(`   🎯 Resolution method: ${result.resolutionMethod}`);
        console.log(`   💬 Response: ${JSON.stringify(result.responseData).substring(0, 100)}...`);
      } catch (error: any) {
        console.log(`   ❌ FAILED: ${error.message}`);
      }
    }

    // Test 3: Non-existent agent (should fail gracefully)
    console.log(`\n3️⃣ Testing non-existent agent 'nonExistentAgent':`);
    try {
      const result = await enhancedAgentProxyTool.execute({
        runtimeContext: {},
        context: {
          targetAgentId: "nonExistentAgent",
          interactionType: "generate",
          messages: [{ role: "user", content: "Hello!" }]
        }
      });
      
      console.log(`   ⚠️  UNEXPECTED SUCCESS: ${result.fullyQualifiedId}`);
    } catch (error: any) {
      console.log(`   ✅ EXPECTED FAILURE: ${error.message}`);
    }

    // Test 4: Explicit qualification still works
    if (conflictAgent) {
      const explicitId = `${conflictAgent.servers[1]}:${conflictAgent.agentId}`;
      console.log(`\n4️⃣ Testing explicit qualification '${explicitId}':`);
      
      try {
        const result = await enhancedAgentProxyTool.execute({
          runtimeContext: {},
          context: {
            targetAgentId: explicitId,
            interactionType: "generate",
            messages: [{ role: "user", content: "Hello! Confirm your server location." }]
          }
        });
        
        console.log(`   ✅ SUCCESS: Resolved to ${result.fullyQualifiedId}`);
        console.log(`   📡 Server used: ${result.serverUsed}`);
        console.log(`   🎯 Resolution method: ${result.resolutionMethod}`);
        console.log(`   💬 Response: ${JSON.stringify(result.responseData).substring(0, 100)}...`);
      } catch (error: any) {
        console.log(`   ❌ FAILED: ${error.message}`);
      }
    }

  } catch (error: any) {
    console.error("❌ Test failed:", error.message);
  }
}

// Run the test
testSmartResolution().catch(console.error); 