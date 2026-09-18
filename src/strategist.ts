/**
 * Strategist: runs once a month (the 25th) and plans the next month as rows with status
 * "planned" (or "needs_photo" when no frame fits). Tony reviews the rows; the Copywriter
 * only writes captions for rows still "planned" or "needs_photo" the next morning.
 */
import { ask } from "./claude.js";
import { config, nextMonth, todayInBeirut } from "./config.js";
import { CalendarRow, StrategistOutput } from "./schema.js";
import { openStore } from "./store.js";
import { BRAND, PILLAR_RULES, VOICE_GUIDE } from "./voice.js";

const SYSTEM = `You are the content strategist for ${BRAND.name} (${BRAND.handle}), ${BRAND.place}.
${BRAND.facts}

Your job: plan next month's Instagram calendar. Sixteen posts, four a week, as rows.

${PILLAR_RULES}

The voice the Copywriter will use, so your angles fit it:
${VOICE_GUIDE}

Return only the rows and a note to the owner of three sentences at most. Never invent a client name or a photo.`;

function fmt(rows: CalendarRow[]) {
  return rows.map((r) =>
    `${r.date} ${r.pillar} | ${r.hero} | ${r.language} ${r.format} | status ${r.status}` +
    (r.reach ? ` | reach ${r.reach} saves ${r.saves} likes ${r.likes} inquiries ${r.inquiries || 0}` : ""),
  ).join("\n");
}

async function main() {
  const store = await openStore();
  const target = nextMonth(todayInBeirut());
  const prefix = `${target.year}-${String(target.month).padStart(2, "0")}`;

  const [calendar, library, dates] = await Promise.all([store.calendar(), store.library(), store.dates()]);
  if (calendar.some((r) => r.date.startsWith(prefix))) {
    console.log(`Rows for ${target.label} already exist; nothing to plan.`);
    return;
  }

  const lastMonth = calendar.filter((r) => ["posted", "measured"].includes(r.status)).slice(-20);
  const freeFrames = library.filter((f) => !f.used_on);
  const upcoming = dates.filter((d) => d.date >= todayInBeirut()).slice(0, 12);

  const user = `Plan ${target.label}. Today is ${todayInBeirut()}.

Photo library, unused frames (frame_id | kind | dish | setting | card or full_bleed | season | consent | source):
${freeFrames.length ? freeFrames.map((f) => `${f.frame_id} | ${f.kind} | ${f.dish} | ${f.setting} | ${f.format} | ${f.season} | consent ${f.client_consent} | ${f.source}`).join("\n") : "(empty: every row will need a photo)"}

Last month's posts with results:
${lastMonth.length ? fmt(lastMonth) : "(first month, no history)"}

Dates that matter in Lebanon in the coming weeks (date | name | angle):
${upcoming.length ? upcoming.map((d) => `${d.date} | ${d.name} | ${d.angle}`).join("\n") : "(none listed)"}

Give me sixteen rows with dates inside ${prefix}.`;

  const plan = await ask({ system: SYSTEM, user, schema: StrategistOutput, effort: "high" });

  const rows: CalendarRow[] = plan.posts.map((p, i) => CalendarRow.parse({
    id: `${prefix}-${String(i + 1).padStart(2, "0")}`,
    date: p.date, time: p.time, pillar: p.pillar, hero: p.hero, language: p.language, format: p.format,
    angle: p.angle, frame_ids: p.frame_ids.join(" "),
    status: p.frame_ids.length ? "planned" : "needs_photo",
  }));

  await store.appendCalendar(rows);
  for (const r of rows) for (const f of r.frame_ids.split(" ").filter(Boolean)) await store.markFrameUsed(f, r.id);

  console.log(`Planned ${rows.length} posts for ${target.label} (${rows.filter((r) => r.status === "needs_photo").length} need a photo).`);
  console.log(`Note to owner: ${plan.note_to_owner}`);
  console.log(`Model: ${config.model}, store: ${config.store}`);
}

main().catch((err) => { console.error(err.message ?? err); process.exit(1); });
