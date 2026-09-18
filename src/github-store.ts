/**
 * GitHub Issues as the calendar. One issue per post. The owner approves by replying
 * to the issue from the GitHub app; photos dropped into a comment become the post's images.
 *
 * Commands, first word of a comment by the owner or a collaborator (case-insensitive):
 *   approve | ok | yes | موافق | تمام   -> status approved
 *   reject  | no | skip                 -> status rejected, issue closed
 *   redo    | rewrite                   -> caption cleared, Copywriter rewrites using the notes
 * Anything else in the comment is kept as notes for the Copywriter.
 * Library frames and key dates live in data/library.json and data/dates.json in the repo.
 */
import { readFile } from "node:fs/promises";
import { CalendarRow, KeyDate, LibraryFrame, type Status } from "./schema.js";
import type { Store } from "./store.js";

const API = "https://api.github.com";
const MARK_START = "<!-- galant:row";
const MARK_END = "-->";

type Issue = { number: number; title: string; body: string | null; state: "open" | "closed"; labels: { name: string }[]; updated_at: string };
type Comment = { id: number; body: string; created_at: string; author_association: string; user: { login: string } };

function statusLabel(s: Status) { return `status:${s}`; }
const TRUSTED = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const APPROVE = new Set(["approve", "approved", "ok", "yes", "go", "موافق", "تمام", "اوك"]);
const REJECT = new Set(["reject", "rejected", "no", "skip", "لا"]);
const REDO = new Set(["redo", "rewrite", "again", "عيد"]);

export function extractImageUrls(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g)) out.add(m[1]);
  for (const m of text.matchAll(/https:\/\/(?:github\.com\/user-attachments\/assets\/[\w-]+|user-images\.githubusercontent\.com\/\S+|[^\s)]+\.(?:jpe?g|png|webp|mp4|mov))/gi)) out.add(m[0]);
  return [...out];
}

export function renderBody(row: CalendarRow): string {
  const machine = { ...row };
  const lines = [
    `${MARK_START}\n${JSON.stringify(machine)}\n${MARK_END}`,
    `**${row.date} at ${row.time}** · ${row.pillar} · ${row.format} · ${row.language}`,
    `_${row.angle}_`,
    "",
    row.caption ? `## Caption\n\n${row.caption}` : "_Caption not written yet._",
    row.first_comment ? `\n## First comment\n\n${row.first_comment}` : "",
    row.alt_text ? `\n**Alt text:** ${row.alt_text}` : "",
    row.missing_facts ? `\n**Missing facts:** ${row.missing_facts}` : "",
    row.image_urls ? `\n**Photos:** ${row.image_urls.split(/\s+/).filter(Boolean).map((u, i) => `[${i + 1}](${u})`).join(" ")}` : "\n**Photos:** none yet. Attach them in a comment.",
    row.notes ? `\n**Notes:** ${row.notes}` : "",
    row.ig_media_id ? `\n**Posted:** ${row.posted_at} (media ${row.ig_media_id})` : "",
    row.reach ? `\n**Results:** reach ${row.reach}, saves ${row.saves}, likes ${row.likes}, comments ${row.comments}` : "",
    "",
    "---",
    "Reply **approve**, **reject**, or **redo**. Any other text becomes a note for the Copywriter. Attach photos to a comment to add them.",
  ];
  return lines.filter((l) => l !== "").join("\n");
}

export function parseBody(body: string | null): CalendarRow | null {
  if (!body) return null;
  const s = body.indexOf(MARK_START);
  const e = body.indexOf(MARK_END, s);
  if (s < 0 || e < 0) return null;
  try {
    return CalendarRow.parse(JSON.parse(body.slice(s + MARK_START.length, e).trim()));
  } catch {
    return null;
  }
}

/** Applies the owner's comments to a row. Pure, so it is testable. */
export function applyComments(row: CalendarRow, comments: Comment[], since: string): { row: CalendarRow; changed: boolean; lastSeen: string } {
  let changed = false;
  let lastSeen = since;
  for (const c of comments) {
    if (c.created_at <= since) continue;
    lastSeen = c.created_at;
    if (!TRUSTED.has(c.author_association)) continue;
    const text = c.body.trim();
    const first = text.split(/\s+/)[0]?.toLowerCase().replace(/[.!،,]/g, "") ?? "";
    const rest = text.split(/\s+/).slice(1).join(" ").trim();
    const urls = extractImageUrls(text);
    const plain = urls.reduce((t, u) => t.replace(u, ""), rest).replace(/!\[[^\]]*\]\(\)/g, "").trim();

    if (urls.length) {
      const have = new Set(row.image_urls.split(/\s+/).filter(Boolean));
      for (const u of urls) have.add(u);
      row = { ...row, image_urls: [...have].join(" ") };
      changed = true;
    }
    if (APPROVE.has(first)) {
      if (row.status === "draft") { row = { ...row, status: "approved" }; changed = true; }
    } else if (REJECT.has(first)) {
      row = { ...row, status: "rejected" }; changed = true;
    } else if (REDO.has(first)) {
      row = { ...row, caption: "", first_comment: "", alt_text: "", missing_facts: "", status: row.image_urls ? "planned" : "needs_photo" };
      changed = true;
    } else if (!urls.length || plain) {
      const note = urls.length ? plain : text;
      if (note) { row = { ...row, notes: [row.notes, note].filter(Boolean).join(" | ") }; changed = true; }
      continue;
    }
    if (plain && (APPROVE.has(first) || REJECT.has(first) || REDO.has(first))) {
      row = { ...row, notes: [row.notes, plain].filter(Boolean).join(" | ") };
    }
  }
  return { row, changed, lastSeen };
}

