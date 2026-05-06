import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radii, spacing } from "../src/theme";

const WIDE = 960;

const STEPS = [
  {
    icon: "wallet-outline",
    title: "1. Set your budget",
    body: "Tell us how much you want to spend in total — flights and hotels combined. Tap a chip like £500 or slide to pick.",
  },
  {
    icon: "globe-outline",
    title: "2. Pick where (or anywhere)",
    body: "Choose a city, a whole region (\"All London airports\"), or just \"Anywhere\" and we'll hunt the planet.",
  },
  {
    icon: "rocket-outline",
    title: "3. We optimise the whole trip",
    body: "We check 8,000+ combos of flights + hotels + dates, and rank the best 3: Cheapest, Best Value, Lowest Risk.",
  },
  {
    icon: "trending-down-outline",
    title: "4. Buy now or wait?",
    body: "Each trip has a buy/wait recommendation with confidence score, based on a 30-day price history and a 14-day forecast.",
  },
  {
    icon: "notifications-outline",
    title: "5. (Pro) Watch the price",
    body: "Save trips and get alerted when prices drop or the recommendation flips — instant push + in-app alerts every 6 hours.",
  },
];

export default function HowItWorks() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE;

  return (
    <View style={styles.root}>
      <LinearGradient colors={[...colors.gradHero] as any} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <View style={styles.header}>
          <Pressable
            testID="how-back-btn"
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
            style={({ hovered }: any) => [styles.iconBtn, hovered && styles.iconBtnHover]}
          >
            <Ionicons name="chevron-back" size={20} color={colors.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>How TripOpt works</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.scroll, isWide && styles.scrollWide]}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeInUp.duration(420)} style={[styles.heroBox, isWide && { maxWidth: 720 }]}>
            <View style={styles.eyebrowRow}>
              <View style={styles.dot} />
              <Text style={styles.eyebrow}>30-SECOND EXPLAINER</Text>
            </View>
            <Text style={styles.h1}>
              Tell us your budget. We pick the <Text style={styles.h1Accent}>best whole trip</Text> anywhere.
            </Text>
            <Text style={styles.heroSub}>
              Most travel apps optimise just flights or just hotels. TripOpt optimises the whole trip — flights + hotels + dates — like a portfolio. You get the cheapest combined cost.
            </Text>
          </Animated.View>

          <View style={[styles.steps, isWide && styles.stepsWide]}>
            {STEPS.map((s, i) => (
              <Animated.View
                key={s.title}
                entering={FadeInDown.duration(380).delay(80 + i * 60)}
                style={[styles.step, isWide && styles.stepWide]}
              >
                <View style={styles.stepIcon}>
                  <Ionicons name={s.icon as any} size={20} color={colors.brand} />
                </View>
                <Text style={styles.stepTitle}>{s.title}</Text>
                <Text style={styles.stepBody}>{s.body}</Text>
              </Animated.View>
            ))}
          </View>

          <Animated.View entering={FadeInUp.duration(420).delay(380)} style={styles.ctaWrap}>
            <Pressable
              testID="how-cta"
              onPress={() => router.replace("/")}
              style={({ hovered }: any) => [styles.cta, hovered && { transform: [{ translateY: -1 }] }]}
            >
              <LinearGradient colors={[...colors.gradAccent] as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <Text style={styles.ctaText}>Try it now</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </Pressable>
            <Text style={styles.fineprint}>
              Free to use. No account needed unless you want price alerts.
            </Text>
          </Animated.View>

          <View style={{ height: spacing.xxxl }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.md,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: radii.md,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  iconBtnHover: { backgroundColor: colors.surfaceHover, borderColor: colors.borderStrong },
  headerTitle: { color: colors.ink, fontSize: 16, fontWeight: "900", letterSpacing: -0.3 },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.xl },
  scrollWide: { paddingHorizontal: spacing.xxxl, alignItems: "center" },
  heroBox: { width: "100%", gap: spacing.md, paddingTop: spacing.lg },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand },
  eyebrow: { color: colors.brandStrong, fontSize: 11, letterSpacing: 2.4, fontWeight: "800" },
  h1: { color: colors.ink, fontSize: 36, lineHeight: 42, fontWeight: "900", letterSpacing: -1.2 },
  h1Accent: { color: colors.brand },
  heroSub: { color: colors.inkSecondary, fontSize: 15, lineHeight: 22, maxWidth: 600 },
  steps: { gap: spacing.md, width: "100%" },
  stepsWide: { flexDirection: "row", flexWrap: "wrap", gap: spacing.lg, maxWidth: 1100 },
  step: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, gap: 8,
  },
  stepWide: { width: "31.5%", minWidth: 280 },
  stepIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: colors.riskLowBg, borderWidth: 1, borderColor: colors.borderGlow,
    alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  stepTitle: { color: colors.ink, fontWeight: "900", fontSize: 15, letterSpacing: -0.3 },
  stepBody: { color: colors.inkSecondary, fontSize: 13, lineHeight: 20 },
  ctaWrap: { width: "100%", alignItems: "center", gap: spacing.sm, marginTop: spacing.lg },
  cta: {
    height: 56, paddingHorizontal: spacing.xxl,
    borderRadius: radii.lg,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: spacing.sm, overflow: "hidden",
    shadowColor: colors.brand, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45, shadowRadius: 16,
  },
  ctaText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  fineprint: { color: colors.inkMuted, fontSize: 12 },
});
