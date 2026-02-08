/**
 * P2P Manager — WebRTC DataChannel orchestrator for peer-to-peer messaging.
 *
 * Manages a full-mesh of RTCPeerConnections with ordered reliable DataChannels.
 * Signaling (SDP offers/answers + ICE candidates) is relayed through the server
 * via the /signal endpoint and received through SSE.
 */

import { apiClient } from "./api-client";

export type PeerConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "failed";

export interface P2PMessage {
  type: "message" | "read_receipt" | "presence" | "ack" | "reaction";
  id: string;
  senderId: string;
  conversationId: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface P2PManagerEvent {
  type:
    | "message_received"
    | "read_receipt"
    | "presence_changed"
    | "connection_state_changed"
    | "reaction";
  peerId: string;
  data: Record<string, unknown>;
}

export type P2PEventCallback = (event: P2PManagerEvent) => void;

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

const DATA_CHANNEL_LABEL = "securechat";

export class P2PManager {
  private conversationId: string;
  private myUserId: string;
  private participants: string[];
  private connections = new Map<string, RTCPeerConnection>();
  private channels = new Map<string, RTCDataChannel>();
  private peerStates = new Map<string, PeerConnectionState>();
  private listeners = new Set<P2PEventCallback>();
  private destroyed = false;

  constructor(
    conversationId: string,
    myUserId: string,
    participants: string[]
  ) {
    this.conversationId = conversationId;
    this.myUserId = myUserId;
    this.participants = participants.filter((id) => id !== myUserId);

    for (const peerId of this.participants) {
      this.peerStates.set(peerId, "disconnected");
    }
  }

  /**
   * Initialize connections to all peers.
   * The initiator (lexicographically smaller userId) creates the offer.
   */
  async initialize(): Promise<void> {
    for (const peerId of this.participants) {
      const isInitiator = this.myUserId < peerId;
      await this.createConnection(peerId, isInitiator);
    }
  }

  /**
   * Handle an incoming WebRTC signal from SSE.
   */
  async handleSignal(senderId: string, signalData: string): Promise<void> {
    if (this.destroyed) return;

    let signal: { type: string; sdp?: string; candidate?: RTCIceCandidateInit; targetPeerId?: string };
    try {
      signal = JSON.parse(signalData);
    } catch {
      // Could be a presence_announce signal
      try {
        const parsed = JSON.parse(signalData);
        if (parsed.type === "presence_announce") {
          // Peer announced presence — if we don't have a connection, create one
          if (
            !this.connections.has(senderId) ||
            this.peerStates.get(senderId) === "failed"
          ) {
            const isInitiator = this.myUserId < senderId;
            await this.createConnection(senderId, isInitiator);
          }
          return;
        }
      } catch {
        // ignore
      }
      return;
    }

    // Filter signals: only process if this signal is intended for us
    if (signal.targetPeerId && signal.targetPeerId !== this.myUserId) {
      return;
    }

    let pc = this.connections.get(senderId);

    if (!pc) {
      // Received a signal from a peer we haven't connected to yet
      await this.createConnection(senderId, false);
      pc = this.connections.get(senderId);
      if (!pc) return;
    }

    if (signal.type === "offer") {
      await pc.setRemoteDescription(
        new RTCSessionDescription({ type: "offer", sdp: signal.sdp })
      );
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await this.sendSignal(senderId, {
        type: "answer",
        sdp: answer.sdp,
      });
    } else if (signal.type === "answer") {
      await pc.setRemoteDescription(
        new RTCSessionDescription({ type: "answer", sdp: signal.sdp })
      );
    } else if (signal.type === "ice-candidate" && signal.candidate) {
      await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
    }
  }

  /**
   * Send a message to all connected peers.
   */
  sendMessage(message: P2PMessage): void {
    const json = JSON.stringify(message);
    for (const [peerId, channel] of this.channels) {
      if (channel.readyState === "open") {
        channel.send(json);
      }
    }
  }

  /**
   * Send a message to a specific peer.
   */
  sendToPeer(peerId: string, message: P2PMessage): void {
    const channel = this.channels.get(peerId);
    if (channel && channel.readyState === "open") {
      channel.send(JSON.stringify(message));
    }
  }

  /**
   * Get the connection state of a specific peer.
   */
  getPeerState(peerId: string): PeerConnectionState {
    return this.peerStates.get(peerId) || "disconnected";
  }

  /**
   * Get all peer connection states.
   */
  getAllPeerStates(): Map<string, PeerConnectionState> {
    return new Map(this.peerStates);
  }

