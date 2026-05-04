import AsyncStorage from "@react-native-async-storage/async-storage";
import type { OptimizeResponse, OptimizeRequest } from "./api";

const KEY_LAST = "tripopt:last_results";
const KEY_REQ = "tripopt:last_request";

export async function persistResults(req: OptimizeRequest, res: OptimizeResponse) {
  await AsyncStorage.multiSet([
    [KEY_LAST, JSON.stringify(res)],
    [KEY_REQ, JSON.stringify(req)],
  ]);
}

export async function loadResults(): Promise<{
  request: OptimizeRequest | null;
  response: OptimizeResponse | null;
}> {
  const [[, r], [, q]] = await AsyncStorage.multiGet([KEY_REQ, KEY_LAST]);
  return {
    request: r ? (JSON.parse(r) as OptimizeRequest) : null,
    response: q ? (JSON.parse(q) as OptimizeResponse) : null,
  };
}
