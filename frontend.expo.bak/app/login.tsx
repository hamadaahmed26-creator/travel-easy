import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, setToken } from "../src/api";
import { useAuth } from "../src/auth";
import { colors, radii, spacing } from "../src/theme";

const AUTH_BASE = "https://auth.emergentagent.com/";

export default function LoginScreen() {
  // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
  const router = useRouter();
  const { setUser, refresh } = useAuth();
  const processedRef = useRef(false);
  const [exchanging, setExchanging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Process #session_id=... fragment if present (post-OAuth callback)
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
        // Strip the fragment
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

  // If already logged in via existing token, bounce to home
  useFocusEffect(
    useCallback(() => {
      (async () => {
        await refresh();
      })();
    }, [refresh])
  );

  const startLogin = () => {
    if (Platform.OS !== "web" || typeof window === "undefined") {
      setError("Sign-in only works in the web preview right now. Use the deployed build for native.");
      return;
    }
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/login";
    window.location.href = `${AUTH_BASE}?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <SafeAreaView style={styles.safe} testID="login-screen">
      <View style={styles.body}>
        <Text style={styles.eyebrow}>TRIPOPT · PRO MODE</Text>
        <Text style={styles.title}>Sign in to watch trips, get price alerts and unlock Pro.</Text>
        <Text style={styles.sub}>
          Free plan watches 1 trip · Pro (£2.99 / 30d) watches everything you save.
        </Text>

        {exchanging ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.ink} />
            <Text style={styles.loadingText}>Signing you in…</Text>
          </View>
        ) : (
          <TouchableOpacity testID="google-login-btn" style={styles.googleBtn} onPress={startLogin}>
            <Ionicons name="logo-google" size={18} color="#fff" />
            <Text style={styles.googleText}>Continue with Google</Text>
          </TouchableOpacity>
        )}
        {error ? <Text style={styles.error} testID="login-error">{error}</Text> : null}

        <TouchableOpacity
          testID="skip-login-btn"
          style={styles.skipBtn}
          onPress={() => router.replace("/")}
        >
          <Text style={styles.skipText}>Browse without signing in</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.brand },
  body: {
    flex: 1, padding: spacing.xl, justifyContent: "center", gap: spacing.lg,
  },
  eyebrow: {
    fontSize: 11, color: "#94A3B8", fontWeight: "800", letterSpacing: 2,
  },
  title: {
    fontSize: 32, color: "#FFFFFF", fontWeight: "900", letterSpacing: -1, lineHeight: 36,
  },
  sub: { color: "#94A3B8", fontSize: 14, lineHeight: 20 },
  googleBtn: {
    height: 56, backgroundColor: "#0B1424", borderRadius: radii.lg,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: spacing.sm, borderWidth: 1, borderColor: "#1E293B", marginTop: spacing.md,
  },
  googleText: { color: "#FFFFFF", fontWeight: "800", fontSize: 16 },
  loadingBox: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.md },
  loadingText: { color: "#FFFFFF", fontWeight: "700" },
  error: { color: "#FCA5A5", fontSize: 13 },
  skipBtn: { alignItems: "center", paddingVertical: spacing.md, marginTop: spacing.lg },
  skipText: { color: "#94A3B8", fontSize: 13, fontWeight: "700" },
});
