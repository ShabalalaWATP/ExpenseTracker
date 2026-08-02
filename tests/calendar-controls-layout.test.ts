import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../app/components/CalendarView.tsx", import.meta.url),
  "utf8",
);

test("places trip selection above the period controls and calendar grid", () => {
  const tripSelection = source.indexOf('className="calendar-range"');
  const periodControls = source.indexOf('className="calendar-period"');
  const calendarGrid = source.indexOf("className={`calendar-grid");

  assert.ok(tripSelection > 0);
  assert.ok(periodControls > tripSelection);
  assert.ok(calendarGrid > periodControls);

  const period = source.slice(periodControls, calendarGrid);
  assert.match(period, /Previous \$\{mode\.replace/);
  assert.match(period, /calendarRangeLabel\(cursor, mode\)/);
  assert.match(period, /Next \$\{mode\.replace/);
});
