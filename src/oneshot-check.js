#!/usr/bin/env node

import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'
import { createServer } from 'http'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Detect CI environment
const isCI = !!(
  process.env.CI ||
  process.env.GITHUB_ACTIONS ||
  process.env.GITLAB_CI ||
  process.env.TRAVIS ||
  process.env.CIRCLECI ||
  process.env.BUILDKITE ||
  process.env.JENKINS_URL
)

// Configuration
const DEFAULT_PORT = process.env.MCP_SERVER_PORT || '3001'
const MAX_WAIT_TIME = isCI ? 30000 : 15000 // Longer timeout in CI
const CHECK_INTERVAL = isCI ? 1000 : 500 // Less frequent polling in CI

// Check what type of check to run
const checkType = process.argv[2] || 'check' // health, status, check, or build-only

/**
 * Find an available port starting from the preferred port
 */
async function findAvailablePort(startPort = parseInt(DEFAULT_PORT)) {
  for (let port = startPort; port < startPort + 100; port++) {
    if (await isPortAvailable(port)) {
      return port
    }
  }
  throw new Error(
    `No available ports found in range ${startPort}-${startPort + 99}`,
  )
}

/**
 * Check if a port is available
 */
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer()

    server.on('error', () => resolve(false))
    server.on('listening', () => {
      server.close(() => resolve(true))
    })

    server.listen(port, 'localhost')
  })
}

async function waitForServer(healthUrl) {
  const startTime = Date.now()

  while (Date.now() - startTime < MAX_WAIT_TIME) {
    try {
      const response = await fetch(healthUrl)
      if (response.ok) {
        return true
      }
    } catch (error) {
      // Server not ready yet, continue waiting
    }

    await new Promise((resolve) => setTimeout(resolve, CHECK_INTERVAL))
  }

  throw new Error(`Server did not become ready within ${MAX_WAIT_TIME}ms`)
}

async function runHealthCheck(healthUrl) {
  try {
    const response = await fetch(healthUrl)
    const data = await response.json()
    console.log('=== Health Check (One-Shot) ===')
    console.log(JSON.stringify(data, null, 2))
    return true
  } catch (error) {
    console.error('Health check failed:', error.message)
    return false
  }
}

async function runStatusCheck(statusUrl) {
  try {
    const response = await fetch(statusUrl)
    const data = await response.json()
    console.log('=== Status Check (One-Shot) ===')
    console.log(JSON.stringify(data, null, 2))
    return true
  } catch (error) {
    console.error('Status check failed:', error.message)
    return false
  }
}

/**
 * Build-only validation - just verify the build artifacts exist and are valid
 */
async function runBuildOnlyCheck() {
  try {
    console.log('=== Build Validation (CI Mode) ===')

    const serverPath = join(__dirname, '..', 'dist', 'mcp-server.js')
    if (!fs.existsSync(serverPath)) {
      console.error('❌ Build artifact missing: dist/mcp-server.js')
      return false
    }

    // Try to load the module to verify it's valid
    const { pathToFileURL } = await import('url')
    const serverModule = await import(pathToFileURL(serverPath))

    console.log('✅ Build artifact exists and loads successfully')
    console.log('✅ TypeScript compilation successful')
    console.log('✅ Module dependencies resolved')

    // Verify package.json scripts exist
    const packagePath = join(__dirname, '..', 'package.json')
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))

    const expectedScripts = [
      'health:oneshot',
      'status:oneshot',
      'check:oneshot',
    ]
    const missingScripts = expectedScripts.filter(
      (script) => !packageJson.scripts[script],
    )

    if (missingScripts.length > 0) {
      console.error(
        '❌ Missing package.json scripts:',
        missingScripts.join(', '),
      )
      return false
    }

    console.log('✅ Package.json scripts configured correctly')
    console.log('\n🎉 Build validation passed - ready for deployment!')

    return true
  } catch (error) {
    console.error('❌ Build validation failed:', error.message)
    return false
  }
}

