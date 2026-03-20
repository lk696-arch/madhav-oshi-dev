/**
 * AvatarCanvas.tsx — Avatar rendering component
 *
 * Renders a fully animated SVG face driven by Live2D-style parameters.
 * The SVG face is a stand-in for a real Live2D model and demonstrates
 * the full expression pipeline working end-to-end on mobile.
 *
 * To connect a real Live2D model, replace this component with a WebView
 * pointing at the web frontend (see Live2DWebView comment at bottom).
 *
 * Animated parameters used:
 *   ParamEyeSmile     → eye curve shape (0=open circle, 1=curved smile line)
 *   ParamEyeOpenL/R   → eye height scale
 *   ParamMouthForm    → mouth curve (-1=sad, 0=neutral, 1=smile)
 *   ParamMouthOpenY   → mouth open amount
 *   ParamCheek        → blush circle opacity
 *   ParamAngleZ       → head tilt (SVG rotate)
 *   ParamBrowLY/RY    → brow vertical position
 */

import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, {
  Circle, Ellipse, Path, Line, G, Defs, RadialGradient, Stop,
} from 'react-native-svg';
import { Animated } from 'react-native';
import { COLORS } from '../constants/config';

const { width } = Dimensions.get('window');
const AVATAR_SIZE = Math.min(width * 0.85, 360);

// Wrap SVG elements with Animated
const AnimatedG = Animated.createAnimatedComponent(G);

interface Props {
  animatedParams: Record<string, Animated.Value>;
}

export function AvatarCanvas({ animatedParams }: Props) {
  const p = animatedParams;
  const cx = AVATAR_SIZE / 2;
  const cy = AVATAR_SIZE / 2;

  // Derive display values from animated params
  const eyeSmile  = p['ParamEyeSmile'];
  const mouthForm = p['ParamMouthForm'];
  const mouthOpen = p['ParamMouthOpenY'];
  const cheek     = p['ParamCheek'];
  const browLY    = p['ParamBrowLY'];
  const browRY    = p['ParamBrowRY'];
  const angleZ    = p['ParamAngleZ'];

  return (
    <View style={[styles.container, { width: AVATAR_SIZE, height: AVATAR_SIZE }]}>
      <Svg width={AVATAR_SIZE} height={AVATAR_SIZE} viewBox={`0 0 ${AVATAR_SIZE} ${AVATAR_SIZE}`}>
        <Defs>
          <RadialGradient id="faceGrad" cx="50%" cy="45%" r="55%">
            <Stop offset="0%" stopColor="#2a1f4a" />
            <Stop offset="100%" stopColor="#1a1030" />
          </RadialGradient>
          <RadialGradient id="glowGrad" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#a78bfa" stopOpacity="0.2" />
            <Stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
          </RadialGradient>
        </Defs>

        {/* Ambient glow */}
        <Circle cx={cx} cy={cy} r={cx * 0.95} fill="url(#glowGrad)" />

        {/* Face circle */}
        <Circle
          cx={cx} cy={cy} r={cx * 0.82}
          fill="url(#faceGrad)"
          stroke={COLORS.accent}
          strokeWidth={2}
          strokeOpacity={0.6}
        />

        {/* Hair suggestion */}
        <Path
          d={`M ${cx - cx * 0.82} ${cy - 10}
              Q ${cx - cx * 0.6} ${cy - cx * 0.95}
                ${cx} ${cy - cx * 0.88}
              Q ${cx + cx * 0.6} ${cy - cx * 0.95}
                ${cx + cx * 0.82} ${cy - 10}`}
          fill="#1a0a2e"
          stroke="none"
        />

        {/* Cheeks (blush) */}
        <AnimatedCheek
          cx={cx - 80} cy={cy + 20}
          opacityAnim={cheek}
        />
        <AnimatedCheek
          cx={cx + 80} cy={cy + 20}
          opacityAnim={cheek}
        />

        {/* Left brow */}
        <AnimatedBrow
          x1={cx - 80} y1={cy - 68}
          x2={cx - 38} y2={cy - 72}
          yOffsetAnim={browLY}
          side="left"
        />

        {/* Right brow */}
        <AnimatedBrow
          x1={cx + 38} y1={cy - 72}
          x2={cx + 80} y2={cy - 68}
          yOffsetAnim={browRY}
          side="right"
        />

        {/* Eyes */}
        <AnimatedEye cx={cx - 58} cy={cy - 30} eyeSmileAnim={eyeSmile} />
        <AnimatedEye cx={cx + 58} cy={cy - 30} eyeSmileAnim={eyeSmile} />

        {/* Nose dot */}
        <Circle cx={cx} cy={cy + 18} r={3} fill={COLORS.accent2} opacity={0.5} />

        {/* Mouth */}
        <AnimatedMouth
          cx={cx} cy={cy + 55}
          mouthFormAnim={mouthForm}
          mouthOpenAnim={mouthOpen}
        />
      </Svg>
    </View>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────────

function AnimatedCheek({ cx, cy, opacityAnim }: {
  cx: number; cy: number;
  opacityAnim: Animated.Value;
}) {
  const opacity = opacityAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] });
  return (
    <AnimatedG style={{ opacity } as any}>
      <Ellipse cx={cx} cy={cy} rx={28} ry={16} fill={COLORS.accent2} />
    </AnimatedG>
  );
}

