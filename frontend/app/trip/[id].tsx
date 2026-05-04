import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, type SavedTrip, type TripOption } from "../../src/api";
import { useAuth } from "../../src/auth";
import { colors, radii, spacing } from "../../src/theme";

const ACTIVE_KEY = "tripopt:active_trip";
const ACTIVE_SAVED_KEY = "tripopt:active_saved_id";

async function registerPushIfPossible() {
  try {
    if (Platform.OS === "web") return; // not supported in web preview
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
    // best-effort; push isn't critical for in-app alerts
    console.log("push register failed", e);
  }
}

export default function TripDetail() {
  const router = useRouter();
  const { user } = useAuth();
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

  const series = useMemo(() => {
    if (!trip) return null;
    const all = [...trip.price_history, ...trip.price_forecast];
    return { all, min: Math.min(...all), max: Math.max(...all), splitAt: trip.price_history.length };
  }, [trip]);

  if (!trip) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.empty}>Loading…</Text>
      </SafeAreaView>
    );
  }

  const isBuy = trip.recommendation === "book_now";
  const open = (url: string) => WebBrowser.openBrowserAsync(url).catch(() => {});

  const onSave = async () => {
    if (busy) return;
    if (!user) {
      router.push("/login");
      return;
    }
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
    if (!saved) {
      // Save first, then enable watch
      await onSave();
      return;
    }
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
        Alert.alert(
          "Pro required",
          "Free tier watches 1 trip. Upgrade to Pro to watch unlimited trips.",
          [
            { text: "Not now", style: "cancel" },
            { text: "Upgrade", onPress: () => router.push("/upgrade") },
          ]
        );
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

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity
          testID="detail-back-btn"
          onPress={() => router.back()}
          style={styles.iconBtn}
        >
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerEyebrow}>{trip.rank_label.toUpperCase()}</Text>
          <Text style={styles.headerTitle}>
            {trip.departure_city} → {trip.destination_city}
          </Text>
        </View>
        <TouchableOpacity
          testID="share-trip-btn"
          onPress={onShare}
          style={styles.iconBtn}
        >
          <Ionicons name="share-outline" size={20} color={colors.ink} />
        </TouchableOpacity>
        <TouchableOpacity
          testID="watch-trip-btn"
          onPress={onToggleWatch}
          style={[styles.iconBtn, saved?.is_watching && styles.iconBtnActive]}
          disabled={busy}
        >
          <Ionicons
            name={saved?.is_watching ? "eye" : "eye-outline"}
            size={20}
            color={saved?.is_watching ? "#fff" : colors.ink}
          />
        </TouchableOpacity>
        <TouchableOpacity
          testID="save-trip-btn"
          onPress={onSave}
          style={[styles.iconBtn, saved && styles.iconBtnActive]}
          disabled={busy}
        >
          <Ionicons
            name={saved ? "bookmark" : "bookmark-outline"}
            size={20}
            color={saved ? "#fff" : colors.ink}
          />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.heroBox}>
          <Text style={styles.heroLabel}>TOTAL TRIP COST</Text>
          <Text style={styles.heroPrice} testID="detail-total-price">
            £{Math.round(trip.total_price)}
          </Text>
          <Text style={styles.heroSub}>
            {trip.nights} nights · {fmtRange(trip.check_in, trip.check_out)}
          </Text>

          <View
            style={[
              styles.recoBadge,
              { backgroundColor: isBuy ? colors.buyBg : colors.waitBg },
            ]}
            testID="recommendation-badge"
          >
            <Ionicons
              name={isBuy ? "trending-down-outline" : "time-outline"}
              size={16}
              color={isBuy ? colors.buy : colors.wait}
            />
            <Text style={[styles.recoText, { color: isBuy ? colors.buy : colors.wait }]}>
              {isBuy ? "BOOK NOW" : "WAIT"} · {trip.confidence}% CONFIDENCE
            </Text>
          </View>
          <Text style={styles.headline} testID="trip-headline">{trip.headline}</Text>
          <Text style={styles.rationale}>{trip.rationale}</Text>
        </View>

        <SectionTitle>Price intelligence</SectionTitle>
        {series && <Sparkline series={series} current={trip.total_price} />}
        <View style={styles.legendRow}>
          <Legend dot={colors.inkSecondary} label="30d history" />
          <Legend dot={colors.riskLow} label="14d forecast" />
          <Legend dot={isBuy ? colors.buy : colors.wait} label="Today" />
        </View>

        <SectionTitle>Flight</SectionTitle>
        <View style={styles.detailCard}>
          <DetailRow label="Airline" value={`${trip.flight.airline} · ${trip.flight.flight_number}`} />
          <DetailRow label="Outbound" value={trip.flight.depart_time} />
          <DetailRow label="Return" value={trip.flight.return_time} />
          <DetailRow label="Stops" value={trip.flight.stops === 0 ? "Direct" : `${trip.flight.stops} stop`} />
          <DetailRow label="Price" value={`£${Math.round(trip.flight.price)}`} bold />
        </View>

        <SectionTitle>Hotel</SectionTitle>
        <View style={styles.detailCard}>
          <DetailRow label="Property" value={trip.hotel.name} />
          <DetailRow label="Rating" value={`${trip.hotel.rating.toFixed(1)} ★`} />
          <DetailRow label="From centre" value={`${trip.hotel.distance_km} km`} />
          <DetailRow label="Per night" value={`£${Math.round(trip.hotel.nightly_rate)}`} />
          <DetailRow
            label={`Total (${trip.nights}n)`}
            value={`£${Math.round(trip.hotel.total)}`}
            bold
          />
        </View>

        <SectionTitle>Why this trip?</SectionTitle>
        <View style={styles.detailCard}>
          <DetailRow label="Rank" value={trip.rank_label} />
          <DetailRow label="Risk score" value={`${Math.round(trip.risk_score)} / 100`} />
          <DetailRow
            label="Value index"
            value={`${trip.rating_score.toFixed(1)}`}
          />
          <DetailRow label="Weather" value={cap(trip.weather)} />
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      <View style={styles.stickyBar}>
        <TouchableOpacity
          testID="book-flight-btn"
          style={[styles.bookBtn, { backgroundColor: colors.bg, borderColor: colors.ink }]}
          onPress={() => open(trip.affiliate_flight_url)}
        >
          <Ionicons name="airplane" size={16} color={colors.ink} />
          <Text style={[styles.bookText, { color: colors.ink }]}>Book flight</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="book-hotel-btn"
          style={[styles.bookBtn, { backgroundColor: colors.ink }]}
          onPress={() => open(trip.affiliate_hotel_url)}
        >
          <Ionicons name="bed" size={16} color="#fff" />
          <Text style={[styles.bookText, { color: "#fff" }]}>Book hotel</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function DetailRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, bold && { fontWeight: "900" }]}>{value}</Text>
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

