/**
 * Re-dates every post that is not yet posted so the first one lands on START (YYYY-MM-DD,
 * default today in Beirut) and the rest follow the posting rhythm: Monday, Wednesday,
 * Thursday, Saturday. Order of posts is kept. Times follow the day: 11:00 on Saturday,
 * otherwise the row's own time (12:30 or 19:30).
 *   npm run reschedule            # from today
 *   START=2026-10-01 npm run reschedule
 */
import { todayInBeirut } from "./config.js";
import { openStore } from "./store.js";

const POSTING_DAYS = new Set([1, 3, 4, 6]); // Mon, Wed, Thu, Sat

export function slots(start: string, count: number): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  out.push(start); // the first post goes out on the start day whatever the weekday
  while (out.length < count) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (POSTING_DAYS.has(d.getUTCDay())) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

async function main() {
  const start = process.env.START || todayInBeirut();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new Error(`START must be YYYY-MM-DD, got ${start}`);
  const store = await openStore();
  const rows = (await store.calendar()).filter((r) => !["posted", "measured", "rejected"].includes(r.status));
  const dates = slots(start, rows.length);
  for (const [i, row] of rows.entries()) {
    const date = dates[i];
    const saturday = new Date(`${date}T00:00:00Z`).getUTCDay() === 6;
    const time = saturday ? "11:00" : row.time === "11:00" ? "12:30" : row.time;
    if (row.date === date && row.time === time) continue;
    await store.updateCalendar({ ...row, date, time });
    console.log(`${row.id}: ${row.date} -> ${date} ${time}  ${row.pillar} · ${row.hero}`);
  }
  console.log(`Rescheduled ${rows.length} post(s) from ${start} to ${dates[dates.length - 1]}.`);
}

main().catch((err) => { console.error(err.message ?? err); process.exit(1); });
