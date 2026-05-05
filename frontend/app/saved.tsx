import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, type SavedTrip } from "../src/api";
import { useAuth } from "../src/auth";
import HoverCard from "../src/components/HoverCard";
import { colors, radii, spacing } from "../src/theme";

const ACTIVE_KEY = "tripopt:active_trip";
const ACTIVE_SAVED_KEY = "tripopt:active_saved_id";
const WIDE = 960;

export default function SavedScreen() {
  const router = useRouter();
  const { user, logout, refresh } = useAuth();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE;
  const [trips, setTrips] = useState<SavedTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    try {
      const data = await api.listTrips();
      setTrips(data);
    } catch (e: any) {
      if (e?.status === 401) { await logout(); router.replace("/login"); return; }
      Alert.alert("Could not load saved trips", e.message ?? "");
    } finally {
      setLoading(false);
    }
  }, [user, logout, router]);

  useFocusEffect(useCallback(() => { refresh(); reload(); }, [reload, refresh]));

  const onRefresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  const onDelete = async (id: string) => {
    try {
      await api.deleteTrip(id);
      setTrips((cur) => cur.filter((t) => t.id !== id));
    } catch (e: any) { Alert.alert("Could not delete", e.message ?? ""); }
  };

  const onToggleWatch = async (t: SavedTrip) => {
    try {
      const res = await api.toggleWatch(t.id, !t.is_watching);
      setTrips((cur) => cur.map((x) => (x.id === t.id ? { ...x, is_watching: res.is_watching } : x)));
    } catch (e: any) {
      const msg = e?.message ?? "";
      if (msg.includes("402")) {
        Alert.alert("Pro required", "Free tier watches 1 trip. Upgrade to Pro for unlimited.",
          [{ text: "Not now", style: "cancel" }, { text: "Upgrade", onPress: () => router.push("/upgrade") }]);
      } else { Alert.alert("Could not update watch", msg); }
    }
  };

  const onOpen = async (item: SavedTrip) => {
    await AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify(item.trip));
    await AsyncStorage.setItem(ACTIVE_SAVED_KEY, item.id);
    router.push(`/trip/${item.trip.id}`);
  };

  if (!user) {
    return (
      <View style={styles.root}>
        <LinearGradient colors={[...colors.gradHero] as any} style={StyleSheet.absoluteFill} />
        <SafeAreaView style={{ flex: 1 }}>
          <EmptyState
            icon="bookmark-outline"
            title="Sign in to save trips"
            sub="Create an account to keep your favourites and watch prices."
            ctaLabel="Sign in"
            ctaTestID="saved-signin-btn"
            onCta={() => router.push("/login")}
          />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <LinearGradient colors={[...colors.gradHero] as any} locations={[0, 0.6, 1]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <View style={[styles.header, isWide && styles.headerWide]}>
          <Pressable testID="saved-back-btn" onPress={() => router.back()} style={({ hovered }: any) => [styles.iconBtn, hovered && styles.iconBtnHover]}>
            <Ionicons name="chevron-back" size={20} color={colors.ink} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>YOUR PORTFOLIO · {user.is_pro ? "PRO" : "FREE"}</Text>
            <Text style={styles.title}>Saved trips</Text>
          </View>
          <Pressable testID="saved-logout-btn" onPress={async () => { await logout(); router.replace("/"); }} style={({ hovered }: any) => [styles.iconBtn, hovered && styles.iconBtnHover]}>
            <Ionicons name="log-out-outline" size={18} color={colors.ink} />
          </Pressable>
        </View>

        {!user.is_pro ? (
          <Pressable
            testID="upgrade-banner"
            style={({ hovered }: any) => [styles.upgradeBanner, isWide && styles.upgradeBannerWide, hovered && { transform: [{ translateY: -1 }] }]}
            onPress={() => router.push("/upgrade")}
          >
            <LinearGradient colors={[...colors.gradAccent] as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <Ionicons name="rocket-outline" size={18} color="#FFF" />
            <View style={{ flex: 1 }}>
              <Text style={styles.upgradeTitle}>Unlock Pro · £2.99</Text>
              <Text style={styles.upgradeSub}>Watch unlimited trips and get instant price alerts.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#FFF" />
          </Pressable>
        ) : null}

        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xxxl }} />
        ) : trips.length === 0 ? (
          <EmptyState
            icon="bookmark-outline"
            title="No saved trips yet"
            sub="Run an optimisation and save trips you want to track."
            ctaLabel="Start a search"
            ctaTestID="empty-search-btn"
            onCta={() => router.replace("/")}
          />
        ) : (
          <FlatList
            data={trips}
            keyExtractor={(t) => t.id}
            contentContainerStyle={[styles.list, isWide && styles.listWide]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
            renderItem={({ item, index }) => (
              <Animated.View entering={FadeInDown.duration(380).delay(index * 60)}>
                <HoverCard onPress={() => onOpen(item)} testID={`saved-row-${item.id}`} style={styles.row} liftPx={3}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <Text style={styles.rowTitle}>
                        {item.trip.departure_city} → {item.trip.destination_city}
                      </Text>
                      {item.is_watching ? (
                        <View style={styles.watchPill}>
                          <Ionicons name="eye" size={10} color={colors.buy} />
                          <Text style={styles.watchPillText}>WATCHING</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.rowSub}>
                      {item.trip.rank_label} · {item.trip.nights}n · {fmtRange(item.trip.check_in, item.trip.check_out)}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.rowPrice}>£{Math.round(item.trip.total_price)}</Text>
                    <Text style={[styles.rowReco, { color: item.trip.recommendation === "book_now" ? colors.buy : colors.wait }]}>
                      {item.trip.recommendation === "book_now" ? "BOOK NOW" : "WAIT"}
                    </Text>
                  </View>
                  <Pressable testID={`watch-toggle-${item.id}`} onPress={() => onToggleWatch(item)} hitSlop={8} style={{ marginLeft: spacing.md }}>
                    <Ionicons name={item.is_watching ? "eye" : "eye-outline"} size={18} color={item.is_watching ? colors.buy : colors.inkMuted} />
                  </Pressable>
                  <Pressable testID={`delete-saved-${item.id}`} onPress={() => onDelete(item.id)} hitSlop={8} style={{ marginLeft: spacing.sm }}>
                    <Ionicons name="trash-outline" size={18} color={colors.inkMuted} />
                  </Pressable>
                </HoverCard>
              </Animated.View>
            )}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

function EmptyState({ icon, title, sub, ctaLabel, ctaTestID, onCta }: { icon: any; title: string; sub: string; ctaLabel: string; ctaTestID: string; onCta: () => void; }) {
  return (
    <View style={styles.emptyBox}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={28} color={colors.brand} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySub}>{sub}</Text>
      <Pressable testID={ctaTestID} onPress={onCta} style={({ hovered }: any) => [styles.cta, hovered && { transform: [{ translateY: -1 }] }]}>
        <LinearGradient colors={[...colors.gradAccent] as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <Text style={styles.ctaText}>{ctaLabel}</Text>
      </Pressable>
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
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  headerWide: { paddingHorizontal: spacing.xxxl, maxWidth: 1280, width: "100%", alignSelf: "center" },
  iconBtn: {
    width: 40, height: 40, borderRadius: radii.md,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  iconBtnHover: { backgroundColor: colors.surfaceHover, borderColor: colors.borderStrong },
  eyebrow: { fontSize: 10, color: colors.brandStrong, fontWeight: "800", letterSpacing: 1.6 },
  title: { fontSize: 22, color: colors.ink, fontWeight: "900", letterSpacing: -0.5 },
  upgradeBanner: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    margin: spacing.xl, padding: spacing.lg, borderRadius: radii.lg,
    overflow: "hidden",
    shadowColor: colors.brand, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 14,
  },
  upgradeBannerWide: { marginHorizontal: spacing.xxxl, maxWidth: 1280, alignSelf: "center", width: "calc(100% - 96px)" as any },
  upgradeTitle: { color: "#FFF", fontWeight: "900", fontSize: 14 },
  upgradeSub: { color: "rgba(255,255,255,0.9)", fontSize: 12, marginTop: 2 },
  list: { padding: spacing.xl, gap: spacing.md, paddingTop: 0 },
  listWide: { paddingHorizontal: spacing.xxxl, maxWidth: 1280, width: "100%", alignSelf: "center" },
  row: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.surface, padding: spacing.lg,
    borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border,
    gap: spacing.md,
  },
  rowTitle: { fontSize: 15, fontWeight: "800", color: colors.ink },
  rowSub: { fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  rowPrice: { fontSize: 18, fontWeight: "900", color: colors.ink, letterSpacing: -0.5 },
  rowReco: { fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginTop: 2 },
  watchPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: colors.buyBg, paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: radii.pill, borderWidth: 1, borderColor: colors.buy,
  },
  watchPillText: { color: colors.buy, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  emptyBox: {
    flex: 1, alignItems: "center", justifyContent: "center",
    padding: spacing.xl, gap: spacing.md,
  },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 18,
    backgroundColor: colors.riskLowBg,
    borderWidth: 1, borderColor: colors.borderGlow,
    alignItems: "center", justifyContent: "center", marginBottom: spacing.sm,
  },
  emptyTitle: { fontSize: 18, fontWeight: "900", color: colors.ink, letterSpacing: -0.4 },
  emptySub: { fontSize: 13, color: colors.inkSecondary, textAlign: "center", maxWidth: 360 },
  cta: {
    height: 48, paddingHorizontal: spacing.xl,
    borderRadius: radii.lg,
    alignItems: "center", justifyContent: "center",
    marginTop: spacing.md, overflow: "hidden",
    shadowColor: colors.brand, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 12,
  },
  ctaText: { color: "#fff", fontWeight: "800" },
});
