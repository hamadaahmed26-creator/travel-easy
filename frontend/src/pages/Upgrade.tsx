import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Loader2, Sparkles, Zap } from 'lucide-react';
import TopNav from '../components/TopNav';
import PageTransition from '../components/PageTransition';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { cn } from '../lib/utils';

const BENEFITS = [
  'Unlimited price-drop alerts on watched trips',
  'SMS pings the moment a watched combo drops',
  'Early-window pricing on long-haul searches',
  'Personal trip history & verdict changes log',
  'Priority routing on the optimisation queue',
];

export default function UpgradePage() {
  const navigate = useNavigate();
  const { user, loading, refresh } = useAuth();
  const [params, setParams] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [pollState, setPollState] = useState<'idle' | 'polling' | 'success' | 'failed'>('idle');
  const [error, setError] = useState<string | null>(null);

  // Poll on return from Stripe via ?session_id=...
  useEffect(() => {
    const sid = params.get('session_id');
    if (!sid || pollState !== 'idle') return;
    setPollState('polling');
    let attempts = 0;
    const max = 6;
    const tick = async () => {
      attempts += 1;
      try {
        const r = await api.paymentStatus(sid);
        if (r.status === 'complete' && r.payment_status === 'paid') {
          setPollState('success');
          await refresh();
          // remove session_id from URL
          params.delete('session_id');
          setParams(params, { replace: true });
          return;
        }
        if (r.status === 'expired' || r.payment_status === 'failed') {
          setPollState('failed');
          return;
        }
      } catch {
        // network error — fall through to retry
      }
      if (attempts >= max) {
        setPollState('failed');
      } else {
        setTimeout(tick, 2000);
      }
    };
    tick();
  }, [params, setParams, pollState, refresh]);

  const onUpgrade = async () => {
    setError(null);
    if (!user) {
      navigate('/login?next=/upgrade');
      return;
    }
    setBusy(true);
    try {
      const origin = window.location.origin;
      const r = await api.checkout(origin);
      window.location.href = r.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start checkout');
      setBusy(false);
    }
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-white flex flex-col">
        <TopNav />

        <section className="relative bg-navy-950 text-white overflow-hidden">
          <div className="absolute inset-0 gradient-mesh opacity-90" />
          <div className="absolute inset-0 grid-bg opacity-50" />
          <div className="relative max-w-[1280px] mx-auto px-4 md:px-8 py-10 md:py-16 lg:py-24 grid lg:grid-cols-12 gap-8 md:gap-12 items-center">
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
                <Sparkles size={12} className="text-amber-300" />
                <span className="text-[10.5px] font-bold tracking-[0.18em] uppercase text-white/70">
                  TRIPOPT PRO
                </span>
              </div>
              <h1 className="mt-4 md:mt-6 text-4xl md:text-5xl lg:text-7xl font-black tracking-[-0.04em] leading-[0.95]">
                Beat the price.
                <br />
                <span className="bg-gradient-to-r from-amber-300 via-emerald-300 to-blue-300 bg-clip-text text-transparent">
                  Every time.
                </span>
              </h1>
              <p className="mt-4 md:mt-5 text-[14px] md:text-[16px] text-white/65 max-w-xl leading-relaxed">
                Pro adds SMS price alerts, early-window pricing, and priority routing for long-haul
                optimisation. Cancel anytime.
              </p>
              <ul className="mt-6 md:mt-8 space-y-2 md:space-y-3 text-[13px] md:text-[15px] text-white/85">
                {BENEFITS.map((b) => (
                  <li key={b} className="flex items-start gap-2 md:gap-3">
                    <span className="w-5 h-5 md:w-6 md:h-6 rounded-full bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check size={10} className="text-emerald-300" />
                    </span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="lg:col-span-5">
              <div
                className="rounded-3xl bg-white text-ink p-8 shadow-glow border border-white/10 relative overflow-hidden"
                data-testid="pricing-card"
              >
                <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-amber-200/40 blur-3xl" />
                <div className="relative">
                  <div className="label-eyebrow">MONTHLY</div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-7xl font-black tracking-[-0.05em]">£2.99</span>
                    <span className="text-ink-muted text-[14px] font-bold">/mo</span>
                  </div>
                  <p className="mt-3 text-[13px] text-ink-secondary leading-relaxed">
                    Pay once, valid for 30 days. Auto-renews on Stripe.
                  </p>

                  {pollState === 'success' && (
                    <div
                      data-testid="upgrade-success"
                      className="mt-6 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-4 flex items-center gap-3"
                    >
                      <Check size={18} className="text-emerald-600" />
                      <div>
                        <div className="text-[14px] font-extrabold text-emerald-800">
                          You’re Pro!
                        </div>
                        <div className="text-[12.5px] text-emerald-700">
                          Pro until{' '}
                          {user?.pro_until
                            ? new Date(user.pro_until).toLocaleDateString('en-GB', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })
                            : '—'}
                        </div>
                      </div>
                    </div>
                  )}

                  {pollState === 'failed' && (
                    <p className="mt-6 text-sm text-amber-600" data-testid="upgrade-failed">
                      We couldn&rsquo;t verify the payment automatically. Refresh in a moment, or try again.
                    </p>
                  )}

                  {error && <p className="mt-4 text-sm text-red-600" data-testid="upgrade-error">{error}</p>}

                  <button
                    data-testid="upgrade-cta"
                    onClick={onUpgrade}
                    disabled={busy || loading || user?.is_pro || pollState === 'polling'}
                    className={cn(
                      'mt-8 w-full inline-flex items-center justify-center gap-3 h-14 rounded-2xl font-extrabold text-[15px] tracking-tight transition-all',
                      user?.is_pro
                        ? 'bg-emerald-50 border border-emerald-300 text-emerald-700 cursor-default'
                        : 'bg-ink text-white hover:bg-navy-800 disabled:opacity-60',
                    )}
                  >
                    {pollState === 'polling' ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Verifying payment…
                      </>
                    ) : user?.is_pro ? (
                      <>
                        <Check size={16} /> Pro is active
                      </>
                    ) : busy ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Opening Stripe…
                      </>
                    ) : (
                      <>
                        <Zap size={16} />
                        Upgrade for £2.99
                      </>
                    )}
                  </button>

                  <Link
                    to="/"
                    className="mt-3 block text-center text-[12.5px] text-ink-muted hover:text-ink"
                  >
                    Maybe later
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </PageTransition>
  );
}
