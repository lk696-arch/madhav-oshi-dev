/**
 * useWebSocket.ts — React hook for WebSocket state
 *
 * Subscribes to WebSocketService and exposes:
 *   - appState: current pipeline state machine
 *   - sessionId: assigned by server on connect
 *   - connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error'
 *   - lastMessage: most recent parsed server message
 *   - send(): typed message sender
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import WebSocketService from '../services/WebSocketService';
import { WS_URL } from '../constants/config';
import { ServerMessage, ClientMessage, AppState } from '../types';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseWebSocketReturn {
  appState: AppState;
  setAppState: (s: AppState) => void;
  connectionStatus: ConnectionStatus;
  sessionId: string | null;
  lastMessage: ServerMessage | null;
  send: (msg: ClientMessage) => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const [appState, setAppState] = useState<AppState>('connecting');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<ServerMessage | null>(null);

  const ws = WebSocketService.getInstance();
  // Keep appState accessible in callbacks without re-subscribing
  const appStateRef = useRef(appState);
  appStateRef.current = appState;

  useEffect(() => {
    // Subscribe to connection events
    const unsubConn = ws.onConnectionChange((state) => {
      if (state === 'open') {
        setConnectionStatus('connecting'); // waiting for 'connected' message
      } else if (state === 'close') {
        setConnectionStatus('disconnected');
        setAppState('connecting');
        setSessionId(null);
      } else {
        setConnectionStatus('error');
      }
    });

    // Subscribe to server messages
    const unsubMsg = ws.onMessage((msg) => {
      setLastMessage(msg);

      switch (msg.type) {
        case 'connected':
          setSessionId(msg.sessionId);
          setConnectionStatus('connected');
          setAppState('idle');
          break;

        case 'transcript':
          setAppState('thinking');
          break;

        case 'llm_response':
          setAppState('speaking');
          break;

        case 'audio_end':
          setAppState('idle');
          break;

        case 'error':
          setAppState('idle');
          if (msg.code === 'SAFETY_BLOCK') {
            // Let ChatScreen handle the message display
          }
          break;
      }
    });

    // Open connection
    ws.connect(WS_URL);

    return () => {
      unsubConn();
      unsubMsg();
    };
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    ws.send(msg);
  }, []);

  return { appState, setAppState, connectionStatus, sessionId, lastMessage, send };
}
