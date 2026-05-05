import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2 } from 'lucide-react';
import TopNav from '../components/TopNav';
import PageTransition from '../components/PageTransition';
import { api, type OptimizeRequest } from '../lib/api';
import { persistResults } from '../lib/store';

const STAGES = [
  'Pulling flight prices…',
  'Pulling hotel rates…',
  'Aligning dates across the window…',
  'Calculating combined trip totals…',
  'Scoring volatility & risk…',
  'Building your trip portfolio…',
];

export default function LoadingPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setStage((s) => (s + 1) % STAGES.length), 700);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const reqStr = params.get('req');
    (async () => {
      try {
        if (!reqStr) throw new Error('Missing request');
        const parsed = JSON.parse(reqStr) as OptimizeRequest;
        const start = Date.now();
        const result = await api.optimize(parsed);
        const elapsed = Date.now() - start;
        if (elapsed < 2200) await new Promise((r) => setTimeout(r, 2200 - elapsed));
        persistResults(parsed, result);
        navigate('/results', { replace: true });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to optimise');
      }
    })();
  }, [params, navigate]);

  return (
    <PageTransition>
      <div className="min-h-screen flex flex-col bg-navy-950 text-white" data-testid="loading-screen">
        <div className="relative">
          <div className="absolute inset-0 gradient-mesh opacity-90" />
          <div className="absolute inset-0 grid-bg opacity-60" />
          <div className="relative">
            <TopNav variant="dark" showNav={false} />
          </div>
        </div>

        <div className="relative flex-1 flex items-center justify-center px-6">
          <div className="absolute inset-0 gradient-mesh opacity-70" />
          <div className="relative max-w-3xl w-full">
            <div className="label-eyebrow text-white/60">OPTIMISING TRIP PORTFOLIO</div>
            <div className="mt-4 flex items-baseline">
              <motion.div
                key={stage}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="text-[120px] lg:text-[180px] font-black tracking-[-0.06em] leading-[0.85] bg-gradient-to-br from-white via-white to-white/40 bg-clip-text text-transparent"
                data-testid="loading-counter"
              >
                {String(stage + 1).padStart(2, '0')}
              </motion.div>
              <span className="text-5xl lg:text-7xl font-black text-white/30 ml-3">
                /{String(STAGES.length).padStart(2, '0')}
              </span>
            </div>

            <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur p-6 space-y-4">
              {STAGES.map((s, i) => {
                const active = i === stage;
                const done = i < stage;
                return (
                  <div
                    key={s}
                    className="flex items-center gap-4"
                    data-testid={active ? 'active-stage' : undefined}
                  >
                    <div
                      className={
                        'w-2.5 h-2.5 rounded-full ' +
                        (active ? 'bg-white' : done ? 'bg-emerald-400' : 'bg-white/15')
                      }
                    />
                    <div
                      className={
                        'text-[14.5px] ' +
                        (active
                          ? 'text-white font-bold'
                          : done
                            ? 'text-white/50'
                            : 'text-white/40')
                      }
                    >
                      {s}
                    </div>
                  </div>
                );
              })}
            </div>

            {error ? (
              <div className="mt-8 flex flex-col items-start gap-3">
                <p className="text-red-300 text-sm" data-testid="loading-error">
                  {error}
                </p>
                <button
                  data-testid="back-to-search-btn"
                  onClick={() => navigate('/', { replace: true })}
                  className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-white text-navy-950 font-bold text-sm hover:bg-white/90"
                >
                  <ArrowLeft size={16} />
                  Back to search
                </button>
              </div>
            ) : (
              <div className="mt-8 flex items-center gap-3 text-white/50 text-[13px]">
                <Loader2 size={16} className="animate-spin" />
                Crunching numbers… a portfolio is forming.
              </div>
            )}
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
