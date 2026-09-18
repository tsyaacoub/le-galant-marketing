import { describe, expect, it } from "vitest";
import { CALENDAR_COLUMNS, CalendarRow, StrategistOutput } from "../src/schema.js";

describe("calendar rows", () => {
  it("fills optional columns so a sheet with blanks still parses", () => {
    const row = CalendarRow.parse({
      id: "2026-10-01", date: "2026-10-01", time: "12:30", pillar: "Dish hero", hero: "Salmon Rose and Quinoa Mosaic",
      language: "en", format: "photo", angle: "The first platter to empty", status: "planned",
    });
    expect(row.caption).toBe("");
    expect(row.status).toBe("planned");
  });
  it("keeps id first and status present in the sheet header", () => {
    expect(CALENDAR_COLUMNS[0]).toBe("id");
    expect(CALENDAR_COLUMNS).toContain("status");
  });
  it("rejects a pillar outside the five", () => {
    expect(() => StrategistOutput.parse({ posts: [{ date: "2026-10-01", time: "12:30", pillar: "Promo", hero: "", language: "en", format: "photo", angle: "", frame_ids: [] }], note_to_owner: "" })).toThrow();
  });
});
