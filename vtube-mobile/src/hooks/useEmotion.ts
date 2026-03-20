/**
 * useEmotion.ts — Hook managing avatar emotion state + animated interpolation
 *
 * Receives expression param objects from the server and smoothly interpolates
 * all Live2D parameter values using React Native Animated.
 *
 * Exports:
 *   emotionState  — current { emotion, intensity, params }
 *   animatedParams — Animated.Value map for each Live2D param (for SVG avatar)
 *   applyEmotion  — callable to trigger a new emotion directly
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Animated } from 'react-native';
import { ServerMessage, Emotion, EmotionState } from '../types';

// All Live2D params we animate — must match backend emotionParser.js
const PARAM_KEYS = [
  'ParamEyeOpenL', 'ParamEyeOpenR', 'ParamEyeSmile',
  'ParamBrowLY', 'ParamBrowRY', 'ParamBrowFrownL', 'ParamBrowFrownR',
  'ParamMouthOpenY', 'ParamMouthForm', 'ParamCheek',
  'ParamAngleX', 'ParamAngleY', 'ParamAngleZ', 'ParamBodyAngleX',
];

const NEUTRAL_PARAMS: Record<string, number> = {
  ParamEyeOpenL: 1.0, ParamEyeOpenR: 1.0, ParamEyeSmile: 0.0,
  ParamBrowLY: 0.0,   ParamBrowRY: 0.0,   ParamBrowFrownL: 0.0, ParamBrowFrownR: 0.0,
  ParamMouthOpenY: 0.0, ParamMouthForm: 0.0, ParamCheek: 0.0,
  ParamAngleX: 0.0,   ParamAngleY: 0.0,   ParamAngleZ: 0.0, ParamBodyAngleX: 0.0,
};

interface UseEmotionProps {
  lastMessage: ServerMessage | null;
}

interface UseEmotionReturn {
  emotionState: EmotionState;
  animatedParams: Record<string, Animated.Value>;
  applyEmotion: (params: Record<string, number>, emotion?: Emotion, intensity?: number) => void;
}

export function useEmotion({ lastMessage }: UseEmotionProps): UseEmotionReturn {
  const [emotionState, setEmotionState] = useState<EmotionState>({
    emotion: 'neutral',
    intensity: 0.5,
    params: NEUTRAL_PARAMS,
  });

  // Initialize one Animated.Value per parameter
  const animatedParams = useRef<Record<string, Animated.Value>>(
    Object.fromEntries(
      PARAM_KEYS.map(key => [key, new Animated.Value(NEUTRAL_PARAMS[key] ?? 0)])
    )
  ).current;

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyEmotion = useCallback(
    (params: Record<string, number>, emotion: Emotion = 'neutral', intensity: number = 0.7) => {
      setEmotionState({ emotion, intensity, params });

      // Animate each parameter toward its target with spring physics
      const animations = Object.entries(params).map(([key, target]) => {
        const animVal = animatedParams[key];
        if (!animVal) return null;
        return Animated.spring(animVal, {
          toValue: target,
          tension: 40,
          friction: 8,
          useNativeDriver: false,  // false needed for SVG viewBox params
        });
      }).filter(Boolean) as Animated.CompositeAnimation[];

      Animated.parallel(animations).start();

      // Return to neutral after 8s of inactivity
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        applyEmotion(NEUTRAL_PARAMS, 'neutral', 0);
      }, 8000);
    },
    [animatedParams]
  );

  // Listen for expression events from server
  useEffect(() => {
    if (!lastMessage) return;

    if (lastMessage.type === 'expression') {
      // params come with emotion from the llm_response message
      // We merge with last known emotion state
      applyEmotion(lastMessage.params, emotionState.emotion, emotionState.intensity);
    } else if (lastMessage.type === 'llm_response') {
      setEmotionState(prev => ({
        ...prev,
        emotion: lastMessage.emotion,
        intensity: lastMessage.intensity,
      }));
    }
  }, [lastMessage]);

  return { emotionState, animatedParams, applyEmotion };
}
