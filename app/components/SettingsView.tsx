"use client";

import { useEffect, useState } from "react";
import { StatusMessage, ViewHeader } from "./ui";

type Theme = "system" | "light" | "dark";

function applyTheme(theme: Theme) {
  if (theme === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.dataset.theme = theme;
  }
}

export function SettingsView() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "system";
    const saved = window.localStorage.getItem("expense-tracker-theme");
    return saved === "light" || saved === "dark" || saved === "system"
      ? saved
      : "system";
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function chooseTheme(value: Theme) {
    setTheme(value);
    window.localStorage.setItem("expense-tracker-theme", value);
    applyTheme(value);
  }

  return (
    <div className="view page-enter">
      <ViewHeader
        eyebrow="Preferences and controls"
        title="Settings"
        detail="Review the active policy, appearance and how your private evidence is handled."
      />

      <div className="settings-ledger">
        <section aria-labelledby="policy-heading">
          <div className="setting-number" aria-hidden="true">01</div>
          <div className="setting-content">
            <p className="eyebrow">Read-only policy</p>
            <h2 id="policy-heading">UK Day Subsistence</h2>
            <dl className="policy-details">
              <div><dt>Source</dt><dd>JSP 752 v66.1, May 2026</dd></div>
              <div><dt>Daily limit</dt><dd>£30.00 from 1 April 2026</dd></div>
              <div><dt>Currency and country</dt><dd>GBP · United Kingdom (GB)</dd></div>
              <div><dt>Aggregation</dt><dd>Permitted for two nights or more, with an explicit method choice</dd></div>
            </dl>
            <a className="text-button external-link" href="https://www.gov.uk/government/publications/jsp-752-tri-service-regulations-for-expenses-and-allowances" target="_blank" rel="noreferrer">
              View official publication <span aria-hidden="true">↗</span>
            </a>
            <StatusMessage tone="neutral">
              ExpenseTracker is a calculation and evidence aid. It does not decide entitlement or replace the authoritative policy.
            </StatusMessage>
          </div>
        </section>

        <section aria-labelledby="appearance-heading">
          <div className="setting-number" aria-hidden="true">02</div>
          <div className="setting-content">
            <p className="eyebrow">On this device</p>
            <h2 id="appearance-heading">Appearance</h2>
            <fieldset className="theme-choice">
              <legend className="sr-only">Colour theme</legend>
              {(["system", "light", "dark"] as Theme[]).map((option) => (
                <label key={option}>
                  <input type="radio" name="theme" value={option} checked={theme === option} onChange={() => chooseTheme(option)} />
                  <span className={`theme-swatch ${option}`} aria-hidden="true"><i /><i /></span>
                  <strong>{option[0].toUpperCase() + option.slice(1)}</strong>
                </label>
              ))}
            </fieldset>
            <p className="setting-note">Only this appearance preference is stored in your browser.</p>
          </div>
        </section>

        <section aria-labelledby="privacy-heading">
          <div className="setting-number" aria-hidden="true">03</div>
          <div className="setting-content">
            <p className="eyebrow">Private by construction</p>
            <h2 id="privacy-heading">Privacy and data control</h2>
            <ul className="plain-list">
              <li><strong>Private evidence</strong><span>Receipt originals and expense records are kept in owner-only storage. They are never public links.</span></li>
              <li><strong>No browser ledger</strong><span>Financial records are server-authoritative. Closing Safari does not leave a second local financial record.</span></li>
              <li><strong>No AI decisions</strong><span>Allowance calculations are deterministic. Any future extraction suggestions will require your confirmation.</span></li>
              <li><strong>Your control</strong><span>Data export and verified deletion will be provided as protected owner operations before real claim data is used.</span></li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
