# BGP Policy Templates CLI Guide

The BGP Policy Templates CLI is a powerful command-line interface for managing BGP routing policies in agent networks. It provides an intuitive way to discover, customize, and deploy enterprise-grade routing policies without writing code.

## 🚀 Installation

### Global Installation

```bash
npm install -g @mashh/mcp-agent-proxy
```

After installation, the CLI will be available as `bgp-policy-templates`:

```bash
bgp-policy-templates --help
```

### Local Installation

```bash
npm install @mashh/mcp-agent-proxy
npx bgp-policy-templates --help
```

### Development Installation

```bash
git clone https://github.com/mashh-lab/mcp-agent-proxy.git
cd mcp-agent-proxy
pnpm install
pnpm build
node dist/cli/policy-templates.js --help
```

## 📚 Quick Start

### 1. Browse Available Templates

```bash
# List all templates
bgp-policy-templates list

# List with details
bgp-policy-templates list --detailed

# Filter by category
bgp-policy-templates list -c security

# Filter by difficulty
bgp-policy-templates list -d beginner
```

### 2. Get Template Information

```bash
# Show template details
bgp-policy-templates show security-basic

# Show with individual policies
bgp-policy-templates show security-basic --policies
```

### 3. Search Templates

```bash
# Search by keyword
bgp-policy-templates search security
bgp-policy-templates search performance
```

### 4. Apply Templates

```bash
# Basic application
bgp-policy-templates apply security-basic

# Interactive customization
bgp-policy-templates apply security-basic --interactive

# Save to file
bgp-policy-templates apply security-basic -o my-policies.json

# Validate policies
bgp-policy-templates apply security-basic --validate
```

### 5. Interactive Wizard

```bash
# Get personalized recommendations
bgp-policy-templates wizard
```

## 📖 Commands Reference

### `list` / `ls`

List available policy templates with filtering options.

```bash
bgp-policy-templates list [options]
```

**Options:**

- `-c, --category <category>` - Filter by category (security, performance, etc.)
- `-d, --difficulty <difficulty>` - Filter by difficulty (beginner, intermediate, advanced)
- `-t, --tag <tag>` - Filter by tag
- `--detailed` - Show detailed information

**Examples:**

```bash
bgp-policy-templates list
bgp-policy-templates list -c security --detailed
bgp-policy-templates list -d beginner
bgp-policy-templates ls -t health
```

### `show`

Display detailed information about a specific template.

```bash
bgp-policy-templates show <templateId> [options]
```

**Options:**

- `--policies` - Show individual policies

**Examples:**

```bash
bgp-policy-templates show security-basic
bgp-policy-templates show performance-optimization --policies
```

### `search`

Search templates by keyword across names, descriptions, and tags.

```bash
bgp-policy-templates search <keyword> [options]
```

**Options:**

- `--detailed` - Show detailed results

**Examples:**

```bash
bgp-policy-templates search security
bgp-policy-templates search "load balancing" --detailed
```

### `apply`

Apply a policy template with customization options.

```bash
bgp-policy-templates apply <templateId> [options]
```

**Options:**

- `-o, --output <file>` - Save policies to file
- `-i, --interactive` - Interactive customization
- `--enabled-only` - Include only enabled policies
- `--priority-offset <number>` - Add offset to policy priorities
- `--name-prefix <prefix>` - Add prefix to policy names
- `--test-file <file>` - Test policies against routes from file
- `--validate` - Validate generated policies

**Examples:**

```bash
bgp-policy-templates apply security-basic
bgp-policy-templates apply security-basic --interactive
bgp-policy-templates apply security-basic -o policies.json --validate
bgp-policy-templates apply performance-optimization --priority-offset 100 --name-prefix "prod-"
```

### `stats`

Show policy template statistics.

```bash
bgp-policy-templates stats
```

### `wizard`

Interactive template selection wizard.

```bash
bgp-policy-templates wizard
```

The wizard guides you through:

