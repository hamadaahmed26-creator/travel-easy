import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Slider from "@react-native-community/slider";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, type Airport, type Destination, type OptimizeRequest } from "../src/api";
import { useAuth } from "../src/auth";
import Globe from "../src/components/Globe";
import { persistResults } from "../src/store";
import { colors, radii, spacing } from "../src/theme";

const RECENT_DEP_KEY = "tripopt:recent_departures";
const RECENT_DEST_KEY = "tripopt:recent_destinations";
const MAX_RECENT = 5;
const WIDE_BREAKPOINT = 960;

async function pushRecent(key: string, code: string) {
  try {
    const raw = await AsyncStorage.getItem(key);
    const list: string[] = raw ? JSON.parse(raw) : [];
    const next = [code, ...list.filter((c) => c !== code)].slice(0, MAX_RECENT);
    await AsyncStorage.setItem(key, JSON.stringify(next));
  } catch {}
}

async function loadRecent(key: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

type WeatherPref = "any" | "sun" | "city";
type HotelPref = "any" | "budget" | "mid";

export default function SearchScreen() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;

  const [airports, setAirports] = useState<Airport[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [departure, setDeparture] = useState<string | null>(null);
  const [destination, setDestination] = useState<string | null>(null);
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

  useEffect(() => {
    if (pickerOpen === null) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = pickerSearch.trim();
    if (!q) {
      setPickerResults((pickerOpen === "departure" ? airports : destinations) as Airport[]);
      setPickerLoading(false);
      return;
    }
    setPickerLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.searchAirports(q, 50);
        setPickerResults(res.results);
      } catch {} finally {
        setPickerLoading(false);
      }
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [pickerSearch, pickerOpen, airports, destinations]);

  useEffect(() => {
    if (pickerOpen === null) return;
    const t = setTimeout(() => searchInputRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, [pickerOpen]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const departureMeta = useMemo(
    () => (departure ? airports.find((a) => a.code === departure) : undefined),
    [airports, departure]
  );
  const destinationMeta = useMemo(
    () => destinations.find((d) => d.code === destination),
    [destinations, destination]
  );

  const onOptimise = async () => {
    setError(null);
    if (!departure) {
      setError("Pick a departure airport first.");
      return;
    }
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

  return (
    <View style={styles.root}>
      {/* Cinematic gradient backdrop */}
      <LinearGradient
        colors={[...colors.gradHero] as any}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          {/* Top nav */}
          <View style={styles.topbar}>
            <View style={styles.brandRow}>
              <View style={styles.logoDot}>
                <LinearGradient
                  colors={[...colors.gradAccent] as any}
                  style={StyleSheet.absoluteFill}
                />
              </View>
              <Text style={styles.brandText}>TRIPOPT</Text>
              <View style={styles.brandTag}>
                <Text style={styles.brandTagText}>{user?.is_pro ? "PRO" : "BETA"}</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {user ? (
                <IconBtn icon="notifications-outline" onPress={() => router.push("/alerts")} testID="open-alerts-btn" />
              ) : null}
              <IconBtn
                icon={user ? "bookmark-outline" : "person-circle-outline"}
                onPress={() => router.push(user ? "/saved" : "/login")}
                testID="open-saved-btn"
              />
            </View>
          </View>

          <ScrollView
            contentContainerStyle={[styles.scroll, isWide && styles.scrollWide]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.heroLayout, isWide && styles.heroLayoutWide]}>
              {/* LEFT: Hero copy + Globe */}
              <Animated.View
                entering={FadeInUp.duration(500)}
                style={[styles.heroLeft, isWide && styles.heroLeftWide]}
              >
                <View style={styles.eyebrowRow}>
                  <View style={styles.dot} />
                  <Text style={styles.eyebrow}>PORTFOLIO TRAVEL OPTIMISER</Text>
                </View>
                <Text style={styles.h1}>
                  Optimise the <Text style={styles.h1Accent}>whole trip</Text>,
                  not just the flight.
                </Text>
                <Text style={styles.heroSub}>
                  Any city → any city. Flights + hotels + timing — ranked like
                  a portfolio. Cheapest combined cost wins.
                </Text>

                <View style={styles.kpis}>
                  <Kpi value="4,400+" label="Global airports" />
                  <Kpi value="3" label="Trips per search" />
                  <Kpi value="6h" label="Price refresh" />
                </View>

                {isWide && (
                  <View style={styles.globeWrap} pointerEvents="none">
                    <Globe size={520} />
                  </View>
                )}
              </Animated.View>

              {/* RIGHT: Glass card form */}
              <Animated.View
                entering={FadeInDown.duration(500).delay(100)}
                style={[styles.cardWrap, isWide && styles.cardWrapWide]}
              >
                <View style={styles.glassCard}>
                  <Text style={styles.cardTitle}>Plan a trip</Text>
                  <Text style={styles.cardHint}>
                    Tell us your budget — we'll hunt for the best total deal.
                  </Text>

                  <FieldLabel>FROM</FieldLabel>
                  <FieldRow
                    testID="departure-input"
                    icon={departureMeta?.is_city_group ? "globe-outline" : "airplane-outline"}
                    title={departureMeta
                      ? departureMeta.is_city_group
                        ? `All ${departureMeta.city} airports`
                        : `${departureMeta.city} (${departureMeta.code})`
                      : "Pick airport"}
                    sub={departureMeta
                      ? departureMeta.is_city_group
                        ? `${(departureMeta.member_codes ?? []).join(" · ")}${departureMeta.country ? ` · ${departureMeta.country}` : ""}`
                        : `${departureMeta.name}${departureMeta.country ? ` · ${departureMeta.country}` : ""}`
                      : "Tap to choose any airport — or pick All [city] for multi-airport cities"}
                    accent={!departureMeta}
                    onPress={() => { setPickerSearch(""); setPickerOpen("departure"); }}
                  />

                  <FieldLabel>TO</FieldLabel>
                  <FieldRow
                    testID="destination-input"
                    icon={destinationMeta?.is_city_group ? "globe-outline" : destination ? "location-outline" : "globe-outline"}
                    title={destination
                      ? destinationMeta?.is_city_group
                        ? `All ${destinationMeta.city} airports`
                        : `${destinationMeta?.city ?? destination} (${destination})`
                      : "Anywhere"}
                    sub={destination
                      ? destinationMeta?.is_city_group
                        ? `${(destinationMeta.member_codes ?? []).join(" · ")}${destinationMeta.country ? ` · ${destinationMeta.country}` : ""}`
                        : destinationMeta?.country ?? ""
                      : "Let the optimiser hunt globally"}
                    accent={!destination}
                    rightAdornment={destination ? (
                      <Pressable
                        testID="clear-destination-btn"
                        onPress={() => setDestination(null)}
                        hitSlop={8}
                      >
                        <Ionicons name="close-circle" size={18} color={colors.inkMuted} />
                      </Pressable>
                    ) : undefined}
                    onPress={() => { setPickerSearch(""); setPickerOpen("destination"); }}
                  />

                  <FieldLabel>BUDGET (TOTAL TRIP)</FieldLabel>
                  <View style={styles.budgetBox}>
                    <Text style={styles.budgetValue} testID="budget-value">£{budget}</Text>
                    <View style={styles.budgetPresets}>
                      {[300, 500, 750, 1000, 1500].map((preset) => {
                        const active = budget === preset;
                        return (
                          <Pressable
                            key={preset}
                            testID={`budget-preset-${preset}`}
                            style={[styles.chip, active && styles.chipActive]}
                            onPress={() => setBudget(preset)}
                          >
                            <Text style={[styles.chipText, active && styles.chipTextActive]}>£{preset}</Text>
                          </Pressable>
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
                      minimumTrackTintColor={colors.brand}
                      maximumTrackTintColor={colors.borderStrong}
                      thumbTintColor={colors.brand}
                    />
                    <View style={styles.rangeRow}>
                      <Text style={styles.fieldHint}>£150</Text>
                      <Text style={styles.fieldHint}>£2000</Text>
                    </View>
                  </View>

                  <FieldLabel>NIGHTS</FieldLabel>
                  <ChipRow testID="nights-row" options={[2, 3, 4, 5, 7, 10, 14]} value={tripLength} onChange={setTripLength} format={(v) => `${v}n`} />

                  <FieldLabel>DATE FLEXIBILITY</FieldLabel>
                  <ChipRow testID="flex-row" options={[0, 3, 7, 14]} value={flexibility} onChange={setFlexibility} format={(v) => (v === 0 ? "Fixed" : `±${v}d`)} />

                  <FieldLabel>WEATHER</FieldLabel>
                  <ChipRow testID="weather-row" options={["any", "sun", "city"] as const} value={weather} onChange={setWeather} format={(v) => (v === "any" ? "No preference" : v === "sun" ? "Sun" : "City")} />

                  <FieldLabel>HOTEL STANDARD</FieldLabel>
                  <ChipRow testID="hotel-row" options={["any", "budget", "mid"] as const} value={hotelPref} onChange={setHotelPref} format={(v) => (v === "any" ? "Any" : v === "budget" ? "Budget" : "Mid-range")} />

                  {error ? <Text style={styles.error} testID="form-error">{error}</Text> : null}

                  <Pressable
                    testID="optimise-btn"
                    style={({ pressed, hovered }: any) => [
                      styles.cta,
                      hovered && styles.ctaHover,
                      pressed && { opacity: 0.85 },
                      submitting && { opacity: 0.7 },
                    ]}
                    disabled={submitting}
                    onPress={onOptimise}
                  >
                    <LinearGradient
                      colors={[...colors.gradAccent] as any}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                    {submitting ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Text style={styles.ctaText}>Optimise my trip</Text>
                        <Ionicons name="arrow-forward" size={18} color="#fff" />
                      </>
                    )}
                  </Pressable>

                  <Text style={styles.disclaimer}>
                    TripOpt searches flights + hotels across 80+ airports in your flexibility window.
                    Prices are realistic estimates; affiliate links open the live booking site.
                  </Text>
                </View>
              </Animated.View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

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
              <TouchableOpacity testID="close-picker-btn" onPress={() => setPickerOpen(null)}>
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
                onPress={() => { setDestination(null); setPickerOpen(null); }}
              >
                <Ionicons name="globe-outline" size={20} color={colors.brand} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldValue}>Anywhere</Text>
                  <Text style={styles.fieldHint}>Let the optimiser hunt globally</Text>
                </View>
              </TouchableOpacity>
            )}
            <FlatList
              data={pickerResults}
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
              renderItem={({ item }: any) => {
                const isCityGroup = !!item.is_city_group;
                const memberCount = (item.member_codes ?? []).length;
                return (
                  <TouchableOpacity
                    testID={`picker-item-${item.code}`}
                    style={[styles.pickerRow, isCityGroup && styles.pickerRowGroup]}
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
                    <View style={[styles.pickerIcon, isCityGroup && styles.pickerIconGroup]}>
                      <Ionicons
                        name={isCityGroup ? "globe-outline" : "airplane-outline"}
                        size={isCityGroup ? 18 : 14}
                        color={isCityGroup ? colors.brandStrong : colors.inkMuted}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <Text style={[styles.pickerCity, isCityGroup && styles.pickerCityGroup]}>
                          {isCityGroup ? `All ${item.city} airports` : `${item.city}${item.country ? `, ${item.country}` : ""}`}
                        </Text>
                        {isCityGroup ? (
                          <View style={styles.groupBadge}>
                            <Text style={styles.groupBadgeText}>{memberCount} AIRPORTS</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.pickerSub} numberOfLines={1}>
                        {isCityGroup
                          ? `${(item.member_codes ?? []).join(" · ")}${item.country ? ` · ${item.country}` : ""}`
                          : (item.name || (item as any).region || "")}
                      </Text>
                    </View>
                    <Text style={[styles.pickerCode, isCityGroup && styles.pickerCodeGroup]}>
                      {isCityGroup ? "ALL" : item.code}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function IconBtn({ icon, onPress, testID }: { icon: any; onPress: () => void; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ hovered }: any) => [styles.iconBtn, hovered && styles.iconBtnHover]}
    >
      <Ionicons name={icon} size={18} color={colors.ink} />
    </Pressable>
  );
}

function FieldRow({
  icon, title, sub, accent, rightAdornment, onPress, testID,
}: {
  icon: any; title: string; sub: string; accent?: boolean;
  rightAdornment?: React.ReactNode; onPress: () => void; testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ hovered }: any) => [
        styles.fieldRow,
        accent && styles.fieldRowAccent,
        hovered && styles.fieldRowHover,
      ]}
    >
      <Ionicons name={icon} size={20} color={accent ? colors.brand : colors.ink} />
      <View style={{ flex: 1 }}>
        <Text style={styles.fieldValue} numberOfLines={1}>{title}</Text>
        <Text style={styles.fieldHint} numberOfLines={1}>{sub}</Text>
      </View>
      {rightAdornment}
      <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} style={{ marginLeft: spacing.sm }} />
    </Pressable>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

function Kpi({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

function RecentRow({
  codes, airportsByCode, onPick,
}: { codes: string[]; airportsByCode: Airport[]; onPick: (code: string) => void; }) {
  if (!codes.length) return null;
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
  options, value, onChange, format, testID,
}: {
  options: readonly T[]; value: T; onChange: (v: T) => void;
  format: (v: T) => string; testID?: string;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipScrollRow}
      testID={testID}
    >
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Pressable
            key={String(opt)}
            testID={`${testID}-${String(opt)}`}
            style={({ hovered }: any) => [
              styles.chip,
              active && styles.chipActive,
              hovered && !active && styles.chipHover,
            ]}
            onPress={() => onChange(opt)}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{format(opt)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  logoDot: {
    width: 24, height: 24, borderRadius: 6,
    overflow: "hidden",
  },
  brandText: {
    color: colors.ink, fontWeight: "900", fontSize: 16, letterSpacing: 2,
  },
  brandTag: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  brandTagText: {
    color: colors.brandStrong, fontSize: 9, fontWeight: "900", letterSpacing: 1.5,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center", justifyContent: "center",
  },
  iconBtnHover: { backgroundColor: colors.surfaceHover, borderColor: colors.borderStrong },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.xl },
  scrollWide: { paddingHorizontal: spacing.xxxl, alignItems: "center" },
  heroLayout: { gap: spacing.xl, width: "100%" },
  heroLayoutWide: {
    flexDirection: "row",
    gap: spacing.xxxl,
    maxWidth: 1280,
    alignItems: "flex-start",
  },
  heroLeft: { gap: spacing.lg, paddingTop: spacing.lg },
  heroLeftWide: { flex: 1.1, paddingTop: spacing.xxxl, position: "relative", minHeight: 700 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand },
  eyebrow: {
    color: colors.brandStrong, fontSize: 11, letterSpacing: 2.4, fontWeight: "800",
  },
  h1: {
    color: colors.ink, fontSize: 44, lineHeight: 50, fontWeight: "900", letterSpacing: -1.5,
  },
  h1Accent: { color: colors.brand },
  heroSub: {
    color: colors.inkSecondary, fontSize: 16, lineHeight: 24, maxWidth: 520,
  },
  kpis: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.md, flexWrap: "wrap" },
  kpi: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderRadius: radii.md, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, minWidth: 120,
  },
  kpiValue: { color: colors.ink, fontWeight: "900", fontSize: 20, letterSpacing: -0.5 },
  kpiLabel: { color: colors.inkMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, marginTop: 2 },
  globeWrap: {
    position: "absolute", left: -80, bottom: -80,
    opacity: 0.85,
  },

  cardWrap: { width: "100%" },
  cardWrapWide: { flex: 1, maxWidth: 540 },
  glassCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.xs,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 28,
    elevation: 12,
  },
  cardTitle: { color: colors.ink, fontSize: 22, fontWeight: "900", letterSpacing: -0.5 },
  cardHint: { color: colors.inkSecondary, fontSize: 13, marginBottom: spacing.md },

  fieldLabel: {
    fontSize: 10, letterSpacing: 1.8, color: colors.inkMuted,
    fontWeight: "800", marginTop: spacing.lg, marginBottom: spacing.sm,
  },
  fieldRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.lg, height: 64, borderRadius: radii.lg,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surfaceStrong,
  },
  fieldRowHover: { borderColor: colors.borderStrong, backgroundColor: colors.surfaceHover },
  fieldRowAccent: { borderColor: colors.borderGlow, backgroundColor: colors.riskLowBg },
  fieldValue: { fontSize: 15, fontWeight: "700", color: colors.ink },
  fieldHint: { fontSize: 12, color: colors.inkMuted, marginTop: 2 },

  budgetBox: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surfaceStrong,
  },
  budgetValue: {
    fontSize: 40, fontWeight: "900", color: colors.ink, letterSpacing: -1.5,
  },
  budgetPresets: {
    flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md,
  },
  rangeRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },

  chipScrollRow: { gap: spacing.sm, paddingVertical: 2 },
  chip: {
    paddingHorizontal: spacing.lg, height: 38, borderRadius: radii.pill,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center", justifyContent: "center",
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipHover: { borderColor: colors.borderStrong, backgroundColor: colors.surfaceHover },
  chipText: { fontSize: 13, fontWeight: "700", color: colors.ink },
  chipTextActive: { color: "#fff" },

  cta: {
    marginTop: spacing.xl, height: 56, borderRadius: radii.lg,
    alignItems: "center", justifyContent: "center", flexDirection: "row",
    gap: spacing.sm, overflow: "hidden",
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  ctaHover: { transform: [{ translateY: -1 }] },
  ctaText: { color: "#fff", fontWeight: "800", fontSize: 16, letterSpacing: 0.2 },

  disclaimer: {
    fontSize: 11, color: colors.inkMuted, textAlign: "center",
    marginTop: spacing.lg, lineHeight: 16,
  },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.md, textAlign: "center" },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(5,7,15,0.7)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.bgAlt,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm,
    paddingBottom: spacing.xl, maxHeight: "85%",
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.borderStrong, alignSelf: "center", marginBottom: spacing.md,
  },
  sheetHeader: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", marginBottom: spacing.md,
  },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: colors.ink },
  search: {
    height: 48, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, fontSize: 14, color: colors.ink, marginBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  anywhereRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  pickerRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.md,
  },
  pickerRowGroup: {
    backgroundColor: colors.riskLowBg,
    borderRadius: radii.md,
    borderBottomColor: "transparent",
    borderWidth: 1, borderColor: colors.borderGlow,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  pickerIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  pickerIconGroup: {
    backgroundColor: colors.brand, borderColor: colors.brandStrong,
  },
  pickerCity: { fontSize: 15, fontWeight: "700", color: colors.ink },
  pickerCityGroup: { fontWeight: "900", color: colors.ink },
  pickerSub: { fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  pickerCode: {
    fontSize: 13, fontWeight: "800", color: colors.brand, letterSpacing: 1,
  },
  pickerCodeGroup: {
    fontSize: 10, fontWeight: "900", color: "#fff", letterSpacing: 1.4,
    backgroundColor: colors.brand,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: radii.pill, overflow: "hidden",
  },
  groupBadge: {
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceStrong,
    borderWidth: 1, borderColor: colors.borderGlow,
  },
  groupBadgeText: { fontSize: 9, fontWeight: "900", color: colors.brandStrong, letterSpacing: 1 },
  searchHint: {
    fontSize: 11, color: colors.inkMuted, fontWeight: "700",
    letterSpacing: 1, marginBottom: spacing.sm,
  },
  recentBox: {
    paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
    marginBottom: spacing.sm,
  },
  recentTitle: {
    fontSize: 10, color: colors.inkMuted, fontWeight: "800",
    letterSpacing: 1.6, marginBottom: spacing.sm,
  },
  recentChip: {
    paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radii.pill,
    borderWidth: 1, borderColor: colors.borderStrong,
    flexDirection: "row", alignItems: "center", gap: 6, maxWidth: 160,
    backgroundColor: colors.surface,
  },
  recentChipCode: { fontSize: 11, fontWeight: "900", color: colors.brand, letterSpacing: 1 },
  recentChipCity: { fontSize: 12, color: colors.ink, flexShrink: 1 },
  noResults: {
    fontSize: 13, color: colors.inkSecondary,
    paddingVertical: spacing.lg, textAlign: "center",
  },
});
