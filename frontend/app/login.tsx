import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, setToken } from "../src/api";
import { useAuth } from "../src/auth";
import Globe from "../src/components/Globe";
import { colors, radii, spacing } from "../src/theme";

const AUTH_BASE = "https://auth.emergentagent.com/";
const WIDE = 960;

export default function LoginScreen() {
  // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
  const router = useRouter();
  const { setUser, refresh } = useAuth();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE;
  const processedRef = useRef(false);
  const [exchanging, setExchanging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (processedRef.current) return;
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const hash = window.location.hash || "";
    const m = hash.match(/session_id=([^&]+)/);
    if (!m) return;
    processedRef.current = true;
    const sid = decodeURIComponent(m[1]);
    setExchanging(true);
    (async () => {
      try {
        const { session_token, user } = await api.exchangeSession(sid);
        await setToken(session_token);
        setUser(user);
        if (window.history?.replaceState) {
          window.history.replaceState(null, "", window.location.pathname);
        }
        router.replace("/");
      } catch (e: any) {
        setError(e?.message ?? "Sign-in failed");
        setExchanging(false);
      }
    })();
  }, [router, setUser]);

  useFocusEffect(useCallback(() => { (async () => { await refresh(); })(); }, [refresh]));

  const startLogin = () => {
    if (Platform.OS !== "web" || typeof window === "undefined") {
      setError("Sign-in only works in the web preview right now.");
      return;
    }
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/login";
    window.location.href = `${AUTH_BASE}?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <View style={styles.root} testID="login-screen">
      <LinearGradient colors={[...colors.gradHero] as any} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        {isWide && (
          <View style={styles.globePos} pointerEvents="none">
            <Globe size={520} opacity={0.7} />
          </View>
        )}
        <View style={styles.body}>
          <Animated.View entering={FadeInUp.duration(420)} style={[styles.card, isWide && styles.cardWide]}>
            <View style={styles.eyebrowRow}>
              <View style={styles.dot} />
              <Text style={styles.eyebrow}>TRIPOPT · PRO MODE</Text>
            </View>
            <Text style={styles.title}>Sign in to watch trips and unlock Pro.</Text>
            <Text style={styles.sub}>
              Free plan watches 1 trip · Pro (£2.99 / 30d) watches everything you save.
            </Text>

            {exchanging ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator color={colors.brand} />
                <Text style={styles.loadingText}>Signing you in…</Text>
              </View>
            ) : (
              <Animated.View entering={FadeInDown.duration(380).delay(80)}>
                <Pressable
                  testID="google-login-btn"
                  onPress={startLogin}
                  style={({ hovered }: any) => [styles.googleBtn, hovered && { transform: [{ translateY: -1 }] }]}
                >
                  <LinearGradient colors={[...colors.gradAccent] as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                  <Ionicons name="logo-google" size={18} color="#fff" />
                  <Text style={styles.googleText}>Continue with Google</Text>
                </Pressable>
              </Animated.View>
            )}
            {error ? <Text style={styles.error} testID="login-error">{error}</Text> : null}

            <Pressable
              testID="skip-login-btn"
              onPress={() => router.replace("/")}
              style={({ hovered }: any) => [styles.skipBtn, hovered && { backgroundColor: colors.surfaceHover }]}
            >
              <Text style={styles.skipText}>Browse without signing in</Text>
            </Pressable>
          </Animated.View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  globePos: { position: "absolute", right: -120, top: 80 },
  body: { flex: 1, padding: spacing.xl, justifyContent: "center", alignItems: "center" },
  card: {
    width: "100%", maxWidth: 480,
    backgroundColor: colors.surface,
    borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border,
    padding: spacing.xl, gap: spacing.md,
    shadowColor: "#000", shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4, shadowRadius: 28, elevation: 12,
  },
  cardWide: { marginLeft: 0 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand },
  eyebrow: { fontSize: 11, color: colors.brandStrong, fontWeight: "800", letterSpacing: 2 },
  title: { fontSize: 28, color: colors.ink, fontWeight: "900", letterSpacing: -1, lineHeight: 32, marginTop: 4 },
  sub: { color: colors.inkSecondary, fontSize: 14, lineHeight: 20 },
  googleBtn: {
    height: 56, borderRadius: radii.lg,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: spacing.sm, marginTop: spacing.md, overflow: "hidden",
    shadowColor: colors.brand, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 14,
  },
  googleText: { color: "#FFFFFF", fontWeight: "800", fontSize: 16 },
  loadingBox: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.md },
  loadingText: { color: colors.ink, fontWeight: "700" },
  error: { color: colors.danger, fontSize: 13 },
  skipBtn: {
    alignItems: "center", paddingVertical: spacing.md, marginTop: spacing.sm,
    borderRadius: radii.md,
  },
  skipText: { color: colors.inkMuted, fontSize: 13, fontWeight: "700" },
});
