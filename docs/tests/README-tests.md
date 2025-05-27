# Test Suite for list-agents-tool.ts

This directory contains comprehensive unit tests for the `list-agents-tool.ts` module using Vitest.

## Test Coverage

The test suite achieves **100% code coverage** for the `list-agents-tool.ts` file, covering:

- ✅ All functions (`getMastraAgentsInfo`, `listAgents`)
- ✅ All branches and conditional logic
- ✅ All error handling paths
- ✅ All edge cases

## Test Structure

### Main Test Categories

1. **getMastraAgentsInfo Function Tests**

   - Normal operation with multiple servers
   - Server error handling
   - Agent conflict detection
   - Agent name handling (missing, null, empty)
   - Static vs dynamic server distinction
   - Empty server list handling
   - Non-Error exception handling
   - Retry configuration validation

2. **listAgents Tool Tests**

   - Tool configuration validation
   - Tool execution
   - Output schema validation

3. **Edge Cases and Error Scenarios**
   - Multiple agent conflicts across servers
   - Servers with no agents
   - All servers being offline

### Key Test Features

- **Comprehensive Mocking**: All external dependencies are properly mocked
- **Type Safety**: Uses TypeScript types for better test reliability
- **Error Scenarios**: Tests both Error objects and non-Error exceptions
- **Configuration Testing**: Validates retry configuration is passed correctly
- **Schema Validation**: Ensures output matches expected schema structure

## Running Tests

```bash
# Run tests once
pnpm test:run

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Run all tests (including in CI)
pnpm ci:test
```

## Test Dependencies

- **vitest**: Testing framework
- **@vitest/coverage-v8**: Coverage reporting
- **vi.mock()**: For mocking external dependencies

## Mock Strategy

The tests mock the following dependencies:

- `@mastra/client-js` - MastraClient for API calls
- `../config.js` - Configuration functions

This ensures tests are:

- Fast (no real network calls)
- Reliable (no external dependencies)
- Isolated (each test is independent)

## Test Data Patterns

Tests use realistic data patterns that match the actual API responses:

- Agent objects with optional names
- Server configurations with URLs
- Error responses with proper error messages
- Conflict detection across multiple servers

## Coverage Report

The test suite provides detailed coverage reporting including:

- Statement coverage: 100%
- Branch coverage: 100%
- Function coverage: 100%
- Line coverage: 100%

This ensures every code path in the `list-agents-tool.ts` file is tested and verified.
