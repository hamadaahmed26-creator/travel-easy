import React from "react";
import { View, StyleSheet, Text } from "react-native";
import Svg, {
  Path,
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Line,
  G,
} from "react-native-svg";
import { colors } from "../theme";

/**
 * Smooth interactive-feeling SVG sparkline.
 * - Solid line for the historical part
 * - Dashed line for the forecast part
 * - Gradient fill underneath
 * - "Today" marker dot
 */
export default function Sparkline({
  history,
  forecast,
  current,
  width = 600,
  height = 180,
}: {
  history: number[];
  forecast: number[];
  current: number;
  width?: number;
  height?: number;
}) {
  const all = [...history, ...forecast];
  if (all.length < 2) return null;

  const min = Math.min(...all);
  const max = Math.max(...all);
  const range = Math.max(1, max - min);

  const padX = 16;
  const padY = 18;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const step = innerW / (all.length - 1);

  const points = all.map((v, i) => ({
    x: padX + i * step,
    y: padY + innerH - ((v - min) / range) * innerH,
  }));

  // Smooth path using cubic bezier (Catmull-Rom -> Bezier)
  const buildPath = (pts: { x: number; y: number }[]) => {
    if (pts.length < 2) return "";
    let d = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] ?? p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    return d;
  };

  const splitIdx = history.length - 1;
  const histPts = points.slice(0, history.length);
  const fcstPts = points.slice(history.length - 1); // overlap one point for continuity

  const histPath = buildPath(histPts);
  const fcstPath = buildPath(fcstPts);

  // Area path (only history) - close to baseline
  const areaPath = histPath
    ? `${histPath} L ${histPts[histPts.length - 1].x},${padY + innerH} L ${histPts[0].x},${padY + innerH} Z`
    : "";

  const todayPt = points[splitIdx];

  return (
    <View style={[styles.box, { width, height }]} testID="price-sparkline">
      <Svg width={width} height={height}>
        <Defs>
          <SvgLinearGradient id="area" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor={colors.brand} stopOpacity="0.35" />
            <Stop offset="100%" stopColor={colors.brand} stopOpacity="0" />
          </SvgLinearGradient>
        </Defs>

        {/* Horizontal grid */}
        <G opacity={0.25}>
          {[0.25, 0.5, 0.75].map((p) => (
            <Line
              key={p}
              x1={padX}
              y1={padY + innerH * p}
              x2={width - padX}
              y2={padY + innerH * p}
              stroke={colors.border}
              strokeWidth={1}
              strokeDasharray="2,4"
            />
          ))}
        </G>

        {/* Area gradient under history */}
        <Path d={areaPath} fill="url(#area)" />

        {/* History line - solid */}
        <Path d={histPath} stroke={colors.brand} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />

        {/* Forecast line - dashed */}
        <Path d={fcstPath} stroke={colors.brandStrong} strokeWidth={2} fill="none" strokeDasharray="5,5" strokeLinecap="round" />

        {/* Today marker */}
        {todayPt && (
          <>
            <Circle cx={todayPt.x} cy={todayPt.y} r={8} fill={colors.brand} opacity={0.25} />
            <Circle cx={todayPt.x} cy={todayPt.y} r={4.5} fill={colors.bg} stroke={colors.brand} strokeWidth={2} />
          </>
        )}
      </Svg>

      <View style={styles.labelMin}>
        <Text style={styles.tag}>£{Math.round(min)}</Text>
      </View>
      <View style={styles.labelMax}>
        <Text style={styles.tag}>£{Math.round(max)}</Text>
      </View>
      <View style={styles.labelNow}>
        <Text style={styles.nowTag}>now £{Math.round(current)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.bgElev,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  labelMin: { position: "absolute", left: 12, bottom: 6 },
  labelMax: { position: "absolute", right: 12, top: 6 },
  labelNow: { position: "absolute", left: 12, top: 6 },
  tag: { fontSize: 10, color: colors.inkMuted, fontWeight: "700", letterSpacing: 1 },
  nowTag: { fontSize: 10, color: colors.brand, fontWeight: "800", letterSpacing: 1 },
});
