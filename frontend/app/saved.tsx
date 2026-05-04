import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, type SavedTrip } from "../src/api";
import { useAuth } from "../src/auth";
import { colors, radii, spacing } from "../src/theme";

const ACTIVE_KEY = "tripopt:active_trip";
const ACTIVE_SAVED_KEY = "tripopt:active_saved_id";

export default function SavedScreen() {
  const router = useRouter();
  const { user, logout, refresh } = useAuth();
  const [trips, setTrips] = useState<SavedTrip[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const data = await api.listTrips();
      setTrips(data);
    } catch (e: any) {
      // 401 → token expired
      if (e?.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }
      Alert.alert("Could not load saved trips", e.message ?? "");
    } finally {
      setLoading(false);
    }
  }, [user, logout, router]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      reload();
    }, [reload, refresh])
  );

  const onDelete = async (id: string) => {
    try {
      await api.deleteTrip(id);
      setTrips((cur) => cur.filter((t) => t.id !== id));
    } catch (e: any) {
      Alert.alert("Could not delete", e.message ?? "");
    }
  };

  const onToggleWatch = async (t: SavedTrip) => {
    try {
      const res = await api.toggleWatch(t.id, !t.is_watching);
      setTrips((cur) => cur.map((x) => (x.id === t.id ? { ...x, is_watching: res.is_watching } : x)));
    } catch (e: any) {
      const msg = e?.message ?? "";
      if (msg.includes("402")) {
        Alert.alert(
          "Pro required",
          "Free tier watches 1 trip. Upgrade to Pro for unlimited.",
          [{ text: "Not now", style: "cancel" }, { text: "Upgrade", onPress: () => router.push("/upgrade") }]
        );
      } else {
        Alert.alert("Could not update watch", msg);
      }
    }
  };

  const onOpen = async (item: SavedTrip) => {
    await AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify(item.trip));
    await AsyncStorage.setItem(ACTIVE_SAVED_KEY, item.id);
    router.push(`/trip/${item.trip.id}`);
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.emptyBox}>
          <Ionicons name="bookmark-outline" size={42} color={colors.inkMuted} />
          <Text style={styles.emptyTitle}>Sign in to save trips</Text>
          <Text style={styles.emptySub}>Create an account to keep your favourites and watch prices.</Text>
          <TouchableOpacity testID="saved-signin-btn" style={styles.cta} onPress={() => router.push("/login")}>
            <Text style={styles.ctaText}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity testID="saved-back-btn" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>YOUR PORTFOLIO · {user.is_pro ? "PRO" : "FREE"}</Text>
          <Text style={styles.title}>Saved trips</Text>
        </View>
        <TouchableOpacity testID="saved-logout-btn" onPress={async () => { await logout(); router.replace("/"); }} style={styles.iconBtn}>
          <Ionicons name="log-out-outline" size={20} color={colors.ink} />
        </TouchableOpacity>
      </View>

      {!user.is_pro ? (
        <TouchableOpacity testID="upgrade-banner" style={styles.upgradeBanner} onPress={() => router.push("/upgrade")}>
          <Ionicons name="rocket-outline" size={18} color="#FFF" />
          <View style={{ flex: 1 }}>
            <Text style={styles.upgradeTitle}>Unlock Pro · £2.99</Text>
            <Text style={styles.upgradeSub}>Watch unlimited trips and get instant price alerts.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#FFF" />
        </TouchableOpacity>
      ) : null}

      {loading ? (
        <ActivityIndicator color={colors.ink} style={{ marginTop: spacing.xxxl }} />
      ) : trips.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="bookmark-outline" size={42} color={colors.inkMuted} />
          <Text style={styles.emptyTitle}>No saved trips yet</Text>
          <Text style={styles.emptySub}>Run an optimisation and save trips you want to track.</Text>
          <TouchableOpacity testID="empty-search-btn" style={styles.cta} onPress={() => router.replace("/")}>
            <Text style={styles.ctaText}>Start a search</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`saved-row-${item.id}`}
              style={styles.row}
              onPress={() => onOpen(item)}
              activeOpacity={0.85}
            >
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.rowTitle}>
                    {item.trip.departure_city} → {item.trip.destination_city}
                  </Text>
                  {item.is_watching ? (
                    <View style={styles.watchPill}>
                      <Ionicons name="eye" size={10} color="#FFF" />
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
                <Text style={styles.rowReco}>
                  {item.trip.recommendation === "book_now" ? "BOOK NOW" : "WAIT"}
                </Text>
              </View>
              <TouchableOpacity
                testID={`watch-toggle-${item.id}`}
                onPress={() => onToggleWatch(item)}
                hitSlop={8}
                style={{ marginLeft: spacing.md }}
              >
                <Ionicons
                  name={item.is_watching ? "eye" : "eye-outline"}
                  size={18}
                  color={item.is_watching ? colors.buy : colors.inkMuted}
                />
              </TouchableOpacity>
              <TouchableOpacity
                testID={`delete-saved-${item.id}`}
                onPress={() => onDelete(item.id)}
                hitSlop={8}
                style={{ marginLeft: spacing.sm }}
              >
                <Ionicons name="trash-outline" size={18} color={colors.inkMuted} />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function fmtRange(checkIn: string, checkOut: string) {
  const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${fmt(checkIn)} – ${fmt(checkOut)}`;
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
    width: 40, height: 40, borderRadius: radii.md,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  eyebrow: { fontSize: 11, color: colors.inkMuted, fontWeight: "800", letterSpacing: 1.6 },
  title: { fontSize: 22, color: colors.ink, fontWeight: "800", letterSpacing: -0.5 },
  upgradeBanner: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    margin: spacing.lg, padding: spacing.lg, borderRadius: radii.lg,
    backgroundColor: colors.brand,
  },
  upgradeTitle: { color: "#FFF", fontWeight: "900", fontSize: 14 },
  upgradeSub: { color: "#94A3B8", fontSize: 12, marginTop: 2 },
  list: { padding: spacing.lg, gap: spacing.md, paddingTop: 0 },
  row: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.bg, padding: spacing.lg,
    borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border,
    gap: spacing.md,
  },
  rowTitle: { fontSize: 15, fontWeight: "800", color: colors.ink },
  rowSub: { fontSize: 12, color: colors.inkSecondary, marginTop: 2 },
  rowPrice: { fontSize: 18, fontWeight: "900", color: colors.ink, letterSpacing: -0.5 },
  rowReco: { fontSize: 10, fontWeight: "900", color: colors.inkMuted, letterSpacing: 1.2, marginTop: 2 },
  watchPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: colors.buy, paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: radii.pill,
  },
  watchPillText: { color: "#FFF", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  emptyBox: {
    flex: 1, alignItems: "center", justifyContent: "center",
    padding: spacing.xl, gap: spacing.md,
  },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: colors.ink },
  emptySub: { fontSize: 13, color: colors.inkSecondary, textAlign: "center" },
  cta: {
    height: 48, paddingHorizontal: spacing.xl,
    borderRadius: radii.lg, backgroundColor: colors.ink,
    alignItems: "center", justifyContent: "center", marginTop: spacing.md,
  },
  ctaText: { color: "#fff", fontWeight: "800" },
});
