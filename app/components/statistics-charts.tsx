"use client";

import type { CSSProperties } from "react";
import { formatMoney } from "./format";
import type { DailyStat, RankedStat } from "./statistics-model";

const MEAL_COLOURS = ["#2d7ff9", "#41a5ff", "#52c7c0", "#86d7ff", "#97a7c3", "#ff6675"];

export function RankedBars({
  items,
  valueLabel = "visits",
  onSelect,
}: {
  items: RankedStat[];
  valueLabel?: string;
  onSelect: (item: RankedStat) => void;
}) {
  if (!items.length) {
    return <p className="stats-empty-note">No matching receipts in this selection.</p>;
  }
  const maximum = Math.max(1, ...items.map((item) => item.count));
  return (
    <ol className="stats-ranked">
      {items.slice(0, 8).map((item) => (
        <li key={item.key}>
          <button type="button" onClick={() => onSelect(item)}>
            <span className="rank-copy">
              <strong>{item.label}</strong>
              <span>{item.count} {item.count === 1 ? valueLabel.replace(/s$/, "") : valueLabel}</span>
            </span>
            <span className="stats-bar" aria-hidden="true">
              <i style={{ width: `${Math.max(7, item.count / maximum * 100)}%` }} />
            </span>
            <small>{formatMoney(item.totalPence)}</small>
          </button>
        </li>
      ))}
    </ol>
  );
}

export function SpendTrend({
  daily,
  periodLabel,
  onSelect,
}: {
  daily: DailyStat[];
  periodLabel: string;
  onSelect: (day: DailyStat) => void;
}) {
  const width = 720;
  const height = 250;
  const left = 46;
  const right = 18;
  const top = 20;
  const bottom = 38;
  const maximum = Math.max(1, ...daily.map((day) => day.totalPence));
  const x = (index: number) => left + (index / Math.max(1, daily.length - 1)) * (width - left - right);
  const y = (value: number) => top + (1 - value / maximum) * (height - top - bottom);
  const line = daily.map((day, index) => `${index ? "L" : "M"} ${x(index)} ${y(day.totalPence)}`).join(" ");
  const area = `${line} L ${x(daily.length - 1)} ${height - bottom} L ${left} ${height - bottom} Z`;
  return (
    <div className="trend-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Eligible spend by day in ${periodLabel}`}>
        <defs>
          <linearGradient id="trend-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2d7ff9" stopOpacity="0.34" />
            <stop offset="1" stopColor="#2d7ff9" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((ratio) => (
          <g key={ratio}>
            <line x1={left} x2={width - right} y1={y(maximum * ratio)} y2={y(maximum * ratio)} className="chart-grid-line" />
            <text x={left - 8} y={y(maximum * ratio) + 4} textAnchor="end">{formatMoney(Math.round(maximum * ratio))}</text>
          </g>
        ))}
        <path d={area} fill="url(#trend-area)" />
        <path d={line} className="trend-line" />
        {daily.map((day, index) => (
          <g
            key={day.date}
            className={day.count ? "trend-point has-spend" : "trend-point"}
            role={day.count ? "button" : undefined}
            tabIndex={day.count ? 0 : undefined}
            aria-label={day.count ? `${day.date}: ${formatMoney(day.totalPence)}, ${day.count} receipts` : undefined}
            onClick={() => day.count && onSelect(day)}
            onKeyDown={(event) => {
              if (day.count && (event.key === "Enter" || event.key === " ")) onSelect(day);
            }}
          >
            <circle cx={x(index)} cy={y(day.totalPence)} r={day.count ? 6 : 2} />
            {(day.day === 1 || day.day % 5 === 0) ? (
              <text x={x(index)} y={height - 14} textAnchor="middle">{day.day}</text>
            ) : null}
          </g>
        ))}
      </svg>
    </div>
  );
}

export function MealDonut({
  items,
  onSelect,
}: {
  items: RankedStat[];
  onSelect: (item: RankedStat) => void;
}) {
  if (!items.length) {
    return <p className="stats-empty-note">No food receipts in this selection.</p>;
  }
  const total = Math.max(1, items.reduce((sum, item) => sum + item.count, 0));
  const stops = items.map((item, index) => {
    const start = items
      .slice(0, index)
      .reduce((sum, candidate) => sum + candidate.count / total * 360, 0);
    const end = start + item.count / total * 360;
    return `${MEAL_COLOURS[index % MEAL_COLOURS.length]} ${start}deg ${end}deg`;
  });
  const style = { "--meal-gradient": `conic-gradient(${stops.join(", ")})` } as CSSProperties;
  return (
    <div className="meal-chart">
      <div className="meal-donut" style={style} role="img" aria-label={`${total} meals split by meal context`}>
        <span><strong>{total}</strong><small>meals</small></span>
      </div>
      <ol className="meal-legend">
        {items.map((item, index) => (
          <li key={item.key}>
            <button type="button" onClick={() => onSelect(item)}>
              <i style={{ background: MEAL_COLOURS[index % MEAL_COLOURS.length] }} />
              <span><strong>{item.label}</strong><small>{Math.round(item.count / total * 100)}% · {formatMoney(item.totalPence)}</small></span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function AllowanceHeatmap({
  daily,
  dailyCapPence,
  onSelect,
}: {
  daily: DailyStat[];
  dailyCapPence: number;
  onSelect: (day: DailyStat) => void;
}) {
  const safeDailyCapPence = Math.max(1, dailyCapPence);
  return (
    <div className="allowance-wrap">
      <div className="allowance-grid" aria-label="Daily food allowance utilisation">
        {daily.map((day) => {
          const ratio = day.foodPence / safeDailyCapPence;
          const tone = ratio > 1 ? "over" : ratio >= 0.75 ? "near" : day.foodPence ? "within" : "empty";
          return (
            <button
              key={day.date}
              className={tone}
              type="button"
              disabled={!day.count}
              onClick={() => onSelect(day)}
              aria-label={`${day.date}: ${formatMoney(day.foodPence)} food spend, ${Math.round(ratio * 100)}% of daily limit`}
            >
              <span>{day.day}</span>
              <i style={{ height: `${Math.min(100, ratio * 100)}%` }} />
              {day.foodPence ? <small>{Math.round(ratio * 100)}%</small> : null}
            </button>
          );
        })}
      </div>
      <div className="allowance-key">
        <span><i className="within" />Within limit</span>
        <span><i className="near" />75–100%</span>
        <span><i className="over" />Above limit</span>
      </div>
    </div>
  );
}
