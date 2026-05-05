import React from "react";
import { View, StyleSheet } from "react-native";
import Svg, { Circle, Defs, RadialGradient, Stop, G, Ellipse, LinearGradient as SvgLinearGradient } from "react-native-svg";
import { colors } from "../theme";

/**
 * Cinematic globe-style decoration. Uses pure SVG so it works on web + native.
 * Renders a glowing orb with concentric orbits and scattered stars.
 */
export default function Globe({ size = 520, opacity = 1 }: { size?: number; opacity?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.28;

  // Deterministic pseudo-random stars so SSR matches
  const stars = React.useMemo(() => {
    const arr: { x: number; y: number; r: number; o: number }[] = [];
    let seed = 1;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let i = 0; i < 80; i++) {
      arr.push({
        x: rand() * size,
        y: rand() * size,
        r: rand() * 1.6 + 0.3,
        o: rand() * 0.7 + 0.15,
      });
    }
    return arr;
  }, [size]);

  return (
    <View style={[styles.box, { width: size, height: size, opacity }]} pointerEvents="none">
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#5B8FFF" stopOpacity="0.55" />
            <Stop offset="45%" stopColor="#5B8FFF" stopOpacity="0.18" />
            <Stop offset="100%" stopColor="#5B8FFF" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="core" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#7C5BFF" stopOpacity="0.6" />
            <Stop offset="60%" stopColor="#1A2A6E" stopOpacity="0.85" />
            <Stop offset="100%" stopColor="#0A1234" stopOpacity="1" />
          </RadialGradient>
          <SvgLinearGradient id="orbit" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#5B8FFF" stopOpacity="0" />
            <Stop offset="50%" stopColor="#5B8FFF" stopOpacity="0.5" />
            <Stop offset="100%" stopColor="#5B8FFF" stopOpacity="0" />
          </SvgLinearGradient>
        </Defs>

        {/* Stars */}
        {stars.map((s, i) => (
          <Circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#FFFFFF" opacity={s.o} />
        ))}

        {/* Outer glow */}
        <Circle cx={cx} cy={cy} r={size * 0.48} fill="url(#glow)" />

        {/* Orbits */}
        <G opacity={0.7}>
          <Ellipse cx={cx} cy={cy} rx={r * 1.9} ry={r * 0.55} stroke="url(#orbit)" strokeWidth={1} fill="none" />
          <Ellipse cx={cx} cy={cy} rx={r * 1.55} ry={r * 0.42} stroke="url(#orbit)" strokeWidth={1} fill="none" rotation="-22" origin={`${cx}, ${cy}`} />
          <Ellipse cx={cx} cy={cy} rx={r * 1.35} ry={r * 0.32} stroke="url(#orbit)" strokeWidth={1} fill="none" rotation="35" origin={`${cx}, ${cy}`} />
        </G>

        {/* Core orb */}
        <Circle cx={cx} cy={cy} r={r} fill="url(#core)" />
        <Circle cx={cx} cy={cy} r={r} fill="none" stroke={colors.borderGlow} strokeWidth={1} />

        {/* Highlight dot on orb */}
        <Circle cx={cx - r * 0.3} cy={cy - r * 0.4} r={r * 0.08} fill="#FFFFFF" opacity={0.25} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: "center",
    justifyContent: "center",
  },
});
