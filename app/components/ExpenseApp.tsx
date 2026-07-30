"use client";

import { useEffect, useRef, useState } from "react";
import { resolveStoredTheme, THEME_STORAGE_KEY, type Theme } from "../theme";
import { AppShell } from "./AppShell";
import { AuditView } from "./AuditView";
import { CalendarView } from "./CalendarView";
import { CaptureView } from "./CaptureView";
import { ClaimsView } from "./ClaimsView";
import { ExpenseEditor } from "./ExpenseEditor";
import { ExpensesView } from "./ExpensesView";
import { SettingsView } from "./SettingsView";
import { StatisticsView } from "./StatisticsView";
import { TodayView } from "./TodayView";
import { TripsView } from "./TripsView";
import type { Expense, NavigationTarget, ViewName } from "./types";
import {
  navigationHash,
  parseNavigationHash,
  replaceNavigationTarget,
} from "./navigation";
import { useDashboard } from "./useDashboard";
import { LoadingLedger, StatusMessage } from "./ui";

const titles: Record<ViewName, string> = {
  today: "Today",
  capture: "Capture",
  calendar: "Calendar",
  expenses: "Expenses",
  trips: "Trips",
  claims: "Submit",
  statistics: "Statistics",
  audit: "Audit response",
  settings: "Settings",
};

export function ExpenseApp() {
  const [view, setView] = useState<ViewName>("capture");
  const [target, setTarget] = useState<NavigationTarget>({ view: "capture" });
  const [captureDate, setCaptureDate] = useState("");
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [status, setStatus] = useState("");
  const {
    data,
    error,
    loading,
    refresh,
    claimPeriod,
    setClaimPeriod,
  } = useDashboard();
  const errorRef = useRef<HTMLDivElement>(null);
  const settingsReturnView = useRef<ViewName>("capture");

  function applyTheme(theme: Theme) {
    if (theme === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.dataset.theme = theme;
    }
  }

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      // Safari may block storage in a restricted browsing context.
    }
    applyTheme(resolveStoredTheme(saved));
  }, []);

  useEffect(() => {
    function syncViewFromLocation() {
      const nextTarget = parseNavigationHash(window.location.hash);
      const next = nextTarget.view;
      setTarget(nextTarget);
      setView(nextTarget.view);
      setSelectedExpense(null);
      setCaptureDate(
        nextTarget.date ??
          (next === "capture" &&
          typeof window.history.state?.captureDate === "string"
            ? window.history.state.captureDate
            : ""),
      );
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
    const returnView =
      next === "settings" && view !== "settings" ? view : undefined;
    if (returnView) settingsReturnView.current = returnView;
    if (next === "capture") setCaptureDate("");
    setSelectedExpense(null);
    setView(next);
    setTarget({ view: next });
    setStatus(`${titles[next]} view opened`);
    if (window.location.hash !== `#${next}`) {
      window.history.pushState(
        { view: next, settingsReturnView: returnView },
        "",
        `#${next}`,
      );
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
    requestAnimationFrame(() => document.getElementById("main-content")?.focus());
  }

  function navigateTarget(next: NavigationTarget) {
    if (next.view === "settings" && view !== "settings") {
      settingsReturnView.current = view;
    }
    setTarget(next);
    setView(next.view);
    setSelectedExpense(null);
    setCaptureDate(next.date ?? "");
    setStatus(`${titles[next.view]} view opened`);
    window.history.pushState({ target: next }, "", navigationHash(next));
    window.scrollTo({ top: 0, behavior: "smooth" });
    requestAnimationFrame(() => document.getElementById("main-content")?.focus());
  }

  function closeSettings() {
    const state = window.history.state as {
      view?: string;
      settingsReturnView?: string;
    } | null;
    if (
      state?.view === "settings" &&
      state.settingsReturnView === settingsReturnView.current
    ) {
      window.history.back();
      setStatus(`${titles[settingsReturnView.current]} view opened`);
      requestAnimationFrame(() =>
        document.getElementById("main-content")?.focus(),
      );
      return;
    }
    navigate(settingsReturnView.current);
  }

  function captureForDate(date: string) {
    navigateTarget({ view: "capture", date });
    setStatus(`Receipt capture opened for ${date}`);
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
    const activeExpense =
      selectedExpense ??
      (target.expenseId
        ? data.expenses.find((expense) => expense.id === target.expenseId) ?? null
        : null);
    const captureView = (
      <CaptureView
        data={data}
        initialDate={captureDate || undefined}
        initialIntakeId={target.intakeId}
        onSaved={changed}
      />
    );
    const views: Record<ViewName, React.ReactNode> = {
      today: (
        <TodayView
          data={data}
          navigate={navigate}
          navigateTarget={navigateTarget}
          onOpenExpense={setSelectedExpense}
        />
      ),
      capture: null,
      calendar: (
        <CalendarView
          expenses={data.expenses}
          initialDate={`${claimPeriod}-01`}
          initialMode="month"
          lockedPeriods={data.claims.flatMap((claim) =>
            claim.period ? [claim.period] : [],
          )}
          onAddClaim={captureForDate}
          onOpenClaim={setSelectedExpense}
          onCreateTripRange={(startDate, endDate) =>
            navigateTarget({ view: "trips", startDate, endDate })
          }
          supportedPeriod={claimPeriod}
        />
      ),
      expenses: <ExpensesView data={data} navigate={navigate} onChanged={changed} />,
      trips: (
        <TripsView
          data={data}
          initialTripId={target.tripId}
          initialStartDate={target.startDate}
          initialEndDate={target.endDate}
          onChanged={changed}
        />
      ),
      claims: (
        <ClaimsView
          data={data}
          navigate={navigate}
          navigateTarget={navigateTarget}
          onChanged={changed}
          claimPeriod={claimPeriod}
          onClaimPeriodChange={setClaimPeriod}
        />
      ),
      statistics: (
        <StatisticsView
          data={data}
          claimPeriod={claimPeriod}
          onOpenExpense={setSelectedExpense}
        />
      ),
      audit: <AuditView />,
      settings: <SettingsView onClose={closeSettings} />,
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
        <div hidden={view !== "capture"}>{captureView}</div>
        {view === "capture" ? null : views[view]}
        {activeExpense ? (
          <ExpenseEditor
            expense={activeExpense}
            trips={data.trips}
            onClose={() => {
              setSelectedExpense(null);
              if (target.expenseId) {
                const next = { view: target.view };
                setTarget(next);
                setView(next.view);
                replaceNavigationTarget(window.history, next);
              }
            }}
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
