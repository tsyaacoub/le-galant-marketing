/**
 * Analyst: runs weekly. Seven days after a post, pulls reach, saves, likes and comments
 * into the row and sets "measured". The Strategist reads these next month.
 * Inquiries stay a manual column: the Community manager fills it when that role ships.
 */
import { daysBetween, todayInBeirut } from "./config.js";
import { insights } from "./meta.js";
import { openStore } from "./store.js";

async function main() {
  const store = openStore();
  const today = todayInBeirut();
  const ready = (await store.calendar()).filter((r) => r.status === "posted" && r.ig_media_id && daysBetween(r.date, today) >= 7);
  if (ready.length === 0) { console.log("Nothing to measure."); return; }

  for (const row of ready) {
    try {
      const m = await insights(row.ig_media_id);
      await store.updateCalendar({ ...row, status: "measured", reach: String(m.reach), saves: String(m.saved), likes: String(m.likes), comments: String(m.comments) });
      console.log(`${row.id} ${row.pillar}: reach ${m.reach}, saves ${m.saved}, likes ${m.likes}, comments ${m.comments}`);
    } catch (err) {
      console.error(`${row.id}: ${(err as Error).message}`);
    }
  }
}

main().catch((err) => { console.error(err.message ?? err); process.exit(1); });
