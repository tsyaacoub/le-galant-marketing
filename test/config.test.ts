import { describe, expect, it } from "vitest";
import { daysBetween, isDue, nextMonth, todayInBeirut } from "../src/config.js";

describe("Beirut time", () => {
  it("todayInBeirut rolls the date at Beirut midnight, not UTC midnight", () => {
    // 22:30 UTC on 30 Sep 2026 is 01:30 on 1 Oct in Beirut (UTC+3 in summer time)
    expect(todayInBeirut(new Date("2026-09-30T22:30:00Z"))).toBe("2026-10-01");
  });
  it("isDue compares local time on the same day", () => {
    const now = new Date("2026-10-01T09:00:00Z"); // 12:00 Beirut
    expect(isDue("2026-10-01", "12:30", now)).toBe(false);
    expect(isDue("2026-10-01", "11:00", now)).toBe(true);
    expect(isDue("2026-09-30", "19:30", now)).toBe(true);
    expect(isDue("2026-10-02", "11:00", now)).toBe(false);
  });
  it("nextMonth wraps December", () => {
    expect(nextMonth("2026-12-25")).toEqual({ year: 2027, month: 1, label: "January 2027" });
    expect(nextMonth("2026-09-25").label).toBe("October 2026");
  });
  it("daysBetween counts whole days", () => {
    expect(daysBetween("2026-10-01", "2026-10-08")).toBe(7);
  });
});
