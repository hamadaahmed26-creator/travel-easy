import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { loadResults } from "../src/store";
import { colors, radii, spacing } from "../src/theme";
import type { OptimizeRequest, OptimizeResponse, TripOption } from "../src/api";
import AsyncStorage from "@react-native-async-storage/async-storage";

const ACTIVE_KEY = "tripopt:active_trip";

export default function ResultsScreen() {
  const router = useRouter();
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
      <SafeAreaView style={styles.safe}>
        <Text style={styles.empty}>Loading results…</Text>
      </SafeAreaView>
    );
  }
  if (!data || data.options.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No trips found</Text>
          <TouchableOpacity
            testID="results-back-btn"
            style={styles.cta}
            onPress={() => router.replace("/")}
          >
            <Text style={styles.ctaText}>Try another search</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity
          testID="results-close-btn"
          onPress={() => router.replace("/")}
          style={styles.iconBtn}
        >
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>{data.searched_combinations} combos searched</Text>
          <Text style={styles.title}>Top trips for you</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {request && cheapest ? (
          <View style={styles.verdict} testID="verdict-banner">
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
        ) : null}

        {data.options.map((trip) => (
          <TripCard key={trip.id} trip={trip} budget={request?.budget ?? 0} onPress={() => openDetail(trip)} />
        ))}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function TripCard({ trip, budget, onPress }: { trip: TripOption; budget: number; onPress: () => void }) {
  const isBuy = trip.recommendation === "book_now";
  const labelColor = colors.ranking[trip.rank_label] ?? colors.ink;
  const savings = budget > 0 ? budget - trip.total_price : 0;
  const underBudget = savings >= 0;
  return (
    <TouchableOpacity
      testID={`trip-card-${trip.rank_label.replace(/\s+/g, "-").toLowerCase()}`}
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.cardHeaderRow}>
        <View style={[styles.rankPill, { borderColor: labelColor }]}>
          <View style={[styles.rankDot, { backgroundColor: labelColor }]} />
          <Text style={[styles.rankText, { color: labelColor }]}>{trip.rank_label.toUpperCase()}</Text>
        </View>
        <Text style={styles.cardWeather}>
          {trip.destination_city.toUpperCase()} · {trip.destination}
        </Text>
      </View>

      <Text style={styles.heroPrice} testID={`trip-card-price-${trip.rank_label.replace(/\s+/g, "-").toLowerCase()}`}>
        £{Math.round(trip.total_price)}
      </Text>
      <Text style={styles.heroSub}>
        Total trip · {trip.nights} nights · {formatRange(trip.check_in, trip.check_out)}
      </Text>

      {budget > 0 && (
        <View
          style={[
            styles.savingsChip,
            { backgroundColor: underBudget ? colors.buyBg : colors.waitBg },
          ]}
          testID={`savings-chip-${trip.rank_label.replace(/\s+/g, "-").toLowerCase()}`}
        >
          <Ionicons
            name={underBudget ? "arrow-down" : "arrow-up"}
            size={12}
            color={underBudget ? colors.buy : colors.wait}
          />
          <Text style={[styles.savingsText, { color: underBudget ? colors.buy : colors.wait }]}>
            {underBudget
              ? `£${Math.round(savings)} UNDER YOUR £${budget} BUDGET`
              : `£${Math.round(-savings)} OVER YOUR £${budget} BUDGET`}
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
        subtitle={`${trip.hotel.rating.toFixed(1)} ★ · ${trip.hotel.distance_km}km centre · ${trip.hotel.standard === "mid" ? "Mid-range" : "Budget"}`}
        right={`£${Math.round(trip.hotel.total)}`}
      />

      <View
        style={[
          styles.recoBadge,
          { backgroundColor: isBuy ? colors.buyBg : colors.waitBg },
        ]}
      >
        <Ionicons
          name={isBuy ? "trending-down-outline" : "time-outline"}
          size={16}
          color={isBuy ? colors.buy : colors.wait}
        />
        <Text
          style={[styles.recoText, { color: isBuy ? colors.buy : colors.wait }]}
        >
          {isBuy ? "BOOK NOW" : "CONSIDER WAITING"} · {trip.confidence}% CONFIDENCE
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function Stat({ label, value, emphasis }: { label: string; value: string; emphasis?: "good" | "bad" }) {
  const valueColor =
    emphasis === "good" ? colors.buy : emphasis === "bad" ? colors.wait : "#FFFFFF";
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

function Row({
  icon,
  title,
  subtitle,
  right,
}: {
  icon: any;
  title: string;
  subtitle: string;
  right: string;
}) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={18} color={colors.ink} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>{subtitle}</Text>
      </View>
      <Text style={styles.rowRight}>{right}</Text>
    </View>
  );
}

function formatRange(checkIn: string, checkOut: string) {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };
  return `${fmt(checkIn)} – ${fmt(checkOut)}`;
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
  eyebrow: {
    fontSize: 11,
    color: colors.inkMuted,
    fontWeight: "700",
    letterSpacing: 1.4,
  },
  title: { fontSize: 22, color: colors.ink, fontWeight: "800", letterSpacing: -0.5 },
  scroll: { padding: spacing.lg, gap: spacing.lg },
  verdict: {
    backgroundColor: colors.brand,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  verdictEyebrow: {
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "800",
    letterSpacing: 1.6,
  },
  verdictHeadline: {
    fontSize: 26,
    color: "#FFFFFF",
    fontWeight: "900",
    letterSpacing: -0.8,
    lineHeight: 30,
    marginTop: 6,
  },
  verdictSub: {
    fontSize: 13,
    color: "#94A3B8",
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  verdictStatsRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  stat: {
    flex: 1,
    backgroundColor: "#0B1424",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  statLabel: {
    fontSize: 9,
    color: "#64748B",
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.5,
    marginTop: 4,
  },
  savingsChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    marginTop: spacing.sm,
  },
  savingsText: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  summary: {
    backgroundColor: colors.bg,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryLabel: {
    fontSize: 11,
    color: colors.inkMuted,
    letterSpacing: 1.6,
    fontWeight: "700",
  },
  summaryValue: {
    fontSize: 36,
    color: colors.ink,
    fontWeight: "900",
    letterSpacing: -1,
    marginTop: 4,
  },
  summarySub: { fontSize: 12, color: colors.inkSecondary, marginTop: 4 },
  card: {
    backgroundColor: colors.bg,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  rankPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  rankDot: { width: 6, height: 6, borderRadius: 3 },
  rankText: { fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  cardWeather: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.inkMuted,
    letterSpacing: 1.2,
  },
  heroPrice: {
    fontSize: 56,
    fontWeight: "900",
    color: colors.ink,
    letterSpacing: -2,
    lineHeight: 60,
  },
  heroSub: { fontSize: 13, color: colors.inkSecondary, marginTop: 4 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowTitle: { fontSize: 14, fontWeight: "700", color: colors.ink },
  rowSub: { fontSize: 12, color: colors.inkSecondary, marginTop: 2 },
  rowRight: { fontSize: 14, fontWeight: "800", color: colors.ink },
  recoBadge: {
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.pill,
  },
  recoText: { fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  cta: {
    height: 52,
    borderRadius: radii.lg,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  ctaText: { color: "#fff", fontWeight: "800" },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: colors.ink, marginBottom: spacing.lg },
});
