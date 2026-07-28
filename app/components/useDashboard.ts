"use client";

import { useCallback, useEffect, useState } from "react";
import { getDashboard } from "./api";
import type { DashboardData } from "./types";

export function useDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await getDashboard());
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Expense data could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void refresh());
  }, [refresh]);

  return { data, error, loading, refresh };
}
