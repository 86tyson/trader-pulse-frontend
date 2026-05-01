import { useEffect, useState } from "react";
import {
  startLiveStatusPoller,
  subscribeLiveStatus,
  type LiveStatusSnapshot,
} from "@/lib/liveStatusStore";

// React hook over the shared /live/status singleton. Use this from any
// component that needs status data — every consumer shares the same
// 10-second poll cadence (no rate-limiter spam).
export function useLiveStatus(): LiveStatusSnapshot {
  const [snap, setSnap] = useState<LiveStatusSnapshot>({
    status: null,
    error: null,
    lastFetchAt: null,
  });
  useEffect(() => {
    startLiveStatusPoller();
    return subscribeLiveStatus(setSnap);
  }, []);
  return snap;
}
