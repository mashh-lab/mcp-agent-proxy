// BGP Session Management for Agent Networks
// Implements BGP-style neighbor discovery and session management

import { EventEmitter } from 'events'
import {
  AgentPeer,
  BGPMessage,
  BGPUpdate,
  AgentRoute,
  BGP_DEFAULTS,
} from './types.js'
import { logger } from '../config.js'

/**
 * BGP Session States (RFC 4271)
 * Adapted for agent network management
 */
export enum BGPSessionState {
  IDLE = 'idle',
  CONNECT = 'connect',
  ACTIVE = 'active',
  ESTABLISHED = 'established',
}

/**
 * BGP Session Management for Agent Peers
 * Handles connection lifecycle, keepalives, and route exchange
 */
export class BGPSession extends EventEmitter {
  private peers = new Map<number, AgentPeer>()
  private sessions = new Map<
    number,
    {
      state: BGPSessionState
      lastKeepalive: Date
      connectAttempts: number
      routes: Map<string, AgentRoute>
    }
  >()
  private keepaliveTimer?: NodeJS.Timeout
  private connectRetryTimer?: NodeJS.Timeout

  constructor(
    private localASN: number,
    private routerId: string = `router-${localASN}`,
  ) {
    super()
    this.startKeepaliveTimer()
  }

  /**
   * Add a BGP peer (agent server) to track
   */
  async addPeer(peerASN: number, peerAddress: string): Promise<void> {
    if (this.peers.has(peerASN)) {
      logger.log(`BGP: Updating peer AS${peerASN} address`)
    }

    const peer: AgentPeer = {
      asn: peerASN,
      address: peerAddress,
      status: BGPSessionState.IDLE,
      lastUpdate: new Date(),
      routesReceived: 0,
      routesSent: 0,
    }

    this.peers.set(peerASN, peer)
    this.sessions.set(peerASN, {
      state: BGPSessionState.IDLE,
      lastKeepalive: new Date(),
      connectAttempts: 0,
      routes: new Map(),
    })

    logger.log(`BGP: Added peer AS${peerASN}`)

    // Attempt to establish session
    await this.connectToPeer(peerASN)
  }

  /**
   * Remove a BGP peer
   */
  removePeer(peerASN: number): void {
    const peer = this.peers.get(peerASN)
    if (!peer) return

    // Send notification if session is established
    if (peer.status === BGPSessionState.ESTABLISHED) {
      this.sendNotification(peerASN, 'Session termination')
    }

    this.peers.delete(peerASN)
    this.sessions.delete(peerASN)

    logger.log(`BGP: Removed peer AS${peerASN}`)
    this.emit('peerRemoved', peerASN)
  }

