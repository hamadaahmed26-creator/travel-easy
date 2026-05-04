const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

if (!BASE) {
  console.warn("EXPO_PUBLIC_BACKEND_URL is not set");
}

export type Airport = { code: string; city: string; name: string };
export type Destination = {
  code: string;
  city: string;
  country: string;
  weather: "sun" | "city" | "both";
  base_flight: number;
  base_hotel: number;
  volatility: number;
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
  rank_label: "Cheapest" | "Best Value" | "Lowest Risk";
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
  recommendation: "book_now" | "wait";
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

export type SavedTrip = { id: string; saved_at: string; trip: TripOption };

export type OptimizeRequest = {
  departure: string;
  destination: string | null;
  budget: number;
  trip_length: number;
  flexibility_days: number;
  weather: "sun" | "city" | "any";
  hotel_standard: "budget" | "mid" | "any";
  start_window_days: number;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  airports: () => request<{ airports: Airport[] }>("/airports"),
  destinations: () => request<{ destinations: Destination[] }>("/destinations"),
  optimize: (body: OptimizeRequest) =>
    request<OptimizeResponse>("/optimize", { method: "POST", body: JSON.stringify(body) }),
  saveTrip: (trip: TripOption) =>
    request<SavedTrip>("/trips/save", { method: "POST", body: JSON.stringify({ trip }) }),
  listTrips: () => request<SavedTrip[]>("/trips"),
  deleteTrip: (id: string) => request<{ deleted: string }>(`/trips/${id}`, { method: "DELETE" }),
};
