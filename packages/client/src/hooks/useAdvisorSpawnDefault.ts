import { useEffect, useState } from "react";
import { fetchOmpConfig } from "../lib/omp-config-api.js";

/** Mirrors the server-owned advisor setting without blocking local spawning. */
export function useAdvisorSpawnDefault(): boolean {
  const [advisorDefault, setAdvisorDefault] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchOmpConfig()
      .then((snapshot) => {
        if (!cancelled) setAdvisorDefault(snapshot.settings["advisor.enabled"]?.value === true);
      })
      .catch(() => {
        // An unavailable mirror must not block spawning; false is the safe default.
      });
    return () => { cancelled = true; };
  }, []);

  return advisorDefault;
}
