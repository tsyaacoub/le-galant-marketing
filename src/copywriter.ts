/**
 * Copywriter: runs every morning. For each row with status "planned" or "needs_photo"
 * and no caption yet, writes caption, first comment and alt text, then sets status
 * "draft". Tony changes "draft" to "approved" (or "rejected") from his phone.
 */
import { ask } from "./claude.js";
import { CopywriterOutput, type CalendarRow, type LibraryFrame } from "./schema.js";
import { openStore } from "./store.js";
import { BRAND, VOICE_GUIDE } from "./voice.js";

const SYSTEM = `You write Instagram captions for ${BRAND.name} (${BRAND.handle}), ${BRAND.place}.
${BRAND.facts}

${VOICE_GUIDE}

You are given one calendar row and the frames chosen for it. Write in the language the row names.
Output the caption, the first comment (8 to 12 hashtags and nothing else), one sentence of alt text,
and the list of facts you needed and did not have. No commentary.`;

function describe(row: CalendarRow, frames: LibraryFrame[]) {
  const consent = frames.some((f) => f.client_consent === "yes") ? "yes" : "no";
  return `Row ${row.id}
Date: ${row.date} at ${row.time} Beirut
Pillar: ${row.pillar}
Hero: ${row.hero}
Language: ${row.language}
Format: ${row.format}
Angle: ${row.angle}
Client consent to be named: ${consent}
Frames: ${frames.length ? frames.map((f) => `${f.frame_id}: ${f.dish || f.setting} (${f.source})`).join("; ") : "none yet, a photo is still to be shot; write for the hero as described"}
Owner notes: ${row.notes || "none"}`;
}

async function main() {
  const store = await openStore();
  const [calendar, library] = await Promise.all([store.calendar(), store.library()]);
  const todo = calendar.filter((r) => ["planned", "needs_photo"].includes(r.status) && !r.caption);
  if (todo.length === 0) { console.log("Nothing to write."); return; }

  let written = 0;
  for (const row of todo) {
    const frames = library.filter((f) => row.frame_ids.split(" ").includes(f.frame_id));
    const out = await ask({ system: SYSTEM, user: describe(row, frames), schema: CopywriterOutput, effort: "medium", maxTokens: 4000 });
    await store.updateCalendar({
      ...row,
      caption: out.caption,
      first_comment: out.first_comment,
      alt_text: out.alt_text,
      missing_facts: out.missing_facts.join("; "),
      status: "draft",
    });
    written++;
    console.log(`${row.id} ${row.date} ${row.pillar}: drafted${out.missing_facts.length ? ` (missing: ${out.missing_facts.join(", ")})` : ""}`);
  }
  console.log(`Drafted ${written} post(s). Approve them in the sheet by setting status to "approved".`);
}

main().catch((err) => { console.error(err.message ?? err); process.exit(1); });
