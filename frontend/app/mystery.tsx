import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, type OptimizeRequest, type TripOption } from "../src/api";
import { colors, radii, spacing } from "../src/theme";

const ACTIVE_KEY = "tripopt:active_trip";
const MYSTERY_REQ_KEY = "tripopt:mystery_req";
const WIDE = 960;

type MysteryClue = {
  region: string;
  weather: string;
  vibe: string;
};

const REGION_LABELS: Record<string, string> = {
  EU: "Europe",
  NA: "North America",
  SA: "South America",
  AS: "Asia",
  AF: "Africa",
  ME: "Middle East",
  OC: "Oceania",
  OT: "Worldwide",
};

const VIBE_BY_WEATHER: Record<string, string> = {
  sun: "Beach vibes & sun-kissed afternoons",
  city: "Cobblestones, cafés & nightlife",
  any: "Local food and a packed weekend",
};

// Family-friendly emoji per region (no flags - ambiguous between countries)
const REGION_EMOJI: Record<string, string> = {
  EU: "🏰",
  NA: "🗽",
  SA: "🌴",
  AS: "🏯",
  AF: "🦁",
  ME: "🕌",
  OC: "🏝",
  OT: "🌍",
};

function buildClue(trip: TripOption): MysteryClue {
  const region = (trip as any).region as string | undefined;
  const weather = trip.weather || "any";
  return {
    region: REGION_LABELS[region || "OT"] || "Somewhere amazing",
    weather:
      weather === "sun"
        ? "Sunshine guaranteed"
        : weather === "city"
        ? "Buzzing city break"
        : "Mixed of city + chill",
    vibe: VIBE_BY_WEATHER[weather] ?? "Local food and a packed weekend",
  };
}

