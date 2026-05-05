import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../src/api";
import { useAuth } from "../src/auth";
import { colors, radii, spacing } from "../src/theme";

const WIDE = 960;

export default function UpgradeScreen() {
  const router = useRouter();
  const { user, loading, refresh } = useAuth();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE;
  const params = useLocalSearchParams<{ session_id?: string }>();
  const [creating, setCreating] = useState(false);
  const [polling, setPolling] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const polledRef = useRef(false);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  useEffect(() => {
    const sid = (params.session_id as string) || (typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("session_id") ?? undefined
      : undefined);
    if (!sid || polledRef.current) return;
    polledRef.current = true;
    poll(sid);
  }, [params.session_id]);

  const poll = useCallback(async (sid: string, attempts = 0) => {
    setPolling(true);
    setStatusMsg("Confirming payment…");
    try {
      const res = await api.paymentStatus(sid);
      if (res.payment_status === "paid") {
        setStatusMsg(`Pro unlocked! Active until ${res.pro_until ? new Date(res.pro_until).toLocaleDateString("en-GB") : "30 days"}.`);
        setPolling(false);
        await refresh();
        return;
      }
      if (res.status === "expired") {
        setError("Payment session expired. Try again.");
        setPolling(false);
        return;
      }
      if (attempts >= 6) {
        setStatusMsg("Still processing. Check back in a moment.");
        setPolling(false);
        return;
      }
      setTimeout(() => poll(sid, attempts + 1), 2000);
    } catch (e: any) {
      setError(e?.message ?? "Could not check payment status");
      setPolling(false);
    }
  }, [refresh]);

  const startCheckout = async () => {
    if (!user) { router.push("/login"); return; }
    setCreating(true);
    setError(null);
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const res = await api.checkout(origin);
      if (typeof window !== "undefined") window.location.href = res.url;
    } catch (e: any) {
      setError(e?.message ?? "Checkout failed");
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.root}>
        <LinearGradient colors={[...colors.gradHero] as any} style={StyleSheet.absoluteFill} />
        <SafeAreaView style={{ flex: 1 }}>
          <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xxxl }} />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root} testID="upgrade-screen">
      <LinearGradient colors={[...colors.gradHero] as any} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <View style={styles.header}>
          <Pressable testID="upgrade-back-btn" onPress={() => router.back()} style={({ hovered }: any) => [styles.iconBtn, hovered && styles.iconBtnHover]}>
            <Ionicons name="chevron-back" size={20} color={colors.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>TripOpt Pro</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={[styles.body, isWide && styles.bodyWide]}>
          <Animated.View entering={FadeInUp.duration(420)} style={[styles.card, isWide && { maxWidth: 560 }]}>
            <Text style={styles.eyebrow}>UPGRADE · 30 DAYS</Text>
            <Text style={styles.bigPrice}>£2.99</Text>
            <Text style={styles.bigSub}>One payment. 30 days of Pro. No auto-renew.</Text>

            <View style={styles.benefitsCard}>
              <Benefit icon="eye-outline" title="Watch unlimited trips" sub="Free tier limits you to 1." />
              <Benefit icon="notifications-outline" title="Real price alerts" sub="Push + in-app alerts every 6h." />
              <Benefit icon="trending-down-outline" title="Smart timing" sub="Buy/Wait flips trigger instant alerts." />
              <Benefit icon="rocket-outline" title="Early deal access" sub="Top combos surfaced before search median." />
            </View>

            {user?.is_pro && (
              <View style={styles.proBox} testID="already-pro-box">
                <Text style={styles.proText}>
                  ✓ You're already Pro until {user.pro_until ? new Date(user.pro_until).toLocaleDateString("en-GB") : "—"}.
                </Text>
                <Text style={styles.proSub}>Buying again extends Pro by another 30 days.</Text>
              </View>
            )}

            {statusMsg ? (
              <View style={styles.statusBox} testID="payment-status">
                {polling ? <ActivityIndicator color={colors.brand} /> : null}
                <Text style={styles.statusText}>{statusMsg}</Text>
              </View>
            ) : null}
            {error ? <Text style={styles.error} testID="upgrade-error">{error}</Text> : null}

            <Animated.View entering={FadeInDown.duration(380).delay(80)}>
              <Pressable
                testID="start-checkout-btn"
                style={({ pressed, hovered }: any) => [
                  styles.cta, hovered && { transform: [{ translateY: -1 }] },
                  (pressed || creating) && { opacity: 0.8 },
                ]}
                onPress={startCheckout}
                disabled={creating || polling}
              >
                <LinearGradient colors={[...colors.gradAccent] as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                {creating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="card" size={18} color="#fff" />
                    <Text style={styles.ctaText}>{user?.is_pro ? "Extend Pro · £2.99" : "Upgrade to Pro · £2.99"}</Text>
                  </>
                )}
              </Pressable>
            </Animated.View>
            <Text style={styles.disclaimer}>Test card 4242 4242 4242 4242 · any future expiry · any CVC.</Text>
          </Animated.View>
        </View>
      </SafeAreaView>
    </View>
  );
}

