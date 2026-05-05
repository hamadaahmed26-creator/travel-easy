import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, type OptimizeRequest } from "../src/api";
import { persistResults } from "../src/store";
import { colors, radii, spacing } from "../src/theme";

const STAGES = [
  "Pulling flight prices…",
  "Pulling hotel rates…",
  "Aligning dates across the window…",
  "Calculating combined trip totals…",
  "Scoring volatility & risk…",
  "Building your trip portfolio…",
];

export default function LoadingScreen() {
  const router = useRouter();
  const { req } = useLocalSearchParams<{ req: string }>();
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const shimmer = useSharedValue(0);
  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [shimmer]);

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: 0.45 + shimmer.value * 0.55,
    transform: [{ translateX: -40 + shimmer.value * 80 }],
  }));

  useEffect(() => {
    const interval = setInterval(() => {
      setStage((s) => (s + 1) % STAGES.length);
    }, 700);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        if (!req) throw new Error("Missing request");
        const parsed = JSON.parse(req) as OptimizeRequest;
        const start = Date.now();
        const result = await api.optimize(parsed);
        // Hold loading screen for at least 2s for perceived intelligence
        const elapsed = Date.now() - start;
        if (elapsed < 2200) await new Promise((r) => setTimeout(r, 2200 - elapsed));
        await persistResults(parsed, result);
        router.replace("/results");
      } catch (e: any) {
        setError(e.message ?? "Failed to optimise");
      }
    })();
  }, [req, router]);

  return (
    <View style={styles.root} testID="loading-screen">
      <LinearGradient colors={[...colors.gradHero] as any} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.center}>
          <View style={styles.eyebrowRow}>
            <View style={styles.brandDot} />
            <Text style={styles.eyebrow}>OPTIMISING TRIP PORTFOLIO</Text>
          </View>
          <View style={styles.numberWrap}>
            <Text style={styles.bigNumber} testID="loading-counter">
              {String(stage + 1).padStart(2, "0")}
              <Text style={styles.bigNumberMuted}>/{String(STAGES.length).padStart(2, "0")}</Text>
            </Text>
            <Animated.View style={[styles.shimmer, shimmerStyle, { pointerEvents: "none" }]} />
          </View>

          <View style={styles.stagesBox}>
            {STAGES.map((s, i) => {
              const active = i === stage;
              const done = i < stage;
              return (
                <View key={s} style={styles.stageRow}>
                  <View style={[styles.dot, done && styles.dotDone, active && styles.dotActive]} />
                  <Text
                    style={[styles.stageText, active && styles.stageTextActive, done && styles.stageTextDone]}
                    testID={active ? "active-stage" : undefined}
                  >
                    {s}
                  </Text>
                </View>
              );
            })}
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText} testID="loading-error">{error}</Text>
              <TouchableOpacity testID="back-to-search-btn" onPress={() => router.replace("/")} style={styles.errorBtn}>
                <Text style={styles.errorBtnText}>Back to search</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xl }} />
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xl,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.lg },
  brandDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand },
  eyebrow: {
    color: colors.brandStrong,
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "800",
  },
  numberWrap: { overflow: "hidden", paddingVertical: spacing.sm },
  bigNumber: {
    color: colors.ink,
    fontSize: 120,
    fontWeight: "900",
    letterSpacing: -5,
    lineHeight: 124,
  },
  bigNumberMuted: { color: colors.inkDim, fontSize: 64 },
  shimmer: {
    position: "absolute", top: 0, bottom: 0, left: 0, width: 220,
    backgroundColor: "rgba(91,143,255,0.12)",
  },
  stagesBox: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.md,
  },
  stageRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.borderStrong },
  dotActive: { backgroundColor: colors.brand },
  dotDone: { backgroundColor: colors.buy },
  stageText: { color: colors.inkMuted, fontSize: 14 },
  stageTextActive: { color: colors.ink, fontWeight: "700" },
  stageTextDone: { color: colors.inkSecondary },
  errorBox: { marginTop: spacing.xl, alignItems: "center", gap: spacing.md },
  errorText: { color: colors.danger, textAlign: "center" },
  errorBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.brand,
  },
  errorBtnText: { color: "#fff", fontWeight: "800" },
});
