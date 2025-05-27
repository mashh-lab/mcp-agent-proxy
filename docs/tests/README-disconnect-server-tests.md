# Test Suite for disconnect-server-tool.ts

This directory contains comprehensive unit tests for the `disconnect-server-tool.ts` module using Vitest.

## Test Coverage

The test suite achieves **100% code coverage** for the `disconnect-server-tool.ts` file, covering:

- ✅ All functions (`disconnectServer`)
- ✅ All server disconnection scenarios
- ✅ All error handling paths (server not found, removal failures, configuration errors)
- ✅ All edge cases and parameter combinations
- ✅ All integration scenarios

## Test Structure

### Main Test Categories

1. **Tool Configuration Tests**

   - Tool metadata validation
   - Schema definitions
   - Description content verification (including environment variable restrictions)

2. **Successful Server Disconnection Tests**

   - Disconnecting existing dynamic servers
   - Disconnecting the last dynamic server
   - Servers with special characters in names

3. **Server Not Found Error Tests**

   - Server not found with no dynamic servers
   - Server not found with existing dynamic servers
   - Case-sensitive server name matching

4. **Removal Failure Error Tests**

   - removeDynamicServer returning false
   - removeDynamicServer throwing errors
   - Non-Error exceptions from removal

5. **getDynamicServers Error Tests**

   - Errors during initial server existence check
   - Errors during final remaining servers check

6. **Input Validation Tests**

   - Empty server names
   - Server names with whitespace

7. **Edge Cases Tests**

   - Very long server names
   - Large number of remaining servers
   - Unicode characters in server names
   - Null/undefined values from configuration

8. **Integration Scenarios Tests**
   - Disconnecting multiple servers in sequence
   - Helpful error messages for troubleshooting

### Key Test Features

- **Comprehensive Mocking**: All external dependencies properly mocked
- **Type Safety**: Uses TypeScript types for better test reliability
- **Real-world Scenarios**: Tests actual usage patterns and edge cases
- **Error Message Testing**: Validates helpful error messages for troubleshooting
- **Configuration Testing**: Validates integration with dynamic server management
- **Sequential Operations**: Tests multiple disconnections in sequence

## Test Scenarios Covered

### Successful Disconnection Scenarios

1. **Standard Disconnection**: Removes server from list of multiple servers
2. **Last Server Disconnection**: Removes the final dynamic server (empty list result)
3. **Special Characters**: Handles server names with hyphens, underscores, numbers

### Error Handling Scenarios

1. **Server Not Found**: Clear error messages with available server suggestions
2. **Removal Failures**: Handles both boolean false returns and thrown exceptions
3. **Configuration Errors**: Handles errors from getDynamicServers function
4. **Type Safety**: Handles non-Error exceptions gracefully

### Input Validation

1. **Empty Names**: Handles empty server name strings
2. **Whitespace**: Supports server names with spaces
3. **Case Sensitivity**: Enforces exact case matching for server names
4. **Unicode Support**: Handles international characters and emojis

### Edge Cases

1. **Long Names**: Very long server names (100+ characters)
2. **Large Lists**: Many remaining servers (100+ servers)
3. **Unicode Characters**: International characters and emojis in names
4. **Null Values**: Graceful handling of null/undefined configuration responses

## Running Tests

