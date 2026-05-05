import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  CalendarDays,
  Plane,
  ShieldCheck,
  TrendingDown,
  Trophy,
} from 'lucide-react';
import TopNav from '../components/TopNav';
import PageTransition from '../components/PageTransition';
import { api, type OptimizeResponse, type SavedTrip, type TripOption } from '../lib/api';
import {
  loadResults,
  setActiveSavedId,
  setActiveTrip,
} from '../lib/store';
import { cap, cn, fmtRange, formatGBP } from '../lib/utils';
import { useAuth } from '../lib/auth';

const rankIcon: Record<TripOption['rank_label'], React.ComponentType<{ size?: number; className?: string }>> = {
  Cheapest: TrendingDown,
  'Best Value': Trophy,
  'Lowest Risk': ShieldCheck,
};

const rankColor: Record<TripOption['rank_label'], { dot: string; text: string; bg: string; ring: string }> = {
  Cheapest: {
    dot: 'bg-rank-cheap',
    text: 'text-rank-cheap',
    bg: 'bg-ink/[0.04]',
    ring: 'ring-ink/15',
  },
  'Best Value': {
    dot: 'bg-rank-value',
    text: 'text-rank-value',
    bg: 'bg-blue-50',
    ring: 'ring-rank-value/30',
  },
  'Lowest Risk': {
    dot: 'bg-rank-risk',
    text: 'text-rank-risk',
    bg: 'bg-emerald-50',
    ring: 'ring-rank-risk/30',
  },
};

