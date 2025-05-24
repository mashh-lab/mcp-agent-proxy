import { defineConfig } from 'tsup'

export default defineConfig([
  // MCP Server build (with DTS)
  {
    entry: ['src/mcp-server.ts'],
    format: ['esm', 'cjs'],
    outDir: 'dist',
    dts: true,
    clean: true,
    splitting: false,
    sourcemap: false,
    minify: false,
  },
  // CLI build (without DTS to avoid shebang issues)
  {
    entry: { 'cli/policy-templates': 'src/cli/policy-templates.ts' },
    format: ['esm', 'cjs'],
    outDir: 'dist',
    dts: false, // Skip DTS for CLI to avoid shebang line issues
    clean: false, // Don't clean since server build already did
    splitting: false,
    sourcemap: false,
    minify: false,
    // Preserve shebang line for executable
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
])
