import { Link, useNavigate } from 'react-router-dom';
import { Bell, Bookmark, LogOut, Sparkles } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { cn } from '../lib/utils';

export default function TopNav({
  variant = 'light',
  showNav = true,
}: {
  variant?: 'light' | 'dark';
  showNav?: boolean;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const dark = variant === 'dark';

  return (
    <header
      className={cn(
        'w-full border-b backdrop-blur-md sticky top-0 z-30',
        dark
          ? 'bg-navy-950/80 border-white/10 text-white'
          : 'bg-white/80 border-ink/[0.06] text-ink',
      )}
    >
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 h-14 md:h-16 flex items-center justify-between gap-3 md:gap-6">
        <Link to="/" className="flex items-center gap-2.5 group">
          <div
            className={cn(
              'w-9 h-9 rounded-xl flex items-center justify-center',
              dark ? 'bg-white text-navy-950' : 'bg-ink text-white',
            )}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M4 17 L12 5 L20 17 H16 L12 11 L8 17 Z" fill="currentColor" />
              <circle cx="12" cy="19" r="1.5" fill="currentColor" />
            </svg>
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-black tracking-tight text-[15px]">TripOpt</span>
            <span
              className={cn(
                'text-[9px] font-bold tracking-[0.2em] uppercase',
                dark ? 'text-white/50' : 'text-ink-muted',
              )}
            >
              {user?.is_pro ? 'Pro' : 'Optimiser'}
            </span>
          </div>
        </Link>

        {showNav && (
          <nav className="hidden md:flex items-center gap-1">
            <NavLink to="/" dark={dark}>
              Search
            </NavLink>
            {user && (
              <NavLink to="/saved" dark={dark}>
                Saved
              </NavLink>
            )}
            {user && (
              <NavLink to="/alerts" dark={dark}>
                Alerts
              </NavLink>
            )}
            <NavLink to="/upgrade" dark={dark} highlight={!user?.is_pro}>
              {user?.is_pro ? 'Pro · active' : 'Upgrade'}
            </NavLink>
          </nav>
        )}

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Link
                to="/alerts"
                data-testid="open-alerts-btn"
                className={cn(
                  'w-9 h-9 rounded-lg flex items-center justify-center transition-all',
                  dark
                    ? 'border border-white/10 hover:border-white/30 text-white/80 hover:text-white'
                    : 'border border-ink/10 hover:border-ink/30 text-ink/80 hover:text-ink',
                )}
                aria-label="Alerts"
              >
                <Bell size={16} />
              </Link>
              <Link
                to="/saved"
                data-testid="open-saved-btn"
                className={cn(
                  'w-9 h-9 rounded-lg flex items-center justify-center transition-all',
                  dark
                    ? 'border border-white/10 hover:border-white/30 text-white/80 hover:text-white'
                    : 'border border-ink/10 hover:border-ink/30 text-ink/80 hover:text-ink',
                )}
                aria-label="Saved trips"
              >
                <Bookmark size={16} />
              </Link>
              <div
                className={cn(
                  'flex items-center gap-1.5 md:gap-2.5 px-2 md:px-2.5 h-9 rounded-lg',
                  dark ? 'bg-white/5 border border-white/10' : 'bg-ink/[0.03] border border-ink/[0.08]',
                )}
                title={user.email}
              >
                {user.picture ? (
                  <img src={user.picture} alt="" className="w-6 h-6 rounded-full" />
                ) : (
                  <div
                    className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold',
                      dark ? 'bg-white text-navy-950' : 'bg-ink text-white',
                    )}
                  >
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="hidden sm:block text-[12px] font-semibold max-w-[110px] truncate">{user.name}</span>
                {user.is_pro && (
                  <Sparkles size={12} className={dark ? 'text-amber-300' : 'text-amber-500'} />
                )}
                <button
                  onClick={async () => {
                    await logout();
                    navigate('/');
                  }}
                  data-testid="logout-btn"
                  className={cn(
                    'pl-2 ml-0.5 border-l h-5 flex items-center text-[11px] font-bold tracking-wide opacity-60 hover:opacity-100 transition',
                    dark ? 'border-white/10' : 'border-ink/10',
                  )}
                  title="Sign out"
                >
                  <LogOut size={12} />
                </button>
              </div>
            </>
          ) : (
            <Link
              to="/login"
              data-testid="signin-btn"
              className={cn(
                'inline-flex items-center justify-center gap-2 h-9 px-4 rounded-lg text-[13px] font-bold tracking-tight transition-colors',
                dark
                  ? 'bg-white text-navy-950 hover:bg-white/90'
                  : 'bg-ink text-white hover:bg-navy-800',
              )}
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function NavLink({
  to,
  children,
  dark,
  highlight,
}: {
  to: string;
  children: React.ReactNode;
  dark: boolean;
  highlight?: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'px-3 h-9 inline-flex items-center rounded-lg text-[13px] font-semibold transition-colors',
        dark ? 'text-white/70 hover:text-white hover:bg-white/5' : 'text-ink/70 hover:text-ink hover:bg-ink/[0.04]',
        highlight && !dark && 'text-amber-600',
        highlight && dark && 'text-amber-300',
      )}
    >
      {children}
    </Link>
  );
}
