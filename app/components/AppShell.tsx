"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import type { ViewName } from "./types";
import {
  CalendarIcon,
  CameraIcon,
  FileCheckIcon,
  HomeIcon,
  PlusIcon,
  ReceiptIcon,
  RouteIcon,
  SlidersIcon,
} from "./icons";

type NavItem = { id: ViewName; label: string; icon: ReactNode };

const desktopNav: NavItem[] = [
  { id: "today", label: "Overview", icon: <HomeIcon /> },
  { id: "capture", label: "Add receipts", icon: <CameraIcon /> },
  { id: "calendar", label: "Calendar", icon: <CalendarIcon /> },
  { id: "expenses", label: "Expenses", icon: <ReceiptIcon /> },
  { id: "trips", label: "Trips", icon: <RouteIcon /> },
  { id: "claims", label: "Claims", icon: <FileCheckIcon /> },
];

const mobileNav: NavItem[] = [
  { id: "calendar", label: "Calendar", icon: <CalendarIcon /> },
  { id: "expenses", label: "Expenses", icon: <ReceiptIcon /> },
  { id: "capture", label: "Add", icon: <PlusIcon /> },
  { id: "trips", label: "Trips", icon: <RouteIcon /> },
  { id: "claims", label: "Claims", icon: <FileCheckIcon /> },
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
