import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import { LinearGradient } from "expo-linear-gradient";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, type SavedTrip, type TripOption } from "../../src/api";
import { useAuth } from "../../src/auth";
import Sparkline from "../../src/components/Sparkline";
import { colors, radii, spacing } from "../../src/theme";

const ACTIVE_KEY = "tripopt:active_trip";
const ACTIVE_SAVED_KEY = "tripopt:active_saved_id";
const WIDE_BREAKPOINT = 960;

async function registerPushIfPossible() {
  try {
    if (Platform.OS === "web") return;
    if (!Device.isDevice) return;
    const { status: existing } = await Notifications.getPermissionsAsync();
    let final = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      final = status;
    }
    if (final !== "granted") return;
    const token = await Notifications.getExpoPushTokenAsync();
    await api.registerPush(token.data, Platform.OS);
  } catch (e) {
    console.log("push register failed", e);
  }
}

export default function TripDetail() {
  const router = useRouter();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;
  const [trip, setTrip] = useState<TripOption | null>(null);
  const [saved, setSaved] = useState<SavedTrip | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(ACTIVE_KEY);
      if (raw) setTrip(JSON.parse(raw));
      const sid = await AsyncStorage.getItem(ACTIVE_SAVED_KEY);
      if (sid && user) {
        try {
          const all = await api.listTrips();
          const match = all.find((s) => s.id === sid);
          if (match) setSaved(match);
        } catch {}
      }
    })();
  }, [user]);

  if (!trip) {
    return (
      <View style={styles.root}>
        <LinearGradient colors={[...colors.gradHero] as any} style={StyleSheet.absoluteFill} />
        <SafeAreaView style={styles.safe}><Text style={styles.empty}>Loading…</Text></SafeAreaView>
      </View>
    );
  }

  const isBuy = trip.recommendation === "book_now";
  const open = (url: string) => WebBrowser.openBrowserAsync(url).catch(() => {});

  const onSave = async () => {
    if (busy) return;
    if (!user) { router.push("/login"); return; }
    setBusy(true);
    try {
      const result = await api.saveTrip(trip);
      setSaved(result);
      await AsyncStorage.setItem(ACTIVE_SAVED_KEY, result.id);
      Alert.alert("Saved", "Trip added. Toggle Watch to get price alerts.");
    } catch (e: any) {
      Alert.alert("Could not save", e.message ?? "Try again");
    } finally {
      setBusy(false);
    }
  };

  const onToggleWatch = async () => {
    if (!user) { router.push("/login"); return; }
    if (!saved) { await onSave(); return; }
    setBusy(true);
    try {
      const next = !saved.is_watching;
      const res = await api.toggleWatch(saved.id, next);
      setSaved({ ...saved, is_watching: res.is_watching });
      if (res.is_watching) {
        registerPushIfPossible();
        Alert.alert("Watching", "We'll alert you when prices drop or the recommendation changes.");
      }
    } catch (e: any) {
      const msg = e?.message ?? "";
      if (msg.includes("402")) {
        Alert.alert("Pro required", "Free tier watches 1 trip. Upgrade to Pro to watch unlimited trips.", [
          { text: "Not now", style: "cancel" },
          { text: "Upgrade", onPress: () => router.push("/upgrade") },
        ]);
      } else {
        Alert.alert("Could not update watch", msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const onShare = async () => {
    if (!trip) return;
    const message = `${trip.headline} ${trip.nights} nights · ${fmtRange(trip.check_in, trip.check_out)} · ${trip.flight.airline} + ${trip.hotel.name}. Found with TripOpt.`;
    try { await Share.share({ message, title: "My TripOpt deal" }); } catch {}
  };

  const sparkW = Math.min(isWide ? 760 : width - 32, 1024);

  return (
    <View style={styles.root}>
      <LinearGradient colors={[...colors.gradHero] as any} locations={[0, 0.6, 1]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <View style={styles.header}>
          <Pressable
            testID="detail-back-btn"
            onPress={() => router.back()}
            style={({ hovered }: any) => [styles.iconBtn, hovered && styles.iconBtnHover]}
          >
            <Ionicons name="chevron-back" size={20} color={colors.ink} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerEyebrow}>{trip.rank_label.toUpperCase()}</Text>
            <Text style={styles.headerTitle}>
              {trip.departure_city} → {trip.destination_city}
            </Text>
          </View>
          <Pressable
            testID="share-trip-btn" onPress={onShare}
            style={({ hovered }: any) => [styles.iconBtn, hovered && styles.iconBtnHover]}
          >
            <Ionicons name="share-outline" size={18} color={colors.ink} />
          </Pressable>
          <Pressable
            testID="watch-trip-btn" onPress={onToggleWatch} disabled={busy}
            style={({ hovered }: any) => [styles.iconBtn, hovered && styles.iconBtnHover, saved?.is_watching && styles.iconBtnActive]}
          >
            <Ionicons
              name={saved?.is_watching ? "eye" : "eye-outline"}
              size={18}
              color={saved?.is_watching ? "#fff" : colors.ink}
            />
          </Pressable>
          <Pressable
            testID="save-trip-btn" onPress={onSave} disabled={busy}
            style={({ hovered }: any) => [styles.iconBtn, hovered && styles.iconBtnHover, saved && styles.iconBtnActive]}
          >
            <Ionicons
              name={saved ? "bookmark" : "bookmark-outline"}
              size={18}
              color={saved ? "#fff" : colors.ink}
            />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={[styles.scroll, isWide && styles.scrollWide]} showsVerticalScrollIndicator={false}>
          <View style={[styles.maxBox, isWide && { maxWidth: 1280, width: "100%" }]}>
            {/* HERO */}
            <Animated.View entering={FadeInUp.duration(420)} style={styles.heroBox}>
              <LinearGradient
                colors={[colors.bgElev, colors.bgAlt] as any}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.heroGlow} />
              <View style={styles.heroInner}>
                <View style={[styles.heroLayout, isWide && styles.heroLayoutWide]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.heroLabel}>TOTAL TRIP COST</Text>
                    <Text style={styles.heroPrice} testID="detail-total-price">£{Math.round(trip.total_price)}</Text>
                    <Text style={styles.heroSub}>
                      {trip.nights} nights · {fmtRange(trip.check_in, trip.check_out)}
                    </Text>
                    <View style={[styles.recoBadge, { backgroundColor: isBuy ? colors.buyBg : colors.waitBg, borderColor: isBuy ? colors.buy : colors.wait }]} testID="recommendation-badge">
                      <Ionicons name={isBuy ? "trending-down-outline" : "time-outline"} size={14} color={isBuy ? colors.buy : colors.wait} />
                      <Text style={[styles.recoText, { color: isBuy ? colors.buy : colors.wait }]}>
                        {isBuy ? "BOOK NOW" : "WAIT"} · {trip.confidence}% CONFIDENCE
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.heroRight, isWide && { flex: 1.2 }]}>
                    <Text style={styles.headline} testID="trip-headline">{trip.headline}</Text>
                    <Text style={styles.rationale}>{trip.rationale}</Text>
                  </View>
                </View>
              </View>
            </Animated.View>

            {/* PRICE INTELLIGENCE */}
            <SectionTitle>Price intelligence</SectionTitle>
            <Animated.View entering={FadeInDown.duration(420).delay(80)}>
              <Sparkline
                history={trip.price_history}
                forecast={trip.price_forecast}
                current={trip.total_price}
                width={sparkW}
                height={isWide ? 220 : 180}
              />
            </Animated.View>
            <View style={styles.legendRow}>
              <Legend dot={colors.brand} label="30d history" />
              <Legend dot={colors.brandStrong} label="14d forecast" />
              <Legend dot={isBuy ? colors.buy : colors.wait} label="Today" />
            </View>

            {/* 3-col flight / hotel / why */}
            <SectionTitle>The breakdown</SectionTitle>
            <View style={[styles.threeCol, isWide && styles.threeColWide]}>
              <DetailGroup title="Flight" icon="airplane-outline">
                <DetailRow label="Airline" value={`${trip.flight.airline} · ${trip.flight.flight_number}`} />
                <DetailRow label="Outbound" value={trip.flight.depart_time} />
                <DetailRow label="Return" value={trip.flight.return_time} />
                <DetailRow label="Stops" value={trip.flight.stops === 0 ? "Direct" : `${trip.flight.stops} stop`} />
                <DetailRow label="Price" value={`£${Math.round(trip.flight.price)}`} bold />
              </DetailGroup>
              <DetailGroup title="Hotel" icon="bed-outline">
                <DetailRow label="Property" value={trip.hotel.name} />
                <DetailRow label="Rating" value={`${trip.hotel.rating.toFixed(1)} ★`} />
                <DetailRow label="From centre" value={`${trip.hotel.distance_km} km`} />
                <DetailRow label="Per night" value={`£${Math.round(trip.hotel.nightly_rate)}`} />
                <DetailRow label={`Total (${trip.nights}n)`} value={`£${Math.round(trip.hotel.total)}`} bold />
              </DetailGroup>
              <DetailGroup title="Why this trip" icon="sparkles-outline">
                <DetailRow label="Rank" value={trip.rank_label} />
                <DetailRow label="Risk score" value={`${Math.round(trip.risk_score)} / 100`} />
                <DetailRow label="Value index" value={trip.rating_score.toFixed(1)} />
                <DetailRow label="Weather" value={cap(trip.weather)} />
              </DetailGroup>
            </View>

            <View style={{ height: 140 }} />
          </View>
        </ScrollView>

        {/* Sticky booking bar */}
        <View style={[styles.stickyBar, isWide && styles.stickyBarWide]}>
          <View style={[styles.stickyInner, isWide && { maxWidth: 1280 }]}>
            <Pressable
              testID="book-flight-btn"
              onPress={() => open(trip.affiliate_flight_url)}
              style={({ hovered }: any) => [styles.bookBtnAlt, hovered && styles.bookBtnAltHover]}
            >
              <Ionicons name="airplane" size={16} color={colors.ink} />
              <Text style={[styles.bookText, { color: colors.ink }]}>Book flight</Text>
            </Pressable>
            <Pressable
              testID="book-hotel-btn"
              onPress={() => open(trip.affiliate_hotel_url)}
              style={({ hovered }: any) => [styles.bookBtnPrimary, hovered && { transform: [{ translateY: -1 }] }]}
            >
              <LinearGradient
                colors={[...colors.gradAccent] as any}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <Ionicons name="bed" size={16} color="#fff" />
              <Text style={[styles.bookText, { color: "#fff" }]}>Book hotel</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function DetailGroup({ title, icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <View style={styles.detailGroup}>
      <View style={styles.detailGroupHeader}>
        <Ionicons name={icon} size={14} color={colors.brandStrong} />
        <Text style={styles.detailGroupTitle}>{title.toUpperCase()}</Text>
      </View>
      {children}
    </View>
  );
}

function DetailRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, bold && { fontWeight: "900", color: colors.brandStrong }]}>{value}</Text>
    </View>
  );
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: dot }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function fmtRange(checkIn: string, checkOut: string) {
  const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${fmt(checkIn)} – ${fmt(checkOut)}`;
}
function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: spacing.xl, paddingTop: spacing.sm,
    paddingBottom: spacing.md, gap: spacing.sm,
  },
  iconBtn: {
    width: 40, height: 40, alignItems: "center", justifyContent: "center",
    borderRadius: radii.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  iconBtnHover: { backgroundColor: colors.surfaceHover, borderColor: colors.borderStrong },
  iconBtnActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  headerEyebrow: { fontSize: 10, color: colors.brandStrong, fontWeight: "800", letterSpacing: 1.6 },
  headerTitle: { fontSize: 18, color: colors.ink, fontWeight: "800", letterSpacing: -0.4 },
  scroll: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxxl },
  scrollWide: { paddingHorizontal: spacing.xxxl, alignItems: "center" },
  maxBox: { width: "100%", gap: spacing.lg },

  // Hero
  heroBox: {
    borderRadius: radii.xl, overflow: "hidden",
    borderWidth: 1, borderColor: colors.borderGlow,
  },
  heroGlow: {
    position: "absolute", right: -120, top: -120,
    width: 380, height: 380, borderRadius: 380,
    backgroundColor: colors.brand, opacity: 0.18,
  },
  heroInner: { padding: spacing.xl },
  heroLayout: { gap: spacing.lg },
  heroLayoutWide: { flexDirection: "row", alignItems: "center" },
  heroLabel: { fontSize: 11, letterSpacing: 1.8, color: colors.brandStrong, fontWeight: "800" },
  heroPrice: {
    fontSize: 72, fontWeight: "900", color: colors.ink,
    letterSpacing: -3, lineHeight: 76, marginTop: 4,
  },
  heroSub: { fontSize: 13, color: colors.inkSecondary, marginTop: 4 },
  heroRight: { borderLeftWidth: 0 },
  recoBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    alignSelf: "flex-start", paddingHorizontal: spacing.md, paddingVertical: 7,
    borderRadius: radii.pill, marginTop: spacing.lg, borderWidth: 1,
  },
  recoText: { fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  headline: {
    fontSize: 18, fontWeight: "800", color: colors.ink,
    letterSpacing: -0.3, lineHeight: 24,
  },
  rationale: { fontSize: 14, color: colors.inkSecondary, marginTop: spacing.sm, lineHeight: 20 },

  sectionTitle: {
    fontSize: 11, color: colors.brandStrong, fontWeight: "800",
    letterSpacing: 1.8, marginTop: spacing.lg, marginBottom: spacing.sm,
  },

  legendRow: {
    flexDirection: "row", gap: spacing.lg, marginTop: spacing.sm, flexWrap: "wrap",
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: colors.inkMuted, fontWeight: "700" },

  // 3-col grid
  threeCol: { gap: spacing.md, width: "100%" },
  threeColWide: { flexDirection: "row", gap: spacing.lg },
  detailGroup: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg,
    minWidth: 240,
  },
  detailGroupHeader: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginBottom: spacing.sm,
  },
  detailGroupTitle: {
    fontSize: 10, color: colors.brandStrong, fontWeight: "800", letterSpacing: 1.6,
  },
  detailRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  detailLabel: { fontSize: 12, color: colors.inkMuted },
  detailValue: { fontSize: 13, color: colors.ink, fontWeight: "700" },

  // Sticky bar
  stickyBar: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    paddingTop: spacing.md, paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    backgroundColor: "rgba(5,7,15,0.85)",
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  stickyBarWide: { paddingHorizontal: spacing.xxxl },
  stickyInner: {
    flexDirection: "row", gap: spacing.md, width: "100%",
    alignSelf: "center",
  },
  bookBtnAlt: {
    flex: 1, height: 52, borderRadius: radii.lg,
    borderWidth: 1, borderColor: colors.borderStrong,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: spacing.sm, backgroundColor: colors.surface,
  },
  bookBtnAltHover: { backgroundColor: colors.surfaceHover, borderColor: colors.brandStrong },
  bookBtnPrimary: {
    flex: 1, height: 52, borderRadius: radii.lg,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: spacing.sm, overflow: "hidden",
    shadowColor: colors.brand, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45, shadowRadius: 14,
  },
  bookText: { fontWeight: "800", fontSize: 14 },
  empty: { flex: 1, textAlign: "center", padding: spacing.xl, color: colors.inkSecondary },
});
