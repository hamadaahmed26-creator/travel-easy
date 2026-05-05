import type { OptimizeRequest, OptimizeResponse, TripOption } from './api';

const KEY_LAST = 'tripopt:last_results';
const KEY_REQ = 'tripopt:last_request';
export const ACTIVE_KEY = 'tripopt:active_trip';
export const ACTIVE_SAVED_KEY = 'tripopt:active_saved_id';
const RECENT_DEP_KEY = 'tripopt:recent_departures';
const RECENT_DEST_KEY = 'tripopt:recent_destinations';
const MAX_RECENT = 5;

export function persistResults(req: OptimizeRequest, res: OptimizeResponse) {
  localStorage.setItem(KEY_LAST, JSON.stringify(res));
  localStorage.setItem(KEY_REQ, JSON.stringify(req));
}

export function loadResults(): {
  request: OptimizeRequest | null;
  response: OptimizeResponse | null;
} {
  const r = localStorage.getItem(KEY_REQ);
  const q = localStorage.getItem(KEY_LAST);
  return {
    request: r ? (JSON.parse(r) as OptimizeRequest) : null,
    response: q ? (JSON.parse(q) as OptimizeResponse) : null,
  };
}

export function setActiveTrip(t: TripOption) {
  localStorage.setItem(ACTIVE_KEY, JSON.stringify(t));
}
export function getActiveTrip(): TripOption | null {
  const raw = localStorage.getItem(ACTIVE_KEY);
  return raw ? (JSON.parse(raw) as TripOption) : null;
}
export function setActiveSavedId(id: string) {
  localStorage.setItem(ACTIVE_SAVED_KEY, id);
}
export function getActiveSavedId(): string | null {
  return localStorage.getItem(ACTIVE_SAVED_KEY);
}

export function pushRecent(kind: 'departure' | 'destination', code: string) {
  const key = kind === 'departure' ? RECENT_DEP_KEY : RECENT_DEST_KEY;
  const raw = localStorage.getItem(key);
  const list: string[] = raw ? JSON.parse(raw) : [];
  const next = [code, ...list.filter((c) => c !== code)].slice(0, MAX_RECENT);
  localStorage.setItem(key, JSON.stringify(next));
}

export function loadRecent(kind: 'departure' | 'destination'): string[] {
  const key = kind === 'departure' ? RECENT_DEP_KEY : RECENT_DEST_KEY;
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : [];
}
