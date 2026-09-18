# Le Galant Catering, Instagram pipeline

Four small agents and a GitHub repository as the shared desk. The Strategist plans a month, the Copywriter drafts each post,
Tony approves from his phone by changing one cell, the Publisher posts what is approved when its time comes,
and the Analyst writes the numbers back so next month's plan learns from this one.

```
Strategist (monthly) -> rows "planned" -> Copywriter (daily) -> "draft"
        -> Tony replies "approve" on the issue -> Publisher (every 30 min) -> "posted"
        -> Analyst (weekly, 7 days later) -> "measured" -> back to the Strategist
```

Nothing is posted without an approval. The Publisher also refuses to post unless `PUBLISH_ENABLED=yes`.

## Where posts live: GitHub Issues

Every post is one issue in this repository, labelled `post` and `status:<state>`. The owner works from the
GitHub app on the phone:

- **approve** (or `ok`, `تمام`) as a reply moves a draft to approved.
- **reject** closes it. **redo** clears the caption; anything after the word becomes a note the Copywriter uses.
- Any other reply is kept as a note (a client name, a fact, a correction).
- A photo attached to a reply is added to the post's images.

Only replies from the repository owner or a collaborator count. The issue body holds the machine copy of the row
inside an HTML comment; do not edit that part by hand.

Photo library and key dates are two JSON files in the repo, `data/library.json` and `data/dates.json`.

Status values, in order: `planned`, `needs_photo`, `draft`, `approved`, `rejected`, `posted`, `measured`, `failed`.

A Google Sheet store also exists (`STORE=sheet`, see `.env.example`) for a team that prefers a spreadsheet.

## Setup

1. **Anthropic.** Create an API key in the Console and save it as the repository secret `ANTHROPIC_API_KEY`
   (Settings, Secrets and variables, Actions). This is the only secret the drafting needs; `GITHUB_TOKEN` is automatic.
2. **Load month one.** Actions tab, `seed`, Run workflow. Sixteen October issues appear.
3. **Draft.** Actions tab, `copywriter`, Run workflow (or wait for 06:00 Beirut). Each issue gets its caption.
4. **Meta, later.** For automatic posting: Business account linked to a Page, a Meta app, a long-lived token with
   `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`; secrets `META_ACCESS_TOKEN` and
   `IG_USER_ID`; variable `PUBLISH_ENABLED=yes` after a dry run. Images attached to issues in a private
   repository are not reachable by Meta; the Publisher needs public image URLs (a public storage bucket). Until then
   posting is manual: copy the caption from the approved issue.

## Try it locally, with no GitHub

```bash
cp .env.example .env          # add ANTHROPIC_API_KEY; set STORE=local
npm install
npm test
npm run copywriter            # drafts the 16 seeded October rows into data/calendar.local.json
npm run publisher             # dry run: prints what would be posted, posts nothing
```

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
