"use client";

import { useEffect, useRef, useState } from "react";
import { AppShell } from "./AppShell";
import { CaptureView } from "./CaptureView";
import { ClaimsView } from "./ClaimsView";
import { ExpensesView } from "./ExpensesView";
import { SettingsView } from "./SettingsView";
import { TodayView } from "./TodayView";
import { TripsView } from "./TripsView";
import type { ViewName } from "./types";
import { useDashboard } from "./useDashboard";
import { LoadingLedger, StatusMessage } from "./ui";

const titles: Record<ViewName, string> = {
  today: "Today",
  capture: "Capture",
  expenses: "Expenses",
  trips: "Trips",
  claims: "Claims",
  settings: "Settings",
};

export function ExpenseApp() {
  const [view, setView] = useState<ViewName>("today");
  const [status, setStatus] = useState("");
  const { data, error, loading, refresh } = useDashboard();
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("expense-tracker-theme");
    if (saved === "light" || saved === "dark") {
      document.documentElement.dataset.theme = saved;
    }
  }, []);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  function navigate(next: ViewName) {
    setView(next);
    setStatus(`${titles[next]} view opened`);
    window.scrollTo({ top: 0, behavior: "smooth" });
    requestAnimationFrame(() => document.getElementById("main-content")?.focus());
  }

  async function changed() {
    await refresh();
    setStatus("Expense data refreshed");
  }

  let content;
  if (loading && !data) {
    content = (
      <div className="view loading-view">
        <p className="eyebrow">ExpenseTracker</p>
        <h1>Opening your ledger</h1>
        <LoadingLedger />
      </div>
    );
  } else if (error && !data) {
    content = (
      <div className="view error-view" ref={errorRef} tabIndex={-1}>
        <StatusMessage tone="error">
          <strong>Your expense data could not be opened</strong>
          <p>{error}</p>
          <button className="secondary-button" type="button" onClick={() => void refresh()}>
            Try again
          </button>
        </StatusMessage>
      </div>
    );
  } else if (data) {
    const views: Record<ViewName, React.ReactNode> = {
      today: <TodayView data={data} navigate={navigate} />,
      capture: <CaptureView data={data} onSaved={changed} />,
      expenses: <ExpensesView data={data} navigate={navigate} onChanged={changed} />,
      trips: <TripsView data={data} onChanged={changed} />,
      claims: <ClaimsView data={data} navigate={navigate} onChanged={changed} />,
      settings: <SettingsView />,
    };
    content = (
      <>
        {error ? (
          <div className="stale-warning">
            <StatusMessage tone="warning">
              Showing the last loaded data. Refresh failed: {error}
              <button className="text-button" type="button" onClick={() => void refresh()}>Retry</button>
            </StatusMessage>
          </div>
        ) : null}
        {views[view]}
      </>
    );
  }

  return (
    <AppShell active={view} onNavigate={navigate} status={status}>
      {content}
    </AppShell>
  );
}