function Sparkline({
  series,
  current,
}: {
  series: { all: number[]; min: number; max: number; splitAt: number };
  current: number;
}) {
  const W = 320;
  const H = 120;
  const range = Math.max(1, series.max - series.min);
  const step = W / (series.all.length - 1);
  const yFor = (v: number) => H - ((v - series.min) / range) * (H - 8) - 4;
  const bars = series.all.map((v, i) => {
    const isForecast = i >= series.splitAt;
    const isToday = i === series.splitAt - 1;
    const y = yFor(v);
    return (
      <View
        key={i}
        style={{
          position: "absolute",
          left: i * step,
          top: y - 1.5,
          width: 3,
          height: 3,
          borderRadius: 2,
          backgroundColor: isToday
            ? colors.ink
            : isForecast
            ? colors.riskLow
            : colors.inkMuted,
        }}
      />
    );
  });
  // simple line by drawing many tiny segments using View rotation is overkill;
  // use stacked thin bars instead for a clean Swiss tick chart
  return (
    <View style={[styles.sparkBox, { width: W, height: H }]} testID="price-sparkline">
      {bars}
      <View style={styles.sparkBaseline} />
      <Text style={styles.sparkMin}>£{Math.round(series.min)}</Text>
      <Text style={styles.sparkMax}>£{Math.round(series.max)}</Text>
      <Text style={styles.sparkCurrent}>now £{Math.round(current)}</Text>
    </View>
  );
}

function fmtRange(checkIn: string, checkOut: string) {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${fmt(checkIn)} – ${fmt(checkOut)}`;
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgAlt },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.md,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconBtnActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  headerEyebrow: {
    fontSize: 10,
    color: colors.inkMuted,
    fontWeight: "800",
    letterSpacing: 1.6,
  },
  headerTitle: {
    fontSize: 18,
    color: colors.ink,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  scroll: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxxl },
  heroBox: {
    backgroundColor: colors.bg,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  heroLabel: {
    fontSize: 11,
    letterSpacing: 1.6,
    color: colors.inkMuted,
    fontWeight: "800",
  },
  heroPrice: {
    fontSize: 64,
    fontWeight: "900",
    color: colors.ink,
    letterSpacing: -2.5,
    lineHeight: 68,
    marginTop: 4,
  },
  heroSub: { fontSize: 13, color: colors.inkSecondary, marginTop: 4 },
  recoBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.pill,
    marginTop: spacing.md,
  },
  recoText: { fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  rationale: {
    fontSize: 13,
    color: colors.inkSecondary,
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  headline: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.ink,
    marginTop: spacing.md,
    letterSpacing: -0.3,
    lineHeight: 22,
  },
  sectionTitle: {
    fontSize: 11,
    color: colors.inkMuted,
    fontWeight: "800",
    letterSpacing: 1.6,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  detailCard: {
    backgroundColor: colors.bg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailLabel: { fontSize: 13, color: colors.inkSecondary },
  detailValue: { fontSize: 14, color: colors.ink, fontWeight: "700" },
  sparkBox: {
    backgroundColor: colors.bg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: "center",
    overflow: "hidden",
  },
  sparkBaseline: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 4,
    height: 1,
    backgroundColor: colors.border,
  },
  sparkMin: {
    position: "absolute",
    left: 8,
    bottom: 6,
    fontSize: 10,
    color: colors.inkMuted,
    fontWeight: "700",
  },
  sparkMax: {
    position: "absolute",
    right: 8,
    top: 6,
    fontSize: 10,
    color: colors.inkMuted,
    fontWeight: "700",
  },
  sparkCurrent: {
    position: "absolute",
    left: 8,
    top: 6,
    fontSize: 10,
    color: colors.ink,
    fontWeight: "800",
  },
  legendRow: {
    flexDirection: "row",
    gap: spacing.lg,
    marginTop: spacing.sm,
    flexWrap: "wrap",
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: colors.inkSecondary, fontWeight: "600" },
  stickyBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  bookBtn: {
    flex: 1,
    height: 52,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  bookText: { fontWeight: "800", fontSize: 14 },
  empty: {
    flex: 1,
    textAlign: "center",
    padding: spacing.xl,
    color: colors.inkSecondary,
  },
});
