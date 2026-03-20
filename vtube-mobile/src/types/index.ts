// ─── WebSocket message types (mirrors backend protocol) ───────────────────────

export type AppState =
  | 'connecting'
  | 'idle'
  | 'recording'
  | 'thinking'
  | 'speaking'
  | 'error';

export type Emotion =
  | 'neutral'
  | 'happy'
  | 'excited'
  | 'shy'
  | 'sad'
  | 'surprised'
  | 'focused'
  | 'playful';

// Messages FROM server
export type ServerMessage =
  | { type: 'connected';     sessionId: string }
  | { type: 'transcript';    text: string; final: boolean }
  | { type: 'llm_response';  text: string; emotion: Emotion; intensity: number }
  | { type: 'expression';    params: Record<string, number> }
  | { type: 'audio_chunk';   data: string }   // base64 MP3
  | { type: 'audio_end' }
  | { type: 'error';         message: string; code: string }
  | { type: 'pong' };

// Messages TO server
export type ClientMessage =
  | { type: 'audio_chunk';  data: string }    // base64 audio
  | { type: 'audio_end' }
  | { type: 'text_input';   text: string }
  | { type: 'ping' };

// Chat log entry
export interface Turn {
  id: string;
  role: 'user' | 'oshi';
  text: string;
  timestamp: number;
}

// Emotion state for avatar
export interface EmotionState {
  emotion: Emotion;
  intensity: number;
  params: Record<string, number>;
}
