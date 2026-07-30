"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import type { ViewName } from "./types";
import {
  CalendarIcon,
  ChartIcon,
  CameraIcon,
  AuditIcon,
  HomeIcon,
  PlusIcon,
  ReceiptIcon,
  RouteIcon,
  SlidersIcon,
  MoreIcon,
} from "./icons";

type NavItem = { id: ViewName; label: string; icon: ReactNode };

const desktopNav: NavItem[] = [
  { id: "today", label: "Overview", icon: <HomeIcon /> },
  { id: "capture", label: "Add receipts", icon: <CameraIcon /> },
  { id: "calendar", label: "Calendar", icon: <CalendarIcon /> },
  { id: "expenses", label: "Expenses", icon: <ReceiptIcon /> },
  { id: "trips", label: "Trips", icon: <RouteIcon /> },
  { id: "statistics", label: "Statistics", icon: <ChartIcon /> },
  { id: "audit", label: "Audit response", icon: <AuditIcon /> },
];

const mobileNav: NavItem[] = [
  { id: "calendar", label: "Calendar", icon: <CalendarIcon /> },
  { id: "expenses", label: "Expenses", icon: <ReceiptIcon /> },
  { id: "capture", label: "Add", icon: <PlusIcon /> },
  { id: "trips", label: "Trips", icon: <RouteIcon /> },
  { id: "audit", label: "Audit", icon: <AuditIcon /> },
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
          aria-label="Open overview"
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
          <span className="nav-mark" aria-hidden="true">
            <SlidersIcon />
          </span>
          Settings
        </button>
      </aside>

      <div className="mobile-mast">
        <button
          className="brand"
          type="button"
          onClick={() => onNavigate("today")}
          aria-label="Open overview"
        >
          <Image src="/expensetracker-logo.png" width={42} height={42} alt="" priority unoptimized />
          <span>ExpenseTracker</span>
        </button>
        <details
          key={active}
          className={`mobile-more ${
            ["statistics", "settings"].includes(active) ? "active" : ""
          }`}
        >
          <summary aria-label="Open more navigation">
            <MoreIcon />
            <span>More</span>
          </summary>
          <nav aria-label="More navigation">
            {[
              { id: "statistics" as const, label: "Statistics", icon: <ChartIcon /> },
              { id: "settings" as const, label: "Settings", icon: <SlidersIcon /> },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                className={active === item.id ? "active" : ""}
                aria-current={active === item.id ? "page" : undefined}
                onClick={(event) => {
                  event.currentTarget.closest("details")?.removeAttribute("open");
                  onNavigate(item.id);
                }}
              >
                <span className="nav-mark" aria-hidden="true">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
        </details>
      </div>

      <main id="main-content" className="paper-workspace" tabIndex={-1}>
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
        {item.icon}
      </span>
      <span>{item.label}</span>
    </button>
  );
}
