import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Bell,
  BellOff,
  Bookmark,
  CalendarDays,
  Plane,
  Trash2,
} from 'lucide-react';
import TopNav from '../components/TopNav';
import PageTransition from '../components/PageTransition';
import { api, type SavedTrip } from '../lib/api';
import { setActiveSavedId, setActiveTrip } from '../lib/store';
import { cap, cn, fmtRange, formatGBP } from '../lib/utils';
import { useAuth } from '../lib/auth';

export default function SavedPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [trips, setTrips] = useState<SavedTrip[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate('/login?next=/saved', { replace: true });
      return;
    }
    (async () => {
      try {
        setTrips(await api.listTrips());
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      }
    })();
  }, [user, loading, navigate]);

  const onOpen = (t: SavedTrip) => {
    setActiveTrip(t.trip);
    setActiveSavedId(t.id);
    navigate(`/trip/${t.trip.id}`);
  };

  const onWatch = async (t: SavedTrip) => {
    setBusyId(t.id);
    try {
      const r = await api.toggleWatch(t.id, !t.is_watching);
      setTrips((prev) =>
        (prev ?? []).map((s) => (s.id === t.id ? { ...s, is_watching: r.is_watching } : s)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Watch failed');
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (t: SavedTrip) => {
    setBusyId(t.id);
    try {
      await api.deleteTrip(t.id);
      setTrips((prev) => (prev ?? []).filter((s) => s.id !== t.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-white">
        <TopNav />

        <section className="relative bg-navy-950 text-white overflow-hidden">
          <div className="absolute inset-0 gradient-mesh opacity-90" />
          <div className="absolute inset-0 grid-bg opacity-50" />
          <div className="relative max-w-[1280px] mx-auto px-4 md:px-8 py-8 md:py-12 lg:py-16">
            <div className="label-eyebrow text-white/60">YOUR SAVED TRIPS</div>
            <h1
              className="mt-2 md:mt-3 text-3xl md:text-5xl lg:text-6xl font-black tracking-[-0.04em] leading-[0.95]"
              data-testid="saved-headline"
            >
              Watch them. <span className="text-white/50">Or book them.</span>
            </h1>
            <p className="mt-3 md:mt-4 text-[14px] md:text-[16px] text-white/70 max-w-2xl">
              We re-check prices every 6 hours. When a watched trip drops, we ping you in Alerts.
            </p>
          </div>
        </section>

        <section className="max-w-[1280px] mx-auto px-4 md:px-8 py-8 md:py-12">
          {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

          {trips === null ? (
            <SkeletonGrid />
          ) : trips.length === 0 ? (
            <div className="rounded-3xl border border-ink/10 bg-white p-16 text-center" data-testid="empty-saved">
              <Bookmark size={28} className="mx-auto text-ink-muted" />
              <h2 className="mt-4 text-2xl font-black tracking-tight">No saved trips yet</h2>
              <p className="mt-2 text-[14px] text-ink-secondary max-w-md mx-auto">
                Optimise a trip and bookmark it from the Results screen — we&rsquo;ll watch the price.
              </p>
              <Link to="/" className="btn-primary mt-6" data-testid="empty-search-btn">
                Start a search
                <ArrowRight size={16} />
              </Link>
            </div>
          ) : (
            <div className="grid lg:grid-cols-3 md:grid-cols-2 gap-6">
              {trips.map((s, i) => (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.4 }}
                  data-testid={`saved-card-${i}`}
                  className="rounded-3xl border border-ink/10 bg-white shadow-card hover:shadow-cardHover hover:border-ink/25 transition-all overflow-hidden cursor-pointer"
                  onClick={() => onOpen(s)}
                >
                  <div className="px-6 pt-5 pb-2 flex items-center gap-2">
                    <span className="text-[10.5px] font-black tracking-[0.18em] uppercase text-ink-muted">
                      {s.trip.rank_label}
                    </span>
                    <span className="ml-auto text-[10.5px] font-bold tracking-[0.16em] text-ink-muted">
                      Saved {new Date(s.saved_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                  <div className="px-6 pb-6">
                    <div className="flex items-center gap-2 text-[12px] font-bold text-ink-muted">
                      <span>{s.trip.departure}</span>
                      <Plane size={11} />
                      <span>{s.trip.destination}</span>
                    </div>
                    <h3 className="mt-2 text-2xl font-black tracking-[-0.025em] leading-tight">
                      {cap(s.trip.destination_city)}
                      <span className="text-ink-muted font-extrabold">, {s.trip.destination_country}</span>
                    </h3>
                    <div className="mt-1 flex items-center gap-2 text-[12px] text-ink-muted">
                      <CalendarDays size={12} />
                      <span>
                        {fmtRange(s.trip.check_in, s.trip.check_out)} · {s.trip.nights}n
                      </span>
                    </div>

                    <div className="mt-5 flex items-baseline justify-between">
                      <div className="text-4xl font-black tracking-[-0.04em]">
                        {formatGBP(s.trip.total_price)}
                      </div>
                      <div
                        className={cn(
                          'text-[11px] font-bold tracking-[0.16em] uppercase',
                          s.trip.recommendation === 'book_now'
                            ? 'text-emerald-600'
                            : 'text-amber-600',
                        )}
                      >
                        {s.trip.recommendation === 'book_now' ? 'Book now' : 'Wait'}
                      </div>
                    </div>

                    <div className="mt-5 flex gap-2">
                      <button
                        data-testid={`saved-watch-${i}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onWatch(s);
                        }}
                        disabled={busyId === s.id}
                        className={cn(
                          'flex-1 inline-flex items-center justify-center gap-2 h-10 rounded-xl border text-[12.5px] font-bold transition-colors',
                          s.is_watching
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                            : 'bg-white border-ink/10 hover:border-ink/30',
                        )}
                      >
                        {s.is_watching ? <Bell size={13} /> : <BellOff size={13} />}
                        {s.is_watching ? 'Watching' : 'Watch'}
                      </button>
                      <button
                        data-testid={`saved-open-${i}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(s);
                        }}
                        className="flex-1 inline-flex items-center justify-center gap-2 h-10 rounded-xl bg-ink text-white text-[12.5px] font-bold hover:bg-navy-800"
                      >
                        Open
                        <ArrowRight size={13} />
                      </button>
                      <button
                        data-testid={`saved-delete-${i}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(s);
                        }}
                        disabled={busyId === s.id}
                        className="w-10 h-10 rounded-xl border border-red-200 text-red-500 hover:border-red-400 hover:bg-red-50 flex items-center justify-center"
                        aria-label="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </section>
      </div>
    </PageTransition>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid lg:grid-cols-3 md:grid-cols-2 gap-6">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-3xl border border-ink/[0.06] bg-white p-6 h-72 shimmer" />
      ))}
    </div>
  );
}
