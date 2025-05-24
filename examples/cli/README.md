# BGP Policy Templates CLI Examples

This directory contains examples and demonstrations for the BGP Policy Templates CLI.

## Files

### `sample-routes.json`

A collection of sample agent routes for testing policy templates. Includes various scenarios:

- Healthy agents with different capabilities
- Unhealthy and degraded agents
- Long AS path routes
- Production and development environments
- Different performance characteristics

### `quick-start.sh`

An interactive demonstration script that walks through all major CLI features:

- Template discovery and browsing
- Policy generation and customization
- Route testing and validation
- File output and configuration

## Quick Start

### Run the Interactive Demo

```bash
# From the examples/cli directory
./quick-start.sh

# Or from anywhere in the project
bash examples/cli/quick-start.sh
```

### Test with Sample Routes

```bash
# Apply security template and test with sample routes
bgp-policy-templates apply security-basic --test-file examples/cli/sample-routes.json

# Apply performance template with customization
bgp-policy-templates apply performance-optimization \
  --test-file examples/cli/sample-routes.json \
  --name-prefix "perf-" \
  --priority-offset 100 \
  -o performance-config.json
```

### Interactive Wizard

```bash
# Get personalized template recommendations
bgp-policy-templates wizard
```

## Example Workflows

### Security Hardening

```bash
# 1. Search for security templates
bgp-policy-templates search security

# 2. Get detailed information
bgp-policy-templates show security-basic --policies

# 3. Apply with validation
bgp-policy-templates apply security-basic \
  --validate \
  --test-file examples/cli/sample-routes.json \
  -o security-policies.json
```

### Performance Optimization

```bash
# 1. Apply performance template
bgp-policy-templates apply performance-optimization \
  --name-prefix "perf-" \
  --priority-offset 500

# 2. Test against sample routes
bgp-policy-templates apply performance-optimization \
  --test-file examples/cli/sample-routes.json
```

### Development Setup

```bash
# Apply development-friendly policies
bgp-policy-templates apply development-friendly \
  --interactive \
  -o dev-policies.json
```

### Production Deployment

```bash
# Apply production-hardened policies
bgp-policy-templates apply production-hardened \
  --enabled-only \
  --name-prefix "prod-" \
  --validate \
  --test-file examples/cli/sample-routes.json \
  -o production-policies.json
```

## Creating Custom Test Routes

You can create your own test routes file following this structure:

```json
[
  {
    "agentId": "your-agent-id",
    "capabilities": ["capability1", "capability2"],
    "asPath": [65001, 65002],
    "nextHop": "http://localhost:4001",
    "localPref": 100,
    "med": 10,
    "communities": ["health:healthy", "region:us-east"],
    "originTime": "2024-12-19T18:00:00.000Z",
    "pathAttributes": {}
  }
]
```

## Expected Results

When running the sample tests, you should see output like:

```bash
$ bgp-policy-templates apply security-basic --test-file sample-routes.json

⚡ Applying template: security-basic

✅ Generated 3 policies from template

🧪 Testing against sample routes...
   ✅ 6/8 routes accepted
   ❌ 2 routes rejected
   📋 Accepted agents:
      - coding-agent-1
      - database-agent-1
      - production-agent-1
      - development-agent-1
      - high-performance-agent
      - degraded-agent-1

📋 Generated Policies:
   1. block-unhealthy-agents (priority: 1000)
   2. limit-hop-count (priority: 900)
   3. quarantine-degraded (priority: 800)
```

The security template should:

- Block the unhealthy agent
- Block the agent with too many AS hops (>8)
- Accept healthy agents with reasonable paths
- Quarantine degraded agents (lower preference)

## Troubleshooting

### CLI Not Found

If you get "command not found" errors:

```bash
# Install globally
npm install -g @mashh/mcp-agent-proxy

# Or run from project
node dist/cli/policy-templates.js --help
```

### File Not Found

Make sure you're running commands from the correct directory or use absolute paths:

```bash
# From project root
bgp-policy-templates apply security-basic --test-file examples/cli/sample-routes.json

# Or with absolute path
bgp-policy-templates apply security-basic --test-file /full/path/to/sample-routes.json
```

### Permission Denied

Make sure the quick-start script is executable:

```bash
chmod +x examples/cli/quick-start.sh
```

## Next Steps

After exploring these examples:

1. **Read the full CLI guide**: `docs/CLI_GUIDE.md`
2. **Explore all templates**: `bgp-policy-templates list --detailed`
3. **Use the wizard**: `bgp-policy-templates wizard`
4. **Create your own routes**: Test with your specific agent scenarios
5. **Deploy to production**: Use generated policies in your BGP network

Happy routing! 🚀
