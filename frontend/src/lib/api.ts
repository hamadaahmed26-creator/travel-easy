// API client — talks to FastAPI backend at /api via the same origin (ingress proxies /api/* to port 8001).
// Falls back to VITE_BACKEND_URL or current origin so it works in dev/preview/production identically.

const BACKEND_URL =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ||
  (typeof window !== 'undefined' ? window.location.origin : '');
const API_BASE = `${BACKEND_URL.replace(/\/$/, '')}/api`;
const TOKEN_KEY = 'tripopt:session_token';

export type Airport = {
  code: string;
  city: string;
  country?: string;
  country_name?: string;
  name: string;
  lat?: number;
  lng?: number;
  region?: string;
  is_large?: boolean;
  is_city_group?: boolean;
};
export type Destination = {
  code: string;
  city: string;
  country: string;
  weather: 'sun' | 'city' | 'both';
  base_hotel: number;
  volatility: number;
  lat: number;
  lng: number;
  region: string;
};
export type FlightOption = {
  airline: string;
  airline_code: string;
  flight_number: string;
  depart_time: string;
  return_time: string;
  price: number;
  stops: number;
};
export type HotelOption = {
  name: string;
  rating: number;
  distance_km: number;
  nightly_rate: number;
  total: number;
  standard: string;
};
export type TripOption = {
  id: string;
  rank_label: 'Cheapest' | 'Best Value' | 'Lowest Risk';
  departure: string;
  departure_city: string;
  destination: string;
  destination_city: string;
  destination_country: string;
  weather: string;
  check_in: string;
  check_out: string;
  nights: number;
  flight: FlightOption;
  hotel: HotelOption;
  total_price: number;
  currency: string;
  rating_score: number;
  risk_score: number;
  recommendation: 'book_now' | 'wait';
  confidence: number;
  rationale: string;
  headline: string;
  savings_vs_budget: number;
  affiliate_flight_url: string;
  affiliate_hotel_url: string;
  price_history: number[];
  price_forecast: number[];
};
export type OptimizeResponse = {
  request_id: string;
  generated_at: string;
  options: TripOption[];
  searched_combinations: number;
  median_total: number;
};
export type SavedTrip = {
  id: string;
  user_id: string;
  saved_at: string;
  trip: TripOption;
  is_watching: boolean;
  last_seen_total?: number | null;
  last_seen_recommendation?: string | null;
};
export type OptimizeRequest = {
  departure: string;
  destination: string | null;
  budget: number;
  trip_length: number;
  flexibility_days: number;
  weather: 'sun' | 'city' | 'any';
  hotel_standard: 'budget' | 'mid' | 'any';
  start_window_days: number;
};
export type User = {
  user_id: string;
  email: string;
  name: string;
  picture: string | null;
  pro_until: string | null;
  is_pro: boolean;
  created_at: string;
};
export type AppNotification = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  saved_trip_id?: string | null;
  data: Record<string, unknown>;
  created_at: string;
  read: boolean;
};

export function setToken(t: string | null) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

async function request<T>(
  path: string,
  init?: RequestInit & { auth?: boolean },
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (init?.auth !== false) {
    const tok = getToken();
    if (tok) headers['Authorization'] = `Bearer ${tok}`;
  }
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`API ${res.status}: ${text}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

export const api = {
  airports: () => request<{ airports: Airport[] }>('/airports', { auth: false }),
  destinations: () =>
    request<{ destinations: Destination[] }>('/destinations', { auth: false }),
  searchAirports: (q: string, limit = 40) =>
    request<{ results: Airport[] }>(
      `/airports/search?q=${encodeURIComponent(q)}&limit=${limit}`,
      { auth: false },
    ),
  optimize: (body: OptimizeRequest) =>
    request<OptimizeResponse>('/optimize', {
      method: 'POST',
      body: JSON.stringify(body),
      auth: false,
    }),
  exchangeSession: (session_id: string) =>
    request<{ session_token: string; user: User }>('/auth/session', {
      method: 'POST',
      body: JSON.stringify({ session_id }),
      auth: false,
    }),
  me: () => request<User>('/auth/me'),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  saveTrip: (trip: TripOption) =>
    request<SavedTrip>('/trips/save', {
      method: 'POST',
      body: JSON.stringify({ trip }),
    }),
  listTrips: () => request<SavedTrip[]>('/trips'),
  deleteTrip: (id: string) =>
    request<{ deleted: string }>(`/trips/${id}`, { method: 'DELETE' }),
  toggleWatch: (id: string, is_watching: boolean) =>
    request<{ id: string; is_watching: boolean }>(`/trips/${id}/watch`, {
      method: 'POST',
      body: JSON.stringify({ is_watching }),
    }),
  checkout: (origin_url: string) =>
    request<{ url: string; session_id: string }>('/payments/checkout', {
      method: 'POST',
      body: JSON.stringify({ origin_url }),
    }),
  paymentStatus: (session_id: string) =>
    request<{
      session_id: string;
      status: string;
      payment_status: string;
      amount_total: number;
      currency: string;
      credited: boolean;
      pro_until: string | null;
    }>(`/payments/status/${session_id}`),
  notifications: () => request<AppNotification[]>('/notifications'),
  markRead: (id: string) =>
    request<{ ok: boolean }>(`/notifications/${id}/read`, { method: 'POST' }),
};