  /**
   * Subscribe to P2P events.
   */
  on(callback: P2PEventCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Clean up all connections and channels.
   */
  destroy(): void {
    this.destroyed = true;

    for (const channel of this.channels.values()) {
      channel.close();
    }
    this.channels.clear();

    for (const pc of this.connections.values()) {
      pc.close();
    }
    this.connections.clear();

    this.listeners.clear();
  }

  private async createConnection(
    peerId: string,
    isInitiator: boolean
  ): Promise<void> {
    if (this.destroyed) return;

    // Close existing connection if any
    const existing = this.connections.get(peerId);
    if (existing) {
      existing.close();
    }

    const pc = new RTCPeerConnection(ICE_CONFIG);
    this.connections.set(peerId, pc);
    this.updatePeerState(peerId, "connecting");

    // ICE candidate handling
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal(peerId, {
          type: "ice-candidate",
          candidate: event.candidate.toJSON(),
        });
      }
    };

    // Connection state tracking
    pc.onconnectionstatechange = () => {
      if (this.destroyed) return;

      switch (pc.connectionState) {
        case "connected":
          this.updatePeerState(peerId, "connected");
          break;
        case "disconnected":
        case "closed":
          this.updatePeerState(peerId, "disconnected");
          break;
        case "failed":
          this.updatePeerState(peerId, "failed");
          break;
        case "connecting":
          this.updatePeerState(peerId, "connecting");
          break;
      }
    };

    if (isInitiator) {
      // Create the DataChannel
      const channel = pc.createDataChannel(DATA_CHANNEL_LABEL, {
        ordered: true,
      });
      this.setupDataChannel(peerId, channel);

      // Create and send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await this.sendSignal(peerId, {
        type: "offer",
        sdp: offer.sdp,
      });
    } else {
      // Wait for the remote peer to create the DataChannel
      pc.ondatachannel = (event) => {
        this.setupDataChannel(peerId, event.channel);
      };
    }
  }

  private setupDataChannel(peerId: string, channel: RTCDataChannel): void {
    this.channels.set(peerId, channel);

    channel.onopen = () => {
      if (this.destroyed) return;
      this.updatePeerState(peerId, "connected");
    };

    channel.onclose = () => {
      if (this.destroyed) return;
      this.channels.delete(peerId);
      this.updatePeerState(peerId, "disconnected");
    };

    channel.onerror = () => {
      if (this.destroyed) return;
      this.updatePeerState(peerId, "failed");
    };

    channel.onmessage = (event) => {
      if (this.destroyed) return;
      this.handleDataChannelMessage(peerId, event.data);
    };
  }

  private handleDataChannelMessage(peerId: string, data: string): void {
    let message: P2PMessage;
    try {
      message = JSON.parse(data);
    } catch {
      return;
    }

    // Auto-ack incoming messages
    if (message.type === "message") {
      const ack: P2PMessage = {
        type: "ack",
        id: crypto.randomUUID(),
        senderId: this.myUserId,
        conversationId: this.conversationId,
        timestamp: new Date().toISOString(),
        payload: { originalMessageId: message.id },
      };
      this.sendToPeer(peerId, ack);
    }

    // Map message type to event type
    let eventType: P2PManagerEvent["type"];
    switch (message.type) {
      case "message":
        eventType = "message_received";
        break;
      case "read_receipt":
        eventType = "read_receipt";
        break;
      case "presence":
        eventType = "presence_changed";
        break;
      case "reaction":
        eventType = "reaction";
        break;
      case "ack":
        eventType = "message_received"; // acks go through the same handler
        break;
      default:
        return;
    }

    this.emit({
      type: eventType,
      peerId,
      data: { ...message.payload, messageType: message.type, messageId: message.id, senderId: message.senderId, timestamp: message.timestamp },
    });
  }

  private async sendSignal(
    targetPeerId: string,
    signalData: object
  ): Promise<void> {
    try {
      await apiClient.relaySignal(
        this.conversationId,
        JSON.stringify({ ...signalData, targetPeerId })
      );
    } catch (err) {
      console.error("Failed to relay signal:", err);
    }
  }

  private updatePeerState(
    peerId: string,
    state: PeerConnectionState
  ): void {
    const prev = this.peerStates.get(peerId);
    if (prev === state) return;

    this.peerStates.set(peerId, state);
    this.emit({
      type: "connection_state_changed",
      peerId,
      data: { state, previousState: prev },
    });
  }

  private emit(event: P2PManagerEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Don't let listener errors break the manager
      }
    }
  }
}
