"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getDashboard } from "./api";
import type { DashboardData } from "./types";
import { ukCalendarMonth } from "../../src/domain/calendar";
import {
  dataAfterPeriodSelection,
  isLatestDashboardRequest,
} from "../../src/domain/dashboard-selection";

export function useDashboard() {
  const [claimPeriod, setClaimPeriod] = useState(ukCalendarMonth);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const requestSequence = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError("");
    try {
      const next = await getDashboard(claimPeriod);
      if (isLatestDashboardRequest(requestId, requestSequence.current)) {
        setData(next);
      }
    } catch (caught) {
      if (isLatestDashboardRequest(requestId, requestSequence.current)) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Expense data could not be loaded.",
        );
      }
    } finally {
      if (isLatestDashboardRequest(requestId, requestSequence.current)) {
        setLoading(false);
      }
    }
  }, [claimPeriod]);

  const selectClaimPeriod = useCallback((period: string) => {
    if (period === claimPeriod) return;
    requestSequence.current += 1;
    setData((current) =>
      dataAfterPeriodSelection(current, claimPeriod, period),
    );
    setLoading(true);
    setClaimPeriod(period);
  }, [claimPeriod]);

  useEffect(() => {
    queueMicrotask(() => void refresh());
  }, [refresh]);

  return {
    data,
    error,
    loading,
    refresh,
    claimPeriod,
    setClaimPeriod: selectClaimPeriod,
  };
}
