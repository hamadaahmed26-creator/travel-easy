import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../src/api";
import { useAuth } from "../src/auth";
import { colors, radii, spacing } from "../src/theme";

export default function UpgradeScreen() {
  const router = useRouter();
  const { user, loading, refresh } = useAuth();
  const params = useLocalSearchParams<{ session_id?: string }>();
  const [creating, setCreating] = useState(false);
  const [polling, setPolling] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const polledRef = useRef(false);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  // If returned from Stripe with ?session_id=...
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
    if (!user) {
      router.push("/login");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const res = await api.checkout(origin);
      if (typeof window !== "undefined") {
        window.location.href = res.url;
      }
    } catch (e: any) {
      setError(e?.message ?? "Checkout failed");
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={colors.ink} style={{ marginTop: spacing.xxxl }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]} testID="upgrade-screen">
      <View style={styles.header}>
        <TouchableOpacity testID="upgrade-back-btn" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>TripOpt Pro</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.body}>
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
            <Text style={styles.proSub}>
              Buying again extends your Pro window by another 30 days.
            </Text>
          </View>
        )}

        {statusMsg ? (
          <View style={styles.statusBox} testID="payment-status">
            {polling ? <ActivityIndicator color="#FFF" /> : null}
            <Text style={styles.statusText}>{statusMsg}</Text>
          </View>
        ) : null}
        {error ? <Text style={styles.error} testID="upgrade-error">{error}</Text> : null}

        <TouchableOpacity
          testID="start-checkout-btn"
          style={[styles.cta, creating && { opacity: 0.7 }]}
          onPress={startCheckout}
          disabled={creating || polling}
        >
          {creating ? (
            <ActivityIndicator color={colors.ink} />
          ) : (
            <>
              <Ionicons name="card" size={18} color={colors.ink} />
              <Text style={styles.ctaText}>{user?.is_pro ? "Extend Pro · £2.99" : "Upgrade to Pro · £2.99"}</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          Test card 4242 4242 4242 4242 · any future expiry · any CVC.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function Benefit({ icon, title, sub }: { icon: any; title: string; sub: string }) {
  return (
    <View style={styles.benefit}>
      <Ionicons name={icon} size={20} color="#FFF" />
      <View style={{ flex: 1 }}>
        <Text style={styles.benefitTitle}>{title}</Text>
        <Text style={styles.benefitSub}>{sub}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.brand },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: "#1E293B",
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: radii.md, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "#1E293B",
  },
  headerTitle: { color: "#FFF", fontWeight: "800", fontSize: 16 },
  body: { flex: 1, padding: spacing.xl, gap: spacing.md },
  eyebrow: { color: "#94A3B8", fontSize: 11, letterSpacing: 2, fontWeight: "800" },
  bigPrice: {
    color: "#FFF", fontSize: 80, fontWeight: "900", letterSpacing: -3.5, lineHeight: 84,
  },
  bigSub: { color: "#94A3B8", fontSize: 14 },
  benefitsCard: {
    backgroundColor: "#0B1424", borderRadius: radii.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: "#1E293B", gap: spacing.md, marginTop: spacing.md,
  },
  benefit: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  benefitTitle: { color: "#FFF", fontWeight: "800", fontSize: 14 },
  benefitSub: { color: "#94A3B8", fontSize: 12, marginTop: 2 },
  proBox: {
    backgroundColor: "#064E3B", borderRadius: radii.lg, padding: spacing.lg,
    marginTop: spacing.md,
  },
  proText: { color: "#A7F3D0", fontWeight: "800" },
  proSub: { color: "#A7F3D0", opacity: 0.8, fontSize: 12, marginTop: 4 },
  statusBox: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    padding: spacing.md, borderRadius: radii.md, backgroundColor: "#1E293B", marginTop: spacing.md,
  },
  statusText: { color: "#FFF" },
  error: { color: "#FCA5A5", marginTop: spacing.sm },
  cta: {
    height: 56, backgroundColor: "#FFFFFF", borderRadius: radii.lg,
    alignItems: "center", justifyContent: "center",
    flexDirection: "row", gap: spacing.sm, marginTop: spacing.md,
  },
  ctaText: { color: colors.ink, fontWeight: "900", fontSize: 16 },
  disclaimer: { color: "#64748B", fontSize: 11, textAlign: "center", marginTop: spacing.md },
});
