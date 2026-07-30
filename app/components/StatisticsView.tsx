"use client";

import { useCallback, useMemo, useState } from "react";
import { countryName, formatMoney } from "./format";
import {
  buildStatistics,
  type DailyStat,
  type MapPoint,
  type RankedStat,
  type StatisticsFilters,
} from "./statistics-model";
import type { DashboardData, Expense } from "./types";
import { EmptyState, ViewHeader } from "./ui";
import {
  AllowanceHeatmap,
  MealDonut,
  RankedBars,
  SpendTrend,
} from "./statistics-charts";
import { DetailedLocationMap } from "./DetailedLocationMap";
import { StatisticsDrilldown } from "./StatisticsDrilldown";
import {
  statisticsPeriod,
  type StatisticsRange,
} from "./statistics-period";

type Drilldown = { title: string; expenseIds: string[] };

const RANGE_OPTIONS: { value: StatisticsRange; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "three_months", label: "3 months" },
  { value: "annual", label: "Annual" },
];

function changeLabel(value: number | null, comparisonLabel: string): string {
  if (value === null) return `No baseline for ${comparisonLabel}`;
  if (value === 0) return `No change from ${comparisonLabel}`;
  return `${Math.abs(value)}% ${value > 0 ? "higher" : "lower"} than ${comparisonLabel}`;
}

