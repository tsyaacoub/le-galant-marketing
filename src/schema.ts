import { z } from "zod/v4";

export const PILLARS = ["Proof of event", "Dish hero", "Behind the scenes", "Utility", "People"] as const;
export const LANGUAGES = ["en", "ar", "fr", "ar+en", "fr+en", "en+ar"] as const;
export const FORMATS = ["photo", "carousel", "reel"] as const;
export const STATUSES = ["planned", "needs_photo", "draft", "approved", "rejected", "posted", "measured", "failed"] as const;

export type Pillar = (typeof PILLARS)[number];
export type Status = (typeof STATUSES)[number];

/** One row of the calendar tab. Column order in the sheet follows this key order. */
export const CalendarRow = z.object({
  id: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  pillar: z.enum(PILLARS),
  hero: z.string(),
  language: z.enum(LANGUAGES),
  format: z.enum(FORMATS),
  angle: z.string(),
  frame_ids: z.string().default(""),
  image_urls: z.string().default(""),
  caption: z.string().default(""),
  first_comment: z.string().default(""),
  alt_text: z.string().default(""),
  missing_facts: z.string().default(""),
  status: z.enum(STATUSES),
  ig_media_id: z.string().default(""),
  posted_at: z.string().default(""),
  reach: z.string().default(""),
  saves: z.string().default(""),
  likes: z.string().default(""),
  comments: z.string().default(""),
  inquiries: z.string().default(""),
  notes: z.string().default(""),
});
export type CalendarRow = z.infer<typeof CalendarRow>;
export const CALENDAR_COLUMNS = Object.keys(CalendarRow.shape) as (keyof CalendarRow)[];

/** One photo or video in the library tab. `url` must be public for Meta to fetch it. */
export const LibraryFrame = z.object({
  frame_id: z.string(),
  url: z.string(),
  kind: z.enum(["photo", "video"]),
  dish: z.string().default(""),
  setting: z.string().default(""),
  format: z.enum(["card", "full_bleed"]).default("full_bleed"),
  season: z.string().default(""),
  client_consent: z.enum(["yes", "no"]).default("no"),
  source: z.enum(["shoot", "generated", "archive"]).default("shoot"),
  used_on: z.string().default(""),
});
export type LibraryFrame = z.infer<typeof LibraryFrame>;
export const LIBRARY_COLUMNS = Object.keys(LibraryFrame.shape) as (keyof LibraryFrame)[];

/** A date that matters in Lebanon. Catering is booked ahead, so the Strategist posts 2 to 4 weeks before. */
export const KeyDate = z.object({
  date: z.string(),
  name: z.string(),
  angle: z.string().default(""),
});
export type KeyDate = z.infer<typeof KeyDate>;
export const DATES_COLUMNS = Object.keys(KeyDate.shape) as (keyof KeyDate)[];

/** What the Strategist returns: the month, as rows without captions. */
export const StrategistOutput = z.object({
  posts: z.array(
    z.object({
      date: z.string().describe("YYYY-MM-DD, a Monday, Wednesday, Thursday or Saturday"),
      time: z.string().describe("HH:MM Beirut time: 12:30 or 19:30 on weekdays, 11:00 on Saturday"),
      pillar: z.enum(PILLARS),
      hero: z.string().describe("The subject in one line, named precisely"),
      language: z.enum(LANGUAGES),
      format: z.enum(FORMATS),
      angle: z.string().describe("One sentence the Copywriter builds the caption on"),
      frame_ids: z.array(z.string()).describe("Library frame ids to use, empty when no frame fits"),
    }),
  ),
  note_to_owner: z.string().describe("Three sentences at most: what changed from last month and why"),
});
export type StrategistOutput = z.infer<typeof StrategistOutput>;

/** What the Copywriter returns for one row. */
export const CopywriterOutput = z.object({
  caption: z.string(),
  first_comment: z.string().describe("8 to 12 hashtags, space separated, nothing else"),
  alt_text: z.string().describe("One sentence describing the image for screen readers"),
  missing_facts: z.array(z.string()).describe("Facts the caption needed and did not have; empty when none"),
});
export type CopywriterOutput = z.infer<typeof CopywriterOutput>;