export class GitHubStore implements Store {
  private repo: string;
  private token: string;
  private cache: Map<string, number> | null = null; // row id -> issue number

  constructor(repo = process.env.GITHUB_REPOSITORY, token = process.env.GITHUB_TOKEN) {
    if (!repo || !token) throw new Error("GITHUB_REPOSITORY and GITHUB_TOKEN are required for the GitHub store");
    this.repo = repo;
    this.token = token;
  }

  private async api<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 422 && method === "POST" && path.endsWith("/labels")) return undefined as T; // label exists
    if (!res.ok) throw new Error(`GitHub ${method} ${path}: ${res.status} ${await res.text()}`);
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  private async ensureLabels() {
    const labels: [string, string][] = [
      ["post", "1f5f3a"], ["status:planned", "c2c2c2"], ["status:needs_photo", "e4c26b"], ["status:draft", "6b9bd1"],
      ["status:approved", "2ea043"], ["status:rejected", "8b8b8b"], ["status:posted", "1f5f3a"], ["status:measured", "0b3d2e"], ["status:failed", "d1242f"],
    ];
    for (const [name, color] of labels) await this.api("POST", `/repos/${this.repo}/labels`, { name, color });
  }

  private async allIssues(): Promise<Issue[]> {
    const out: Issue[] = [];
    for (let page = 1; page < 20; page++) {
      const batch = await this.api<Issue[]>("GET", `/repos/${this.repo}/issues?labels=post&state=all&per_page=100&page=${page}`);
      out.push(...batch);
      if (batch.length < 100) break;
    }
    return out;
  }

  /** Reads every post issue and applies new owner comments, persisting any change. */
  async calendar(): Promise<CalendarRow[]> {
    const issues = await this.allIssues();
    this.cache = new Map();
    const rows: CalendarRow[] = [];
    for (const issue of issues) {
      const parsed = parseBody(issue.body);
      if (!parsed) continue;
      this.cache.set(parsed.id, issue.number);
      let row = parsed;
      if (!["posted", "measured", "rejected"].includes(row.status)) {
        const comments = await this.api<Comment[]>("GET", `/repos/${this.repo}/issues/${issue.number}/comments?per_page=100`);
        const since = row.notes.match(/\[seen:([^\]]+)\]/)?.[1] ?? "";
        const clean = { ...row, notes: row.notes.replace(/\s*\[seen:[^\]]+\]/, "") };
        const r = applyComments(clean, comments, since);
        if (r.changed || r.lastSeen !== since) {
          row = { ...r.row, notes: [r.row.notes, r.lastSeen ? `[seen:${r.lastSeen}]` : ""].filter(Boolean).join(" ") };
          await this.write(issue.number, row);
        }
      }
      rows.push({ ...row, notes: row.notes.replace(/\s*\[seen:[^\]]+\]/, "") });
    }
    return rows.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  }

  async library(): Promise<LibraryFrame[]> { return readJsonFile("data/library.json", LibraryFrame); }
  async dates(): Promise<KeyDate[]> { return readJsonFile("data/dates.json", KeyDate); }

  async appendCalendar(rows: CalendarRow[]) {
    await this.ensureLabels();
    for (const row of rows) {
      await this.api("POST", `/repos/${this.repo}/issues`, {
        title: `${row.date} · ${row.pillar} · ${row.hero}`,
        body: renderBody(row),
        labels: ["post", statusLabel(row.status)],
      });
    }
  }

  private async write(number: number, row: CalendarRow) {
    const closed = ["rejected", "measured"].includes(row.status);
    await this.api("PATCH", `/repos/${this.repo}/issues/${number}`, {
      body: renderBody(row),
      labels: ["post", statusLabel(row.status)],
      state: closed ? "closed" : "open",
    });
  }

  async updateCalendar(row: CalendarRow) {
    if (!this.cache) await this.calendar();
    const number = this.cache!.get(row.id);
    if (!number) throw new Error(`No issue for row ${row.id}`);
    const seen = (await this.api<Issue>("GET", `/repos/${this.repo}/issues/${number}`)).body?.match(/\[seen:([^\]]+)\]/)?.[1];
    await this.write(number, { ...row, notes: [row.notes, seen ? `[seen:${seen}]` : ""].filter(Boolean).join(" ") });
  }

  async markFrameUsed() { /* library lives in the repo; the Strategist's note lists which frames it used */ }
}

async function readJsonFile<T>(path: string, schema: { parse: (v: unknown) => T }): Promise<T[]> {
  try {
    return (JSON.parse(await readFile(path, "utf8")) as unknown[]).map((v) => schema.parse(v));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}
