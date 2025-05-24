#!/bin/bash

# BGP Policy Templates CLI - Quick Start Demo
# This script demonstrates the main features of the CLI

echo "🚀 BGP Policy Templates CLI - Quick Start Demo"
echo "=============================================="
echo

# Check if CLI is available
if ! command -v bgp-policy-templates &> /dev/null; then
    echo "❌ bgp-policy-templates CLI not found"
    echo "Please install with: npm install -g @mashh/mcp-agent-proxy"
    echo "Or run from project: node dist/cli/policy-templates.js"
    exit 1
fi

echo "✅ CLI found! Let's explore the features..."
echo

# 1. Show help
echo "📚 1. Show CLI help:"
echo "Command: bgp-policy-templates --help"
echo "---"
bgp-policy-templates --help
echo
echo "Press Enter to continue..."
read

# 2. List all templates
echo "📋 2. List all available templates:"
echo "Command: bgp-policy-templates list"
echo "---"
bgp-policy-templates list
echo
echo "Press Enter to continue..."
read

# 3. Show template details
echo "🔍 3. Show detailed template information:"
echo "Command: bgp-policy-templates show security-basic --policies"
echo "---"
bgp-policy-templates show security-basic --policies
echo
echo "Press Enter to continue..."
read

# 4. Search templates
echo "🔎 4. Search for security templates:"
echo "Command: bgp-policy-templates search security"
echo "---"
bgp-policy-templates search security
echo
echo "Press Enter to continue..."
read

# 5. Get statistics
echo "📊 5. Show template statistics:"
echo "Command: bgp-policy-templates stats"
echo "---"
bgp-policy-templates stats
echo
echo "Press Enter to continue..."
read

# 6. Apply template (basic)
echo "⚡ 6. Apply a template (console output):"
echo "Command: bgp-policy-templates apply security-basic"
echo "---"
bgp-policy-templates apply security-basic
echo
echo "Press Enter to continue..."
read

# 7. Apply template with file output
echo "💾 7. Apply template with file output:"
echo "Command: bgp-policy-templates apply security-basic -o demo-policies.json --validate"
echo "---"
bgp-policy-templates apply security-basic -o demo-policies.json --validate
echo
echo "✅ Generated demo-policies.json"
if [ -f "demo-policies.json" ]; then
    echo "📄 File contents (first 20 lines):"
    head -20 demo-policies.json
    echo "..."
fi
echo
echo "Press Enter to continue..."
read

# 8. Test against sample routes
echo "🧪 8. Test policies against sample routes:"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROUTES_FILE="$SCRIPT_DIR/sample-routes.json"

if [ -f "$ROUTES_FILE" ]; then
    echo "Command: bgp-policy-templates apply security-basic --test-file $ROUTES_FILE"
    echo "---"
    bgp-policy-templates apply security-basic --test-file "$ROUTES_FILE"
else
    echo "⚠️ Sample routes file not found at $ROUTES_FILE"
    echo "Creating a simple test route..."
    cat > test-routes.json << 'EOF'
[
  {
    "agentId": "test-agent",
    "capabilities": ["coding"],
    "asPath": [65001],
    "nextHop": "http://localhost:4001",
    "localPref": 100,
    "med": 0,
    "communities": ["health:healthy"],
    "originTime": "2024-12-19T18:00:00.000Z",
    "pathAttributes": {}
  }
]
EOF
    echo "Command: bgp-policy-templates apply security-basic --test-file test-routes.json"
    echo "---"
    bgp-policy-templates apply security-basic --test-file test-routes.json
    rm -f test-routes.json
fi
echo
echo "Press Enter to continue..."
read

# 9. List with filters
echo "🔧 9. List templates with filters:"
echo "Command: bgp-policy-templates list -c security --detailed"
echo "---"
bgp-policy-templates list -c security --detailed
echo
echo "Press Enter to continue..."
read

# 10. Performance template demo
echo "⚡ 10. Performance template example:"
echo "Command: bgp-policy-templates apply performance-optimization --name-prefix 'perf-' --priority-offset 500"
echo "---"
bgp-policy-templates apply performance-optimization --name-prefix "perf-" --priority-offset 500
echo

echo "🎉 Quick Start Demo Complete!"
echo "=============================="
echo
echo "✨ Key Features Demonstrated:"
echo "• Template discovery and browsing"
echo "• Detailed template information"
echo "• Template search functionality"
echo "• Policy generation and validation"
echo "• File output and route testing"
echo "• Template customization options"
echo
echo "📚 Next Steps:"
echo "• Try the interactive wizard: bgp-policy-templates wizard"
echo "• Explore more templates: bgp-policy-templates list --detailed"
echo "• Read the full guide: docs/CLI_GUIDE.md"
echo
echo "🚀 Happy routing with BGP Policy Templates!"

# Cleanup
rm -f demo-policies.json 