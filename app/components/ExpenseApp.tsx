"use client";

import { useEffect, useRef, useState } from "react";
import { AppShell } from "./AppShell";
import { CalendarView } from "./CalendarView";
import { CaptureView } from "./CaptureView";
import { ClaimsView } from "./ClaimsView";
import { ExpenseEditor } from "./ExpenseEditor";
import { ExpensesView } from "./ExpensesView";
import { SettingsView } from "./SettingsView";
import { TodayView } from "./TodayView";
import { TripsView } from "./TripsView";
import type { Expense, ViewName } from "./types";
import { useDashboard } from "./useDashboard";
import { LoadingLedger, StatusMessage } from "./ui";

const titles: Record<ViewName, string> = {
  today: "Today",
  capture: "Capture",
  calendar: "Calendar",
  expenses: "Expenses",
  trips: "Trips",
  claims: "Claims",
  settings: "Settings",
};

const viewNames = new Set<ViewName>(Object.keys(titles) as ViewName[]);

export function ExpenseApp() {
  const [view, setView] = useState<ViewName>("capture");
  const [captureDate, setCaptureDate] = useState("");
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
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
    function syncViewFromLocation() {
      const hash = window.location.hash.slice(1) as ViewName;
      if (viewNames.has(hash)) {
        setView(hash);
        setSelectedExpense(null);
        setCaptureDate(
          hash === "capture" &&
            typeof window.history.state?.captureDate === "string"
            ? window.history.state.captureDate
            : "",
        );
      }
    }
    syncViewFromLocation();
    window.addEventListener("popstate", syncViewFromLocation);
    window.addEventListener("hashchange", syncViewFromLocation);
    return () => {
      window.removeEventListener("popstate", syncViewFromLocation);
      window.removeEventListener("hashchange", syncViewFromLocation);
    };
  }, []);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  function navigate(next: ViewName) {
    if (next === "capture") setCaptureDate("");
    setSelectedExpense(null);
    setView(next);
    setStatus(`${titles[next]} view opened`);
    if (window.location.hash !== `#${next}`) {
      window.history.pushState({ view: next }, "", `#${next}`);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
    requestAnimationFrame(() => document.getElementById("main-content")?.focus());
  }

  function captureForDate(date: string) {
    setCaptureDate(date);
    setSelectedExpense(null);
    setView("capture");
    setStatus(`Receipt capture opened for ${date}`);
    window.history.pushState(
      { view: "capture", captureDate: date },
      "",
      "#capture",
    );
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
      capture: (
        <CaptureView
          data={data}
          initialDate={captureDate || undefined}
          onSaved={changed}
        />
      ),
      calendar: (
        <CalendarView
          expenses={data.expenses}
          initialDate="2026-08-01"
          initialMode="month"
          lockedPeriods={data.claims.flatMap((claim) =>
            claim.period ? [claim.period] : [],
          )}
          onAddClaim={captureForDate}
          onOpenClaim={setSelectedExpense}
          supportedPeriod="2026-08"
        />
      ),
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
        {selectedExpense ? (
          <ExpenseEditor
            expense={selectedExpense}
            onClose={() => setSelectedExpense(null)}
            onChanged={changed}
          />
        ) : null}
      </>
    );
  }

  return (
    <AppShell active={view} onNavigate={navigate} status={status}>
      {content}
    </AppShell>
  );
}
