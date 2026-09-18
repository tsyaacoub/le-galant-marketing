import { describe, expect, it } from "vitest";
import { applyComments, extractImageUrls, parseBody, renderBody } from "../src/github-store.js";
import { CalendarRow } from "../src/schema.js";

const base = CalendarRow.parse({
  id: "2026-10-02", date: "2026-09-30", time: "12:30", pillar: "Dish hero", hero: "Salmon Rose and Quinoa Mosaic",
  language: "en", format: "photo", angle: "First to empty", status: "draft", caption: "Smoked salmon roses.", first_comment: "#LeGalantCatering",
});
const c = (body: string, assoc = "OWNER", created_at = "2026-09-20T10:00:00Z") => ({ id: 1, body, created_at, author_association: assoc, user: { login: "tony" } });

describe("issue body round trip", () => {
  it("renders and parses back the same row", () => {
    expect(parseBody(renderBody(base))).toEqual(base);
  });
  it("returns null for a body without the marker", () => {
    expect(parseBody("hello")).toBeNull();
  });
});

describe("owner comments", () => {
  it("approve moves a draft to approved", () => {
    expect(applyComments(base, [c("Approve")], "").row.status).toBe("approved");
  });
  it("approve in Arabic works", () => {
    expect(applyComments(base, [c("تمام")], "").row.status).toBe("approved");
  });
  it("a stranger cannot approve", () => {
    expect(applyComments(base, [c("approve", "NONE")], "").row.status).toBe("draft");
  });
  it("redo clears the caption and sends it back to the Copywriter", () => {
    const r = applyComments(base, [c("redo, say it serves twelve")], "").row;
    expect(r.caption).toBe("");
    expect(r.status).toBe("needs_photo");
    expect(r.notes).toContain("serves twelve");
  });
  it("plain text becomes a note", () => {
    expect(applyComments(base, [c("the client is Hôpital X, consent yes")], "").row.notes).toContain("consent yes");
  });
  it("a photo in a comment is added to image_urls", () => {
    const r = applyComments(base, [c("![img](https://github.com/user-attachments/assets/abc-123)")], "").row;
    expect(r.image_urls).toBe("https://github.com/user-attachments/assets/abc-123");
  });
  it("comments already seen are skipped", () => {
    const r = applyComments(base, [c("approve", "OWNER", "2026-09-19T00:00:00Z")], "2026-09-19T00:00:00Z");
    expect(r.row.status).toBe("draft");
    expect(r.changed).toBe(false);
  });
});

describe("image urls", () => {
  it("finds attachments, markdown images and bare image links", () => {
    const t = "see https://github.com/user-attachments/assets/1a2b-3c and ![x](https://cdn.example.com/a.jpg) plus https://x.com/b.png";
    expect(extractImageUrls(t)).toHaveLength(3);
  });
});
