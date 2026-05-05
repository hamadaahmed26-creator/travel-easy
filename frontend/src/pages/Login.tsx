import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Loader2, Lock, Sparkles } from 'lucide-react';
import TopNav from '../components/TopNav';
import PageTransition from '../components/PageTransition';
import { api, setToken } from '../lib/api';
import { useAuth } from '../lib/auth';

export default function LoginPage() {
  const { setUser, refresh } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/saved';
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'redirecting' | 'exchanging'>('idle');

  useEffect(() => {
    // Handle Emergent OAuth redirect: app receives #session_id=...
    if (typeof window !== 'undefined' && window.location.hash.includes('session_id=')) {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const sid = params.get('session_id');
      if (!sid) return;
      setPhase('exchanging');
      (async () => {
        try {
          const r = await api.exchangeSession(sid);
          setToken(r.session_token);
          setUser(r.user);
          window.history.replaceState({}, '', window.location.pathname);
          await refresh();
          navigate(next, { replace: true });
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Sign in failed');
          setPhase('idle');
        }
      })();
    }
  }, [navigate, next, refresh, setUser]);

  const onSignIn = () => {
    setError(null);
    setPhase('redirecting');
    const here = window.location.origin + '/login?next=' + encodeURIComponent(next);
    const url =
      'https://auth.emergentagent.com/?redirect=' + encodeURIComponent(here);
    window.location.href = url;
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-white flex flex-col">
        <TopNav />
        <main className="flex-1 grid lg:grid-cols-2">
          <section className="relative hidden lg:flex items-center justify-center bg-navy-950 text-white overflow-hidden">
            <div className="absolute inset-0 gradient-mesh opacity-90" />
            <div className="absolute inset-0 grid-bg opacity-50" />
            <div className="relative max-w-md px-12">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
                <Sparkles size={12} className="text-amber-300" />
                <span className="text-[10.5px] font-bold tracking-[0.18em] uppercase text-white/70">
                  Sign in to TripOpt
                </span>
              </div>
              <h1 className="mt-6 text-5xl font-black tracking-[-0.04em] leading-[0.95]">
                Save trips.
                <br />
                <span className="bg-gradient-to-r from-blue-300 to-emerald-300 bg-clip-text text-transparent">
                  Watch prices.
                </span>
              </h1>
              <p className="mt-5 text-[15px] text-white/65 leading-relaxed">
                We re-check your watched trips every 6 hours and ping you when the combined cost
                drops below your last seen price.
              </p>
              <ul className="mt-8 space-y-3 text-[14px] text-white/70">
                {[
                  'Save unlimited trips.',
                  'Get alerts on price drops & verdict changes.',
                  'Upgrade to Pro for SMS + early-window pricing (£2.99 / month).',
                ].map((line) => (
                  <li key={line} className="flex gap-3">
                    <span className="mt-2 w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="flex items-center justify-center px-6 py-16">
            <div className="w-full max-w-md">
              <div className="label-eyebrow">SIGN IN</div>
              <h2 className="mt-2 text-4xl font-black tracking-[-0.04em]">
                Continue with Google
              </h2>
              <p className="mt-3 text-[14px] text-ink-secondary leading-relaxed">
                One click. No password to remember. We use Emergent Auth which is the same flow used by leading
                travel apps.
              </p>

              <button
                data-testid="google-signin-btn"
                onClick={onSignIn}
                disabled={phase !== 'idle'}
                className="mt-8 w-full inline-flex items-center justify-center gap-3 h-14 rounded-2xl bg-ink text-white font-bold text-[15px] tracking-tight hover:bg-navy-800 transition-colors disabled:opacity-60"
              >
                {phase === 'idle' && (
                  <>
                    <GoogleIcon />
                    Continue with Google
                    <ArrowRight size={16} />
                  </>
                )}
                {phase === 'redirecting' && (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Redirecting to Google…
                  </>
                )}
                {phase === 'exchanging' && (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Signing you in…
                  </>
                )}
              </button>

              {error && (
                <p className="mt-4 text-sm text-red-600" data-testid="login-error">
                  {error}
                </p>
              )}

              <div className="mt-8 flex items-center gap-2 text-[12px] text-ink-muted">
                <Lock size={12} />
                Your token is stored locally and only sent to TripOpt API.
              </div>
            </div>
          </section>
        </main>
      </div>
    </PageTransition>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#FFFFFF"
        d="M21.6 12.227c0-.69-.062-1.36-.18-2H12v3.83h5.41c-.234 1.244-.94 2.298-2 3.005v2.5h3.232c1.892-1.745 2.958-4.31 2.958-7.335z"
      />
      <path
        fill="#34D399"
        d="M12 22c2.7 0 4.965-.895 6.62-2.438l-3.232-2.5c-.895.6-2.04.955-3.388.955-2.605 0-4.81-1.76-5.598-4.122H3.062v2.59A9.99 9.99 0 0 0 12 22z"
      />
      <path
        fill="#FBBF24"
        d="M6.402 13.895c-.2-.6-.314-1.24-.314-1.895 0-.655.114-1.295.314-1.895V7.515H3.062A10 10 0 0 0 2 12c0 1.61.385 3.13 1.062 4.485l3.34-2.59z"
      />
      <path
        fill="#EF4444"
        d="M12 5.985c1.467 0 2.785.505 3.82 1.49l2.866-2.866C16.96 3.085 14.695 2 12 2A9.99 9.99 0 0 0 3.062 7.515l3.34 2.59C7.19 7.745 9.395 5.985 12 5.985z"
      />
    </svg>
  );
}
