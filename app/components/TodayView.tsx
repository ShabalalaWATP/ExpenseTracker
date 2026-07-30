"use client";

import { useRef, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { formatDate, formatMoney, localDate } from "./format";
import type { DashboardData, Expense, NavigationTarget, ViewName } from "./types";
import { CountUpMoney, EmptyState, ViewHeader } from "./ui";
import {
  CheckCircleIcon,
  ChevronRightIcon,
  FileCheckIcon,
  ImageIcon,
  MapPinIcon,
  PlusIcon,
  ReceiptIcon,
  RouteIcon,
} from "./icons";

const DAY_MS = 86_400_000;

const attentionIcons: Record<string, ReactNode> = {
  evidence: <ImageIcon />,
  details: <MapPinIcon />,
  trip: <RouteIcon />,
  policy: <FileCheckIcon />,
};

function lastSevenDays(endDate: string): string[] {
  const end = new Date(`${endDate}T12:00:00Z`);
  if (Number.isNaN(end.valueOf())) return [];
  return Array.from({ length: 7 }, (_, index) =>
    new Date(end.valueOf() - (6 - index) * DAY_MS).toISOString().slice(0, 10),
  );
}

function weekdayLetter(date: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "narrow" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

export function TodayView({
  data,
  navigate,
  navigateTarget,
  onOpenExpense,
}: {
  data: DashboardData;
  navigate: (view: ViewName) => void;
  navigateTarget: (target: NavigationTarget) => void;
  onOpenExpense: (expense: Expense) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const progress = Math.min(
    100,
    Math.round((data.claimableTodayPence / Math.max(1, data.dailyCapPence)) * 100),
  );
  const overCap = data.remainingTodayPence <= 0;
  const recent = data.expenses
    .filter((expense) => !expense.deletedAt)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4);

  const endDate = data.date ?? localDate();
  const days = lastSevenDays(endDate);
  const spendByDay = new Map(days.map((day) => [day, 0]));
  for (const expense of data.expenses) {
    if (expense.deletedAt || !spendByDay.has(expense.date)) continue;
    spendByDay.set(
      expense.date,
      (spendByDay.get(expense.date) ?? 0) + expense.eligibleAmountPence,
    );
  }
  const chartMax = Math.max(data.dailyCapPence, ...spendByDay.values(), 1);
  const capPct = Math.round((data.dailyCapPence / chartMax) * 100);

  function trackSpotlight(event: PointerEvent<HTMLDivElement>) {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    card.style.setProperty("--sx", `${event.clientX - rect.left}px`);
    card.style.setProperty("--sy", `${event.clientY - rect.top}px`);
  }

  return (
    <div className="view page-enter today-view">
      <ViewHeader
        eyebrow={formatDate(endDate)}
        title="Today’s receipts"
        detail={`${recent.length} recent ${recent.length === 1 ? "entry" : "entries"} · ${formatMoney(data.remainingTodayPence)} remains within today’s limit.`}
        action={
          <button className="primary-button" type="button" onClick={() => navigate("capture")}>
            <PlusIcon />
            Add receipt
          </button>
        }
      />

      <section
        className="allowance-card"
        aria-labelledby="allowance-heading"
        ref={cardRef}
        onPointerMove={trackSpotlight}
      >
        <div className="allowance-summary">
          <p className="eyebrow" id="allowance-heading">Claimable today</p>
          <p className="hero-money">
            <CountUpMoney pence={data.claimableTodayPence} />
            <small>of {formatMoney(data.dailyCapPence)} daily cap</small>
          </p>
          <div
            className={`cap-track${overCap ? " over" : ""}`}
            role="img"
            aria-label={`${progress}% of today’s allowance used`}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
          <p className="cap-caption">
            <span>{progress}% of cap used</span>
            <span>resets midnight</span>
          </p>
          <dl className="mini-stats">
            <div><dt>Eligible spend</dt><dd>{formatMoney(data.spentTodayPence)}</dd></div>
            <div><dt>Remaining</dt><dd>{formatMoney(data.remainingTodayPence)}</dd></div>
            <div><dt>Daily limit</dt><dd>{formatMoney(data.dailyCapPence)}</dd></div>
          </dl>
        </div>

        <div className="week-pulse">
          <h3 id="week-pulse-title">Eligible spend · last 7 days</h3>
          <div className="pulse-chart" aria-labelledby="week-pulse-title">
            <span className="cap-line" style={{ bottom: `${capPct}%` }} aria-hidden="true">
              <small>cap {formatMoney(data.dailyCapPence)}</small>
            </span>
            {days.map((day, index) => {
              const pence = spendByDay.get(day) ?? 0;
              const height = Math.round((pence / chartMax) * 100);
              return (
                <div
                  key={day}
                  className={`pulse-slot${day === endDate ? " today" : ""}`}
                  title={`${formatDate(day)} · ${formatMoney(pence)}`}
                >
                  {day === endDate ? <span className="pulse-flag">today</span> : null}
                  <span
                    className="pulse-bar"
                    style={{ "--v": height, animationDelay: `${index * 45}ms` } as CSSProperties}
                  />
                </div>
              );
            })}
          </div>
          <div className="pulse-days" aria-hidden="true">
            {days.map((day) => <span key={day}>{weekdayLetter(day)}</span>)}
          </div>
          <details className="pulse-table">
            <summary>View as table</summary>
            <table>
              <tbody>
                {days.map((day) => (
                  <tr key={day}>
                    <td>{formatDate(day)}</td>
                    <td>{formatMoney(spendByDay.get(day) ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      </section>

      <div className="ledger-columns">
        <section aria-labelledby="attention-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Next actions</p>
              <h2 id="attention-heading">Attention</h2>
            </div>
            <span className="count-badge">{data.attention.length}</span>
          </div>
          {data.attention.length ? (
            <ul className="row-list">
              {data.attention.map((item, index) => {
                const icon = attentionIcons[item.category ?? ""] ?? <ImageIcon />;
                const destination = item.target ?? (item.view ? { view: item.view } : null);
                return (
                  <li key={item.id ?? `${item.title}-${index}`} style={{ animationDelay: `${index * 70}ms` }}>
                    <RowLine
                      onOpen={destination ? () => navigateTarget(destination) : undefined}
                    >
                      <span
                        className={`chip-icon ${item.severity === "blocking" ? "blocking" : "warn"}`}
                        aria-hidden="true"
                      >
                        {icon}
                      </span>
                      <span className="row-body">
                        <strong>{item.title}</strong>
                        {item.detail ? <span>{item.detail}</span> : null}
                      </span>
                    </RowLine>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="calm-note">
              <span aria-hidden="true"><CheckCircleIcon /></span>
              <p><strong>Nothing needs attention</strong><br />Your records are in good order.</p>
            </div>
          )}
        </section>

        <section aria-labelledby="recent-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Confirmed receipts</p>
              <h2 id="recent-heading">Recent entries</h2>
            </div>
            <button className="text-button" type="button" onClick={() => navigate("expenses")}>View all</button>
          </div>
          {recent.length ? (
            <ul className="row-list">
              {recent.map((expense, index) => (
                <li key={expense.id} style={{ animationDelay: `${index * 70}ms` }}>
                  <RowLine onOpen={() => onOpenExpense(expense)}>
                    <span className="chip-icon" aria-hidden="true"><ReceiptIcon /></span>
                    <span className="row-body">
                      <strong>{expense.merchant}</strong>
                      <span className={expense.location ? "" : "needs-detail"}>
                        {expense.location || "Location needed"} · {formatDate(expense.date)}
                      </span>
                    </span>
                    <span className="row-money">{formatMoney(expense.eligibleAmountPence)}</span>
                  </RowLine>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Your ledger is clear" action={<button className="text-button" type="button" onClick={() => navigate("capture")}>Capture your first receipt</button>}>
              New expenses will appear here in date order.
            </EmptyState>
          )}
        </section>
      </div>
    </div>
  );
}

function RowLine({
  children,
  onOpen,
}: {
  children: ReactNode;
  onOpen?: () => void;
}) {
  if (!onOpen) return <div className="row-line">{children}</div>;
  return (
    <button type="button" className="row-line" onClick={onOpen}>
      {children}
      <span className="row-go" aria-hidden="true"><ChevronRightIcon /></span>
    </button>
  );
}
