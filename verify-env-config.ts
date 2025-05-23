import { loadServerMappings } from './src/config.js';

console.log('=== Environment Configuration Verification ===');
console.log('Current working directory:', process.cwd());
console.log('');

// Check environment variables
console.log('Environment Variables:');
console.log('MASTRA_SERVER_BASE_URL:', process.env.MASTRA_SERVER_BASE_URL);
console.log('MASTRA_SERVERS_CONFIG:', process.env.MASTRA_SERVERS_CONFIG);
console.log('MCP_SERVER_PORT:', process.env.MCP_SERVER_PORT);
console.log('');

// Check what loadServerMappings returns
console.log('Loading server mappings...');
const serverMappings = loadServerMappings();
console.log('Server mappings loaded:');
for (const [name, url] of serverMappings.entries()) {
  console.log(`  ${name}: ${url}`);
}
console.log('Total servers:', serverMappings.size); 