```bash
# Run disconnect-server-tool tests only
pnpm test:run src/tools/disconnect-server-tool.test.ts

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

- `../config.js` - Configuration functions for server management and logging

### Mock Patterns

1. **Server Management**: Mock getDynamicServers and removeDynamicServer functions
2. **State Simulation**: Different Map instances for before/after server states
3. **Error Simulation**: Mock various error conditions and edge cases
4. **Logging**: Mock logger for error tracking validation
5. **Sequential Operations**: Mock multiple calls with different return values

## Test Data Patterns

Tests use realistic data patterns that match actual server management:

- Server names in various formats (simple, hyphenated, underscored)
- Server URLs in standard HTTP/HTTPS formats
- Map-based server storage matching actual implementation
- Error messages matching actual error conditions
- Large datasets for performance testing

## Coverage Details

- **Statement Coverage**: 100%
- **Branch Coverage**: 100%
- **Function Coverage**: 100%
- **Line Coverage**: 100%

Perfect coverage ensures every code path in the `disconnect-server-tool.ts` file is tested and verified.

## Key Testing Insights

1. **Server Existence Validation**: Thoroughly tested server lookup logic
2. **Error Message Quality**: Validates helpful error messages with server suggestions
3. **State Management**: Tests proper before/after server state handling
4. **Configuration Integration**: Validates integration with dynamic server management
5. **Type Safety**: Ensures graceful handling of various data types and edge cases
6. **Sequential Operations**: Tests realistic usage patterns with multiple operations

## Server Disconnection Test Scenarios

### Successful Disconnection

```typescript
{
  serverName: 'targetServer'
}
// Before: ['server1', 'server2', 'targetServer']
// After: ['server1', 'server2']
// Returns: success, serverName, message, remainingDynamicServers
```

### Server Not Found

```typescript
{
  serverName: 'nonexistentServer'
}
// Available: ['server1', 'server2', 'server3']
// Error: "Server 'nonexistentServer' not found... Available: server1, server2, server3"
```

### Last Server Disconnection

```typescript
{
  serverName: 'lastServer'
}
// Before: ['lastServer']
// After: []
// Returns: success with empty remainingDynamicServers array
```

## Error Handling Test Scenarios

### Configuration Errors

- **getDynamicServers Failure**: Tests errors during server list retrieval
- **removeDynamicServer Failure**: Tests both boolean false and thrown exceptions
- **Non-Error Exceptions**: Tests string and other non-Error thrown values

### Input Validation

- **Empty Names**: Handles empty string server names
- **Case Sensitivity**: Enforces exact case matching (MyServer ≠ myserver)
- **Special Characters**: Supports valid server name patterns

## Integration with Other Tools

This tool is designed to work in conjunction with:

- **`connectServer`**: Add servers that can later be disconnected
- **`listAgents`**: Verify agents are no longer available after disconnection
- **Dynamic Server Management**: Clean up runtime-connected servers
- **Agent Networks**: Manage agent network topology

The test suite validates that the tool provides reliable server disconnection functionality for dynamic agent network management.

## Edge Case Testing

### Unicode and Special Characters

- **International Characters**: Tests Chinese characters (测试)
- **Emojis**: Tests emoji characters (🚀)
- **Accented Characters**: Tests accented characters (émoji)
- **Mixed Content**: Tests combinations of special characters

### Performance and Scale

- **Large Server Lists**: Tests with 100+ servers
- **Long Server Names**: Tests very long server names (100+ characters)
- **Sequential Operations**: Tests multiple disconnections in sequence
- **Memory Management**: Validates proper cleanup of server references

## Error Message Quality

The tests validate that error messages are:

- **Descriptive**: Clear explanation of what went wrong
- **Actionable**: Include available server names for correction
- **Consistent**: Follow consistent error message patterns
- **Helpful**: Assist users in identifying correct server names

### Example Error Messages

```
"Server 'prod-server' not found in dynamically connected servers.
Available connected servers: production-server, staging-server, development-server"
```

This helps users identify typos and find the correct server name.

## Integration Scenarios

### Sequential Disconnections

Tests validate that multiple disconnections work correctly:

1. **First Disconnection**: Remove server1, verify remaining servers
2. **Second Disconnection**: Remove server2, verify updated remaining servers
3. **State Consistency**: Ensure server lists are properly maintained

### Error Recovery

Tests validate graceful error handling:

- **Partial Failures**: Some operations succeed, others fail gracefully
- **State Preservation**: Failed operations don't corrupt server state
- **Logging**: All errors are properly logged for debugging

This test suite provides excellent confidence in the reliability and robustness of the disconnect-server-tool functionality, ensuring it can safely and effectively manage dynamic server connections in agent networks.
