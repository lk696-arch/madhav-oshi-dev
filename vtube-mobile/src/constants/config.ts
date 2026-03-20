// WS_URL — set EXPO_PUBLIC_WS_URL in your .env file
// For local dev, use your machine's LAN IP so physical devices can reach it:
//   ipconfig (Windows) → IPv4 Address → e.g. ws://192.168.1.42:3001/ws
// For production, use your Railway/Fly.io URL:
//   e.g. wss://your-app.railway.app/ws
export const WS_URL: string =
  process.env.EXPO_PUBLIC_WS_URL ?? 'ws://localhost:3001/ws';

// How long to wait before attempting WS reconnect (ms)
export const WS_RECONNECT_DELAY = 3000;

// Audio recording options
export const RECORDING_OPTIONS = {
  android: {
    extension: '.m4a',
    outputFormat: 2,        // MPEG_4
    audioEncoder: 3,        // AAC
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 128000,
  },
  ios: {
    extension: '.m4a',
    audioQuality: 127,      // MAX
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 128000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 128000,
  },
};

// Design tokens (mirror the web frontend palette)
export const COLORS = {
  bg:           '#0d0d14',
  surface:      '#16162a',
  surface2:     '#1e1e38',
  accent:       '#a78bfa',
  accent2:      '#f472b6',
  text:         '#e2e8f0',
  textMuted:    '#94a3b8',
  border:       '#2e2e50',
  danger:       '#f87171',
  success:      '#34d399',
  warning:      '#fbbf24',
};