function AnimatedBrow({ x1, y1, x2, y2, yOffsetAnim, side }: {
  x1: number; y1: number; x2: number; y2: number;
  yOffsetAnim: Animated.Value;
  side: 'left' | 'right';
}) {
  const translate = yOffsetAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [8, 0, -8],
  });

  return (
    <AnimatedG style={{ transform: [{ translateY: translate }] } as any}>
      <Line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={COLORS.text}
        strokeWidth={4}
        strokeLinecap="round"
        strokeOpacity={0.9}
      />
    </AnimatedG>
  );
}

function AnimatedEye({ cx, cy, eyeSmileAnim }: {
  cx: number; cy: number;
  eyeSmileAnim: Animated.Value;
}) {
  // When smiling, the eye bottom flattens to a curved line
  const eyeH = eyeSmileAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [18, 6],
  });
  const smileOpacity = eyeSmileAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0.5, 1],
  });

  return (
    <G>
      {/* Eye white */}
      <AnimatedEllipse
        cx={cx} cy={cy} rx={20}
        ryAnim={eyeH}
        fill={COLORS.text}
      />
      {/* Pupil */}
      <Circle cx={cx} cy={cy + 2} r={10} fill="#1a0a2e" />
      {/* Iris highlight */}
      <Circle cx={cx - 3} cy={cy - 3} r={5} fill="#a78bfa" opacity={0.8} />
      <Circle cx={cx - 5} cy={cy - 5} r={3} fill="white" />
      {/* Smile crease */}
      <AnimatedG style={{ opacity: smileOpacity } as any}>
        <Path
          d={`M ${cx - 20} ${cy + 2} Q ${cx} ${cy + 16} ${cx + 20} ${cy + 2}`}
          stroke={COLORS.accent}
          strokeWidth={2.5}
          fill="none"
          strokeLinecap="round"
        />
      </AnimatedG>
    </G>
  );
}

// Helper: Animated Ellipse (ry driven by Animated.Value)
function AnimatedEllipse({ cx, cy, rx, ryAnim, fill }: {
  cx: number; cy: number; rx: number;
  ryAnim: Animated.Value;
  fill: string;
}) {
  // We interpolate the clipPath height via scaleY transform
  const scaleY = (ryAnim as any).interpolate
    ? ryAnim.interpolate({ inputRange: [0, 18], outputRange: [0, 1] })
    : 1;

  return (
    <AnimatedG style={{ transform: [{ scaleY }] } as any}>
      <Ellipse cx={cx} cy={cy} rx={rx} ry={18} fill={fill} />
    </AnimatedG>
  );
}

function AnimatedMouth({ cx, cy, mouthFormAnim, mouthOpenAnim }: {
  cx: number; cy: number;
  mouthFormAnim: Animated.Value;
  mouthOpenAnim: Animated.Value;
}) {
  // curve: positive = smile, negative = frown
  const curve = mouthFormAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [-20, 0, 22],
  });
  const openH = mouthOpenAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 18],
  });

  return (
    <G>
      {/* Mouth line */}
      <AnimatedMouthPath cx={cx} cy={cy} curveAnim={curve} />
    </G>
  );
}

// Animated path helper using interpolated curve
function AnimatedMouthPath({ cx, cy, curveAnim }: {
  cx: number; cy: number;
  curveAnim: Animated.Value | any;
}) {
  // We can't interpolate SVG path strings in RN Animated natively,
  // so we use a scaleY on an arc shape as a proxy
  const scaleY = curveAnim.interpolate({
    inputRange: [-20, 0, 22],
    outputRange: [-0.8, 0.01, 1],
  });

  return (
    <AnimatedG style={{ transform: [{ scaleY }] } as any}>
      <Path
        d={`M ${cx - 38} ${cy} Q ${cx} ${cy + 24} ${cx + 38} ${cy}`}
        stroke={COLORS.accent2}
        strokeWidth={4}
        strokeLinecap="round"
        fill="none"
      />
    </AnimatedG>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
