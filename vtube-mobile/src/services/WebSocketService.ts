/**
 * WebSocketService.ts — Singleton WebSocket client
 *
 * Manages the connection lifecycle to the Node.js backend.
 * Exposes typed send() and an event listener pattern so multiple
 * hooks/components can subscribe to server messages without each
 * managing their own WS connection.
 *
 * Usage:
 *   const ws = WebSocketService.getInstance();
 *   ws.connect('ws://192.168.1.42:3001/ws');
 *   ws.on('llm_response', (msg) => { ... });
 *   ws.send({ type: 'text_input', text: 'hello' });
 *   ws.disconnect();
 */

import { ServerMessage, ClientMessage } from '../types';

type MessageHandler = (msg: ServerMessage) => void;
type ConnectionHandler = (state: 'open' | 'close' | 'error') => void;

class WebSocketService {
  private static instance: WebSocketService;
  private socket: WebSocket | null = null;
  private messageListeners: Set<MessageHandler> = new Set();
  private connectionListeners: Set<ConnectionHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private url: string = '';
  private shouldReconnect = false;

  static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  connect(url: string): void {
    this.url = url;
    this.shouldReconnect = true;
    this._open();
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
  }

  send(msg: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    } else {
      console.warn('[WS] Cannot send — socket not open');
    }
  }

  get isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageListeners.add(handler);
    return () => this.messageListeners.delete(handler);
  }

  onConnectionChange(handler: ConnectionHandler): () => void {
    this.connectionListeners.add(handler);
    return () => this.connectionListeners.delete(handler);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _open(): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return;

    try {
      this.socket = new WebSocket(this.url);
    } catch (err) {
      console.error('[WS] Failed to create WebSocket:', err);
      this._scheduleReconnect();
      return;
    }

    this.socket.onopen = () => {
      console.log('[WS] Connected to', this.url);
      this._notifyConnection('open');
    };

    this.socket.onmessage = (event) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      this.messageListeners.forEach(h => h(msg));
    };

    this.socket.onclose = () => {
      console.log('[WS] Disconnected');
      this._notifyConnection('close');
      if (this.shouldReconnect) this._scheduleReconnect();
    };

    this.socket.onerror = (err) => {
      console.error('[WS] Error:', err);
      this._notifyConnection('error');
    };
  }

  private _scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldReconnect) {
        console.log('[WS] Attempting reconnect...');
        this._open();
      }
    }, 3000);
  }

  private _notifyConnection(state: 'open' | 'close' | 'error'): void {
    this.connectionListeners.forEach(h => h(state));
  }
}

export default WebSocketService;
