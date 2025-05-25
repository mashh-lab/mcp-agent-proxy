// BGP Peering Configuration Utility
// Automatically configures BGP peering between agent servers

import { logger } from '../config.js'

export interface PeeringTarget {
  asn: number
  address: string
  port: number
}

export interface PeeringConfig {
  localASN: number
  localAddress: string
  localPort: number
  peers: PeeringTarget[]
}

/**
 * Configure BGP peering by making HTTP requests to BGP servers
 */
export class BGPPeeringConfigurator {
  private config: PeeringConfig

  constructor(config: PeeringConfig) {
    this.config = config
  }

  /**
   * Establish peering with all configured peers
   */
  async establishPeering(): Promise<void> {
    logger.log(`🤝 Configuring BGP peering for AS${this.config.localASN}...`)

    for (const peer of this.config.peers) {
      await this.addPeer(peer)
    }

    logger.log(
      `✅ BGP peering configuration complete (${this.config.peers.length} peers)`,
    )
  }

  /**
   * Add a single BGP peer
   */
  async addPeer(peer: PeeringTarget): Promise<void> {
    try {
      const response = await fetch(
        `http://${this.config.localAddress}:${this.config.localPort}/bgp/peers`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            asn: peer.asn,
            address: `${peer.address}:${peer.port}`,
          }),
        },
      )

      if (response.ok) {
        logger.log(
          `🔗 BGP peer AS${peer.asn} (${peer.address}:${peer.port}) added successfully`,
        )
      } else {
        const error = await response.text()
        logger.log(`❌ Failed to add BGP peer AS${peer.asn}: ${error}`)
      }
    } catch (error) {
      logger.log(
        `❌ Error adding BGP peer AS${peer.asn}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  /**
   * Get BGP peering status from the BGP server
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getStatus(): Promise<any> {
    try {
      const response = await fetch(
        `http://${this.config.localAddress}:${this.config.localPort}/bgp/peers`,
      )

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      logger.log(
        `❌ Error checking BGP peering status: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
      throw error
    }
  }

  /**
   * Initiate BGP session establishment with peers
   */
  async establishSessions(): Promise<void> {
    logger.log(`🚀 Establishing BGP sessions...`)

    for (const peer of this.config.peers) {
      await this.establishSession(peer)
    }
  }

  /**
   * Establish BGP session with a specific peer
   */
  async establishSession(peer: PeeringTarget): Promise<void> {
    try {
      // Send BGP OPEN message to establish session
      const openMessage = {
        type: 'OPEN',
        version: 4,
        asn: this.config.localASN,
        holdTime: 180,
        routerId: `${this.config.localAddress}`,
        capabilities: ['agent-advertisement', 'route-refresh'],
      }

      const response = await fetch(
        `http://${peer.address}:${peer.port}/bgp/open`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(openMessage),
        },
      )

      if (response.ok) {
        logger.log(`🤝 BGP session established with AS${peer.asn}`)
      } else {
        logger.log(`❌ Failed to establish BGP session with AS${peer.asn}`)
      }
    } catch (error) {
      logger.log(
        `❌ Error establishing BGP session with AS${peer.asn}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }
}

/**
 * Create default peering configuration for agent networks
 */
export function createDefaultPeeringConfig(
  localASN: number,
  targetASNs: number[],
): PeeringConfig {
  // Assign BGP ports based on ASN to avoid conflicts
  const getPort = (asn: number) => 1179 + (asn - 64512) // AS64512->1179, AS64513->1180

  return {
    localASN,
    localAddress: 'localhost',
    localPort: getPort(localASN),
    peers: targetASNs.map((asn) => ({
      asn,
      address: 'localhost',
      port: getPort(asn),
    })),
  }
}

/**
 * Auto-configure BGP peering for standard 2-server setup
 */
export async function autoConfigureBGPPeering(localASN: number): Promise<void> {
  logger.log(`🔧 Auto-configuring BGP peering for AS${localASN}...`)

  // Standard 2-server setup: AS64512 and AS64513
  const allASNs = [64512, 64513]
  const targetASNs = allASNs.filter((asn) => asn !== localASN)

  if (targetASNs.length === 0) {
    logger.log('⚠️ No target ASNs found for peering')
    return
  }

  const peeringConfig = createDefaultPeeringConfig(localASN, targetASNs)
  const configurator = new BGPPeeringConfigurator(peeringConfig)

  // Wait a bit for BGP servers to start
  await new Promise((resolve) => setTimeout(resolve, 2000))

  await configurator.establishPeering()
  await configurator.establishSessions()

  // Check status
  const status = await configurator.getStatus()
  if (status) {
    logger.log('📊 BGP Peering Status:', status)
  }
}