async function main() {
  // Build-only mode for CI environments or when explicitly requested
  if (
    checkType === 'build-only' ||
    (isCI && process.env.MCP_SKIP_SERVER_TESTS === 'true')
  ) {
    console.log(
      isCI
        ? 'CI environment detected - running build validation only'
        : 'Running build validation only',
    )
    const success = await runBuildOnlyCheck()
    process.exit(success ? 0 : 1)
    return
  }

  let serverProcess = null
  let serverPort = null

  // Cleanup function
  const cleanup = () => {
    if (serverProcess && !serverProcess.killed) {
      console.log('Cleaning up server process...')
      try {
        serverProcess.kill('SIGTERM')

        // Give it a moment to shut down gracefully, then force kill
        setTimeout(() => {
          if (serverProcess && !serverProcess.killed) {
            console.log('Force killing server process...')
            serverProcess.kill('SIGKILL')
          }
        }, 1000)
      } catch (error) {
        console.error('Error during cleanup:', error.message)
      }
    }
  }

  // Set up signal handlers for cleanup
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
  process.on('exit', cleanup)

  try {
    // Ensure the dist directory exists and mcp-server.js is built
    const serverPath = join(__dirname, '..', 'dist', 'mcp-server.js')
    if (!fs.existsSync(serverPath)) {
      console.error('Server not built. Please run "pnpm build" first.')
      process.exit(1)
    }

    // Find an available port
    console.log(isCI ? 'CI environment detected' : 'Local environment detected')
    console.log('Finding available port...')
    serverPort = await findAvailablePort(parseInt(DEFAULT_PORT))
    console.log(`Using port: ${serverPort}`)

    const healthUrl = `http://localhost:${serverPort}/health`
    const statusUrl = `http://localhost:${serverPort}/status`

    // Start the server
    console.log('Starting MCP server...')
    serverProcess = spawn('node', [serverPath, '--http'], {
      stdio: ['ignore', 'inherit', 'inherit'],
      detached: false,
      env: {
        ...process.env,
        AGENT_SERVERS: process.env.AGENT_SERVERS || 'http://localhost:4111',
        MCP_SERVER_PORT: serverPort.toString(),
        MCP_TRANSPORT: 'http',
      },
    })

    console.log(`Server process PID: ${serverProcess.pid}`)

    // Handle server process events
    serverProcess.on('error', (error) => {
      console.error('Failed to start server process:', error)
      cleanup()
      throw error
    })

    serverProcess.on('exit', (code, signal) => {
      console.log(`Server process exited with code ${code}, signal ${signal}`)
      if (code !== 0 && code !== null) {
        cleanup()
        throw new Error(`Server process failed with exit code ${code}`)
      }
    })

    // Give the server a moment to start
    console.log('Giving server time to initialize...')
    await new Promise((resolve) => setTimeout(resolve, isCI ? 3000 : 2000))

    // Wait for server to be ready
    console.log('Waiting for server to be ready...')
    await waitForServer(healthUrl)
    console.log('Server ready!\n')

    // Run the requested checks
    let success = true

    if (checkType === 'health') {
      success = await runHealthCheck(healthUrl)
    } else if (checkType === 'status') {
      success = await runStatusCheck(statusUrl)
    } else {
      // Run both checks
      const healthSuccess = await runHealthCheck(healthUrl)
      console.log() // Empty line between checks
      const statusSuccess = await runStatusCheck(statusUrl)
      success = healthSuccess && statusSuccess
    }

    // Clean up and exit
    cleanup()
    await new Promise((resolve) => setTimeout(resolve, 500)) // Give cleanup time
    process.exit(success ? 0 : 1)
  } catch (error) {
    console.error('Error:', error.message)
    cleanup()
    await new Promise((resolve) => setTimeout(resolve, 500)) // Give cleanup time
    process.exit(1)
  }
}

// Handle cleanup on process exit
main().catch((error) => {
  console.error('Unhandled error:', error)
  process.exit(1)
})
