import "node:process";

export const BEIRUT = "Asia/Beirut";

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export const config = {
  store: (process.env.STORE ?? "local") as "local" | "sheet",
  sheetId: () => env("SHEET_ID"),
  serviceAccount: () => JSON.parse(Buffer.from(env("GOOGLE_SERVICE_ACCOUNT_JSON_B64"), "base64").toString("utf8")),
  metaToken: () => env("META_ACCESS_TOKEN"),
  igUserId: () => env("IG_USER_ID"),
  publishEnabled: process.env.PUBLISH_ENABLED === "yes",
  model: "claude-opus-5",
};

/** YYYY-MM-DD for today in Lebanon. Servers run on UTC; the bakery does not. */
export function todayInBeirut(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BEIRUT, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** "HH:MM" for now in Lebanon. */
export function timeInBeirut(now = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: BEIRUT, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
}

/** True when a row dated `date` at local `time` is due at `now`, Beirut time. */
export function isDue(date: string, time: string, now = new Date()): boolean {
  const today = todayInBeirut(now);
  if (date < today) return true;
  if (date > today) return false;
  return (time || "00:00") <= timeInBeirut(now);
}

/** First day of the month after the one containing `date` (YYYY-MM-DD). */
export function nextMonth(date = todayInBeirut()): { year: number; month: number; label: string } {
  const [y, m] = date.split("-").map(Number);
  const year = m === 12 ? y + 1 : y;
  const month = m === 12 ? 1 : m + 1;
  const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  return { year, month, label };
}

/** Days between two YYYY-MM-DD dates. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}
