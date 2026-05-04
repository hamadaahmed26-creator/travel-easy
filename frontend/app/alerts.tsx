import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, type AppNotification } from "../src/api";
import { useAuth } from "../src/auth";
import { colors, radii, spacing } from "../src/theme";

const ACTIVE_KEY = "tripopt:active_trip";

export default function AlertsScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }
    try {
      const data = await api.notifications();
      setItems(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

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
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity testID="alerts-back-btn" style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>PRICE ALERTS</Text>
          <Text style={styles.title}>Alerts</Text>
        </View>
      </View>

      {!user ? (
        <View style={styles.empty}>
          <Ionicons name="notifications-off-outline" size={42} color={colors.inkMuted} />
          <Text style={styles.emptyTitle}>Sign in to receive alerts</Text>
          <TouchableOpacity testID="alerts-signin-btn" style={styles.cta} onPress={() => router.push("/login")}>
            <Text style={styles.ctaText}>Sign in</Text>
          </TouchableOpacity>
        </View>
      ) : loading ? (
        <ActivityIndicator color={colors.ink} style={{ marginTop: spacing.xxxl }} />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="notifications-outline" size={42} color={colors.inkMuted} />
          <Text style={styles.emptyTitle}>No alerts yet</Text>
          <Text style={styles.emptySub}>
            Watch a trip from the detail screen — we'll ping you when prices drop or the recommendation flips.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`alert-row-${item.id}`}
              style={[styles.row, !item.read && styles.rowUnread]}
              onPress={() => onPress(item)}
              activeOpacity={0.85}
            >
              <View style={[styles.dot, !item.read && styles.dotUnread]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text style={styles.rowBody}>{item.body}</Text>
                <Text style={styles.rowTime}>{new Date(item.created_at).toLocaleString("en-GB")}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.inkMuted} />
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgAlt },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md,
    gap: spacing.md, backgroundColor: colors.bg,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: radii.md, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  eyebrow: { fontSize: 11, color: colors.inkMuted, letterSpacing: 1.6, fontWeight: "800" },
  title: { fontSize: 22, color: colors.ink, fontWeight: "800", letterSpacing: -0.5 },
  list: { padding: spacing.lg, gap: spacing.md },
  row: {
    flexDirection: "row", alignItems: "flex-start", gap: spacing.md,
    backgroundColor: colors.bg, padding: spacing.lg,
    borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border,
  },
  rowUnread: { borderColor: colors.brand },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border, marginTop: 6 },
  dotUnread: { backgroundColor: colors.buy },
  rowTitle: { fontSize: 14, fontWeight: "800", color: colors.ink },
  rowBody: { fontSize: 13, color: colors.inkSecondary, marginTop: 4 },
  rowTime: { fontSize: 11, color: colors.inkMuted, marginTop: 6 },
  empty: {
    flex: 1, alignItems: "center", justifyContent: "center",
    padding: spacing.xl, gap: spacing.md,
  },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: colors.ink },
  emptySub: { fontSize: 13, color: colors.inkSecondary, textAlign: "center" },
  cta: {
    height: 48, paddingHorizontal: spacing.xl,
    backgroundColor: colors.ink, borderRadius: radii.lg,
    alignItems: "center", justifyContent: "center",
  },
  ctaText: { color: "#fff", fontWeight: "800" },
});
