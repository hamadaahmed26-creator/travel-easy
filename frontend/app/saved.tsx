import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
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
import { colors, radii, spacing } from "../src/theme";

const ACTIVE_KEY = "tripopt:active_trip";

export default function SavedScreen() {
  const router = useRouter();
  const [trips, setTrips] = useState<SavedTrip[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const data = await api.listTrips();
      setTrips(data);
    } catch (e: any) {
      Alert.alert("Could not load saved trips", e.message ?? "");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const onDelete = async (id: string) => {
    try {
      await api.deleteTrip(id);
      setTrips((cur) => cur.filter((t) => t.id !== id));
    } catch (e: any) {
      Alert.alert("Could not delete", e.message ?? "");
    }
  };

  const onOpen = async (item: SavedTrip) => {
    await AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify(item.trip));
    router.push(`/trip/${item.trip.id}`);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity
          testID="saved-back-btn"
          onPress={() => router.back()}
          style={styles.iconBtn}
        >
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>YOUR PORTFOLIO</Text>
          <Text style={styles.title}>Saved trips</Text>
        </View>
      </View>

      {loading ? (
        <Text style={styles.empty}>Loading…</Text>
      ) : trips.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="bookmark-outline" size={42} color={colors.inkMuted} />
          <Text style={styles.emptyTitle}>No saved trips yet</Text>
          <Text style={styles.emptySub}>
            Run an optimisation and save trips you want to track.
          </Text>
          <TouchableOpacity
            testID="empty-search-btn"
            style={styles.cta}
            onPress={() => router.replace("/")}
          >
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
                <Text style={styles.rowTitle}>
                  {item.trip.departure_city} → {item.trip.destination_city}
                </Text>
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
                testID={`delete-saved-${item.id}`}
                onPress={() => onDelete(item.id)}
                hitSlop={8}
                style={{ marginLeft: spacing.md }}
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
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
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
  eyebrow: { fontSize: 11, color: colors.inkMuted, fontWeight: "800", letterSpacing: 1.6 },
  title: { fontSize: 22, color: colors.ink, fontWeight: "800", letterSpacing: -0.5 },
  list: { padding: spacing.lg, gap: spacing.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  rowTitle: { fontSize: 15, fontWeight: "800", color: colors.ink },
  rowSub: { fontSize: 12, color: colors.inkSecondary, marginTop: 2 },
  rowPrice: { fontSize: 18, fontWeight: "900", color: colors.ink, letterSpacing: -0.5 },
  rowReco: { fontSize: 10, fontWeight: "900", color: colors.inkMuted, letterSpacing: 1.2, marginTop: 2 },
  empty: { textAlign: "center", marginTop: spacing.xxl, color: colors.inkSecondary },
  emptyBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.md,
  },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: colors.ink },
  emptySub: { fontSize: 13, color: colors.inkSecondary, textAlign: "center" },
  cta: {
    height: 48,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.lg,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md,
  },
  ctaText: { color: "#fff", fontWeight: "800" },
});
