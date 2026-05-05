import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, type AppNotification } from "../src/api";
import { useAuth } from "../src/auth";
import HoverCard from "../src/components/HoverCard";
import { colors, radii, spacing } from "../src/theme";

const ACTIVE_KEY = "tripopt:active_trip";
const WIDE = 960;

export default function AlertsScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE;
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    if (!user) { setItems([]); setLoading(false); return; }
    try { const data = await api.notifications(); setItems(data); }
    catch {} finally { setLoading(false); }
  }, [user]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const onRefresh = async () => {
    setRefreshing(true); await reload(); setRefreshing(false);
  };

  const onPress = async (n: AppNotification) => {
    try { await api.markRead(n.id); } catch {}
    setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    if (n.saved_trip_id) {
      const trips = await api.listTrips();
      const t = trips.find((x) => x.id === n.saved_trip_id);
      if (t) {
        await AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify(t.trip));
        router.push(`/trip/${t.trip.id}`);
      }
    }
  };

  if (authLoading) return null;

  return (
    <View style={styles.root}>
      <LinearGradient colors={[...colors.gradHero] as any} locations={[0, 0.6, 1]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <View style={[styles.header, isWide && styles.headerWide]}>
          <Pressable testID="alerts-back-btn" onPress={() => router.back()} style={({ hovered }: any) => [styles.iconBtn, hovered && styles.iconBtnHover]}>
            <Ionicons name="chevron-back" size={20} color={colors.ink} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>PRICE ALERTS</Text>
            <Text style={styles.title}>Alerts</Text>
          </View>
        </View>

        {!user ? (
          <EmptyState icon="notifications-off-outline" title="Sign in to receive alerts" sub="" ctaLabel="Sign in" ctaTestID="alerts-signin-btn" onCta={() => router.push("/login")} />
        ) : loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xxxl }} />
        ) : items.length === 0 ? (
          <EmptyState
            icon="notifications-outline"
            title="No alerts yet"
            sub="Watch a trip from the detail screen — we'll ping you when prices drop or the recommendation flips."
          />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(n) => n.id}
            contentContainerStyle={[styles.list, isWide && styles.listWide]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
            renderItem={({ item, index }) => (
              <Animated.View entering={FadeInDown.duration(380).delay(index * 60)}>
                <HoverCard
                  testID={`alert-row-${item.id}`}
                  onPress={() => onPress(item)}
                  style={[styles.row, !item.read && styles.rowUnread]}
                  liftPx={3}
                >
                  <View style={[styles.dot, !item.read && styles.dotUnread]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{item.title}</Text>
                    <Text style={styles.rowBody}>{item.body}</Text>
                    <Text style={styles.rowTime}>{new Date(item.created_at).toLocaleString("en-GB")}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.inkMuted} />
                </HoverCard>
              </Animated.View>
            )}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

function EmptyState({ icon, title, sub, ctaLabel, ctaTestID, onCta }: { icon: any; title: string; sub?: string; ctaLabel?: string; ctaTestID?: string; onCta?: () => void; }) {
  return (
    <View style={styles.emptyBox}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={28} color={colors.brand} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {sub ? <Text style={styles.emptySub}>{sub}</Text> : null}
      {ctaLabel && onCta ? (
        <Pressable testID={ctaTestID} onPress={onCta} style={({ hovered }: any) => [styles.cta, hovered && { transform: [{ translateY: -1 }] }]}>
          <LinearGradient colors={[...colors.gradAccent] as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Text style={styles.ctaText}>{ctaLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
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
  eyebrow: { fontSize: 10, color: colors.brandStrong, letterSpacing: 1.6, fontWeight: "800" },
  title: { fontSize: 22, color: colors.ink, fontWeight: "900", letterSpacing: -0.5 },
  list: { padding: spacing.xl, gap: spacing.md, paddingTop: 0 },
  listWide: { paddingHorizontal: spacing.xxxl, maxWidth: 1280, width: "100%", alignSelf: "center" },
  row: {
    flexDirection: "row", alignItems: "flex-start", gap: spacing.md,
    backgroundColor: colors.surface, padding: spacing.lg,
    borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border,
  },
  rowUnread: { borderColor: colors.borderGlow },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.borderStrong, marginTop: 6 },
  dotUnread: { backgroundColor: colors.brand },
  rowTitle: { fontSize: 14, fontWeight: "800", color: colors.ink },
  rowBody: { fontSize: 13, color: colors.inkSecondary, marginTop: 4 },
  rowTime: { fontSize: 11, color: colors.inkMuted, marginTop: 6 },
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
  },
  ctaText: { color: "#fff", fontWeight: "800" },
});
