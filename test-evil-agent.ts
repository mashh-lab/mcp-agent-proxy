import { enhancedAgentProxyTool } from './src/tools/enhancedAgentProxyTool.js';

console.log('🧪 Testing evilConversationAgent auto-resolution...\n');

try {
  const result = await enhancedAgentProxyTool.execute({
    runtimeContext: {},
    context: {
      targetAgentId: 'evilConversationAgent',
      interactionType: 'generate',
      messages: [{ role: 'user', content: 'Hello evil agent! Can you tell me which server you are on?' }]
    }
  });

  console.log('✅ SUCCESS: Auto-resolved to', result.fullyQualifiedId);
  console.log('📡 Server used:', result.serverUsed);
  console.log('🎯 Resolution method:', result.resolutionMethod);
  console.log('💬 Response:', JSON.stringify(result.responseData, null, 2));
} catch (error) {
  console.error('❌ FAILED:', error.message);
} 