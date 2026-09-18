import { readFile, writeFile } from "node:fs/promises";
import { google } from "googleapis";
import { config } from "./config.js";
import {
  CALENDAR_COLUMNS, CalendarRow, DATES_COLUMNS, KeyDate, LIBRARY_COLUMNS, LibraryFrame,
} from "./schema.js";
import type { ZodTypeAny, z } from "zod/v4";

/** The three tabs the agents read and write. The owner edits the same tabs by hand. */
export interface Store {
  calendar(): Promise<CalendarRow[]>;
  library(): Promise<LibraryFrame[]>;
  dates(): Promise<KeyDate[]>;
  appendCalendar(rows: CalendarRow[]): Promise<void>;
  updateCalendar(row: CalendarRow): Promise<void>;
  markFrameUsed(frameId: string, rowId: string): Promise<void>;
}

// ---------- Local JSON store: try the pipeline with no sheet at all ----------

const LOCAL = {
  calendar: "data/calendar.local.json",
  library: "data/library.json",
  dates: "data/dates.json",
};

async function readJson<T extends ZodTypeAny>(path: string, schema: T): Promise<z.infer<T>[]> {
  try {
    const raw = JSON.parse(await readFile(path, "utf8")) as unknown[];
    return raw.map((r) => schema.parse(r));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export class LocalStore implements Store {
  calendar() { return readJson(LOCAL.calendar, CalendarRow); }
  library() { return readJson(LOCAL.library, LibraryFrame); }
  dates() { return readJson(LOCAL.dates, KeyDate); }
  async appendCalendar(rows: CalendarRow[]) {
    const all = await this.calendar();
    await writeFile(LOCAL.calendar, JSON.stringify([...all, ...rows], null, 2));
  }
  async updateCalendar(row: CalendarRow) {
    const all = await this.calendar();
    const i = all.findIndex((r) => r.id === row.id);
    if (i < 0) throw new Error(`Row ${row.id} not found`);
    all[i] = row;
    await writeFile(LOCAL.calendar, JSON.stringify(all, null, 2));
  }
  async markFrameUsed(frameId: string, rowId: string) {
    const all = await this.library();
    const f = all.find((x) => x.frame_id === frameId);
    if (!f) return;
    f.used_on = [f.used_on, rowId].filter(Boolean).join(" ");
    await writeFile(LOCAL.library, JSON.stringify(all, null, 2));
  }
}

// ---------- Google Sheets store: the real thing ----------

const TABS = { calendar: "calendar", library: "library", dates: "dates" } as const;

function rowsToObjects<T extends ZodTypeAny>(values: string[][], columns: string[], schema: T): z.infer<T>[] {
  if (values.length === 0) return [];
  const header = values[0].map((h) => h.trim());
  const out: z.infer<T>[] = [];
  for (const line of values.slice(1)) {
    if (line.every((c) => !c)) continue;
    const obj: Record<string, string> = {};
    for (const col of columns) {
      const idx = header.indexOf(col);
      obj[col] = idx >= 0 ? (line[idx] ?? "") : "";
    }
    out.push(schema.parse(obj));
  }
  return out;
}

export class SheetsStore implements Store {
  private sheets;
  private id: string;
  constructor() {
    const auth = new google.auth.GoogleAuth({
      credentials: config.serviceAccount(),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    this.sheets = google.sheets({ version: "v4", auth });
    this.id = config.sheetId();
  }

  private async values(tab: string): Promise<string[][]> {
    const res = await this.sheets.spreadsheets.values.get({ spreadsheetId: this.id, range: tab });
    return (res.data.values ?? []) as string[][];
  }

  async calendar() { return rowsToObjects(await this.values(TABS.calendar), CALENDAR_COLUMNS, CalendarRow); }
  async library() { return rowsToObjects(await this.values(TABS.library), LIBRARY_COLUMNS, LibraryFrame); }
  async dates() { return rowsToObjects(await this.values(TABS.dates), DATES_COLUMNS, KeyDate); }

  async appendCalendar(rows: CalendarRow[]) {
    const existing = await this.values(TABS.calendar);
    if (existing.length === 0) {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.id, range: `${TABS.calendar}!A1`, valueInputOption: "RAW",
        requestBody: { values: [CALENDAR_COLUMNS as string[]] },
      });
    }
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.id, range: TABS.calendar, valueInputOption: "RAW", insertDataOption: "INSERT_ROWS",
      requestBody: { values: rows.map((r) => CALENDAR_COLUMNS.map((c) => r[c] ?? "")) },
    });
  }

  /** Rewrites the one line whose id matches. Header order in the sheet decides column positions. */
  async updateCalendar(row: CalendarRow) {
    const values = await this.values(TABS.calendar);
    const header = values[0] ?? [];
    const idCol = header.indexOf("id");
    const line = values.findIndex((v, i) => i > 0 && v[idCol] === row.id);
    if (line < 0) throw new Error(`Row ${row.id} not found in sheet`);
    const out = header.map((h) => (h in row ? String(row[h as keyof CalendarRow] ?? "") : values[line][header.indexOf(h)] ?? ""));
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.id, range: `${TABS.calendar}!A${line + 1}`, valueInputOption: "RAW",
      requestBody: { values: [out] },
    });
  }

  async markFrameUsed(frameId: string, rowId: string) {
    const values = await this.values(TABS.library);
    const header = values[0] ?? [];
    const idCol = header.indexOf("frame_id");
    const usedCol = header.indexOf("used_on");
    if (idCol < 0 || usedCol < 0) return;
    const line = values.findIndex((v, i) => i > 0 && v[idCol] === frameId);
    if (line < 0) return;
    const used = [values[line][usedCol], rowId].filter(Boolean).join(" ");
    const colLetter = String.fromCharCode(65 + usedCol);
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.id, range: `${TABS.library}!${colLetter}${line + 1}`, valueInputOption: "RAW",
      requestBody: { values: [[used]] },
    });
  }
}

export async function openStore(): Promise<Store> {
  if (config.store === "github") {
    const { GitHubStore } = await import("./github-store.js");
    return new GitHubStore();
  }
  if (config.store === "sheet" && !(process.env.SHEET_ID && process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64)) {
    console.log("Sheet not configured yet (SHEET_ID or GOOGLE_SERVICE_ACCOUNT_JSON_B64 missing); nothing to do.");
    process.exit(0);
  }
  return config.store === "sheet" ? new SheetsStore() : new LocalStore();
}