function Benefit({ icon, title, sub }: { icon: any; title: string; sub: string }) {
  return (
    <View style={styles.benefit}>
      <View style={styles.benefitIcon}>
        <Ionicons name={icon} size={18} color={colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.benefitTitle}>{title}</Text>
        <Text style={styles.benefitSub}>{sub}</Text>
      </View>
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
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  iconBtnHover: { backgroundColor: colors.surfaceHover, borderColor: colors.borderStrong },
  headerTitle: { color: colors.ink, fontWeight: "900", fontSize: 16, letterSpacing: -0.3 },
  body: { flex: 1, padding: spacing.xl, alignItems: "center", justifyContent: "center" },
  bodyWide: { paddingHorizontal: spacing.xxxl },
  card: {
    width: "100%", backgroundColor: colors.surface,
    borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border,
    padding: spacing.xl, gap: spacing.sm,
    shadowColor: "#000", shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4, shadowRadius: 28, elevation: 12,
  },
  eyebrow: { color: colors.brandStrong, fontSize: 11, letterSpacing: 2, fontWeight: "800" },
  bigPrice: { color: colors.ink, fontSize: 72, fontWeight: "900", letterSpacing: -3, lineHeight: 76, marginTop: 4 },
  bigSub: { color: colors.inkSecondary, fontSize: 14 },
  benefitsCard: {
    backgroundColor: colors.bgElev, borderRadius: radii.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border,
    gap: spacing.md, marginTop: spacing.md,
  },
  benefit: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  benefitIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: colors.riskLowBg, borderWidth: 1, borderColor: colors.borderGlow,
    alignItems: "center", justifyContent: "center",
  },
  benefitTitle: { color: colors.ink, fontWeight: "800", fontSize: 14 },
  benefitSub: { color: colors.inkMuted, fontSize: 12, marginTop: 2 },
  proBox: {
    backgroundColor: colors.buyBg, borderRadius: radii.lg, padding: spacing.lg,
    marginTop: spacing.md, borderWidth: 1, borderColor: colors.buy,
  },
  proText: { color: colors.buy, fontWeight: "800" },
  proSub: { color: colors.buy, opacity: 0.85, fontSize: 12, marginTop: 4 },
  statusBox: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    padding: spacing.md, borderRadius: radii.md,
    backgroundColor: colors.surfaceStrong, marginTop: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  statusText: { color: colors.ink },
  error: { color: colors.danger, marginTop: spacing.sm },
  cta: {
    height: 56, borderRadius: radii.lg,
    alignItems: "center", justifyContent: "center",
    flexDirection: "row", gap: spacing.sm, marginTop: spacing.md,
    overflow: "hidden",
    shadowColor: colors.brand, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45, shadowRadius: 16,
  },
  ctaText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  disclaimer: { color: colors.inkMuted, fontSize: 11, textAlign: "center", marginTop: spacing.md },
});
