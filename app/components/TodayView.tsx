import { formatDate, formatMoney } from "./format";
import type { DashboardData, ViewName } from "./types";
import { EmptyState, ViewHeader } from "./ui";

export function TodayView({
  data,
  navigate,
}: {
  data: DashboardData;
  navigate: (view: ViewName) => void;
}) {
  const progress = Math.min(
    100,
    Math.round((data.claimableTodayPence / Math.max(1, data.dailyCapPence)) * 100),
  );
  const recent = data.expenses
    .filter((expense) => !expense.deletedAt)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4);

  return (
    <div className="view page-enter">
      <ViewHeader
        eyebrow={formatDate(data.date ?? new Date().toISOString().slice(0, 10))}
        title="Today’s receipts"
        detail={`${recent.length} recent ${recent.length === 1 ? "entry" : "entries"} · ${formatMoney(data.remainingTodayPence)} remains within today’s limit.`}
        action={
          <button className="primary-button" type="button" onClick={() => navigate("capture")}>
            Add receipt
          </button>
        }
      />

      <section className="allowance-strip" aria-labelledby="allowance-heading">
        <div className="allowance-copy">
          <p className="eyebrow" id="allowance-heading">Daily summary</p>
          <strong>
            {formatMoney(data.claimableTodayPence)}
            <span> claimable of {formatMoney(data.dailyCapPence)}</span>
          </strong>
        </div>
        <div className="progress-track" aria-label={`${progress}% of today’s allowance used`}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <dl className="inline-stats">
          <div><dt>Eligible spend</dt><dd>{formatMoney(data.spentTodayPence)}</dd></div>
          <div><dt>Remaining</dt><dd>{formatMoney(data.remainingTodayPence)}</dd></div>
          <div><dt>Daily limit</dt><dd>{formatMoney(data.dailyCapPence)}</dd></div>
        </dl>
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
            <ul className="attention-list">
              {data.attention.map((item, index) => (
                <li key={item.id ?? `${item.title}-${index}`}>
                  <span className="attention-mark" aria-hidden="true">!</span>
                  <div><strong>{item.title}</strong>{item.detail ? <p>{item.detail}</p> : null}</div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="calm-state"><span aria-hidden="true">✓</span><p><strong>Nothing needs attention</strong><br />Your records are in good order.</p></div>
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
            <ul className="expense-list compact">
              {recent.map((expense) => (
                <li key={expense.id}>
                  <span className="date-stamp">{expense.date.slice(8, 10)}<small>{formatDate(expense.date).split(" ")[1]}</small></span>
                  <div className="expense-main"><strong>{expense.merchant}</strong><span>{expense.location || "Location needed"}</span></div>
                  <strong>{formatMoney(expense.eligibleAmountPence)}</strong>
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
