export type { ConnectionBackend, ConnectionBackendConfig } from './types.js'
export { LocalConnectionBackend } from './local-backend.js'
export { ConnectionBackendFactory } from './factory.js'

// Note: UpstashConnectionBackend is not exported here to avoid requiring @upstash/redis
// It's dynamically imported in the factory when needed