export function StatisticsView({
  data,
  claimPeriod,
  onOpenExpense,
}: {
  data: DashboardData;
  claimPeriod: string;
  onOpenExpense: (expense: Expense) => void;
}) {
  const [filters, setFilters] = useState<StatisticsFilters>({});
  const [range, setRange] = useState<StatisticsRange>("month");
  const [anchorDate, setAnchorDate] = useState(`${claimPeriod}-01`);
  const [drilldown, setDrilldown] = useState<Drilldown | null>(null);
  const period = useMemo(
    () => statisticsPeriod(range, anchorDate),
    [anchorDate, range],
  );
  const statistics = useMemo(
    () => buildStatistics(data.expenses, period, filters),
    [data.expenses, filters, period],
  );
  const filterScope = useMemo(
    () => buildStatistics(data.expenses, period, {
      tripId: filters.tripId,
      mealContext: filters.mealContext,
    }),
    [data.expenses, filters.mealContext, filters.tripId, period],
  );
  const availableYears = useMemo(() => {
    const years = data.expenses
      .map((expense) => expense.date.slice(0, 4))
      .filter((year) => /^\d{4}$/.test(year));
    return [...new Set([...years, anchorDate.slice(0, 4)])].sort().reverse();
  }, [anchorDate, data.expenses]);

  const openSelection = useCallback((title: string, expenseIds: string[]) => {
    if (expenseIds.length) setDrilldown({ title, expenseIds });
  }, []);
  const openRanked = useCallback(
    (item: RankedStat) => openSelection(item.label, item.expenseIds),
    [openSelection],
  );
  const openDay = useCallback(
    (day: DailyStat) => openSelection(
      new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeZone: "UTC" })
        .format(new Date(`${day.date}T00:00:00Z`)),
      day.expenseIds,
    ),
    [openSelection],
  );
  const openMapPoint = useCallback(
    (point: MapPoint) => openSelection(point.label, point.expenseIds),
    [openSelection],
  );
  const selectedExpenses = drilldown
    ? drilldown.expenseIds.flatMap((id) => {
        const expense = data.expenses.find((candidate) => candidate.id === id);
        return expense ? [expense] : [];
      })
    : [];

  return (
    <div className="view page-enter statistics-view">
      <ViewHeader
        eyebrow="Statistics"
        title={`${period.label}, in detail`}
        detail="Tap any chart, day or map dot to inspect its claims and open the original receipts."
      />

      <section className="statistics-filters" aria-label="Statistics filters">
        <div className="statistics-range-control">
          <span>Range</span>
          <div className="statistics-range" role="group" aria-label="Statistics time range">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={range === option.value}
                onClick={() => setRange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <label>
          <span>{range === "week" ? "Week containing" : range === "three_months" ? "Ending month" : range === "annual" ? "Year" : "Month"}</span>
          {range === "week" ? (
            <input
              type="date"
              value={anchorDate}
              onChange={(event) => /^\d{4}-\d{2}-\d{2}$/.test(event.target.value) && setAnchorDate(event.target.value)}
            />
          ) : range === "annual" ? (
            <select
              value={anchorDate.slice(0, 4)}
              onChange={(event) => setAnchorDate(`${event.target.value}-01-01`)}
            >
              {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          ) : (
            <input
              type="month"
              value={anchorDate.slice(0, 7)}
              onChange={(event) => /^\d{4}-\d{2}$/.test(event.target.value) && setAnchorDate(`${event.target.value}-01`)}
            />
          )}
        </label>
        <label>
          <span>Trip</span>
          <select
            value={filters.tripId ?? ""}
            onChange={(event) => setFilters((current) => ({ ...current, tripId: event.target.value || undefined }))}
          >
            <option value="">All trips</option>
            {data.trips.map((trip) => <option key={trip.id} value={trip.id}>{trip.title}</option>)}
          </select>
        </label>
        <label>
          <span>Country</span>
          <select
            value={filters.country ?? ""}
            onChange={(event) => setFilters((current) => ({ ...current, country: event.target.value || undefined }))}
          >
            <option value="">All countries</option>
            {filterScope.countryOptions.map((code) => <option key={code} value={code}>{countryName(code)}</option>)}
          </select>
        </label>
        <label>
          <span>Meal</span>
          <select
            value={filters.mealContext ?? ""}
            onChange={(event) => setFilters((current) => ({ ...current, mealContext: event.target.value || undefined }))}
          >
            <option value="">All meals</option>
            <option value="breakfast">Breakfast</option>
            <option value="lunch">Lunch</option>
            <option value="dinner">Dinner</option>
            <option value="snack">Snack</option>
            <option value="mixed">Mixed meal</option>
          </select>
        </label>
        {Object.values(filters).some(Boolean) ? (
          <button className="text-button" type="button" onClick={() => setFilters({})}>Clear filters</button>
        ) : null}
      </section>

      {!statistics.expenses.length ? (
        <EmptyState title="No expenses match this selection">
          Change the period or filters, or add a receipt to start building useful patterns.
        </EmptyState>
      ) : (
        <>
          <dl className="stats-kpis">
            <div><dt>Eligible spend</dt><dd>{formatMoney(statistics.totalPence)}</dd><small>{statistics.expenses.length} receipts</small></div>
            <div><dt>Period movement</dt><dd>{statistics.changePercent === null ? "—" : `${statistics.changePercent > 0 ? "+" : ""}${statistics.changePercent}%`}</dd><small>{changeLabel(statistics.changePercent, period.comparisonLabel)}</small></div>
            <div><dt>Average active day</dt><dd>{formatMoney(statistics.averageActiveDayPence)}</dd><small>Days with recorded spend</small></div>
            <div><dt>Median receipt</dt><dd>{formatMoney(statistics.medianReceiptPence)}</dd><small>Less distorted by large bills</small></div>
            <div><dt>Receipt coverage</dt><dd>{statistics.receiptCoverage}%</dd><small>Claims with stored evidence</small></div>
          </dl>

          <section className="stats-section" aria-labelledby="spend-rhythm">
            <div className="section-heading">
              <div><p className="eyebrow">Spend trend</p><h2 id="spend-rhythm">Eligible spend by day</h2></div>
              <strong>{formatMoney(statistics.totalPence)}</strong>
            </div>
            <SpendTrend daily={statistics.daily} periodLabel={period.label} onSelect={openDay} />
          </section>

          <section className="stats-section" aria-labelledby="allowance-use">
            <div className="section-heading">
              <div><p className="eyebrow">Daily limit</p><h2 id="allowance-use">Food allowance utilisation</h2></div>
              <strong>{formatMoney(data.dailyCapPence)} per day</strong>
            </div>
            <AllowanceHeatmap daily={statistics.daily} dailyCapPence={data.dailyCapPence} onSelect={openDay} />
          </section>

          <div className="stats-split">
            <section className="stats-section" aria-labelledby="restaurant-ranking">
              <div className="section-heading">
                <div><p className="eyebrow">Restaurants</p><h2 id="restaurant-ranking">Most visited</h2></div>
                <small>{statistics.uniqueRestaurants} identified</small>
              </div>
              <RankedBars items={statistics.restaurants} onSelect={openRanked} />
            </section>
            <section className="stats-section" aria-labelledby="meal-breakdown">
              <div className="section-heading"><div><p className="eyebrow">Meal context</p><h2 id="meal-breakdown">Breakfast to snacks</h2></div></div>
              <MealDonut items={statistics.mealTypes} onSelect={openRanked} />
            </section>
          </div>

          <div className="stats-split">
            <section className="stats-section" aria-labelledby="food-types">
              <div className="section-heading">
                <div><p className="eyebrow">Food types</p><h2 id="food-types">What appears on receipts</h2></div>
                <small>AI-derived from merchant and receipt details</small>
              </div>
              <RankedBars items={statistics.foodTypes} valueLabel="receipts" onSelect={openRanked} />
            </section>
            <section className="stats-section" aria-labelledby="currency-types">
              <div className="section-heading">
                <div><p className="eyebrow">Currencies</p><h2 id="currency-types">Original receipt currencies</h2></div>
                <small>Spend totals shown in GBP</small>
              </div>
              <RankedBars items={statistics.currencies} valueLabel="receipts" onSelect={openRanked} />
            </section>
          </div>

          <section className="stats-section location-section" aria-labelledby="location-map">
            <div className="section-heading">
              <div><p className="eyebrow">Location detail</p><h2 id="location-map">Receipt locations on a street-level map</h2></div>
              <strong>{statistics.uniqueLocations} places</strong>
            </div>
            <DetailedLocationMap points={statistics.mapPoints} onSelect={openMapPoint} />
            <p className="map-note">
              {statistics.preciseLocationCount} of {statistics.expenses.length} receipts have venue or address-level coordinates.
              New receipts use precise printed branch evidence when available. Older records fall back to city or country centres and are never presented as exact.
              Street tiles load from OpenStreetMap only while this view is open.
            </p>
            <RankedBars items={statistics.locations} onSelect={openRanked} />
          </section>
        </>
      )}

      {drilldown ? (
        <StatisticsDrilldown
          title={drilldown.title}
          expenses={selectedExpenses}
          onClose={() => setDrilldown(null)}
          onOpenExpense={(expense) => {
            setDrilldown(null);
            onOpenExpense(expense);
          }}
        />
      ) : null}
    </div>
  );
}
