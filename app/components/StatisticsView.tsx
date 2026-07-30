"use client";

import Image from "next/image";
import { countryName, formatMoney } from "./format";
import { buildStatistics, type RankedStat } from "./statistics-model";
import type { DashboardData } from "./types";
import { EmptyState, ViewHeader } from "./ui";

function RankedBars({
  items,
  valueLabel = "visits",
}: {
  items: RankedStat[];
  valueLabel?: string;
}) {
  const maximum = Math.max(1, ...items.map((item) => item.count));
  return (
    <ol className="stats-ranked">
      {items.slice(0, 8).map((item) => (
        <li key={item.key}>
          <div>
            <strong>{item.label}</strong>
            <span>{item.count} {item.count === 1 ? valueLabel.replace(/s$/, "") : valueLabel}</span>
          </div>
          <span className="stats-bar" aria-hidden="true">
            <i style={{ width: `${Math.max(7, item.count / maximum * 100)}%` }} />
          </span>
          <small>{formatMoney(item.totalPence)}</small>
        </li>
      ))}
    </ol>
  );
}

export function StatisticsView({
  data,
  claimPeriod,
  onClaimPeriodChange,
}: {
  data: DashboardData;
  claimPeriod: string;
  onClaimPeriodChange: (period: string) => void;
}) {
  const statistics = buildStatistics(data.expenses, claimPeriod);
  const periodLabel = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${claimPeriod}-01T00:00:00Z`));
  const maximumDay = Math.max(
    1,
    ...statistics.daily.map((item) => item.totalPence),
  );
  const mappedLocations = statistics.countries.filter(
    (location) => location.x !== undefined && location.y !== undefined,
  );
  const maximumLocation = Math.max(
    1,
    ...statistics.countries.map((item) => item.count),
  );

  return (
    <div className="view page-enter statistics-view">
      <ViewHeader
        eyebrow="Statistics"
        title={`${periodLabel}, at a glance`}
        detail="Patterns from confirmed expense data, with the original receipts kept one click away in Expenses."
      />
      <div className="claim-period-control statistics-period">
        <label htmlFor="statistics-period">Statistics month</label>
        <input
          id="statistics-period"
          type="month"
          value={claimPeriod}
          onChange={(event) => {
            if (/^\d{4}-\d{2}$/.test(event.target.value)) {
              onClaimPeriodChange(event.target.value);
            }
          }}
        />
      </div>

      {!statistics.expenses.length ? (
        <EmptyState title="No expenses in this month">
          Add a receipt or choose another month to see spending patterns.
        </EmptyState>
      ) : (
        <>
          <dl className="stats-kpis">
            <div><dt>Eligible spend</dt><dd>{formatMoney(statistics.totalPence)}</dd></div>
            <div><dt>Claimable</dt><dd>{formatMoney(statistics.claimablePence)}</dd></div>
            <div><dt>Restaurants</dt><dd>{statistics.uniqueRestaurants}</dd></div>
            <div><dt>Receipt coverage</dt><dd>{statistics.receiptCoverage}%</dd></div>
          </dl>

          <section className="stats-section" aria-labelledby="spend-rhythm">
            <div className="section-heading">
              <div><p className="eyebrow">Spend rhythm</p><h2 id="spend-rhythm">When spending happened</h2></div>
              <strong>{statistics.expenses.length} receipts</strong>
            </div>
            <div className="daily-chart" role="img" aria-label={`Eligible spend by day in ${periodLabel}`}>
              {statistics.daily.map((day) => (
                <span
                  key={day.day}
                  className={day.count ? "has-spend" : ""}
                  title={`Day ${day.day}: ${formatMoney(day.totalPence)}, ${day.count} receipts`}
                >
                  <i style={{ height: `${day.totalPence / maximumDay * 100}%` }} />
                  <small>{day.day % 5 === 0 || day.day === 1 ? day.day : ""}</small>
                </span>
              ))}
            </div>
          </section>

          <div className="stats-split">
            <section className="stats-section" aria-labelledby="restaurant-ranking">
              <div className="section-heading"><div><p className="eyebrow">Restaurants</p><h2 id="restaurant-ranking">Most visited</h2></div></div>
              <RankedBars items={statistics.restaurants} />
            </section>
            <section className="stats-section" aria-labelledby="meal-breakdown">
              <div className="section-heading"><div><p className="eyebrow">Meal context</p><h2 id="meal-breakdown">Breakfast to snacks</h2></div></div>
              <RankedBars items={statistics.mealTypes} valueLabel="meals" />
            </section>
          </div>

          <section className="stats-section" aria-labelledby="food-types">
            <div className="section-heading">
              <div><p className="eyebrow">Food types</p><h2 id="food-types">What you tend to eat</h2></div>
              <small>Estimated from restaurant names</small>
            </div>
            <RankedBars items={statistics.foodTypes} valueLabel="meals" />
          </section>

          <section className="stats-section location-section" aria-labelledby="location-map">
            <div className="section-heading">
              <div><p className="eyebrow">Locations</p><h2 id="location-map">Where spending clusters</h2></div>
              <strong>{statistics.uniqueLocations} places</strong>
            </div>
            <div className="location-map">
              <Image
                src="/world-map-cc0.png"
                alt=""
                width={1280}
                height={720}
                unoptimized
              />
              {mappedLocations.map((location) => {
                const size = 10 + (location.count / maximumLocation) * 24;
                return (
                  <span
                    key={location.key}
                    className="location-dot"
                    style={{
                      left: `${location.x}%`,
                      top: `${location.y}%`,
                      width: size,
                      height: size,
                    }}
                    title={`${countryName(location.countryCode)}: ${location.count} visits, ${formatMoney(location.totalPence)}`}
                    aria-label={`${countryName(location.countryCode)}: ${location.count} visits, ${formatMoney(location.totalPence)}`}
                    role="img"
                    tabIndex={0}
                  />
                );
              })}
              {!mappedLocations.length ? (
                <p>No country coordinates are available for this month.</p>
              ) : null}
            </div>
            <p className="map-note">
              Red dots aggregate visits at country level because receipts store
              place names, not precise coordinates. Larger dots mean more
              visits; the ranking below keeps the individual place names.
            </p>
            <RankedBars items={statistics.locations} />
          </section>
        </>
      )}
    </div>
  );
}
