# Test Suite for get-agent-description-tool.ts

This directory contains comprehensive unit tests for the `get-agent-description-tool.ts` module using Vitest.

## Test Coverage

The test suite achieves **100% code coverage** for the `get-agent-description-tool.ts` file, covering:

- ✅ All functions (`getAgentDescription`, `findAgentServers`)
- ✅ All agent resolution strategies
- ✅ All agent details retrieval scenarios
- ✅ All error handling paths
- ✅ All edge cases and parameter combinations

## Test Structure

### Main Test Categories

1. **Tool Configuration Tests**

   - Tool metadata validation
   - Schema definitions
   - Description content verification

2. **Agent Resolution Tests**

   - Fully qualified agent ID handling (`server:agentId`)
   - Explicit server URL override
   - Unique auto-resolution (agent found on one server)
   - Conflict resolution using default server (`server0`)
   - Conflict resolution using first available server
   - Error handling for unknown agents
   - Error handling for unknown servers
   - Server URL override for unknown servers
   - Server URL override with known server mapping

3. **Agent Details Retrieval Tests**

   - Comprehensive agent details
   - Minimal agent details
   - Empty agent details

4. **Retry Configuration Tests**

   - Correct retry config for interactions
   - Correct retry config for discovery
   - Custom retry configuration validation

5. **Error Handling Tests**

   - Agent details retrieval errors
   - Non-Error exceptions
   - Server discovery errors (graceful degradation)
   - Client creation errors

6. **Edge Cases Tests**
   - Empty server mappings
   - Malformed fully qualified IDs
   - Agent details with null values
   - Very large agent details

### Key Test Features

- **Comprehensive Mocking**: All external dependencies properly mocked
- **Type Safety**: Uses TypeScript types for better test reliability
- **Real-world Scenarios**: Tests actual usage patterns and edge cases
- **Agent Details Simulation**: Detailed agent metadata testing
- **Configuration Testing**: Validates retry and discovery configurations
- **Error Scenario Coverage**: Tests both Error objects and non-Error exceptions

## Test Scenarios Covered

### Agent Resolution Strategies

1. **Explicit Qualification**: `server0:agentName`
2. **URL Override**: Plain agent name + `serverUrl` parameter
3. **Unique Auto-Resolution**: Agent found on exactly one server
4. **Conflict Resolution**: Agent found on multiple servers
   - Prefers `server0` if available
   - Falls back to first available server
5. **Error Cases**: Agent not found, unknown server names

### Agent Details Retrieval

1. **Comprehensive Details**

   - Name, instructions, capabilities
   - Version, author, description
   - Parameters (temperature, maxTokens)
   - Metadata (created, updated dates)

2. **Minimal Details**

   - Basic agent information
   - Sparse metadata

3. **Edge Case Details**
   - Empty details objects
   - Null values in metadata
   - Very large data structures

### Configuration Testing

- **Discovery Config**: Used for agent discovery across servers
- **Interaction Config**: Used for agent details retrieval
- **Custom Retry Settings**: Validates configuration propagation

## Running Tests

```bash
# Run get-agent-description-tool tests only
pnpm test:run src/tools/get-agent-description-tool.test.ts

# Run all tests
pnpm test:run

# Run tests with coverage
pnpm test:coverage

# Run tests in watch mode
pnpm test:watch
```

## Test Dependencies

- **vitest**: Testing framework
- **@vitest/coverage-v8**: Coverage reporting
- **vi.mock()**: For mocking external dependencies

## Mock Strategy

The tests mock the following dependencies:

- `@mastra/client-js` - MastraClient for API calls and agent interactions
- `../config.js` - Configuration functions and logger

### Mock Patterns

1. **Client Mocking**: Different client instances for different servers
2. **Agent Mocking**: Mock agent methods (`details`)
3. **Details Mocking**: Mock agent details responses with various data structures
4. **Discovery Mocking**: Mock agent discovery across multiple servers
5. **Configuration Mocking**: Mock retry configs and server mappings

## Test Data Patterns

Tests use realistic data patterns that match actual agent metadata:

- Agent names and descriptions
- Instruction sets and capabilities
- Version information and authorship
- Configuration parameters (temperature, tokens)
- Metadata with timestamps and tags
- Large data structures for performance testing

## Coverage Details

- **Statement Coverage**: 100%
- **Branch Coverage**: 100%
- **Function Coverage**: 100%
- **Line Coverage**: 100%

Perfect coverage ensures every code path in the `get-agent-description-tool.ts` file is tested and verified.

## Key Testing Insights

1. **Agent Resolution Logic**: Thoroughly tested with all resolution strategies
2. **Details Retrieval**: Comprehensive testing of agent metadata handling
3. **Configuration Propagation**: Validates retry configs reach the right places
4. **Error Resilience**: Tests graceful degradation when servers are offline
5. **Data Handling**: Ensures various data structures are handled correctly
6. **Type Safety**: TypeScript types prevent runtime errors in tests

## Agent Details Test Scenarios

### Comprehensive Agent Details

```typescript
{
  name: 'Comprehensive Agent',
  instructions: 'This agent provides comprehensive functionality',
  capabilities: ['text-generation', 'analysis', 'summarization'],
  version: '2.1.0',
  author: 'Test Team',
  description: 'A fully featured test agent',
  parameters: {
    temperature: 0.7,
    maxTokens: 2048,
  },
  metadata: {
    created: '2024-01-01',
    updated: '2024-01-15',
  },
}
```

### Edge Case Testing

- **Null Values**: Tests handling of null instructions, capabilities
- **Large Data**: Tests performance with 10,000+ character instructions
- **Empty Objects**: Tests behavior with minimal agent information
- **Complex Structures**: Tests nested metadata and parameter objects

## Integration with Other Tools

This tool is designed to work in conjunction with:

- **`listAgents`**: Discover available agents first
- **`callAgent`**: Use detailed information for intelligent routing
- **Agent Networks**: Understand capabilities across multiple servers

The test suite validates that the tool provides the detailed agent information needed for intelligent agent-to-agent collaboration and routing decisions.

This test suite provides excellent confidence in the reliability and robustness of the get-agent-description-tool functionality.
