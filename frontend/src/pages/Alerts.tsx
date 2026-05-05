import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ChevronRight, Inbox } from 'lucide-react';
import TopNav from '../components/TopNav';
import PageTransition from '../components/PageTransition';
import { api, type AppNotification, type SavedTrip } from '../lib/api';
import { setActiveSavedId, setActiveTrip } from '../lib/store';
import { useAuth } from '../lib/auth';
import { cn } from '../lib/utils';

export default function AlertsPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate('/login?next=/alerts', { replace: true });
      return;
    }
    (async () => {
      try {
        setItems(await api.notifications());
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      }
    })();
  }, [user, loading, navigate]);

  const onOpen = async (n: AppNotification) => {
    if (!n.read) {
      try {
        await api.markRead(n.id);
        setItems((prev) =>
          (prev ?? []).map((m) => (m.id === n.id ? { ...m, read: true } : m)),
        );
      } catch {
        // ignore
      }
    }
    if (n.saved_trip_id) {
      try {
        const list: SavedTrip[] = await api.listTrips();
        const found = list.find((s) => s.id === n.saved_trip_id);
        if (found) {
          setActiveTrip(found.trip);
          setActiveSavedId(found.id);
          navigate(`/trip/${found.trip.id}`);
          return;
        }
      } catch {
        // fall through
      }
    }
    navigate('/saved');
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-white">
        <TopNav />

        <section className="relative bg-navy-950 text-white overflow-hidden">
          <div className="absolute inset-0 gradient-mesh opacity-90" />
          <div className="absolute inset-0 grid-bg opacity-50" />
          <div className="relative max-w-[1280px] mx-auto px-4 md:px-8 py-8 md:py-12 lg:py-16">
            <div className="label-eyebrow text-white/60">PRICE WATCH · INBOX</div>
            <h1 className="mt-2 md:mt-3 text-3xl md:text-5xl lg:text-6xl font-black tracking-[-0.04em] leading-[0.95]" data-testid="alerts-headline">
              Alerts
            </h1>
            <p className="mt-3 md:mt-4 text-[14px] md:text-[16px] text-white/70 max-w-2xl">
              We notify you when watched trips drop, change recommendation, or hit your budget.
            </p>
          </div>
        </section>

        <section className="max-w-[1280px] mx-auto px-4 md:px-8 py-8 md:py-12">
          {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

          {items === null ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-20 rounded-2xl shimmer" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-3xl border border-ink/10 bg-white p-16 text-center" data-testid="empty-alerts">
              <Inbox size={28} className="mx-auto text-ink-muted" />
              <h2 className="mt-4 text-2xl font-black tracking-tight">No alerts yet</h2>
              <p className="mt-2 text-[14px] text-ink-secondary max-w-md mx-auto">
                Save a trip and switch on Watch — we’ll ping you on price drops.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {items.map((n, i) => (
                <li
                  key={n.id}
                  data-testid={`alert-${i}`}
                  className={cn(
                    'rounded-2xl border bg-white px-6 py-5 flex items-start gap-4 cursor-pointer transition-all',
                    n.read
                      ? 'border-ink/10 hover:border-ink/20'
                      : 'border-rank-value/30 bg-rank-value/[0.02] hover:border-rank-value/60',
                  )}
                  onClick={() => onOpen(n)}
                >
                  <div
                    className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                      n.read ? 'bg-ink/[0.05] text-ink/60' : 'bg-rank-value text-white',
                    )}
                  >
                    <Bell size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="text-[15px] font-extrabold tracking-tight">{n.title}</h3>
                      <span className="text-[11px] text-ink-muted font-semibold whitespace-nowrap">
                        {new Date(n.created_at).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    </div>
                    <p className="mt-1 text-[13.5px] text-ink/70 leading-relaxed">{n.body}</p>
                  </div>
                  <ChevronRight size={16} className="text-ink-muted self-center flex-shrink-0" />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PageTransition>
  );
}
