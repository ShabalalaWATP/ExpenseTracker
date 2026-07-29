"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import type { ViewName } from "./types";

type NavItem = { id: ViewName; label: string; short: string };

const desktopNav: NavItem[] = [
  { id: "capture", label: "Add receipts", short: "+" },
  { id: "calendar", label: "Calendar", short: "▦" },
  { id: "expenses", label: "Expenses", short: "£" },
  { id: "trips", label: "Trips", short: "↗" },
  { id: "claims", label: "Claims", short: "✓" },
];

const mobileNav: NavItem[] = [
  { id: "calendar", label: "Calendar", short: "▦" },
  { id: "expenses", label: "Expenses", short: "£" },
  { id: "capture", label: "Add", short: "+" },
  { id: "trips", label: "Trips", short: "↗" },
  { id: "claims", label: "Claims", short: "✓" },
];

const viewContext: Record<ViewName, { label: string; detail: string }> = {
  today: { label: "Overview", detail: "Today’s receipts and actions" },
  capture: { label: "Add receipts", detail: "Photograph, upload or enter an expense" },
  calendar: { label: "Calendar", detail: "Browse receipts and claims by date" },
  expenses: { label: "Expenses", detail: "Search and edit confirmed records" },
  trips: { label: "Trips", detail: "Group duty dates and locations" },
  claims: { label: "Claims", detail: "Review totals and prepare a submission" },
  settings: { label: "Settings", detail: "Appearance, AI, privacy and exports" },
};

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
          onClick={() => onNavigate("capture")}
          aria-label="Open receipt capture"
        >
          <Image
            src="/expensetracker-logo.png"
            width={48}
            height={48}
            alt=""
            priority
            unoptimized
          />
          <span>Expense<br />Tracker</span>
        </button>
        <nav>
          {desktopNav.map((item) => (
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
          aria-current={active === "settings" ? "page" : undefined}
        >
          <span aria-hidden="true">⚙</span>
          Settings
        </button>
      </aside>

      <div className="mobile-mast">
        <button
          className="brand"
          type="button"
          onClick={() => onNavigate("capture")}
          aria-label="Open receipt capture"
        >
          <Image src="/expensetracker-logo.png" width={42} height={42} alt="" priority unoptimized />
          <span>ExpenseTracker</span>
        </button>
        <button
          type="button"
          className={`mobile-settings ${active === "settings" ? "active" : ""}`}
          onClick={() => onNavigate("settings")}
          aria-label="Open settings"
          aria-current={active === "settings" ? "page" : undefined}
        >
          Settings
        </button>
      </div>

      <main id="main-content" className="paper-workspace" tabIndex={-1}>
        <div className="workspace-context" aria-live="polite">
          <span aria-hidden="true" />
          <strong>{viewContext[active].label}</strong>
          <small>{viewContext[active].detail}</small>
        </div>
        {children}
      </main>

      <nav className="mobile-nav" aria-label="Primary navigation">
        {mobileNav.map((item) => (
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
  item: NavItem;
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
