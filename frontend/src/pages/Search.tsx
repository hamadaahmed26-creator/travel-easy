import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Globe2,
  Plane,
  Search,
  X,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import TopNav from '../components/TopNav';
import GlobeArc from '../components/GlobeArc';
import PageTransition from '../components/PageTransition';
import {
  api,
  type Airport,
  type Destination,
  type OptimizeRequest,
} from '../lib/api';
import { loadRecent, persistResults, pushRecent } from '../lib/store';
import { cn, formatGBP } from '../lib/utils';
import { useAuth } from '../lib/auth';

type WeatherPref = 'any' | 'sun' | 'city';
type HotelPref = 'any' | 'budget' | 'mid';

export default function SearchPage() {
  const navigate = useNavigate();
  const { user, refresh } = useAuth();
  const [airports, setAirports] = useState<Airport[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [departure, setDeparture] = useState<string>('BRS');
  const [destination, setDestination] = useState<string | null>(null);
  const [budget, setBudget] = useState<number>(500);
  const [tripLength, setTripLength] = useState<number>(4);
  const [flexibility, setFlexibility] = useState<number>(3);
  const [weather, setWeather] = useState<WeatherPref>('any');
  const [hotelPref, setHotelPref] = useState<HotelPref>('any');
  const [pickerOpen, setPickerOpen] = useState<null | 'departure' | 'destination'>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerResults, setPickerResults] = useState<Airport[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [recentDep, setRecentDep] = useState<string[]>([]);
  const [recentDest, setRecentDest] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    refresh();
    (async () => {
      try {
        const [a, d] = await Promise.all([api.airports(), api.destinations()]);
        setAirports(a.airports);
        setDestinations(d.destinations);
        setRecentDep(loadRecent('departure'));
        setRecentDest(loadRecent('destination'));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced live search inside picker
  useEffect(() => {
    if (!pickerOpen) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = pickerSearch.trim();
    if (!q) {
      setPickerResults((pickerOpen === 'departure' ? airports : destinations) as Airport[]);
      setPickerLoading(false);
      return;
    }
    setPickerLoading(true);
    debounceRef.current = window.setTimeout(async () => {
      try {
        const res = await api.searchAirports(q, 50);
        setPickerResults(res.results);
      } finally {
        setPickerLoading(false);
      }
    }, 200);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [pickerSearch, pickerOpen, airports, destinations]);

  // Autofocus + esc-to-close for picker
  useEffect(() => {
    if (!pickerOpen) return;
    setTimeout(() => searchInputRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPickerOpen(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pickerOpen]);

  const departureMeta = useMemo(
    () => airports.find((a) => a.code === departure),
    [airports, departure],
  );
  const destinationMeta = useMemo(
    () => destinations.find((d) => d.code === destination),
    [destinations, destination],
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
      persistResults(req, {
        request_id: '',
        generated_at: '',
        options: [],
        searched_combinations: 0,
        median_total: 0,
      });
      navigate(`/loading?req=${encodeURIComponent(JSON.stringify(req))}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Optimisation failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageTransition>
      <div className="min-h-full flex flex-col bg-white">
        <TopNav variant="light" />

        {/* HERO */}
        <section className="relative overflow-hidden bg-navy-950 text-white">
          <div className="absolute inset-0 gradient-mesh" />
          <div className="absolute inset-0 grid-bg opacity-60" />

          <div className="relative max-w-[1280px] mx-auto px-8 py-16 lg:py-24 grid lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-7 z-10">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
                  <Sparkles size={12} className="text-amber-300" />
                  <span className="text-[10.5px] font-bold tracking-[0.18em] uppercase text-white/70" data-testid="brand-eyebrow">
                    TripOpt · {user?.is_pro ? 'Pro' : 'Optimiser v1'}
                  </span>
                </div>
                <h1
                  className="mt-6 text-5xl lg:text-7xl font-black tracking-[-0.04em] leading-[0.95]"
                  data-testid="screen-title"
                >
                  Optimise the
                  <br />
                  <span className="bg-gradient-to-r from-blue-300 via-emerald-200 to-blue-400 bg-clip-text text-transparent">
                    whole trip.
                  </span>
                </h1>
                <p className="mt-6 text-[17px] leading-relaxed text-white/70 max-w-xl">
                  We search every flight + hotel combo across your dates, score them like a portfolio,
                  and tell you whether to <span className="text-emerald-300 font-semibold">book now</span> or{' '}
                  <span className="text-amber-300 font-semibold">wait</span>. Cheapest combined cost wins.
                </p>
                <div className="mt-10 flex flex-wrap gap-6">
                  <Stat number="4,400+" label="airports searched" />
                  <Stat number="30 days" label="price history & forecast" />
                  <Stat number="3 ranks" label="cheapest · value · risk" />
                </div>
              </motion.div>
            </div>
            <div className="lg:col-span-5 hidden lg:block z-0">
              <motion.div
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                className="relative"
              >
                <GlobeArc className="w-full h-auto" />
              </motion.div>
            </div>
          </div>
        </section>

        {/* FORM */}
        <section className="flex-1 bg-white">
          <div className="max-w-[1280px] mx-auto px-8 py-12 lg:py-16">
            <div className="grid lg:grid-cols-12 gap-10">
              {/* Left: Form */}
              <div className="lg:col-span-7">
                <div className="flex items-baseline justify-between mb-8">
                  <h2 className="text-3xl lg:text-4xl font-black tracking-[-0.03em]">
                    Build your search
                  </h2>
                  <span className="label-eyebrow">STEP 01 · INPUTS</span>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <FieldShell label="FROM">
                    <button
                      data-testid="departure-input"
                      onClick={() => {
                        setPickerSearch('');
                        setPickerOpen('departure');
                      }}
                      className="w-full text-left flex items-center gap-3 px-5 h-[68px] rounded-2xl border border-ink/10 bg-white hover:border-ink/30 transition-colors group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-ink/[0.04] flex items-center justify-center group-hover:bg-ink/[0.08]">
                        <Plane size={18} className="text-ink/80" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[15px] font-bold text-ink truncate">
                          {departureMeta
                            ? `${departureMeta.city} (${departureMeta.code})`
                            : 'Pick airport'}
                        </div>
                        <div className="text-[12px] text-ink-muted truncate">
                          {departureMeta
                            ? `${departureMeta.name}${departureMeta.country ? ` · ${departureMeta.country}` : ''}`
                            : 'Any departure airport'}
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-ink-muted" />
                    </button>
                  </FieldShell>

                  <FieldShell label="TO">
                    <button
                      data-testid="destination-input"
                      onClick={() => {
                        setPickerSearch('');
                        setPickerOpen('destination');
                      }}
                      className={cn(
                        'w-full text-left flex items-center gap-3 px-5 h-[68px] rounded-2xl border transition-colors group',
                        destination
                          ? 'border-ink/10 bg-white hover:border-ink/30'
                          : 'border-risk-low/30 bg-risk-lowBg/40 hover:border-risk-low',
                      )}
                    >
                      <div
                        className={cn(
                          'w-10 h-10 rounded-xl flex items-center justify-center',
                          destination
                            ? 'bg-ink/[0.04] group-hover:bg-ink/[0.08]'
                            : 'bg-risk-low/10 group-hover:bg-risk-low/20',
                        )}
                      >
                        <Globe2
                          size={18}
                          className={destination ? 'text-ink/80' : 'text-risk-low'}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[15px] font-bold text-ink truncate">
                          {destination
                            ? `${destinationMeta?.city ?? destination} (${destination})`
                            : 'Anywhere'}
                        </div>
                        <div className="text-[12px] text-ink-muted truncate">
                          {destination
                            ? destinationMeta?.country
                            : 'Hunt the best deal globally'}
                        </div>
                      </div>
                      {destination && (
                        <button
                          data-testid="clear-destination-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDestination(null);
                          }}
                          className="w-7 h-7 -mr-1 rounded-full hover:bg-ink/10 flex items-center justify-center"
                        >
                          <X size={14} className="text-ink-muted" />
                        </button>
                      )}
                      <ChevronRight size={16} className="text-ink-muted" />
                    </button>
                  </FieldShell>
                </div>

                <FieldShell label="BUDGET (TOTAL TRIP)" className="mt-6">
                  <div className="px-5 pt-4 pb-5 rounded-2xl border border-ink/10 bg-white">
                    <div className="flex items-baseline justify-between">
                      <span
                        className="text-5xl font-black tracking-[-0.04em]"
                        data-testid="budget-value"
                      >
                        {formatGBP(budget)}
                      </span>
                      <span className="text-[11px] font-bold tracking-[0.16em] text-ink-muted">
                        TOTAL
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {[300, 500, 750, 1000, 1500].map((preset) => {
                        const active = budget === preset;
                        return (
                          <button
                            key={preset}
                            data-testid={`budget-preset-${preset}`}
                            onClick={() => setBudget(preset)}
                            className={cn('chip', active && 'chip-active')}
                          >
                            £{preset}
                          </button>
                        );
                      })}
                    </div>
                    <input
                      type="range"
                      data-testid="budget-slider"
                      className="range-slider mt-5"
                      min={150}
                      max={2000}
                      step={25}
                      value={budget}
                      onChange={(e) => setBudget(Number(e.target.value))}
                    />
                    <div className="flex justify-between mt-2">
                      <span className="text-[11px] text-ink-muted font-semibold">£150</span>
                      <span className="text-[11px] text-ink-muted font-semibold">£2000</span>
                    </div>
                  </div>
                </FieldShell>

                <div className="grid sm:grid-cols-2 gap-6 mt-6">
                  <FieldShell label="NIGHTS">
                    <ChipRow
                      testId="nights-row"
                      options={[2, 3, 4, 5, 7, 10, 14]}
                      value={tripLength}
                      onChange={setTripLength}
                      format={(v) => `${v}n`}
                    />
                  </FieldShell>
                  <FieldShell label="DATE FLEXIBILITY">
                    <ChipRow
                      testId="flex-row"
                      options={[0, 3, 7, 14]}
                      value={flexibility}
                      onChange={setFlexibility}
                      format={(v) => (v === 0 ? 'Fixed' : `±${v}d`)}
                    />
                  </FieldShell>
                  <FieldShell label="WEATHER">
                    <ChipRow
                      testId="weather-row"
                      options={['any', 'sun', 'city'] as const}
                      value={weather}
                      onChange={setWeather}
                      format={(v) => (v === 'any' ? 'Any' : v === 'sun' ? 'Sun' : 'City')}
                    />
                  </FieldShell>
                  <FieldShell label="HOTEL STANDARD">
                    <ChipRow
                      testId="hotel-row"
                      options={['any', 'budget', 'mid'] as const}
                      value={hotelPref}
                      onChange={setHotelPref}
                      format={(v) => (v === 'any' ? 'Any' : v === 'budget' ? 'Budget' : 'Mid-range')}
                    />
                  </FieldShell>
                </div>

                {error && (
                  <p className="mt-6 text-sm text-red-600" data-testid="form-error">
                    {error}
                  </p>
                )}

                <button
                  data-testid="optimise-btn"
                  onClick={onOptimise}
                  disabled={submitting}
                  className="mt-8 w-full lg:w-auto inline-flex items-center justify-center gap-3 h-16 px-10 rounded-2xl bg-ink text-white font-extrabold text-[16px] tracking-tight transition-all hover:bg-navy-800 hover:shadow-cardHover active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Optimising…' : 'Optimise my trip'}
                  <ArrowRight size={18} />
                </button>

                <p className="mt-6 text-[12px] text-ink-muted leading-relaxed max-w-2xl">
                  TripOpt searches flights + hotels across 4,400+ airports in your flexibility window
                  and ranks the best combined-price trips. Prices shown are realistic estimates;
                  affiliate links open the live booking site.
                </p>
              </div>

              {/* Right: Trust panel + tips */}
              <div className="lg:col-span-5 space-y-6">
                <div className="sticky top-24">
                  <TrustPanel />
                  <RecentSearches
                    recents={recentDep.length > 0 ? recentDep : recentDest}
                    airportsByCode={airports}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Picker modal */}
        {pickerOpen && (
          <PickerModal
            kind={pickerOpen}
            results={pickerResults}
            loading={pickerLoading}
            search={pickerSearch}
            onSearch={setPickerSearch}
            recents={pickerOpen === 'departure' ? recentDep : recentDest}
            inputRef={searchInputRef}
            onClose={() => setPickerOpen(null)}
            onSelectAnywhere={() => {
              setDestination(null);
              setPickerOpen(null);
            }}
            onPick={(code) => {
              if (pickerOpen === 'departure') {
                setDeparture(code);
                pushRecent('departure', code);
                setRecentDep(loadRecent('departure'));
              } else {
                setDestination(code);
                pushRecent('destination', code);
                setRecentDest(loadRecent('destination'));
              }
              setPickerOpen(null);
            }}
          />
        )}
      </div>
    </PageTransition>
  );
}

function FieldShell({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="label-eyebrow mb-2">{label}</div>
      {children}
    </div>
  );
}

function Stat({ number, label }: { number: string; label: string }) {
  return (
    <div>
      <div className="text-2xl font-black tracking-tight text-white">{number}</div>
      <div className="text-[11px] uppercase tracking-[0.16em] text-white/50 font-bold mt-1">
        {label}
      </div>
    </div>
  );
}

function ChipRow<T extends string | number>({
  options,
  value,
  onChange,
  format,
  testId,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  format: (v: T) => string;
  testId?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" data-testid={testId}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <button
            key={String(opt)}
            data-testid={`${testId}-${String(opt)}`}
            onClick={() => onChange(opt)}
            className={cn('chip', active && 'chip-active')}
          >
            {format(opt)}
          </button>
        );
      })}
    </div>
  );
}

function TrustPanel() {
  const items = [
    { k: 'Cheapest', desc: 'Lowest combined flight + hotel.', color: 'bg-rank-cheap' },
    { k: 'Best Value', desc: 'Star rating per pound, distance to centre, fewer stops.', color: 'bg-rank-value' },
    { k: 'Lowest Risk', desc: 'Stable price history, low forecast volatility.', color: 'bg-rank-risk' },
  ];
  return (
    <div className="rounded-2xl border border-ink/10 bg-gradient-to-br from-navy-950 to-navy-900 text-white p-7 shadow-glow overflow-hidden relative">
      <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-blue-500/20 blur-3xl" />
      <div className="absolute -bottom-12 -left-12 w-48 h-48 rounded-full bg-emerald-500/20 blur-3xl" />
      <div className="relative">
        <div className="label-eyebrow text-white/60">RANKING METHODOLOGY</div>
        <h3 className="mt-3 text-2xl font-black tracking-[-0.03em]">
          Three trips. Three lenses.
        </h3>
        <p className="mt-2 text-[13px] text-white/60 leading-relaxed">
          We don’t show 200 results. We show three: each tuned for a different decision style.
        </p>
        <div className="mt-6 space-y-4">
          {items.map((it) => (
            <div key={it.k} className="flex items-start gap-3">
              <div className={cn('w-2 h-2 rounded-full mt-1.5 flex-shrink-0', it.color)} />
              <div>
                <div className="text-[13px] font-bold tracking-tight">{it.k}</div>
                <div className="text-[12px] text-white/55 leading-snug">{it.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RecentSearches({
  recents,
  airportsByCode,
}: {
  recents: string[];
  airportsByCode: Airport[];
}) {
  if (recents.length === 0) return null;
  const byCode: Record<string, Airport> = {};
  for (const a of airportsByCode) byCode[a.code] = a;
  const items = recents.map((c) => byCode[c]).filter(Boolean);
  if (items.length === 0) return null;
  return (
    <div className="mt-6 rounded-2xl border border-ink/10 bg-white p-6">
      <div className="label-eyebrow">RECENT</div>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((a) => (
          <div
            key={a.code}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-ink/10 bg-ink/[0.02]"
          >
            <span className="text-[10px] font-black tracking-widest text-rank-value">
              {a.code}
            </span>
            <span className="text-[12px] font-semibold text-ink truncate max-w-[140px]">
              {a.city}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PickerModal({
  kind,
  results,
  loading,
  search,
  onSearch,
  recents,
  onClose,
  onSelectAnywhere,
  onPick,
  inputRef,
}: {
  kind: 'departure' | 'destination';
  results: Airport[];
  loading: boolean;
  search: string;
  onSearch: (s: string) => void;
  recents: string[];
  onClose: () => void;
  onSelectAnywhere: () => void;
  onPick: (code: string) => void;
  inputRef: React.RefObject<HTMLInputElement>;
}) {
  const byCode: Record<string, Airport> = {};
  for (const a of results) byCode[a.code] = a;
  const recentItems = recents.map((c) => byCode[c]).filter(Boolean);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm" />
      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -8, opacity: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl rounded-3xl bg-white border border-ink/10 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div>
            <div className="label-eyebrow">SELECT</div>
            <h3 className="text-xl font-extrabold tracking-tight">
              {kind === 'departure' ? 'Departure airport' : 'Destination'}
            </h3>
          </div>
          <button
            data-testid="close-picker-btn"
            onClick={onClose}
            className="icon-btn"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-6 pb-3">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted"
            />
            <input
              ref={inputRef}
              data-testid="picker-search"
              className="input pl-11"
              placeholder={
                kind === 'departure'
                  ? 'Search city, country or IATA…'
                  : 'Search destination, country or IATA…'
              }
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              autoCapitalize="none"
              autoComplete="off"
            />
          </div>
        </div>

        <div className="max-h-[480px] overflow-auto">
          {kind === 'destination' && (
            <button
              data-testid="anywhere-option"
              onClick={onSelectAnywhere}
              className="w-full flex items-center gap-3 px-6 py-4 hover:bg-ink/[0.03] border-b border-ink/[0.05] text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-risk-lowBg flex items-center justify-center">
                <Globe2 size={16} className="text-risk-low" />
              </div>
              <div>
                <div className="font-bold text-[15px]">Anywhere</div>
                <div className="text-[12px] text-ink-muted">
                  Let the optimiser hunt globally
                </div>
              </div>
            </button>
          )}

          {!search.trim() && recentItems.length > 0 && (
            <div
              className="px-6 py-4 border-b border-ink/[0.05]"
              data-testid="picker-recent-row"
            >
              <div className="label-eyebrow mb-2">RECENT</div>
              <div className="flex flex-wrap gap-2">
                {recentItems.map((a) => (
                  <button
                    key={a.code}
                    data-testid={`recent-${a.code}`}
                    onClick={() => onPick(a.code)}
                    className="chip"
                  >
                    <span className="text-rank-value font-black tracking-wide mr-1.5">
                      {a.code}
                    </span>
                    <span className="text-ink/80">{a.city}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading && search.length > 0 && (
            <div className="px-6 py-3 text-[11px] font-bold tracking-[0.18em] text-ink-muted">
              SEARCHING…
            </div>
          )}

          {results.length === 0 && !loading ? (
            <p
              data-testid="picker-no-results"
              className="px-6 py-10 text-center text-[13px] text-ink-secondary"
            >
              No airports match &ldquo;{search}&rdquo;. Try another city, country, or IATA code.
            </p>
          ) : (
            results.map((a) => (
              <button
                key={a.code}
                data-testid={`picker-item-${a.code}`}
                onClick={() => onPick(a.code)}
                className="w-full flex items-center gap-4 px-6 py-3.5 hover:bg-ink/[0.03] text-left border-b border-ink/[0.04] last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-bold text-ink truncate">
                    {a.city}
                    {a.country ? `, ${a.country}` : ''}
                  </div>
                  <div className="text-[12px] text-ink-muted truncate">
                    {a.name || a.region || ''}
                  </div>
                </div>
                <div className="text-[12px] font-black tracking-[0.18em] text-rank-value">
                  {a.code}
                </div>
              </button>
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
