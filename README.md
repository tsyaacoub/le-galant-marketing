# Le Galant Catering, Instagram pipeline

Four small agents and one shared sheet. The Strategist plans a month, the Copywriter drafts each post,
Tony approves from his phone by changing one cell, the Publisher posts what is approved when its time comes,
and the Analyst writes the numbers back so next month's plan learns from this one.

```
Strategist (monthly) -> rows "planned" -> Copywriter (daily) -> "draft"
        -> Tony sets "approved" in the sheet -> Publisher (every 30 min) -> "posted"
        -> Analyst (weekly, 7 days later) -> "measured" -> back to the Strategist
```

Nothing is posted without an approved cell. The Publisher also refuses to post unless `PUBLISH_ENABLED=yes`.

## The sheet

One Google Sheet, three tabs. The header row is the contract; the scripts write the header the first time.

| Tab | Purpose | Columns |
| --- | --- | --- |
| `calendar` | One row per post, from plan to numbers | id, date, time, pillar, hero, language, format, angle, frame_ids, image_urls, caption, first_comment, alt_text, missing_facts, status, ig_media_id, posted_at, reach, saves, likes, comments, inquiries, notes |
| `library` | Every photo or video, with a public URL | frame_id, url, kind, dish, setting, format, season, client_consent, source, used_on |
| `dates` | Dates that matter in Lebanon | date, name, angle |

Status values, in order: `planned`, `needs_photo`, `draft`, `approved`, `rejected`, `posted`, `measured`, `failed`.

The only cells a person edits day to day: `status` (draft to approved or rejected), `image_urls` (paste the
public link(s) of the photo(s) once they exist, space separated), `notes` (facts for the Copywriter, or a reason
for a rejection), and `inquiries` (how many messages a post brought).

`image_urls` must be public links Meta can download. Google Drive share links do not work. A public Supabase
storage bucket, Cloudinary, or any plain HTTPS image URL does.

## Setup, once

1. **Anthropic.** Create an API key in the Console.
2. **Google Sheet.** Create the sheet with the three tabs above (empty is fine). In Google Cloud, create a service
   account, enable the Sheets API, download its JSON key, and share the sheet with the service account's email
   as Editor. Encode the JSON: `base64 -w0 key.json`.
3. **Meta.** The Instagram account must be a Business account linked to a Facebook Page. In Meta for Developers,
   create an app, add the Instagram Graph API product, and generate a long-lived user token with
   `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`, `pages_show_list`,
   `pages_read_engagement`. Find the Instagram user id with `me/accounts?fields=instagram_business_account`.
   Until Meta app review is done the token only works for admins of the app, which is enough for our own account.
4. **GitHub.** Push this folder to a private repository. In Settings, Secrets and variables, Actions, add the
   secrets `ANTHROPIC_API_KEY`, `SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON_B64`, `META_ACCESS_TOKEN`, `IG_USER_ID`,
   and the variable `PUBLISH_ENABLED` set to `no` at first. The four workflows in `.github/workflows` then run
   on their schedules, and each can be started by hand from the Actions tab.
5. **Photos.** Upload the shoot to public storage and fill the `library` tab. Until then the Strategist marks rows
   `needs_photo`, the Copywriter still drafts them, and the Publisher waits for `image_urls`.

Switch `PUBLISH_ENABLED` to `yes` when a dry run has printed exactly what you expect.

## Try it locally, with no sheet

```bash
cp .env.example .env          # add ANTHROPIC_API_KEY; leave STORE=local
npm install
npm test                      # unit tests, no network
npm run copywriter            # drafts the 16 seeded October rows into data/calendar.local.json
npm run publisher             # dry run: prints what would be posted, posts nothing
```

`data/calendar.local.json` ships with October 2026 planned, so the Copywriter has work the first time it runs.
`data/dates.local.json` holds the fixed Lebanese dates; add the movable religious ones each year in the sheet's `dates` tab.

## Schedules (Beirut time)

| Agent | When | What it does |
| --- | --- | --- |
| Strategist | 25th of the month, 07:00 | Plans next month if no rows exist for it yet |
| Copywriter | Every day, 06:00 | Drafts every `planned` or `needs_photo` row with no caption |
| Publisher | Every 30 minutes | Posts `approved` rows whose date and time have passed |
| Analyst | Monday, 08:00 | Fills reach, saves, likes, comments for posts 7 days old |

Cron in GitHub Actions is UTC and does not follow Lebanon's clock change. The scripts decide "due" in Beirut
time themselves, so the Publisher is correct all year; the other three run an hour earlier or later in winter,
which does not matter.

## Voice

The brand voice, pillars and grid rules live in `src/voice.ts`, taken from the Le Galant Instagram Kit.
Change the voice there, not in the prompts. Both agents read it as a cached system prompt.

## Not built yet

- Community manager (replies and lead logging) and image generation for placeholders. Both are next once the
  first month of captions has settled the voice.
- Stories. Meta does not allow API publishing of stories for most accounts; they stay on the phone.