1. Selecting your primary use case
2. Choosing your experience level
3. Recommending appropriate templates
4. Optionally applying selected templates

## 🎯 Policy Template Categories

### Security Templates

Protect your agent network from threats and unauthorized access.

- **security-basic** (Beginner) - Essential security policies
- **security-advanced** (Advanced) - Enterprise security with time-based restrictions

### Performance Templates

Optimize routing for speed and efficiency.

- **performance-optimization** (Intermediate) - Latency and throughput optimization

### Reliability Templates

Ensure high availability and fault tolerance.

- **high-availability** (Advanced) - Mission-critical uptime policies

### Development Templates

Flexible policies for development and testing.

- **development-friendly** (Beginner) - Relaxed policies for dev environments

### Production Templates

Strict policies for production deployments.

- **production-hardened** (Advanced) - Enterprise production standards

## 🔧 Template Customization

### Priority Offsets

Adjust policy priorities to integrate with existing configurations:

```bash
# Add 1000 to all policy priorities
bgp-policy-templates apply security-basic --priority-offset 1000
```

### Name Prefixes

Add prefixes to avoid naming conflicts:

```bash
# Prefix all policy names with "prod-"
bgp-policy-templates apply security-basic --name-prefix "prod-"
```

### Enabled-Only Filtering

Include only enabled policies:

```bash
# Only include policies that are enabled by default
bgp-policy-templates apply security-basic --enabled-only
```

## 🧪 Policy Testing

Test policies against sample routes before deployment:

### Create Test Routes File

```json
[
  {
    "agentId": "test-agent-1",
    "capabilities": ["coding", "analysis"],
    "asPath": [65001],
    "nextHop": "http://localhost:4001",
    "localPref": 100,
    "med": 0,
    "communities": ["health:healthy"],
    "originTime": "2024-12-19T18:00:00.000Z",
    "pathAttributes": {}
  },
  {
    "agentId": "test-agent-2",
    "capabilities": ["database"],
    "asPath": [65002, 65003, 65004],
    "nextHop": "http://localhost:4002",
    "localPref": 100,
    "med": 50,
    "communities": ["health:degraded"],
    "originTime": "2024-12-19T18:00:00.000Z",
    "pathAttributes": {}
  }
]
```

### Test Policies

```bash
bgp-policy-templates apply security-basic --test-file routes.json
```

## 📄 Output Formats

### Console Output

Default output shows a summary of generated policies:

```bash
bgp-policy-templates apply security-basic
```

### JSON File Output

Save complete policy configuration to file:

```bash
bgp-policy-templates apply security-basic -o config.json
```

**Output Structure:**

```json
{
  "template": {
    "id": "security-basic",
    "name": "Basic Security Policies",
    "appliedAt": "2024-12-19T18:00:00.000Z"
  },
  "customization": {
    "enabledOnly": false,
    "priorityOffset": 0,
    "namePrefix": ""
  },
  "policies": [
    {
      "name": "block-unhealthy-agents",
      "description": "Block all traffic to unhealthy agents",
      "enabled": true,
      "priority": 1000,
      "match": {
        "healthStatus": "unhealthy"
      },
      "action": {
        "action": "reject",
        "logDecision": true,
        "alertOnMatch": true,
        "metricsTag": "security-block"
      }
    }
  ]
}
```

## 🔄 Integration Workflows

### CI/CD Pipeline Integration

```bash
# In your deployment script
bgp-policy-templates apply production-hardened \
  --enabled-only \
  --validate \
  -o /etc/bgp/policies.json

# Test policies before deployment
bgp-policy-templates apply production-hardened \
  --test-file /etc/bgp/test-routes.json
```

### Configuration Management

```bash
# Generate policies for different environments
bgp-policy-templates apply development-friendly --name-prefix "dev-" -o dev-policies.json
bgp-policy-templates apply production-hardened --name-prefix "prod-" -o prod-policies.json
```

### Monitoring and Validation

```bash
# Validate existing configuration
bgp-policy-templates apply security-basic --validate

# Check template statistics
bgp-policy-templates stats
```

