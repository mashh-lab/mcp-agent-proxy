#!/bin/bash

# BGP-Powered Agent Networking Validation Helper
# Run this script to test the BGP infrastructure

set -e

echo "🚀 BGP Agent Networking Validation Helper"
echo "========================================"

# Configuration
PRIMARY_BGP_PORT=3001
SECONDARY_BGP_PORT=3002
MASTRA_4111_PORT=4111
MASTRA_4222_PORT=4222

PRIMARY_BGP_URL="http://localhost:${PRIMARY_BGP_PORT}"
SECONDARY_BGP_URL="http://localhost:${SECONDARY_BGP_PORT}"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
print_step() {
    echo -e "\n${BLUE}📋 $1${NC}"
}

print_success() {
    echo -e "   ${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "   ${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "   ${RED}❌ $1${NC}"
}

check_port() {
    local port=$1
    local name=$2
    if curl -s "http://localhost:${port}/health" > /dev/null 2>&1; then
        print_success "$name is running on port $port"
        return 0
    else
        print_error "$name is not running on port $port"
        return 1
    fi
}

test_bgp_discovery() {
    local url=$1
    local name=$2
    print_step "Testing $name agent discovery"
    
    local response
    if response=$(curl -s "$url/status" 2>/dev/null); then
        local server_count
        server_count=$(echo "$response" | jq -r '.servers | length' 2>/dev/null || echo "0")
        
        if [ "$server_count" -gt 0 ]; then
            print_success "Discovered $server_count Mastra servers"
            echo "$response" | jq -r '.servers[] | "   📡 \(.name): \(.url) (\(.agentCount) agents)"' 2>/dev/null || true
        else
            print_warning "No Mastra servers discovered"
        fi
    else
        print_error "Failed to fetch status from $name"
    fi
}

test_bgp_status() {
    local url=$1
    local name=$2
    print_step "Testing $name BGP status"
    
    local response
    if response=$(curl -s "$url/bgp-status" 2>/dev/null); then
        local sessions
        sessions=$(echo "$response" | jq -r '.sessions | length' 2>/dev/null || echo "0")
        print_success "BGP status available ($sessions sessions)"
        
        # Show policy count
        local policies
        policies=$(echo "$response" | jq -r '.policies | length' 2>/dev/null || echo "0")
        print_success "$policies routing policies loaded"
        
        # Show discovery stats
        local discoveries
        discoveries=$(echo "$response" | jq -r '.discovery.totalDiscoveries' 2>/dev/null || echo "N/A")
        print_success "$discoveries total agent discoveries"
    else
        print_error "Failed to fetch BGP status from $name"
    fi
}

show_real_time_monitoring() {
    print_step "Real-time monitoring commands"
    echo ""
    echo "   Run these commands in separate terminals to monitor BGP in real-time:"
    echo ""
    echo -e "   ${YELLOW}# BGP Sessions (Primary)${NC}"
    echo "   watch -n 2 'curl -s $PRIMARY_BGP_URL/bgp-status | jq \".sessions[] | {peer, status, routesReceived}\"'"
    echo ""
    echo -e "   ${YELLOW}# Agent Performance${NC}"
    echo "   watch -n 5 'curl -s $PRIMARY_BGP_URL/status | jq \".servers[] | {name, responseTime, healthStatus}\"'"
    echo ""
    echo -e "   ${YELLOW}# Routing Decisions${NC}"
    echo "   watch -n 3 'curl -s $PRIMARY_BGP_URL/bgp-status | jq \".routing.recentDecisions\"'"
}

# Main validation sequence
main() {
    print_step "Pre-flight checks"
    
    # Check if Mastra servers are running
    local mastra_4111_ok=false
    local mastra_4222_ok=false
    
    if check_port $MASTRA_4111_PORT "Mastra Server (4111)"; then
        mastra_4111_ok=true
    fi
    
    if check_port $MASTRA_4222_PORT "Mastra Server (4222)"; then
        mastra_4222_ok=true
    fi
    
    # Check BGP servers
    local primary_bgp_ok=false
    local secondary_bgp_ok=false
    
    if check_port $PRIMARY_BGP_PORT "Primary BGP Server"; then
        primary_bgp_ok=true
    fi
    
    if check_port $SECONDARY_BGP_PORT "Secondary BGP Server"; then
        secondary_bgp_ok=true
    fi
    
    echo ""
    
    # Test discovery and status
    if [ "$primary_bgp_ok" = true ]; then
        test_bgp_discovery "$PRIMARY_BGP_URL" "Primary BGP Server"
        test_bgp_status "$PRIMARY_BGP_URL" "Primary BGP Server"
    fi
    
    if [ "$secondary_bgp_ok" = true ]; then
        test_bgp_discovery "$SECONDARY_BGP_URL" "Secondary BGP Server"  
        test_bgp_status "$SECONDARY_BGP_URL" "Secondary BGP Server"
    fi
    
    show_real_time_monitoring
    
    print_step "Validation Summary"
    echo ""
    
    if [ "$mastra_4111_ok" = true ] && [ "$mastra_4222_ok" = true ] && [ "$primary_bgp_ok" = true ]; then
        print_success "Core infrastructure ready for testing!"
        print_success "You can now configure Cursor with examples/cursor-bgp-config.json"
        echo ""
        echo -e "   ${GREEN}🎯 Ready for multi-hop agent networking validation!${NC}"
    else
        print_warning "Some components are not running. Check the setup:"
        echo ""
        echo "   To start BGP servers:"
        echo "   MASTRA_SERVERS=\"http://localhost:4111 http://localhost:4222\" MCP_SERVER_PORT=3001 node dist/mcp-server.js"
        echo "   MASTRA_SERVERS=\"http://localhost:4222\" MCP_SERVER_PORT=3002 node dist/mcp-server.js"
    fi
}

# Command line options
case "${1:-help}" in
    "help"|"--help"|"-h")
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  test     Run full validation suite"
        echo "  quick    Quick status check"
        echo "  monitor  Show monitoring commands"
        echo "  help     Show this help"
        ;;
    "test")
        main
        ;;
    "quick")
        print_step "Quick status check"
        check_port $PRIMARY_BGP_PORT "Primary BGP Server"
        check_port $SECONDARY_BGP_PORT "Secondary BGP Server"
        check_port $MASTRA_4111_PORT "Mastra Server (4111)"
        check_port $MASTRA_4222_PORT "Mastra Server (4222)"
        ;;
    "monitor")
        show_real_time_monitoring
        ;;
    *)
        main
        ;;
esac 