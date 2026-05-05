import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowLeft,
  Bell,
  BellOff,
  Bookmark,
  CalendarDays,
  Hotel,
  Plane,
  Share2,
  Star,
  TrendingDown,
  TrendingUp,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import TopNav from '../components/TopNav';
import PageTransition from '../components/PageTransition';
import {
  api,
  type SavedTrip,
  type TripOption,
} from '../lib/api';
import {
  getActiveSavedId,
  getActiveTrip,
  setActiveSavedId,
  setActiveTrip,
} from '../lib/store';
import { cap, cn, fmtRange, formatGBP, pct } from '../lib/utils';
import { useAuth } from '../lib/auth';

export default function TripDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [trip, setTrip] = useState<TripOption | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [watching, setWatching] = useState<boolean>(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const t = getActiveTrip();
    if (!t || (id && t.id !== id)) {
      navigate('/results', { replace: true });
      return;
    }
    setTrip(t);
    const sid = getActiveSavedId();
    if (sid) setSavedId(sid);
  }, [id, navigate]);

  // Refresh saved status from backend
  useEffect(() => {
    (async () => {
      if (!user || !trip) return;
      try {
        const list: SavedTrip[] = await api.listTrips();
        const found = list.find((s) => s.trip.id === trip.id);
        if (found) {
          setSavedId(found.id);
          setWatching(found.is_watching);
          setActiveSavedId(found.id);
        }
      } catch {
        // ignore
      }
    })();
  }, [user, trip]);

  const chartData = useMemo(() => {
    if (!trip) return [];
    const hist = trip.price_history;
    const fc = trip.price_forecast;
    const today = new Date();
    return [
      ...hist.map((v, i) => ({
        day: -hist.length + i + 1,
        date: shiftDay(today, -hist.length + i + 1),
        price: Math.round(v),
        kind: 'history' as const,
      })),
      ...fc.map((v, i) => ({
        day: i + 1,
        date: shiftDay(today, i + 1),
        price: Math.round(v),
        kind: 'forecast' as const,
      })),
    ];
  }, [trip]);

  if (!trip) {
    return (
      <div className="h-full flex items-center justify-center text-ink-muted text-sm">
        Loading…
      </div>
    );
  }

  const onSave = async () => {
    if (!user) {
      setActiveTrip(trip);
      navigate('/login?next=/saved');
      return;
    }
    if (savedId) return;
    setBusy('save');
    try {
      const saved = await api.saveTrip(trip);
      setSavedId(saved.id);
      setActiveSavedId(saved.id);
      setWatching(saved.is_watching);
      flash('Saved');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(null);
    }
  };

  const onDelete = async () => {
    if (!savedId) return;
    setBusy('delete');
    try {
      await api.deleteTrip(savedId);
      setSavedId(null);
      setWatching(false);
      flash('Removed');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusy(null);
    }
  };

  const onWatch = async () => {
    if (!user) {
      setActiveTrip(trip);
      navigate('/login?next=/saved');
      return;
    }
    let sid = savedId;
    if (!sid) {
      // Save first, then toggle watch on
      try {
        setBusy('watch');
        const saved = await api.saveTrip(trip);
        sid = saved.id;
        setSavedId(sid);
        setActiveSavedId(sid);
      } catch (e) {
        flash(e instanceof Error ? e.message : 'Save failed');
        setBusy(null);
        return;
      }
    }
    try {
      setBusy('watch');
      const next = !watching;
      const r = await api.toggleWatch(sid, next);
      setWatching(r.is_watching);
      flash(r.is_watching ? 'Watching for price drops' : 'Stopped watching');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Watch failed');
    } finally {
      setBusy(null);
    }
  };

  const onShare = async () => {
    const text = `${cap(trip.destination_city)} from ${formatGBP(trip.total_price)} — ${fmtRange(trip.check_in, trip.check_out)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'TripOpt', text });
      } else {
        await navigator.clipboard.writeText(text);
        flash('Copied to clipboard');
      }
    } catch {
      // user cancelled
    }
  };

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const recColor =
    trip.recommendation === 'book_now'
      ? 'bg-emerald-500'
      : 'bg-amber-500';

  const verdictTitle = trip.recommendation === 'book_now' ? 'Book now' : 'Wait';
  const verdictDesc =
    trip.recommendation === 'book_now'
      ? 'Price is below median for this window. Forecast is flat or rising.'
      : 'Price is volatile and forecast suggests a likely drop. Hold a few days.';
  const TrendIcon = trip.recommendation === 'book_now' ? TrendingDown : TrendingUp;

  return (
    <PageTransition>
      <div className="min-h-screen bg-white pb-32">
        <TopNav />

        {/* Hero */}
        <section className="relative bg-navy-950 text-white overflow-hidden">
          <div className="absolute inset-0 gradient-mesh opacity-90" />
          <div className="absolute inset-0 grid-bg opacity-50" />
          <div className="relative max-w-[1280px] mx-auto px-8 py-12 lg:py-16">
            <button
              onClick={() => navigate(-1)}
              data-testid="trip-back-btn"
              className="inline-flex items-center gap-2 text-[12px] font-bold tracking-[0.16em] text-white/60 hover:text-white"
            >
              <ArrowLeft size={14} />
              BACK
            </button>

            <div className="mt-6 grid lg:grid-cols-12 gap-12 items-end">
              <div className="lg:col-span-7">
                <div className="label-eyebrow text-white/60">{trip.rank_label.toUpperCase()}</div>
                <h1 className="mt-3 text-5xl lg:text-7xl font-black tracking-[-0.04em] leading-[0.95]">
                  {cap(trip.destination_city)}
                  <span className="text-white/50">, {trip.destination_country}</span>
                </h1>
                <div className="mt-4 flex flex-wrap items-center gap-3 text-[14px]">
                  <span className="inline-flex items-center gap-2 px-3 h-8 rounded-full bg-white/10 border border-white/10">
                    <Plane size={12} /> {trip.departure}
                    <span className="text-white/40">→</span>
                    {trip.destination}
                  </span>
                  <span className="inline-flex items-center gap-2 px-3 h-8 rounded-full bg-white/10 border border-white/10">
                    <CalendarDays size={12} />
                    {fmtRange(trip.check_in, trip.check_out)} · {trip.nights}n
                  </span>
                  <span className="inline-flex items-center gap-2 px-3 h-8 rounded-full bg-white/10 border border-white/10 capitalize">
                    {trip.weather}
                  </span>
                </div>
              </div>

              <div className="lg:col-span-5 lg:text-right">
                <div className="text-[11px] font-bold tracking-[0.18em] text-white/50">
                  TOTAL TRIP COST
                </div>
                <div
                  className="mt-2 text-7xl lg:text-8xl font-black tracking-[-0.05em] leading-none bg-gradient-to-br from-white via-white to-white/60 bg-clip-text text-transparent"
                  data-testid="trip-total-price"
                >
                  {formatGBP(trip.total_price)}
                </div>
                <div className="mt-3 text-[13px] text-white/60">
                  Median for window: <span className="text-white">{formatGBP(trip.total_price + trip.savings_vs_budget)}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Verdict + chart */}
        <section className="max-w-[1280px] mx-auto px-8 -mt-12 relative z-10">
          <div className="grid lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5">
              <div className="rounded-3xl border border-ink/10 bg-white shadow-card p-7 h-full flex flex-col">
                <div className="flex items-center gap-2">
                  <div className={cn('w-2.5 h-2.5 rounded-full', recColor)} />
                  <span className="label-eyebrow">VERDICT</span>
                </div>
                <h2 className="mt-3 text-3xl font-black tracking-[-0.03em] flex items-center gap-3">
                  {verdictTitle}
                  <TrendIcon
                    size={22}
                    className={trip.recommendation === 'book_now' ? 'text-emerald-600' : 'text-amber-600'}
                  />
                </h2>
                <p className="mt-2 text-[14px] text-ink/70 leading-relaxed">{verdictDesc}</p>
                <div className="mt-5 flex items-center gap-3">
                  <div className="flex-1 h-1.5 rounded-full bg-ink/[0.06] overflow-hidden">
                    <div
                      className={cn(
                        'h-full',
                        trip.recommendation === 'book_now' ? 'bg-emerald-500' : 'bg-amber-500',
                      )}
                      style={{ width: `${pct(trip.confidence)}%` }}
                    />
                  </div>
                  <div className="text-[12px] font-bold tracking-tight">
                    {pct(trip.confidence)}% confidence
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                  <Mini label="Risk" value={`${Math.round(trip.risk_score)}/100`} />
                  <Mini label="Rating" value={trip.rating_score.toFixed(1)} />
                  <Mini label="vs budget" value={formatGBP(trip.savings_vs_budget)} />
                </div>

                <p className="mt-6 text-[13px] text-ink/65 leading-relaxed">{trip.rationale}</p>
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="rounded-3xl border border-ink/10 bg-white shadow-card p-7">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="label-eyebrow">PRICE INTELLIGENCE</div>
                    <h3 className="mt-1 text-2xl font-black tracking-tight">
                      30-day history & forecast
                    </h3>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] font-bold uppercase">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-ink" /> History
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-rank-value" /> Forecast
                    </span>
                  </div>
                </div>
                <div className="mt-4 h-[260px]" data-testid="price-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 8, left: 0, right: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="histFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0F172A" stopOpacity={0.18} />
                          <stop offset="100%" stopColor="#0F172A" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="fcFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2563EB" stopOpacity={0.22} />
                          <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="day"
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: number) => (v === 0 ? 'Today' : v < 0 ? `${v}d` : `+${v}d`)}
                        tick={{ fontSize: 11, fill: '#94A3B8' }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11, fill: '#94A3B8' }}
                        tickFormatter={(v: number) => `£${v}`}
                        width={42}
                        domain={['dataMin - 50', 'dataMax + 50']}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: '1px solid rgba(15,23,42,0.08)',
                          boxShadow: '0 8px 24px rgba(15,23,42,0.08)',
                          fontSize: 12,
                        }}
                        formatter={(value) => [`£${value}`, 'Total']}
                        labelFormatter={(label) =>
                          label === 0 ? 'Today' : label < 0 ? `${Math.abs(label)} days ago` : `${label} days ahead`
                        }
                      />
                      <Area
                        type="monotone"
                        dataKey="price"
                        data={chartData.filter((d) => d.kind === 'history')}
                        stroke="#0F172A"
                        strokeWidth={2.5}
                        fill="url(#histFill)"
                        dot={false}
                        isAnimationActive
                      />
                      <Area
                        type="monotone"
                        dataKey="price"
                        data={chartData.filter((d) => d.kind === 'forecast')}
                        stroke="#2563EB"
                        strokeWidth={2.5}
                        strokeDasharray="4 4"
                        fill="url(#fcFill)"
                        dot={false}
                        isAnimationActive
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Components: flight + hotel + why */}
        <section className="max-w-[1280px] mx-auto px-8 mt-8">
          <div className="grid lg:grid-cols-3 gap-6">
            <Component
              icon={<Plane size={18} />}
              title="Flight"
              subtitle={`${trip.flight.airline} · ${trip.flight.flight_number}`}
              price={trip.flight.price}
              meta={[
                `Depart ${trip.flight.depart_time}`,
                `Return ${trip.flight.return_time}`,
                trip.flight.stops === 0 ? 'Non-stop' : `${trip.flight.stops} stop${trip.flight.stops > 1 ? 's' : ''}`,
              ]}
              cta="Book flight"
              ctaUrl={trip.affiliate_flight_url}
              testId="flight-card"
            />
            <Component
              icon={<Hotel size={18} />}
              title="Hotel"
              subtitle={trip.hotel.name}
              price={trip.hotel.total}
              priceLabel={`${formatGBP(trip.hotel.nightly_rate)}/night`}
              meta={[
                `${trip.hotel.rating.toFixed(1)} · ${'★'.repeat(Math.round(trip.hotel.rating))}`,
                `${trip.hotel.distance_km.toFixed(1)} km from centre`,
                cap(trip.hotel.standard),
              ]}
              cta="Book hotel"
              ctaUrl={trip.affiliate_hotel_url}
              testId="hotel-card"
            />
            <div className="rounded-3xl border border-ink/10 bg-gradient-to-br from-navy-950 to-navy-900 text-white p-7 shadow-card overflow-hidden relative" data-testid="why-card">
              <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-blue-500/20 blur-3xl" />
              <div className="relative">
                <div className="flex items-center gap-2 text-white/70">
                  <Star size={16} />
                  <span className="label-eyebrow text-white/60">WHY THIS TRIP</span>
                </div>
                <h3 className="mt-3 text-2xl font-black tracking-[-0.03em]">
                  {trip.headline}
                </h3>
                <ul className="mt-5 space-y-3 text-[13.5px] text-white/75 leading-relaxed">
                  {[
                    `Total £${Math.round(trip.total_price)} for the whole trip — £${Math.round(
                      (trip.total_price / Math.max(1, trip.nights)) * 1,
                    )}/night all-in.`,
                    trip.flight.stops === 0
                      ? 'Non-stop flight from your airport.'
                      : `${trip.flight.stops} stop${trip.flight.stops > 1 ? 's' : ''}, but cheapest combo.`,
                    `${trip.hotel.rating.toFixed(1)}★ hotel only ${trip.hotel.distance_km.toFixed(1)} km from centre.`,
                    trip.recommendation === 'book_now'
                      ? `Forecast suggests prices may rise.`
                      : `Forecast suggests prices may dip — worth a watch.`,
                  ].map((line, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed left-1/2 -translate-x-1/2 bottom-32 z-40 px-5 py-3 rounded-full bg-ink text-white text-sm font-semibold shadow-cardHover"
            data-testid="trip-toast"
          >
            {toast}
          </motion.div>
        )}

        {/* Sticky bottom action bar */}
        <div className="fixed bottom-0 left-0 right-0 z-30">
          <div className="backdrop-blur-md bg-white/85 border-t border-ink/[0.08]">
            <div className="max-w-[1280px] mx-auto px-8 py-4 flex flex-wrap items-center gap-3">
              <div className="flex items-baseline gap-2 mr-2">
                <span className="text-2xl font-black tracking-[-0.03em]">{formatGBP(trip.total_price)}</span>
                <span className="text-[12px] text-ink-muted font-semibold">total</span>
              </div>
              <div className="flex-1 hidden md:block" />
              <button
                data-testid="trip-share-btn"
                onClick={onShare}
                className="icon-btn"
                aria-label="Share"
              >
                <Share2 size={16} />
              </button>
              {savedId ? (
                <button
                  data-testid="trip-remove-btn"
                  onClick={onDelete}
                  className="icon-btn text-red-500 border-red-200 hover:border-red-400"
                  aria-label="Remove"
                  disabled={busy === 'delete'}
                >
                  <Trash2 size={16} />
                </button>
              ) : (
                <button
                  data-testid="trip-save-btn"
                  onClick={onSave}
                  className="icon-btn"
                  disabled={busy === 'save'}
                  aria-label="Save"
                >
                  <Bookmark size={16} />
                </button>
              )}
              <button
                data-testid="trip-watch-btn"
                onClick={onWatch}
                disabled={busy === 'watch'}
                className={cn(
                  'inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg border text-[13px] font-bold transition-colors',
                  watching
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                    : 'bg-white border-ink/10 hover:border-ink/30',
                )}
              >
                {watching ? <Bell size={14} /> : <BellOff size={14} />}
                {watching ? 'Watching' : 'Watch price'}
              </button>
              <a
                href={trip.affiliate_flight_url}
                target="_blank"
                rel="noreferrer"
                data-testid="trip-book-flight-btn"
                className="btn-light h-11"
              >
                <Plane size={14} />
                Book flight
                <ExternalLink size={12} />
              </a>
              <a
                href={trip.affiliate_hotel_url}
                target="_blank"
                rel="noreferrer"
                data-testid="trip-book-hotel-btn"
                className="btn-primary h-11"
              >
                <Hotel size={14} />
                Book hotel
                <ExternalLink size={12} />
              </a>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}

function Component({
  icon,
  title,
  subtitle,
  price,
  priceLabel,
  meta,
  cta,
  ctaUrl,
  testId,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  price: number;
  priceLabel?: string;
  meta: string[];
  cta: string;
  ctaUrl: string;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="rounded-3xl border border-ink/10 bg-white shadow-card p-7 flex flex-col"
    >
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-lg bg-ink/[0.04] flex items-center justify-center text-ink/80">
          {icon}
        </div>
        <span className="label-eyebrow">{title.toUpperCase()}</span>
      </div>
      <h3 className="mt-3 text-xl font-black tracking-[-0.025em]">{subtitle}</h3>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-3xl font-black tracking-[-0.03em]">{formatGBP(price)}</span>
        <span className="text-[12px] text-ink-muted font-semibold">
          {priceLabel ?? 'total'}
        </span>
      </div>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {meta.map((m, i) => (
          <li
            key={i}
            className="inline-flex items-center px-2.5 h-7 rounded-full bg-ink/[0.04] text-[11.5px] font-bold text-ink/75"
          >
            {m}
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-6">
        <a
          href={ctaUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-2 w-full h-11 rounded-xl bg-ink text-white font-bold text-[13px] hover:bg-navy-800 transition-colors"
        >
          {cta}
          <ExternalLink size={13} />
        </a>
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-2.5 px-3 rounded-xl bg-ink/[0.03] border border-ink/[0.05]">
      <div className="text-[10px] font-bold tracking-[0.18em] text-ink-muted uppercase">
        {label}
      </div>
      <div className="text-[15px] font-black tracking-tight mt-0.5">{value}</div>
    </div>
  );
}

function shiftDay(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