## 🎛️ Advanced Usage

### Interactive Mode

The interactive mode prompts for all customization options:

```bash
bgp-policy-templates apply security-basic --interactive
```

**Interactive Prompts:**

1. Include only enabled policies? (y/N)
2. Priority offset (0 for no change):
3. Policy name prefix:

### Combining Multiple Templates

Apply multiple templates with different prefixes:

```bash
bgp-policy-templates apply security-basic --name-prefix "sec-" -o security.json
bgp-policy-templates apply performance-optimization --name-prefix "perf-" -o performance.json
```

### Template Discovery Workflow

```bash
# 1. Explore available templates
bgp-policy-templates list

# 2. Search for specific needs
bgp-policy-templates search "security"

# 3. Get detailed information
bgp-policy-templates show security-basic --policies

# 4. Use wizard for guidance
bgp-policy-templates wizard

# 5. Apply with customization
bgp-policy-templates apply security-basic --interactive
```

## 🚨 Troubleshooting

### Common Issues

**Template Not Found:**

```bash
❌ Template 'invalid-template' not found
```

- Use `bgp-policy-templates list` to see available templates
- Check spelling of template ID

**No Routes in Test File:**

```bash
⚠️ No routes found in test file
```

- Ensure test file contains valid JSON array of routes
- Check file path and permissions

**Policy Validation Failed:**

```bash
⚠️ 2/3 policies are valid
```

- Some policies may have configuration errors
- Check policy syntax and required fields

### Getting Help

```bash
# General help
bgp-policy-templates --help

# Command-specific help
bgp-policy-templates apply --help
bgp-policy-templates list --help

# Show version
bgp-policy-templates --version
```

## 🎯 Examples

### Scenario 1: New Deployment Security

```bash
# Start with wizard guidance
bgp-policy-templates wizard

# Apply basic security with validation
bgp-policy-templates apply security-basic --validate -o security-config.json

# Test against sample routes
bgp-policy-templates apply security-basic --test-file test-routes.json
```

### Scenario 2: Performance Optimization

```bash
# Search for performance templates
bgp-policy-templates search performance --detailed

# Apply with custom priorities
bgp-policy-templates apply performance-optimization \
  --priority-offset 500 \
  --name-prefix "perf-" \
  --validate \
  -o performance-config.json
```

### Scenario 3: Production Hardening

```bash
# Show production template details
bgp-policy-templates show production-hardened --policies

# Apply with strict settings
bgp-policy-templates apply production-hardened \
  --enabled-only \
  --name-prefix "prod-" \
  --test-file production-routes.json \
  -o production-policies.json
```

### Scenario 4: Development Environment

```bash
# Apply flexible development policies
bgp-policy-templates apply development-friendly \
  --interactive \
  -o dev-policies.json

# Check statistics
bgp-policy-templates stats
```

## 🔗 Integration with BGP Agent Network

The CLI generates policies that work seamlessly with the BGP-powered agent network:

1. **Policy Engine Integration** - Generated policies are compatible with the PolicyEngine
2. **BGP Route Attributes** - Templates use standard BGP attributes (AS path, communities, MED)
3. **Agent Health Monitoring** - Policies can filter based on agent health status
4. **Performance Metrics** - Templates optimize for latency and throughput
5. **Security Controls** - Enterprise-grade access control and threat protection

## 📈 Next Steps

After using the CLI to generate policies:

1. **Deploy to BGP Server** - Load policies into your BGP policy engine
2. **Monitor Performance** - Track policy decisions and route changes
3. **Iterate and Improve** - Adjust policies based on network behavior
4. **Scale Across Environments** - Apply consistent policies across dev/staging/prod

---

## 🎉 Success!

You now have a powerful CLI tool for managing BGP routing policies in your agent network. The combination of ready-made templates, interactive customization, and comprehensive testing makes enterprise-grade routing accessible to everyone.

**Happy routing!** 🚀