export default function ResultsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [response, setResponse] = useState<OptimizeResponse | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Record<string, string>>({}); // tripId -> savedId
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { response: res } = loadResults();
    if (!res || res.options.length === 0) {
      navigate('/', { replace: true });
      return;
    }
    setResponse(res);
  }, [navigate]);

  useEffect(() => {
    (async () => {
      if (!user) return;
      try {
        const list: SavedTrip[] = await api.listTrips();
        const map: Record<string, string> = {};
        for (const s of list) map[s.trip.id] = s.id;
        setSavedIds(map);
      } catch {
        // ignore — will retry on save
      }
    })();
  }, [user]);

  const headline = useMemo(() => {
    if (!response) return null;
    const cheapest = response.options.find((o) => o.rank_label === 'Cheapest');
    return cheapest;
  }, [response]);

  if (!response) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-ink-muted text-sm">Loading…</div>
      </div>
    );
  }

  const onOpen = (t: TripOption) => {
    setActiveTrip(t);
    const sid = savedIds[t.id];
    if (sid) setActiveSavedId(sid);
    else localStorage.removeItem('tripopt:active_saved_id');
    navigate(`/trip/${t.id}`);
  };

  const onSave = async (t: TripOption) => {
    if (!user) {
      setActiveTrip(t);
      navigate('/login?next=/saved');
      return;
    }
    if (savedIds[t.id]) return;
    setSavingId(t.id);
    try {
      const saved = await api.saveTrip(t);
      setSavedIds((prev) => ({ ...prev, [t.id]: saved.id }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-white">
        <TopNav />

        {/* Verdict banner */}
        <section className="relative bg-navy-950 text-white overflow-hidden">
          <div className="absolute inset-0 gradient-mesh opacity-90" />
          <div className="absolute inset-0 grid-bg opacity-40" />
          <div className="relative max-w-[1280px] mx-auto px-4 md:px-8 py-8 md:py-12 lg:py-16">
            <button
              data-testid="results-back-btn"
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-2 text-[12px] font-bold tracking-[0.16em] text-white/60 hover:text-white transition-colors"
            >
              <ArrowLeft size={14} />
              EDIT SEARCH
            </button>
            <div className="mt-4 md:mt-6 grid lg:grid-cols-12 gap-6 md:gap-10 items-end">
              <div className="lg:col-span-7">
                <div className="label-eyebrow text-white/60">YOUR PORTFOLIO</div>
                <h1
                  className="mt-2 md:mt-3 text-3xl md:text-4xl lg:text-6xl font-black tracking-[-0.04em] leading-[0.96]"
                  data-testid="results-headline"
                >
                  {headline ? (
                    <>
                      {cap(headline.destination_city)}, {headline.destination_country}{' '}
                      <span className="bg-gradient-to-r from-emerald-300 to-blue-300 bg-clip-text text-transparent">
                        from {formatGBP(headline.total_price)}
                      </span>
                    </>
                  ) : (
                    'Trip portfolio ready.'
                  )}
                </h1>
                {headline && (
                  <p className="mt-3 md:mt-4 text-[14px] md:text-[16px] text-white/70 max-w-2xl leading-relaxed">
                    {headline.headline}
                  </p>
                )}
              </div>
              <div className="lg:col-span-5 grid grid-cols-3 gap-2 md:gap-3">
                <BannerStat
                  label="COMBOS"
                  value={response.searched_combinations.toLocaleString()}
                />
                <BannerStat label="MEDIAN" value={formatGBP(response.median_total)} />
                <BannerStat label="OPTIONS" value={response.options.length.toString()} />
              </div>
            </div>
          </div>
        </section>

        {/* Trip cards */}
        <section className="max-w-[1280px] mx-auto px-4 md:px-8 py-8 md:py-12 lg:py-16">
          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {response.options.map((o, i) => (
              <TripCard
                key={o.id}
                option={o}
                index={i}
                onOpen={() => onOpen(o)}
                onSave={() => onSave(o)}
                isSaved={!!savedIds[o.id]}
                saving={savingId === o.id}
              />
            ))}
          </div>

          <div className="mt-12 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
            <p className="text-[12px] text-ink-muted max-w-xl">
              Prices are realistic estimates pulled across {response.searched_combinations.toLocaleString()}{' '}
              flight + hotel combos. Booking opens the affiliate site in a new tab.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => navigate('/')}
                className="btn-light"
                data-testid="new-search-btn"
              >
                <ArrowLeft size={16} />
                New search
              </button>
              {user && (
                <button
                  onClick={() => navigate('/saved')}
                  className="btn-primary"
                  data-testid="go-saved-btn"
                >
                  Saved trips
                  <ArrowRight size={16} />
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
    </PageTransition>
  );
}

function BannerStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur px-4 py-4">
      <div className="text-[10px] font-bold tracking-[0.18em] text-white/50">{label}</div>
      <div className="text-2xl font-black tracking-tight mt-1">{value}</div>
    </div>
  );
}

function TripCard({
  option,
  index,
  onOpen,
  onSave,
  isSaved,
  saving,
}: {
  option: TripOption;
  index: number;
  onOpen: () => void;
  onSave: () => void;
  isSaved: boolean;
  saving: boolean;
}) {
  const Icon = rankIcon[option.rank_label];
  const colors = rankColor[option.rank_label];

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
      data-testid={`trip-card-${index}`}
      className="group relative rounded-3xl border border-ink/10 bg-white shadow-card hover:shadow-cardHover hover:border-ink/25 transition-all overflow-hidden cursor-pointer"
      onClick={onOpen}
    >
      {/* Rank header */}
      <div className={cn('px-6 pt-6 pb-4 flex items-center gap-2', colors.bg)}>
        <div className="flex items-center gap-2">
          <Icon size={14} className={colors.text} />
          <span
            className={cn(
              'text-[10.5px] font-black tracking-[0.18em] uppercase',
              colors.text,
            )}
          >
            {option.rank_label}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <div
            className={cn(
              'h-2 w-2 rounded-full',
              option.recommendation === 'book_now' ? 'bg-buy' : 'bg-wait',
            )}
          />
          <span className="text-[10.5px] font-bold tracking-[0.16em] text-ink/60 uppercase">
            {option.recommendation === 'book_now' ? 'Book now' : 'Wait'}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="px-6 pt-5 pb-6">
        <div className="flex items-center gap-2 text-[12px] font-bold text-ink-muted">
          <span>{option.departure}</span>
          <Plane size={11} />
          <span>{option.destination}</span>
        </div>
        <h3 className="mt-2 text-2xl font-black tracking-[-0.025em] leading-tight">
          {cap(option.destination_city)}
          <span className="text-ink-muted font-extrabold">, {option.destination_country}</span>
        </h3>

        <div className="mt-1 flex items-center gap-2 text-[12px] text-ink-muted">
          <CalendarDays size={12} />
          <span>
            {fmtRange(option.check_in, option.check_out)} · {option.nights} nights
          </span>
        </div>

        <div className="mt-6 flex items-baseline gap-2">
          <span
            className="text-5xl font-black tracking-[-0.04em]"
            data-testid={`trip-card-${option.id}-total`}
          >
            {formatGBP(option.total_price)}
          </span>
          <span className="text-[12px] text-ink-muted font-semibold">total</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Pill>£{Math.round(option.flight.price)} flight</Pill>
          <Pill>£{Math.round(option.hotel.total)} hotel</Pill>
          <Pill subtle>
            {option.flight.airline} · {option.flight.stops === 0 ? 'Non-stop' : `${option.flight.stops} stop`}
          </Pill>
        </div>

        <p className="mt-5 text-[13px] text-ink/70 leading-relaxed line-clamp-3">
          {option.rationale}
        </p>

        <div className="mt-6 flex gap-2">
          <button
            data-testid={`trip-${index}-open-btn`}
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            className="flex-1 inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-ink text-white font-bold text-[13px] hover:bg-navy-800 transition-colors"
          >
            See trip
            <ArrowRight size={14} />
          </button>
          <button
            data-testid={`trip-${index}-save-btn`}
            onClick={(e) => {
              e.stopPropagation();
              onSave();
            }}
            disabled={saving || isSaved}
            className={cn(
              'inline-flex items-center justify-center w-11 h-11 rounded-xl border transition-colors',
              isSaved
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                : 'bg-white border-ink/10 hover:border-ink/30 text-ink',
              saving && 'opacity-60',
            )}
            aria-label={isSaved ? 'Saved' : 'Save trip'}
          >
            <Bookmark size={16} fill={isSaved ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function Pill({
  children,
  subtle,
}: {
  children: React.ReactNode;
  subtle?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 h-7 rounded-full text-[11px] font-bold',
        subtle
          ? 'bg-ink/[0.04] text-ink/70'
          : 'bg-ink text-white',
      )}
    >
      {children}
    </span>
  );
}
