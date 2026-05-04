import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, type Airport, type Destination, type OptimizeRequest } from "../src/api";
import { useAuth } from "../src/auth";
import { persistResults } from "../src/store";
import { colors, radii, spacing } from "../src/theme";

type WeatherPref = "any" | "sun" | "city";
type HotelPref = "any" | "budget" | "mid";

export default function SearchScreen() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [airports, setAirports] = useState<Airport[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [departure, setDeparture] = useState<string>("BRS");
  const [destination, setDestination] = useState<string | null>(null); // null = Anywhere
  const [budget, setBudget] = useState<number>(500);
  const [tripLength, setTripLength] = useState<number>(4);
  const [flexibility, setFlexibility] = useState<number>(3);
  const [weather, setWeather] = useState<WeatherPref>("any");
  const [hotelPref, setHotelPref] = useState<HotelPref>("any");
  const [pickerOpen, setPickerOpen] = useState<null | "departure" | "destination">(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerResults, setPickerResults] = useState<Airport[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [recentDep, setRecentDep] = useState<string[]>([]);
  const [recentDest, setRecentDest] = useState<string[]>([]);
  const searchInputRef = useRef<TextInput>(null);
  const debounceRef = useRef<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [a, d, rDep, rDest] = await Promise.all([
          api.airports(),
          api.destinations(),
          loadRecent(RECENT_DEP_KEY),
          loadRecent(RECENT_DEST_KEY),
        ]);
        setAirports(a.airports);
        setDestinations(d.destinations);
        setRecentDep(rDep);
        setRecentDest(rDest);
      } catch (e: any) {
        setError(e.message ?? "Failed to load");
      }
    })();
  }, []);

  // Live debounced search whenever the picker query changes.
  useEffect(() => {
    if (pickerOpen === null) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = pickerSearch.trim();
    if (!q) {
      // Show curated/popular set when empty
      setPickerResults(pickerOpen === "departure" ? airports : destinations);
      setPickerLoading(false);
      return;
    }
    setPickerLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.searchAirports(q, 50);
        setPickerResults(res.results);
      } catch {
        // ignore — keep last results
      } finally {
        setPickerLoading(false);
      }
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [pickerSearch, pickerOpen, airports, destinations]);

  // Autofocus the search input the moment the picker opens.
  useEffect(() => {
    if (pickerOpen === null) return;
    const t = setTimeout(() => searchInputRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, [pickerOpen]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const departureMeta = useMemo(
    () => airports.find((a) => a.code === departure),
    [airports, departure]
  );
  const destinationMeta = useMemo(
    () => destinations.find((d) => d.code === destination),
    [destinations, destination]
  );

  const onOptimise = async () => {
    setError(null);
    setSubmitting(true);
    const req: OptimizeRequest = {
      departure,
      destination,
      budget,
      trip_length: tripLength,
      flexibility_days: flexibility,
      weather,
      hotel_standard: hotelPref,
      start_window_days: 30,
    };
    try {
      // Navigate to loading screen first; perform request there so the
      // animation has time to play. We pass the request via storage.
      await persistResults(req, {
        request_id: "",
        generated_at: "",
        options: [],
        searched_combinations: 0,
        median_total: 0,
      });
      router.push({ pathname: "/loading", params: { req: JSON.stringify(req) } });
    } catch (e: any) {
      setError(e.message ?? "Optimisation failed");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredPickerData = pickerResults;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow} testID="brand-eyebrow">
                TRIPOPT · {user?.is_pro ? "PRO" : "v1"}
              </Text>
              <Text style={styles.title} testID="screen-title">Optimise the whole trip.</Text>
              <Text style={styles.subtitle}>
                Any city → any city, ranked like a portfolio. Cheapest combined cost wins.
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {user ? (
                <TouchableOpacity
                  testID="open-alerts-btn"
                  style={styles.savedBtn}
                  onPress={() => router.push("/alerts")}
                >
                  <Ionicons name="notifications-outline" size={20} color={colors.ink} />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                testID="open-saved-btn"
                style={styles.savedBtn}
                onPress={() => router.push(user ? "/saved" : "/login")}
              >
                <Ionicons
                  name={user ? "bookmark-outline" : "person-circle-outline"}
                  size={20}
                  color={colors.ink}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Departure */}
          <FieldLabel>FROM</FieldLabel>
          <TouchableOpacity
            testID="departure-input"
            style={styles.fieldRow}
            onPress={() => {
              setPickerSearch("");
              setPickerOpen("departure");
            }}
          >
            <Ionicons name="airplane-outline" size={20} color={colors.ink} />
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldValue} numberOfLines={1}>
                {departureMeta ? `${departureMeta.city} (${departureMeta.code})` : "Pick airport"}
              </Text>
              <Text style={styles.fieldHint}>
                {departureMeta ? `${departureMeta.name}${departureMeta.country ? ` · ${departureMeta.country}` : ""}` : "Any departure airport"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
          </TouchableOpacity>

          {/* Destination */}
          <FieldLabel>TO</FieldLabel>
          <TouchableOpacity
            testID="destination-input"
            style={[styles.fieldRow, !destination && styles.fieldRowAnywhere]}
            onPress={() => {
              setPickerSearch("");
              setPickerOpen("destination");
            }}
          >
            <Ionicons
              name={destination ? "location-outline" : "globe-outline"}
              size={20}
              color={destination ? colors.ink : colors.riskLow}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldValue} numberOfLines={1}>
                {destination
                  ? `${destinationMeta?.city ?? destination} (${destination})`
                  : "Anywhere"}
              </Text>
              <Text style={styles.fieldHint}>
                {destination ? destinationMeta?.country : "Let the optimiser hunt the best deal globally"}
              </Text>
            </View>
            {destination && (
              <Pressable
                testID="clear-destination-btn"
                onPress={() => setDestination(null)}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={18} color={colors.inkMuted} />
              </Pressable>
            )}
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.inkMuted}
              style={{ marginLeft: spacing.sm }}
            />
          </TouchableOpacity>

          {/* Budget */}
          <FieldLabel>BUDGET (TOTAL TRIP)</FieldLabel>
          <View style={styles.fieldBox}>
            <Text style={styles.budgetValue} testID="budget-value">£{budget}</Text>
            <View style={styles.budgetPresets}>
              {[300, 500, 750, 1000, 1500].map((preset) => {
                const active = budget === preset;
                return (
                  <TouchableOpacity
                    key={preset}
                    testID={`budget-preset-${preset}`}
                    style={[styles.budgetChip, active && styles.budgetChipActive]}
                    onPress={() => setBudget(preset)}
                  >
                    <Text style={[styles.budgetChipText, active && styles.budgetChipTextActive]}>
                      £{preset}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Slider
              testID="budget-slider"
              style={{ marginTop: spacing.md }}
              minimumValue={150}
              maximumValue={2000}
              step={25}
              value={budget}
              onValueChange={(v) => setBudget(Math.round(v))}
              minimumTrackTintColor={colors.ink}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colors.ink}
            />
            <View style={styles.rangeRow}>
              <Text style={styles.fieldHint}>£150</Text>
              <Text style={styles.fieldHint}>£2000</Text>
            </View>
          </View>

          {/* Trip length */}
          <FieldLabel>NIGHTS</FieldLabel>
          <ChipRow
            testID="nights-row"
            options={[2, 3, 4, 5, 7, 10, 14]}
            value={tripLength}
            onChange={setTripLength}
            format={(v) => `${v}n`}
          />

          {/* Flexibility */}
          <FieldLabel>DATE FLEXIBILITY</FieldLabel>
          <ChipRow
            testID="flex-row"
            options={[0, 3, 7, 14]}
            value={flexibility}
            onChange={setFlexibility}
            format={(v) => (v === 0 ? "Fixed" : `±${v}d`)}
          />

          {/* Weather */}
          <FieldLabel>WEATHER</FieldLabel>
          <ChipRow
            testID="weather-row"
            options={["any", "sun", "city"] as const}
            value={weather}
            onChange={setWeather}
            format={(v) => (v === "any" ? "No preference" : v === "sun" ? "Sun" : "City")}
          />

          {/* Hotel standard */}
          <FieldLabel>HOTEL STANDARD</FieldLabel>
          <ChipRow
            testID="hotel-row"
            options={["any", "budget", "mid"] as const}
            value={hotelPref}
            onChange={setHotelPref}
            format={(v) =>
              v === "any" ? "Any" : v === "budget" ? "Budget" : "Mid-range"
            }
          />

          {error ? <Text style={styles.error} testID="form-error">{error}</Text> : null}

          <TouchableOpacity
            testID="optimise-btn"
            style={[styles.cta, submitting && { opacity: 0.7 }]}
            disabled={submitting}
            onPress={onOptimise}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.ctaText}>Optimise my trip</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.disclaimer}>
            TripOpt searches flights + hotels across 80+ airports in your flexibility window
            and ranks the best combined-price trips. Prices shown are realistic estimates;
            affiliate links open the live booking site.
          </Text>
        </ScrollView>

        <Modal
          visible={pickerOpen !== null}
          animationType="slide"
          transparent
          onRequestClose={() => setPickerOpen(null)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.sheet}>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>
                  {pickerOpen === "departure" ? "Departure airport" : "Destination"}
                </Text>
                <TouchableOpacity
                  testID="close-picker-btn"
                  onPress={() => setPickerOpen(null)}
                >
                  <Ionicons name="close" size={22} color={colors.ink} />
                </TouchableOpacity>
              </View>
              <TextInput
                ref={searchInputRef}
                testID="picker-search"
                style={styles.search}
                placeholder={pickerOpen === "departure" ? "Search city, country or IATA…" : "Search destination, country or IATA…"}
                placeholderTextColor={colors.inkMuted}
                value={pickerSearch}
                onChangeText={setPickerSearch}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
              {pickerLoading && pickerSearch.length > 0 ? (
                <Text style={styles.searchHint}>Searching…</Text>
              ) : null}
              {pickerOpen === "destination" && (
                <TouchableOpacity
                  testID="anywhere-option"
                  style={styles.anywhereRow}
                  onPress={() => {
                    setDestination(null);
                    setPickerOpen(null);
                  }}
                >
                  <Ionicons name="globe-outline" size={20} color={colors.brand} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldValue}>Anywhere</Text>
                    <Text style={styles.fieldHint}>Let the optimiser hunt globally</Text>
                  </View>
                </TouchableOpacity>
              )}
              <FlatList
                data={filteredPickerData}
                keyExtractor={(item: any) => item.code}
                keyboardShouldPersistTaps="handled"
                ListHeaderComponent={
                  pickerSearch.trim().length === 0 ? (
                    <RecentRow
                      codes={pickerOpen === "departure" ? recentDep : recentDest}
                      airportsByCode={pickerResults}
                      onPick={async (code) => {
                        if (pickerOpen === "departure") {
                          setDeparture(code);
                          await pushRecent(RECENT_DEP_KEY, code);
                          setRecentDep(await loadRecent(RECENT_DEP_KEY));
                        } else {
                          setDestination(code);
                          await pushRecent(RECENT_DEST_KEY, code);
                          setRecentDest(await loadRecent(RECENT_DEST_KEY));
                        }
                        setPickerOpen(null);
                      }}
                    />
                  ) : null
                }
                ListEmptyComponent={
                  pickerLoading ? null : (
                    <Text style={styles.noResults} testID="picker-no-results">
                      No airports match "{pickerSearch}". Try a different city, country, or 3-letter IATA code.
                    </Text>
                  )
                }
                renderItem={({ item }: any) => (
                  <TouchableOpacity
                    testID={`picker-item-${item.code}`}
                    style={styles.pickerRow}
                    onPress={async () => {
                      if (pickerOpen === "departure") {
                        setDeparture(item.code);
                        await pushRecent(RECENT_DEP_KEY, item.code);
                        setRecentDep(await loadRecent(RECENT_DEP_KEY));
                      } else {
                        setDestination(item.code);
                        await pushRecent(RECENT_DEST_KEY, item.code);
                        setRecentDest(await loadRecent(RECENT_DEST_KEY));
                      }
                      setPickerOpen(null);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickerCity}>
                        {item.city}
                        {item.country ? `, ${item.country}` : ""}
                      </Text>
                      <Text style={styles.pickerSub}>
                        {item.name || (item as any).region || ""}
                      </Text>
                    </View>
                    <Text style={styles.pickerCode}>{item.code}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

function RecentRow({
  codes,
  airportsByCode,
  onPick,
}: {
  codes: string[];
  airportsByCode: Airport[];
  onPick: (code: string) => void;
}) {
  if (!codes.length) return null;
  // Resolve codes to airports from the current pool (popular set when empty query).
  const byCode: Record<string, Airport> = {};
  for (const a of airportsByCode) byCode[a.code] = a;
  const items = codes.map((c) => byCode[c]).filter(Boolean) as Airport[];
  if (!items.length) return null;
  return (
    <View style={styles.recentBox} testID="picker-recent-row">
      <Text style={styles.recentTitle}>RECENT</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {items.map((a) => (
          <TouchableOpacity
            key={a.code}
            testID={`recent-${a.code}`}
            style={styles.recentChip}
            onPress={() => onPick(a.code)}
          >
            <Text style={styles.recentChipCode}>{a.code}</Text>
            <Text style={styles.recentChipCity} numberOfLines={1}>{a.city}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function ChipRow<T>({
  options,
  value,
  onChange,
  format,
  testID,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  format: (v: T) => string;
  testID?: string;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
      testID={testID}
    >
      {options.map((opt) => {
        const active = opt === value;
        return (
          <TouchableOpacity
            key={String(opt)}
            testID={`${testID}-${String(opt)}`}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onChange(opt)}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {format(opt)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: spacing.xl,
    gap: spacing.md,
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 2,
    color: colors.inkMuted,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 32,
    lineHeight: 36,
    color: colors.ink,
    fontWeight: "900",
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 14,
    color: colors.inkSecondary,
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  savedBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldLabel: {
    fontSize: 11,
    letterSpacing: 1.6,
    color: colors.inkMuted,
    fontWeight: "700",
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    height: 64,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  fieldRowAnywhere: {
    borderColor: colors.riskLow,
    backgroundColor: colors.riskLowBg,
  },
  fieldBox: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  fieldValue: { fontSize: 16, fontWeight: "700", color: colors.ink },
  fieldHint: { fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  budgetValue: {
    fontSize: 36,
    fontWeight: "900",
    color: colors.ink,
    letterSpacing: -1.2,
  },
  budgetPresets: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  budgetChip: {
    paddingHorizontal: spacing.md,
    height: 36,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  budgetChipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  budgetChipText: { fontSize: 13, fontWeight: "800", color: colors.ink },
  budgetChipTextActive: { color: "#fff" },
  rangeRow: { flexDirection: "row", justifyContent: "space-between" },
  chipRow: { gap: spacing.sm, paddingVertical: 2 },
  chip: {
    paddingHorizontal: spacing.lg,
    height: 40,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 13, fontWeight: "700", color: colors.ink },
  chipTextActive: { color: "#fff" },
  cta: {
    marginTop: spacing.xl,
    height: 56,
    borderRadius: radii.lg,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  ctaText: { color: "#fff", fontWeight: "800", fontSize: 16, letterSpacing: -0.2 },
  disclaimer: {
    fontSize: 11,
    color: colors.inkMuted,
    textAlign: "center",
    marginTop: spacing.lg,
    lineHeight: 16,
  },
  error: {
    color: "#DC2626",
    fontSize: 13,
    marginTop: spacing.md,
    textAlign: "center",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    maxHeight: "85%",
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: colors.ink },
  search: {
    height: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    fontSize: 14,
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  anywhereRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerCity: { fontSize: 15, fontWeight: "700", color: colors.ink },
  pickerSub: { fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  pickerCode: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.brand,
    letterSpacing: 1,
  },
});
nItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerCity: { fontSize: 15, fontWeight: "700", color: colors.ink },
  pickerSub: { fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  pickerCode: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.brand,
    letterSpacing: 1,
  },
});
