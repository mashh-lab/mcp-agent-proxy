# Contributing to MCP Agent Proxy

Thank you for your interest in contributing to MCP Agent Proxy! This guide will help you get started with contributing to the project.

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct. Please be respectful and constructive in all interactions.

## Getting Started

### Prerequisites

- **Node.js**: Version 18 or higher
- **pnpm**: We use pnpm as our package manager
- **Git**: For version control

### Development Setup

1. **Fork and clone the repository**:

   ```bash
   git clone https://github.com/your-username/mcp-agent-proxy.git
   cd mcp-agent-proxy
   ```

2. **Install dependencies**:

   ```bash
   pnpm install
   ```

3. **Set up environment**:

   ```bash
   cp .env .env.local
   # Edit .env.local with your Mastra server URLs
   ```

4. **Build the project**:

   ```bash
   pnpm build
   ```

5. **Run tests**:
   ```bash
   pnpm test
   ```

## Development Workflow

### Branch Naming Convention

- **Feature branches**: `feature/description-of-feature`
- **Bug fix branches**: `fix/description-of-bug`
- **Documentation**: `docs/description-of-change`
- **Refactoring**: `refactor/description-of-change`

Example: `feature/add-websocket-transport` or `fix/agent-timeout-handling`

### Making Changes

1. **Create a new branch**:

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**:

   - Follow the existing code style and patterns
   - Add tests for new functionality
   - Update documentation as needed

3. **Test your changes**:

   ```bash
   # Run linting and formatting
   pnpm lint
   pnpm format:check

   # Run tests
   pnpm test

   # Build to ensure everything compiles
   pnpm build
   ```

4. **Commit your changes**:
   ```bash
   git add .
   git commit -m "feat: add description of your feature"
   ```

### Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

Examples:

```
feat: add WebSocket transport support
fix: handle agent timeout gracefully
docs: update installation instructions
refactor: simplify error handling logic
```

## Code Style and Standards

### TypeScript

- Use TypeScript for all new code
- Prefer explicit typing over `any`
- Use interfaces for object shapes
- Follow existing naming conventions

### Code Formatting

We use Prettier for code formatting:

```bash
# Format all files
pnpm format

# Check formatting
pnpm format:check
```

### Linting

We use ESLint for code quality:

```bash
# Run linting
pnpm lint

# Fix auto-fixable issues
pnpm lint:fix
```

### Code Organization

```
src/
├── tools/           # MCP tools implementation
├── config.ts        # Configuration management
├── mcp-server.ts    # Main server setup
└── test-client.ts   # Testing utilities
```

## Testing

### Running Tests

```bash
# Run all tests
pnpm test

# Test with specific Mastra server
MASTRA_SERVERS_CONFIG=http://localhost:4111 pnpm test
```

### Writing Tests

- Add tests for new features in the same directory
- Use descriptive test names
- Test both success and error cases
- Mock external dependencies when appropriate

### Test Structure

```typescript
describe('Feature Name', () => {
  beforeEach(() => {
    // Setup
  })

  it('should handle success case', async () => {
    // Test implementation
  })

  it('should handle error case', async () => {
    // Test implementation
  })
})
```

## Documentation

### README Updates

If your changes affect usage or installation:

- Update the main README.md
- Update INSTALL.md if installation procedures change
- Add or update code examples

### Code Documentation

- Add JSDoc comments for public APIs
- Document complex logic with inline comments
- Update type definitions as needed

### API Documentation

When adding new tools or changing existing ones:

- Update schema documentation
- Add usage examples
- Document error conditions

## Pull Request Process

### Before Submitting

1. **Ensure all tests pass**:

   ```bash
   pnpm test
   pnpm lint
   pnpm format:check
   pnpm build
   ```

2. **Update documentation** if needed

3. **Add or update tests** for your changes

4. **Test manually** with a real Mastra server if possible

### Submitting a Pull Request

1. **Push your branch**:

   ```bash
   git push origin feature/your-feature-name
   ```

2. **Create a Pull Request** on GitHub with:

   - Clear title describing the change
   - Detailed description of what was changed and why
   - Reference any related issues
   - Screenshots for UI changes (if applicable)

3. **Fill out the PR template** completely

### PR Review Process

- Maintainers will review your PR
- Address any feedback or requested changes
- Once approved, a maintainer will merge your PR

## Issue Reporting

### Bug Reports

When reporting bugs, please include:

- **Environment**: OS, Node.js version, pnpm version
- **Steps to reproduce**: Clear, step-by-step instructions
- **Expected behavior**: What should happen
- **Actual behavior**: What actually happens
- **Error messages**: Full error output if any
- **Configuration**: Relevant environment variables or config

### Feature Requests

For new features, please include:

- **Use case**: Why is this feature needed?
- **Proposed solution**: How should it work?
- **Alternatives considered**: Other approaches you've thought about
- **Breaking changes**: Would this break existing functionality?

## Release Process (Maintainers)

### Version Bumping

```bash
# Patch release (bug fixes)
pnpm version patch

# Minor release (new features)
pnpm version minor

# Major release (breaking changes)
pnpm version major
```

### Publishing

```bash
# Publish to npm
pnpm publish

# Push tags to trigger GitHub Actions
git push origin main --tags
```

The CI/CD pipeline will automatically:

- Run tests and linting
- Build the package
- Publish to npm
- Create Docker images
- Generate standalone binaries
- Create a GitHub release

## Development Tips

### Local Testing

```bash
# Start the proxy server
pnpm dev

# In another terminal, test with a real MCP client
# or use the test client
pnpm test
```

### Debugging

Enable debug logging:

```bash
DEBUG=mastra:* pnpm dev
```

### Working with Multiple Mastra Servers

For testing multi-server scenarios:

```env
MASTRA_SERVERS_CONFIG=http://localhost:4111 http://localhost:4222
```

## Architecture Overview

Understanding the codebase:

```
MCP Client → MCP Server → Agent Proxy Tool → @mastra/client-js → Mastra Server → Agent
```

### Key Components

- **MCP Server** (`mcp-server.ts`): HTTP/SSE transport layer
- **Agent Proxy Tool** (`tools/agentProxyTool.ts`): Core proxy logic
- **List Agents Tool** (`tools/listMastraAgentsTool.ts`): Agent discovery
- **Configuration** (`config.ts`): Environment-based setup

## Getting Help

- **GitHub Discussions**: For questions and general discussion
- **GitHub Issues**: For bug reports and feature requests
- **Documentation**: Check README.md and INSTALL.md first

## Recognition

Contributors will be recognized in:

- GitHub contributors list
- Release notes for significant contributions
- README.md for major features

Thank you for contributing to MCP Agent Proxy! 🚀
