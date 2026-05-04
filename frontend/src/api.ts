import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
const TOKEN_KEY = "tripopt:session_token";

export type Airport = { code: string; city: string; name: string };
export type Destination = {
  code: string; city: string; country: string;
  weather: "sun" | "city" | "both";
  base_flight: number; base_hotel: number; volatility: number;
};
export type FlightOption = {
  airline: string; airline_code: string; flight_number: string;
  depart_time: string; return_time: string; price: number; stops: number;
};
export type HotelOption = {
  name: string; rating: number; distance_km: number;
  nightly_rate: number; total: number; standard: string;
};
export type TripOption = {
  id: string;
  rank_label: "Cheapest" | "Best Value" | "Lowest Risk";
  departure: string; departure_city: string;
  destination: string; destination_city: string; destination_country: string;
  weather: string;
  check_in: string; check_out: string; nights: number;
  flight: FlightOption; hotel: HotelOption;
  total_price: number; currency: string;
  rating_score: number; risk_score: number;
  recommendation: "book_now" | "wait";
  confidence: number; rationale: string;
  headline: string; savings_vs_budget: number;
  affiliate_flight_url: string; affiliate_hotel_url: string;
  price_history: number[]; price_forecast: number[];
};
export type OptimizeResponse = {
  request_id: string; generated_at: string;
  options: TripOption[];
  searched_combinations: number; median_total: number;
};
export type SavedTrip = {
  id: string; user_id: string; saved_at: string;
  trip: TripOption;
  is_watching: boolean;
  last_seen_total?: number | null;
  last_seen_recommendation?: string | null;
};
export type OptimizeRequest = {
  departure: string; destination: string | null; budget: number;
  trip_length: number; flexibility_days: number;
  weather: "sun" | "city" | "any";
  hotel_standard: "budget" | "mid" | "any";
  start_window_days: number;
};
export type User = {
  user_id: string; email: string; name: string;
  picture: string | null;
  pro_until: string | null;
  is_pro: boolean;
  created_at: string;
};
export type AppNotification = {
  id: string; user_id: string;
  title: string; body: string;
  saved_trip_id?: string | null;
  data: Record<string, any>;
  created_at: string; read: boolean;
};

export async function setToken(t: string | null) {
  if (t) await AsyncStorage.setItem(TOKEN_KEY, t);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}
export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

async function request<T>(path: string, init?: RequestInit & { auth?: boolean }): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (init?.auth !== false) {
    const tok = await getToken();
    if (tok) headers["Authorization"] = `Bearer ${tok}`;
  }
  const res = await fetch(`${BASE}/api${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`API ${res.status}: ${text}`);
    (err as any).status = res.status;
    throw err;
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

export const api = {
  airports: () => request<{ airports: Airport[] }>("/airports", { auth: false }),
  destinations: () => request<{ destinations: Destination[] }>("/destinations", { auth: false }),
  optimize: (body: OptimizeRequest) =>
    request<OptimizeResponse>("/optimize", { method: "POST", body: JSON.stringify(body), auth: false }),
  // Auth
  exchangeSession: (session_id: string) =>
    request<{ session_token: string; user: User }>("/auth/session", {
      method: "POST", body: JSON.stringify({ session_id }), auth: false,
    }),
  me: () => request<User>("/auth/me"),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  // Trips
  saveTrip: (trip: TripOption) =>
    request<SavedTrip>("/trips/save", { method: "POST", body: JSON.stringify({ trip }) }),
  listTrips: () => request<SavedTrip[]>("/trips"),
  deleteTrip: (id: string) => request<{ deleted: string }>(`/trips/${id}`, { method: "DELETE" }),
  toggleWatch: (id: string, is_watching: boolean) =>
    request<{ id: string; is_watching: boolean }>(`/trips/${id}/watch`, {
      method: "POST", body: JSON.stringify({ is_watching }),
    }),
  // Payments
  checkout: (origin_url: string) =>
    request<{ url: string; session_id: string }>("/payments/checkout", {
      method: "POST", body: JSON.stringify({ origin_url }),
    }),
  paymentStatus: (session_id: string) =>
    request<{
      session_id: string; status: string; payment_status: string;
      amount_total: number; currency: string; credited: boolean;
      pro_until: string | null;
    }>(`/payments/status/${session_id}`),
  // Push
  registerPush: (expo_token: string, platform: string) =>
    request<{ ok: boolean }>("/push/register", {
      method: "POST", body: JSON.stringify({ expo_token, platform }),
    }),
  // Notifications
  notifications: () => request<AppNotification[]>("/notifications"),
  markRead: (id: string) =>
    request<{ ok: boolean }>(`/notifications/${id}/read`, { method: "POST" }),
};