export default function MysteryScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE;
  const [trip, setTrip] = useState<TripOption | null>(null);
  const [request, setRequest] = useState<OptimizeRequest | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blur = useSharedValue(14);
  const scale = useSharedValue(1);

  const blurStyle = useAnimatedStyle(() => ({
    // RN-Web understands filter via inline style passthrough; on native the blur is approximated
    // by reduced opacity on the city text.
    opacity: blur.value > 0 ? 0.35 : 1,
    transform: [{ scale: scale.value }],
  }));

  const reroll = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRevealed(false);
    blur.value = withTiming(14, { duration: 0 });
    try {
      const raw = await AsyncStorage.getItem(MYSTERY_REQ_KEY);
      const baseReq: OptimizeRequest = raw
        ? JSON.parse(raw)
        : {
            departure: "LHR",
            destination: null,
            budget: 500,
            trip_length: 4,
            flexibility_days: 7,
            weather: "any",
            hotel_standard: "any",
            start_window_days: 30,
          };
      // Force destination null + add randomness via budget jitter so each roll varies
      const jitter = Math.floor((Math.random() - 0.5) * 60);
      const req: OptimizeRequest = {
        ...baseReq,
        destination: null,
        budget: Math.max(150, (baseReq.budget ?? 500) + jitter),
      };
      setRequest(req);
      const res = await api.optimize(req);
      if (!res.options.length) throw new Error("No trip available");
      // Pick a random one from top 3 for variety + surprise factor
      const pool = res.options.slice(0, Math.min(3, res.options.length));
      const pick = pool[Math.floor(Math.random() * pool.length)];
      setTrip(pick);
    } catch (e: any) {
      setError(e?.message ?? "Could not pick a mystery trip");
    } finally {
      setLoading(false);
    }
  }, [blur]);

  useFocusEffect(
    useCallback(() => {
      reroll();
    }, [reroll])
  );

  const reveal = () => {
    setRevealed(true);
    blur.value = withTiming(0, { duration: 600, easing: Easing.out(Easing.cubic) });
    scale.value = withSpring(1.02, { damping: 8, stiffness: 100 });
    setTimeout(() => {
      scale.value = withSpring(1, { damping: 12, stiffness: 140 });
    }, 200);
  };

  const onShare = async () => {
    if (!trip) return;
    const message = revealed
      ? `🎁 TripOpt sent me to ${trip.destination_city} for £${Math.round(trip.total_price)}. Where will it send you? tripopt.app`
      : `🎁 TripOpt is sending me on a £${Math.round(trip.total_price)} mystery trip. ${REGION_LABELS[(trip as any).region || "OT"]}, ${trip.weather === "sun" ? "sunny" : "city"} vibes. Guess where? tripopt.app`;
    try { await Share.share({ message, title: "My TripOpt mystery trip" }); } catch {}
  };

  const onBookOnReveal = async () => {
    if (!trip) return;
    await AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify(trip));
    router.push(`/trip/${trip.id}`);
  };

  const clue = trip ? buildClue(trip) : null;
  const regionEmoji = trip ? REGION_EMOJI[(trip as any).region || "OT"] || "🌍" : "🎁";

  return (
    <View style={styles.root}>
      <LinearGradient colors={[...colors.gradHero] as any} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <View style={styles.header}>
          <Pressable
            testID="mystery-back-btn"
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
            style={({ hovered }: any) => [styles.iconBtn, hovered && styles.iconBtnHover]}
          >
            <Ionicons name="chevron-back" size={20} color={colors.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>Mystery trip</Text>
          <Pressable
            testID="mystery-share-btn"
            onPress={onShare}
            disabled={!trip}
            style={({ hovered }: any) => [styles.iconBtn, hovered && styles.iconBtnHover, !trip && { opacity: 0.4 }]}
          >
            <Ionicons name="share-outline" size={18} color={colors.ink} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={[styles.scroll, isWide && styles.scrollWide]} showsVerticalScrollIndicator={false}>
          <View style={[styles.maxBox, isWide && { maxWidth: 720 }]}>
            <Animated.View entering={FadeInUp.duration(420)} style={styles.intro}>
              <View style={styles.eyebrowRow}>
                <View style={styles.dot} />
                <Text style={styles.eyebrow}>WHERE WILL TRIPOPT SEND YOU?</Text>
              </View>
              <Text style={styles.h1}>
                A surprise trip you can't <Text style={styles.h1Accent}>refuse.</Text>
              </Text>
              <Text style={styles.heroSub}>
                We've optimised the whole thing. You see the price + a clue. Tap to reveal where you're going.
              </Text>
            </Animated.View>

            {loading ? (
              <View style={styles.loaderBox} testID="mystery-loader">
                <ActivityIndicator color={colors.brand} />
                <Text style={styles.loaderText}>Picking your surprise…</Text>
              </View>
            ) : error || !trip || !clue ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error ?? "No mystery trip available"}</Text>
                <Pressable testID="mystery-retry-btn" onPress={reroll} style={styles.retryBtn}>
                  <Text style={styles.retryText}>Try again</Text>
                </Pressable>
              </View>
            ) : (
              <Animated.View entering={FadeIn.duration(420)} style={styles.card}>
                <LinearGradient colors={["#7C5BFF", "#5B8FFF"] as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardAccent} />
                <View style={styles.gift}>
                  <Text style={styles.giftEmoji}>{revealed ? regionEmoji : "🎁"}</Text>
                </View>

                <Text style={styles.cardEyebrow}>YOUR MYSTERY TRIP</Text>

                {/* Big city name (blurred until reveal) */}
                <Animated.View style={blurStyle}>
                  <Text style={[styles.cityName, !revealed && styles.cityNameBlurred]} testID="mystery-city">
                    {revealed ? trip.destination_city : "????????????"}
                  </Text>
                </Animated.View>

                {/* Big price always visible */}
                <Text style={styles.bigPrice} testID="mystery-price">£{Math.round(trip.total_price)}</Text>
                <Text style={styles.priceSub}>
                  {trip.nights} nights · {fmtRange(trip.check_in, trip.check_out)}
                </Text>

                {/* Clues row */}
                <View style={styles.cluesRow}>
                  <Clue icon="globe-outline" label="Region" value={clue.region} />
                  <Clue icon="sunny-outline" label="Vibe" value={clue.weather} />
                  <Clue icon="restaurant-outline" label="What to expect" value={clue.vibe} />
                </View>

                {!revealed ? (
                  <Animated.View entering={FadeInDown.duration(380).delay(120)}>
                    <Pressable
                      testID="reveal-btn"
                      onPress={reveal}
                      style={({ hovered }: any) => [styles.revealBtn, hovered && { transform: [{ translateY: -1 }] }]}
                    >
                      <LinearGradient colors={["#A78BFA", "#5B8FFF"] as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                      <Ionicons name="eye" size={18} color="#fff" />
                      <Text style={styles.revealText}>Reveal destination</Text>
                    </Pressable>
                  </Animated.View>
                ) : (
                  <Animated.View entering={FadeInDown.duration(380)} style={{ gap: spacing.md }}>
                    <Pressable
                      testID="see-trip-btn"
                      onPress={onBookOnReveal}
                      style={({ hovered }: any) => [styles.revealBtn, hovered && { transform: [{ translateY: -1 }] }]}
                    >
                      <LinearGradient colors={[...colors.gradAccent] as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                      <Ionicons name="airplane" size={18} color="#fff" />
                      <Text style={styles.revealText}>See full trip details</Text>
                    </Pressable>
                  </Animated.View>
                )}

                <View style={styles.actionsRow}>
                  <Pressable
                    testID="reroll-btn"
                    onPress={reroll}
                    style={({ hovered }: any) => [styles.secondaryBtn, hovered && styles.secondaryBtnHover]}
                  >
                    <Ionicons name="refresh" size={16} color={colors.ink} />
                    <Text style={styles.secondaryText}>Show me another</Text>
                  </Pressable>
                  <Pressable
                    testID="share-mystery-btn"
                    onPress={onShare}
                    style={({ hovered }: any) => [styles.secondaryBtn, hovered && styles.secondaryBtnHover]}
                  >
                    <Ionicons name="share-social" size={16} color={colors.ink} />
                    <Text style={styles.secondaryText}>Share</Text>
                  </Pressable>
                </View>
              </Animated.View>
            )}
          </View>
          <View style={{ height: spacing.xxxl }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Clue({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.clue}>
      <View style={styles.clueIcon}>
        <Ionicons name={icon} size={14} color={colors.brandStrong} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.clueLabel}>{label}</Text>
        <Text style={styles.clueValue} numberOfLines={2}>{value}</Text>
      </View>
    </View>
  );
}

function fmtRange(checkIn: string, checkOut: string) {
  const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${fmt(checkIn)} – ${fmt(checkOut)}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.sm,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: radii.md,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  iconBtnHover: { backgroundColor: colors.surfaceHover, borderColor: colors.borderStrong },
  headerTitle: { color: colors.ink, fontSize: 16, fontWeight: "900", letterSpacing: -0.3 },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  scrollWide: { paddingHorizontal: spacing.xxxl, alignItems: "center" },
  maxBox: { width: "100%", gap: spacing.lg },

  intro: { gap: 8, paddingTop: spacing.lg },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#A78BFA" },
  eyebrow: { color: "#C4B5FD", fontSize: 11, letterSpacing: 2.4, fontWeight: "800" },
  h1: { color: colors.ink, fontSize: 36, lineHeight: 42, fontWeight: "900", letterSpacing: -1.2 },
  h1Accent: { color: "#A78BFA" },
  heroSub: { color: colors.inkSecondary, fontSize: 15, lineHeight: 22, maxWidth: 540 },

  loaderBox: {
    backgroundColor: colors.surface, borderRadius: radii.xl,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.xxxl, gap: spacing.md, alignItems: "center",
  },
  loaderText: { color: colors.ink, fontWeight: "700" },

  card: {
    position: "relative",
    backgroundColor: colors.surface,
    borderRadius: radii.xl, borderWidth: 1, borderColor: colors.borderGlow,
    padding: spacing.xl, gap: spacing.md, overflow: "hidden",
    shadowColor: "#7C5BFF", shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5, shadowRadius: 28,
  },
  cardAccent: { position: "absolute", top: 0, left: 0, right: 0, height: 4 },
  gift: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: "rgba(124,91,255,0.15)",
    borderWidth: 1, borderColor: "rgba(124,91,255,0.5)",
    alignItems: "center", justifyContent: "center",
    alignSelf: "center", marginTop: 8,
  },
  giftEmoji: { fontSize: 40 },
  cardEyebrow: {
    color: "#C4B5FD", fontSize: 11, fontWeight: "800",
    letterSpacing: 2, textAlign: "center", marginTop: 8,
  },
  cityName: {
    color: colors.ink, fontSize: 36, fontWeight: "900",
    letterSpacing: -1, textAlign: "center", marginTop: 4,
  },
  cityNameBlurred: { color: "rgba(255,255,255,0.5)", letterSpacing: 4 },
  bigPrice: {
    color: colors.ink, fontSize: 64, fontWeight: "900",
    letterSpacing: -3, textAlign: "center", marginTop: 4,
  },
  priceSub: { color: colors.inkSecondary, fontSize: 13, textAlign: "center" },

  cluesRow: { gap: spacing.sm, marginTop: spacing.md },
  clue: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.bgElev, borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  clueIcon: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: colors.riskLowBg,
    borderWidth: 1, borderColor: colors.borderGlow,
    alignItems: "center", justifyContent: "center",
  },
  clueLabel: { color: colors.inkMuted, fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  clueValue: { color: colors.ink, fontSize: 13, fontWeight: "700", marginTop: 1 },

  revealBtn: {
    height: 56, borderRadius: radii.lg,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: spacing.sm, overflow: "hidden", marginTop: spacing.md,
    shadowColor: "#A78BFA", shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 18,
  },
  revealText: { color: "#fff", fontWeight: "900", fontSize: 16, letterSpacing: 0.2 },

  actionsRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  secondaryBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, height: 44, borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  secondaryBtnHover: { backgroundColor: colors.surfaceHover, borderColor: colors.borderStrong },
  secondaryText: { color: colors.ink, fontWeight: "700", fontSize: 13 },

  errorBox: { padding: spacing.xl, alignItems: "center", gap: spacing.md },
  errorText: { color: colors.danger, textAlign: "center" },
  retryBtn: {
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    backgroundColor: colors.brand, borderRadius: radii.md,
  },
  retryText: { color: "#fff", fontWeight: "800" },
});
