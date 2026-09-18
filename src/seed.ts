/** Loads data/calendar.local.json into the configured store, skipping ids that already exist. */
import { LocalStore, openStore } from "./store.js";

async function main() {
  const store = await openStore();
  const existing = new Set((await store.calendar()).map((r) => r.id));
  const rows = (await new LocalStore().calendar()).filter((r) => !existing.has(r.id));
  if (rows.length === 0) { console.log("Nothing new to seed."); return; }
  await store.appendCalendar(rows);
  console.log(`Seeded ${rows.length} post(s): ${rows.map((r) => r.id).join(", ")}`);
}
main().catch((err) => { console.error(err.message ?? err); process.exit(1); });