  /**
   * Attempt to connect to a peer
   */
  private async connectToPeer(peerASN: number): Promise<void> {
    const peer = this.peers.get(peerASN)
    const session = this.sessions.get(peerASN)

    if (!peer || !session) return

    session.connectAttempts++
    session.state = BGPSessionState.CONNECT
    peer.status = BGPSessionState.CONNECT

    logger.log(
      `BGP: Attempting connection to AS${peerASN} (attempt ${session.connectAttempts})`,
    )

    try {
      // Simulate BGP OPEN message exchange
      const openMessage: BGPMessage = {
        type: 'OPEN',
        timestamp: new Date(),
        senderASN: this.localASN,
        data: {
          version: 4,
          asn: this.localASN,
          holdTime: BGP_DEFAULTS.HOLD_TIME / 1000,
          routerId: this.routerId,
          capabilities: ['agent-routing', 'path-vector'],
        },
      }

      // In real implementation, this would be HTTP/WebSocket communication
      const success = await this.simulateOpenExchange(peer, openMessage)

      if (success) {
        session.state = BGPSessionState.ESTABLISHED
        peer.status = BGPSessionState.ESTABLISHED
        session.lastKeepalive = new Date()

        logger.log(`BGP: Session established with AS${peerASN}`)
        this.emit('sessionEstablished', peerASN, peer)

        // Start route exchange
        await this.initiateRouteExchange(peerASN)
      } else {
        throw new Error('BGP OPEN negotiation failed')
      }
    } catch (error) {
      logger.log(
        `BGP: Connection to AS${peerASN} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )

      session.state = BGPSessionState.IDLE
      peer.status = BGPSessionState.IDLE

      // Schedule retry if not too many attempts
      if (session.connectAttempts < 3) {
        setTimeout(
          () => this.connectToPeer(peerASN),
          BGP_DEFAULTS.CONNECT_RETRY_TIME,
        )
      }

      this.emit('sessionFailed', peerASN, error)
    }
  }

  /**
   * Simulate BGP OPEN message exchange
   * In production, this would involve actual HTTP/WebSocket communication
   */
  private async simulateOpenExchange(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _peer: AgentPeer,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _openMessage: BGPMessage,
  ): Promise<boolean> {
    // Simulate network delay
    await new Promise((resolve) =>
      setTimeout(resolve, 100 + Math.random() * 200),
    )

    // Simulate occasional connection failures for realism
    const successRate = 0.8 // 80% success rate
    return Math.random() < successRate
  }

  /**
   * Initiate route exchange with established peer
   */
  private async initiateRouteExchange(peerASN: number): Promise<void> {
    const session = this.sessions.get(peerASN)
    if (!session || session.state !== BGPSessionState.ESTABLISHED) return

    logger.log(`BGP: Starting route exchange with AS${peerASN}`)

    // In real implementation, this would query the peer for available agents
    // For now, we emit an event that the upper layers can handle
    this.emit('routeExchangeStarted', peerASN)
  }

  /**
   * Send BGP UPDATE message to peer
   */
  async sendUpdate(peerASN: number, update: BGPUpdate): Promise<void> {
    const peer = this.peers.get(peerASN)
    const session = this.sessions.get(peerASN)

    if (!peer || !session || session.state !== BGPSessionState.ESTABLISHED) {
      throw new Error(`No established session with AS${peerASN}`)
    }

    try {
      // Calculate BGP port for peer (AS64512->1179, AS64513->1180)
      const bgpPort = 1179 + (peerASN - 64512)
      const peerUrl = `http://localhost:${bgpPort}/bgp/routes/update`

      // Send actual HTTP request to peer BGP server
      const response = await fetch(peerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(update),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      peer.routesSent += update.advertisedRoutes?.length || 0
      peer.lastUpdate = new Date()

      this.emit('updateSent', peerASN, update)
    } catch (error) {
      logger.log(
        `BGP: Failed to send UPDATE to AS${peerASN}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
      this.handleSessionError(peerASN, error)
    }
  }

  /**
   * Receive BGP UPDATE message from peer
   */
  async receiveUpdate(peerASN: number, update: BGPUpdate): Promise<void> {
    const peer = this.peers.get(peerASN)
    const session = this.sessions.get(peerASN)

    if (!peer || !session || session.state !== BGPSessionState.ESTABLISHED) {
      return
    }

    // Process route advertisements
    if (update.advertisedRoutes) {
      for (const route of update.advertisedRoutes) {
        session.routes.set(route.agentId, route)
        peer.routesReceived++
      }
    }

    // Process route withdrawals
    if (update.withdrawnRoutes) {
      for (const agentId of update.withdrawnRoutes) {
        session.routes.delete(agentId)
      }
    }

    peer.lastUpdate = new Date()
    this.emit('updateReceived', peerASN, update)
  }

  /**
   * Send BGP NOTIFICATION message
   */
  private sendNotification(peerASN: number, reason: string): void {
    logger.log(`BGP: Sending NOTIFICATION to AS${peerASN}: ${reason}`)
    // In real implementation, send BGP NOTIFICATION message over network
    // const notification: BGPMessage = {
    //   type: 'NOTIFICATION',
    //   timestamp: new Date(),
    //   senderASN: this.localASN,
    //   data: { reason }
    // }
  }

  /**
   * Handle session errors
   */
  private handleSessionError(peerASN: number, error: unknown): void {
    const peer = this.peers.get(peerASN)
    const session = this.sessions.get(peerASN)

    if (peer && session) {
      session.state = BGPSessionState.IDLE
      peer.status = BGPSessionState.IDLE

      logger.log(
        `BGP: Session with AS${peerASN} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )

      // Schedule reconnection attempt
      setTimeout(
        () => this.connectToPeer(peerASN),
        BGP_DEFAULTS.CONNECT_RETRY_TIME,
      )
    }

    this.emit('sessionError', peerASN, error)
  }

  /**
   * Start keepalive timer
   */
  private startKeepaliveTimer(): void {
    this.keepaliveTimer = setInterval(() => {
      this.sendKeepalives()
    }, BGP_DEFAULTS.KEEPALIVE_INTERVAL)
  }

  /**
   * Send keepalive messages to all established peers
   */
  private sendKeepalives(): void {
    const now = new Date()

    for (const [peerASN, session] of this.sessions.entries()) {
      if (session.state === BGPSessionState.ESTABLISHED) {
        const timeSinceLastKeepalive =
          now.getTime() - session.lastKeepalive.getTime()

        // Check if peer is still alive (hold time exceeded)
        if (timeSinceLastKeepalive > BGP_DEFAULTS.HOLD_TIME) {
          logger.log(`BGP: Hold timer expired for AS${peerASN}`)
          this.handleSessionError(peerASN, new Error('Hold timer expired'))
          continue
        }

        // Send keepalive
        const keepalive: BGPMessage = {
          type: 'KEEPALIVE',
          timestamp: now,
          senderASN: this.localASN,
        }

        session.lastKeepalive = now
        this.emit('keepaliveSent', peerASN, keepalive)
      }
    }
  }

  /**
   * Receive keepalive message from peer
   */
  receiveKeepalive(peerASN: number): void {
    const session = this.sessions.get(peerASN)
    if (session && session.state === BGPSessionState.ESTABLISHED) {
      session.lastKeepalive = new Date()
    }
  }

  /**
   * Get all peers
   */
  getPeers(): Map<number, AgentPeer> {
    return new Map(this.peers)
  }

  /**
   * Get peer by ASN
   */
  getPeer(peerASN: number): AgentPeer | undefined {
    return this.peers.get(peerASN)
  }

  /**
   * Get routes learned from a specific peer
   */
  getRoutesFromPeer(peerASN: number): AgentRoute[] {
    const session = this.sessions.get(peerASN)
    return session ? Array.from(session.routes.values()) : []
  }

  /**
   * Get session statistics
   */
  getSessionStats() {
    const stats = {
      totalPeers: this.peers.size,
      establishedSessions: 0,
      totalRoutes: 0,
      sessionStates: new Map<BGPSessionState, number>(),
    }

    for (const peer of this.peers.values()) {
      const state = peer.status as BGPSessionState
      stats.sessionStates.set(state, (stats.sessionStates.get(state) || 0) + 1)

      if (state === BGPSessionState.ESTABLISHED) {
        stats.establishedSessions++
      }
    }

    for (const session of this.sessions.values()) {
      stats.totalRoutes += session.routes.size
    }

    return stats
  }

  /**
   * Get local AS number
   */
  getLocalASN(): number {
    return this.localASN
  }

  /**
   * Get router ID
   */
  getRouterID(): string {
    return this.routerId
  }

  /**
   * Get all sessions
   */
  getSessions(): Map<
    number,
    {
      state: BGPSessionState
      lastKeepalive: Date
      connectAttempts: number
      routes: Map<string, AgentRoute>
    }
  > {
    return new Map(this.sessions)
  }

  /**
   * Cleanup and close all sessions
   */
  async shutdown(): Promise<void> {
    logger.log('BGP: Shutting down session manager')

    // Send notifications to all established peers
    for (const [peerASN, peer] of this.peers.entries()) {
      if (peer.status === BGPSessionState.ESTABLISHED) {
        this.sendNotification(peerASN, 'Session shutdown')
      }
    }

    // Clear timers
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer)
    }
    if (this.connectRetryTimer) {
      clearTimeout(this.connectRetryTimer)
    }

    // Clear all data
    this.peers.clear()
    this.sessions.clear()

    this.emit('shutdown')
  }
}
