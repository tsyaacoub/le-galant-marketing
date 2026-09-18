/**
 * Publisher: runs every 30 minutes. Posts every row whose status is "approved" and whose
 * date and Beirut time have passed, then writes the first comment and sets "posted".
 * With PUBLISH_ENABLED unset it only prints what it would do.
 */
import { config, isDue } from "./config.js";
import { comment, createContainer, publish, waitUntilReady } from "./meta.js";
import type { CalendarRow } from "./schema.js";
import { openStore } from "./store.js";

function urlsOf(row: CalendarRow): string[] {
  return row.image_urls.split(/\s+/).filter(Boolean);
}

async function post(row: CalendarRow): Promise<string> {
  const urls = urlsOf(row);
  if (urls.length === 0) throw new Error("image_urls is empty; the photo must be at a public URL");
  let container: string;
  if (row.format === "reel") {
    container = await createContainer({ videoUrl: urls[0], caption: row.caption, reel: true });
    await waitUntilReady(container);
  } else if (row.format === "carousel") {
    if (urls.length < 2) throw new Error("a carousel needs at least two image_urls");
    const children = [];
    for (const u of urls.slice(0, 10)) children.push(await createContainer({ imageUrl: u, isCarouselItem: true }));
    container = await createContainer({ children, caption: row.caption });
    await waitUntilReady(container);
  } else {
    container = await createContainer({ imageUrl: urls[0], caption: row.caption });
  }
  return publish(container);
}

async function main() {
  const store = openStore();
  const due = (await store.calendar()).filter((r) => r.status === "approved" && isDue(r.date, r.time));
  if (due.length === 0) { console.log("Nothing due."); return; }

  for (const row of due) {
    if (!config.publishEnabled) {
      console.log(`[dry run] would post ${row.id} (${row.pillar}, ${row.format}) with ${urlsOf(row).length} file(s):\n${row.caption}\n`);
      continue;
    }
    try {
      const mediaId = await post(row);
      if (row.first_comment) await comment(mediaId, row.first_comment);
      await store.updateCalendar({ ...row, status: "posted", ig_media_id: mediaId, posted_at: new Date().toISOString() });
      console.log(`Posted ${row.id} as ${mediaId}`);
    } catch (err) {
      const msg = (err as Error).message;
      await store.updateCalendar({ ...row, status: "failed", notes: [row.notes, `publish failed: ${msg}`].filter(Boolean).join(" | ") });
      console.error(`Failed ${row.id}: ${msg}`);
    }
  }
}

main().catch((err) => { console.error(err.message ?? err); process.exit(1); });
