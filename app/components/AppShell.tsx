"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import type { ViewName } from "./types";

const primaryNav: Array<{ id: ViewName; label: string; short: string }> = [
  { id: "today", label: "Today", short: "01" },
  { id: "expenses", label: "Expenses", short: "02" },
  { id: "capture", label: "Capture", short: "+" },
  { id: "trips", label: "Trips", short: "03" },
  { id: "claims", label: "Claims", short: "04" },
];

interface AppShellProps {
  active: ViewName;
  children: ReactNode;
  onNavigate: (view: ViewName) => void;
  status: string;
}

export function AppShell({
  active,
  children,
  onNavigate,
  status,
}: AppShellProps) {
  return (
    <div className="app-frame">
      <aside className="desktop-rail" aria-label="Primary navigation">
        <button
          className="brand"
          type="button"
          onClick={() => onNavigate("today")}
          aria-label="ExpenseTracker home"
        >
          <Image
            src="/expensetracker-logo.png"
            width={48}
            height={48}
            alt=""
            priority
          />
          <span>Expense<br />Tracker</span>
        </button>
        <nav>
          {primaryNav.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              active={active === item.id}
              onClick={() => onNavigate(item.id)}
            />
          ))}
        </nav>
        <button
          type="button"
          className={`settings-link ${active === "settings" ? "active" : ""}`}
          onClick={() => onNavigate("settings")}
        >
          <span aria-hidden="true">Aa</span>
          Settings
        </button>
      </aside>

      <div className="mobile-mast">
        <button
          className="brand"
          type="button"
          onClick={() => onNavigate("today")}
          aria-label="ExpenseTracker home"
        >
          <Image src="/expensetracker-logo.png" width={42} height={42} alt="" priority />
          <span>ExpenseTracker</span>
        </button>
        <button
          type="button"
          className="round-button"
          onClick={() => onNavigate("settings")}
          aria-label="Open settings"
        >
          Aa
        </button>
      </div>

      <main id="main-content" className="paper-workspace" tabIndex={-1}>
        {children}
      </main>

      <nav className="mobile-nav" aria-label="Primary navigation">
        {primaryNav.map((item) => (
          <NavButton
            key={item.id}
            item={item}
            active={active === item.id}
            onClick={() => onNavigate(item.id)}
          />
        ))}
      </nav>
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}

function NavButton({
  item,
  active,
  onClick,
}: {
  item: (typeof primaryNav)[number];
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`${item.id === "capture" ? "nav-capture " : ""}${
        active ? "active" : ""
      }`}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
    >
      <span className="nav-mark" aria-hidden="true">
        {item.short}
      </span>
      <span>{item.label}</span>
    </button>
  );
}
