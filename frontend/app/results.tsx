import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import type { OptimizeRequest, OptimizeResponse, TripOption } from "../src/api";
import HoverCard from "../src/components/HoverCard";
import { loadResults } from "../src/store";
import { colors, radii, spacing } from "../src/theme";

const ACTIVE_KEY = "tripopt:active_trip";
const WIDE_BREAKPOINT = 960;

export default function ResultsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;
  const [data, setData] = useState<OptimizeResponse | null>(null);
  const [request, setRequest] = useState<OptimizeRequest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { response, request: req } = await loadResults();
      setData(response);
      setRequest(req);
      setLoading(false);
    })();
  }, []);

  const cheapest = useMemo(
    () => data?.options.find((o) => o.rank_label === "Cheapest") ?? data?.options[0] ?? null,
    [data]
  );

  const openDetail = async (trip: TripOption) => {
    await AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify(trip));
    router.push(`/trip/${trip.id}`);
  };

  if (loading) {
    return (
      <View style={styles.root}>
        <LinearGradient colors={[...colors.gradHero] as any} style={StyleSheet.absoluteFill} />
        <SafeAreaView style={styles.safe}><Text style={styles.empty}>Loading results…</Text></SafeAreaView>
      </View>
    );
  }
  if (!data || data.options.length === 0) {
    return (
      <View style={styles.root}>
        <LinearGradient colors={[...colors.gradHero] as any} style={StyleSheet.absoluteFill} />
        <SafeAreaView style={styles.safe}>
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No trips found</Text>
            <Pressable testID="results-back-btn" style={styles.cta} onPress={() => router.replace("/")}>
              <Text style={styles.ctaText}>Try another search</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <LinearGradient colors={[...colors.gradHero] as any} style={StyleSheet.absoluteFill} locations={[0, 0.6, 1]} />
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        {/* Sticky top header */}
        <View style={styles.header}>
          <Pressable
            testID="results-close-btn"
            onPress={() => router.replace("/")}
            style={({ hovered }: any) => [styles.iconBtn, hovered && styles.iconBtnHover]}
          >
            <Ionicons name="chevron-back" size={20} color={colors.ink} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>{data.searched_combinations} COMBINATIONS SEARCHED</Text>
            <Text style={styles.title}>Top trips for your budget</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={[styles.scroll, isWide && styles.scrollWide]}
          showsVerticalScrollIndicator={false}
        >
          {/* Verdict banner */}
          {request && cheapest ? (
            <Animated.View entering={FadeInUp.duration(420)} style={[styles.verdict, isWide && styles.verdictWide]} testID="verdict-banner">
              <View style={styles.verdictGlow} />
              <View style={styles.verdictInner}>
                <Text style={styles.verdictEyebrow}>VERDICT · £{request.budget} BUDGET</Text>
                <Text style={styles.verdictHeadline}>
                  {cheapest.savings_vs_budget >= 0
                    ? `${cheapest.destination_city} for £${Math.round(cheapest.total_price)}.`
                    : `Best match: ${cheapest.destination_city} at £${Math.round(cheapest.total_price)}.`}
                </Text>
                <Text style={styles.verdictSub}>
                  {cheapest.savings_vs_budget >= 0
                    ? `That's £${Math.round(cheapest.savings_vs_budget)} under your budget — keep it for spending money.`
                    : `£${Math.round(-cheapest.savings_vs_budget)} over your budget. Try a higher budget or a different week.`}
                </Text>
                <View style={styles.verdictStatsRow}>
                  <Stat label="COMBOS" value={String(data.searched_combinations)} />
                  <Stat label="MEDIAN" value={`£${Math.round(data.median_total)}`} />
                  <Stat
                    label={cheapest.savings_vs_budget >= 0 ? "YOU SAVE" : "OVER BUDGET"}
                    value={`£${Math.round(Math.abs(cheapest.savings_vs_budget))}`}
                    emphasis={cheapest.savings_vs_budget >= 0 ? "good" : "bad"}
                  />
                </View>
              </View>
            </Animated.View>
          ) : null}

          {/* Trip cards grid */}
          <View style={[styles.grid, isWide && styles.gridWide]}>
            {data.options.map((trip, idx) => (
              <Animated.View
                key={trip.id}
                entering={FadeInDown.duration(420).delay(120 + idx * 80)}
                style={[styles.gridCell, isWide && styles.gridCellWide]}
              >
                <TripCard trip={trip} budget={request?.budget ?? 0} onPress={() => openDetail(trip)} />
              </Animated.View>
            ))}
          </View>

          <View style={{ height: spacing.xxxl }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function TripCard({ trip, budget, onPress }: { trip: TripOption; budget: number; onPress: () => void }) {
  const isBuy = trip.recommendation === "book_now";
  const labelColor = colors.ranking[trip.rank_label] ?? colors.brand;
  const savings = budget > 0 ? budget - trip.total_price : 0;
  const underBudget = savings >= 0;
  const id = trip.rank_label.replace(/\s+/g, "-").toLowerCase();

  return (
    <HoverCard
      testID={`trip-card-${id}`}
      onPress={onPress}
      style={styles.card}
    >
      {/* Top accent strip */}
      <LinearGradient
        colors={[labelColor, "transparent"] as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.cardAccent}
      />

      <View style={styles.cardHeaderRow}>
        <View style={[styles.rankPill, { borderColor: labelColor, backgroundColor: `${labelColor}20` }]}>
          <View style={[styles.rankDot, { backgroundColor: labelColor }]} />
          <Text style={[styles.rankText, { color: labelColor }]}>{trip.rank_label.toUpperCase()}</Text>
        </View>
        <Text style={styles.cardCity}>
          {trip.destination_city.toUpperCase()} · {trip.destination}
        </Text>
      </View>

      <Text style={styles.heroPrice} testID={`trip-card-price-${id}`}>
        £{Math.round(trip.total_price)}
      </Text>
      <Text style={styles.heroSub}>
        {trip.nights} nights · {formatRange(trip.check_in, trip.check_out)}
      </Text>

      {budget > 0 && (
        <View
          style={[styles.savingsChip, { backgroundColor: underBudget ? colors.buyBg : colors.waitBg, borderColor: underBudget ? colors.buy : colors.wait }]}
          testID={`savings-chip-${id}`}
        >
          <Ionicons name={underBudget ? "arrow-down" : "arrow-up"} size={11} color={underBudget ? colors.buy : colors.wait} />
          <Text style={[styles.savingsText, { color: underBudget ? colors.buy : colors.wait }]}>
            {underBudget
              ? `£${Math.round(savings)} UNDER £${budget}`
              : `£${Math.round(-savings)} OVER £${budget}`}
          </Text>
        </View>
      )}

      <View style={styles.divider} />

      <Row
        icon="airplane-outline"
        title={`${trip.flight.airline} ${trip.flight.flight_number}`}
        subtitle={`${trip.flight.depart_time}  →  ${trip.flight.return_time}`}
        right={`£${Math.round(trip.flight.price)}`}
      />
      <Row
        icon="bed-outline"
        title={trip.hotel.name}
        subtitle={`${trip.hotel.rating.toFixed(1)} ★ · ${trip.hotel.distance_km}km · ${trip.hotel.standard === "mid" ? "Mid-range" : "Budget"}`}
        right={`£${Math.round(trip.hotel.total)}`}
      />

      <View style={[styles.recoBadge, { backgroundColor: isBuy ? colors.buyBg : colors.waitBg, borderColor: isBuy ? colors.buy : colors.wait }]}>
        <Ionicons name={isBuy ? "trending-down-outline" : "time-outline"} size={14} color={isBuy ? colors.buy : colors.wait} />
        <Text style={[styles.recoText, { color: isBuy ? colors.buy : colors.wait }]}>
          {isBuy ? "BOOK NOW" : "WAIT"} · {trip.confidence}% CONFIDENCE
        </Text>
      </View>
    </HoverCard>
  );
}

function Stat({ label, value, emphasis }: { label: string; value: string; emphasis?: "good" | "bad" }) {
  const valueColor = emphasis === "good" ? colors.buy : emphasis === "bad" ? colors.wait : colors.ink;
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

function Row({
  icon, title, subtitle, right,
}: { icon: any; title: string; subtitle: string; right: string }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={18} color={colors.brandStrong} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>{subtitle}</Text>
      </View>
      <Text style={styles.rowRight}>{right}</Text>
    </View>
  );
}

function formatRange(checkIn: string, checkOut: string) {
  const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${fmt(checkIn)} – ${fmt(checkOut)}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: spacing.xl, paddingTop: spacing.sm,
    paddingBottom: spacing.md, gap: spacing.md,
  },
  iconBtn: {
    width: 40, height: 40, alignItems: "center", justifyContent: "center",
    borderRadius: radii.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  iconBtnHover: { backgroundColor: colors.surfaceHover, borderColor: colors.borderStrong },
  eyebrow: { fontSize: 10, color: colors.brandStrong, fontWeight: "800", letterSpacing: 1.8 },
  title: { fontSize: 22, color: colors.ink, fontWeight: "900", letterSpacing: -0.5 },

  scroll: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  scrollWide: { paddingHorizontal: spacing.xxxl, alignItems: "center" },

  // Verdict
  verdict: {
    borderRadius: radii.xl, overflow: "hidden",
    borderWidth: 1, borderColor: colors.borderGlow,
    width: "100%",
  },
  verdictWide: { maxWidth: 1280 },
  verdictGlow: {
    position: "absolute", left: -120, top: -120,
    width: 280, height: 280, borderRadius: 280,
    backgroundColor: colors.brand, opacity: 0.10,
  },
  verdictInner: { padding: spacing.xl },
  verdictEyebrow: { fontSize: 11, color: colors.brandStrong, fontWeight: "800", letterSpacing: 2 },
  verdictHeadline: {
    fontSize: 32, color: colors.ink, fontWeight: "900",
    letterSpacing: -1, lineHeight: 36, marginTop: 8,
  },
  verdictSub: { fontSize: 14, color: colors.inkSecondary, marginTop: spacing.sm, lineHeight: 20, maxWidth: 600 },
  verdictStatsRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg, flexWrap: "wrap" },
  stat: {
    flex: 1, minWidth: 110,
    backgroundColor: "rgba(0,0,0,0.4)",
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderRadius: radii.md, borderWidth: 1, borderColor: colors.border,
  },
  statLabel: { fontSize: 9, color: colors.inkMuted, fontWeight: "800", letterSpacing: 1.4 },
  statValue: { fontSize: 20, fontWeight: "900", letterSpacing: -0.5, marginTop: 4 },

  // Grid
  grid: { gap: spacing.lg, width: "100%" },
  gridWide: { flexDirection: "row", flexWrap: "wrap", maxWidth: 1280, gap: spacing.lg, alignItems: "stretch" },
  gridCell: {},
  gridCellWide: { width: "31.5%", minWidth: 280 },

  // Card
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl, padding: spacing.xl,
    borderWidth: 1, borderColor: colors.border,
    overflow: "hidden",
  },
  cardAccent: { position: "absolute", top: 0, left: 0, right: 0, height: 3 },
  cardHeaderRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  rankPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: radii.pill,
  },
  rankDot: { width: 6, height: 6, borderRadius: 3 },
  rankText: { fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  cardCity: { fontSize: 10, fontWeight: "800", color: colors.inkMuted, letterSpacing: 1.4 },
  heroPrice: {
    fontSize: 52, fontWeight: "900", color: colors.ink,
    letterSpacing: -2, lineHeight: 56,
  },
  heroSub: { fontSize: 12, color: colors.inkMuted, marginTop: 4 },
  savingsChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: radii.pill, marginTop: spacing.sm, borderWidth: 1,
  },
  savingsText: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  row: {
    flexDirection: "row", alignItems: "flex-start", gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowTitle: { fontSize: 13, fontWeight: "700", color: colors.ink },
  rowSub: { fontSize: 11, color: colors.inkMuted, marginTop: 2 },
  rowRight: { fontSize: 14, fontWeight: "800", color: colors.ink },
  recoBadge: {
    marginTop: spacing.md, flexDirection: "row", alignItems: "center", gap: 6,
    alignSelf: "flex-start", paddingHorizontal: spacing.md, paddingVertical: 7,
    borderRadius: radii.pill, borderWidth: 1,
  },
  recoText: { fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },

  cta: {
    height: 52, borderRadius: radii.lg,
    backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  ctaText: { color: "#fff", fontWeight: "800" },
  empty: {
    flex: 1, alignItems: "center", justifyContent: "center",
    padding: spacing.xl,
  },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: colors.ink, marginBottom: spacing.lg },
});
