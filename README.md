# Recreate

A format-idea library and creator-brief tool for a small content team.

1. **Format ideas** — saved Instagram/TikTok posts worth learning from. Each entry holds
   the link, an inline video preview, one tag, a status (To try / Tried), and two
   structured comments: **Hook** and **Body**.
2. **Creator briefs** — for any saved idea, a shot-by-shot brief you send to a creator.
   Each shot is a screenshot, optional freehand annotation, a timestamp and a comment.
   The **Print view** renders it as an A4 document for PDF export.

There is deliberately **no analytics** — no views, engagement rate, velocity, trend
labels or posting-cadence scoring. An earlier version of this product had all of that
and it was removed. Please don't reintroduce it.

Built from `design_handoff_recreate/` — shape B in that handoff (real app, multi-user).

---

## Quick start

Requires Node 20+ and PostgreSQL 17.

```bash
npm install
cp .env.example .env          # defaults point at postgres://localhost:5432/recreate
createdb recreate
npm run migrate
npm run seed                  # optional: the design's mock library, to look at
npm run dev                   # API on :4000, client on :5173
```

Open http://localhost:5173.

Production:

```bash
npm run build
NODE_ENV=production npm start  # serves the built client and the API from :4000
```

## Layout

```
client/          React + Vite SPA
  src/screens/   Format ideas, Creator briefs, Print view
  src/lib/       API client, store, embed helpers
  src/styles.css design tokens and every component class
server/          Express API
  src/routes/    tags, ideas, briefs, shots, files
  src/lib/       db, storage, cleanup, env
  migrations/    plain .sql, applied in filename order
uploads/         shot screenshots (local storage driver; gitignored)
```

## Data model

| table    | shape that matters                                                     |
| -------- | ---------------------------------------------------------------------- |
| `tags`   | `name` unique **case-insensitively** — "Hook" and "hook" are one tag    |
| `ideas`  | `tag_id` is a nullable FK — **one tag per idea**, not a join table      |
| `briefs` | `idea_id` is **UNIQUE** — one brief per video                          |
| `shots`  | `strokes` is JSONB; `image_key` is an object key, never a data URL      |

Two deletion decisions, both enforced by the database rather than by a handler:

- **Deleting a tag** clears it off every idea using it (`ON DELETE SET NULL`). The API
  returns how many ideas were affected; the UI confirms with that count first.
- **Deleting an idea** takes its brief and that brief's shots with it
  (`ON DELETE CASCADE`). The confirm dialog says so before it happens.

Postgres cascades rows but cannot cascade into object storage, so the delete paths
remove the screenshots first. A storage failure there is logged and swallowed — a
stranded object is a cost problem, a failed delete would be a correctness one.

## Screenshot storage

Screenshots are uploaded on drop and the row keeps only the key. Nothing is ever
stored as a data URL — that is what makes the print view reliable.

- **Default**: local disk under `UPLOAD_DIR` (relative paths resolve from the repo
  root, not from cwd, so dev and production land on the same folder).
- **Object storage**: set `S3_BUCKET` (plus `AWS_REGION`, and `S3_ENDPOINT` for an
  S3-compatible service like Cloudflare R2 or MinIO). Credentials come from the
  standard AWS environment variables or the instance role.

Either way the client sees one URL shape, `/api/files/<key>`: the local driver streams
the file, the S3 driver redirects to a short-lived signed URL. Keys are UUIDs we mint
and are pattern-checked before touching any filesystem or bucket call.

## Annotations

A stroke is a list of `[x, y]` points in a **normalised 0–100 space** relative to the
frame, stored as JSON and rendered as SVG polylines with `vector-effect:
non-scaling-stroke`. Keeping it vector rather than a flattened raster is what makes
annotations print sharp at any size and stay editable and undoable.

While draw mode is on, an overlay owns pointer events so the slot underneath is
untouchable and a drag can never fire a drop mid-stroke. Strokes commit on pointer-up.

## Print / PDF

The print sheet is the deliverable a creator receives, so treat printing as a real
feature. `/briefs/:id/print` renders a white A4 sheet; **Print / PDF** opens the
browser's print dialog.

Page geometry lives in `@page` and `.paper-page` and nowhere else. The app shell is a
`100vh` clipped viewport, so `@media print` releases height and overflow on it —
without that, the flow is capped at a single page. Shot rows carry `break-inside:
avoid`, and comments print as flowing text rather than textareas, which print at their
rendered height and clip.

Verified: a three-shot brief renders as **2 A4 pages** with screenshots and
annotations intact and no shot split across the break.

## Embeds

Public embed endpoints, no API keys or OAuth anywhere in this product:

- Instagram — `https://www.instagram.com/{reel|p}/{code}/embed`
- TikTok — `https://www.tiktok.com/embed/v2/{videoId}`

Private, deleted or age-restricted posts will not render. The card pairs every frame
with an "Open original" link and shows an explicit fallback for unembeddable links,
rather than an empty frame.

## API

| method | path                    | notes                                                |
| ------ | ----------------------- | ---------------------------------------------------- |
| GET    | `/api/tags`             | with per-tag idea counts, in library (creation) order |
| POST   | `/api/tags`             | idempotent — returns the existing tag if the name is taken |
| DELETE | `/api/tags/:id`         | returns `clearedFrom`                                 |
| GET    | `/api/ideas`            | supports `platform`, `status`, `tagId` filters        |
| POST   | `/api/ideas`            | platform and handle are derived from the URL          |
| PATCH  | `/api/ideas/:id`        | partial — everything on a card saves as you type      |
| DELETE | `/api/ideas/:id`        | returns `deletedBriefId`                              |
| GET    | `/api/briefs`           | summaries                                             |
| GET    | `/api/briefs/:id`       | full brief with shots and live reference              |
| POST   | `/api/briefs`           | `{ideaId}` — creates, or returns the existing brief    |
| PATCH  | `/api/briefs/:id`       |                                                       |
| DELETE | `/api/briefs/:id`       |                                                       |
| POST   | `/api/briefs/:id/shots` | appends a shot                                        |
| PATCH  | `/api/shots/:id`        | timestamp, comment, strokes                           |
| DELETE | `/api/shots/:id`        |                                                       |
| POST   | `/api/shots/:id/image`  | multipart `file`; images only, 12 MB cap              |
| DELETE | `/api/shots/:id/image`  |                                                       |
| GET    | `/api/files/*key`       | serves a screenshot                                   |

The brief's reference block (handle, tag, URL, Hook, Body) is read live off the idea
rather than copied onto the brief, so editing an idea's Hook updates every brief citing it.

The board fetches all ideas and filters client-side on purpose: the tag chips show
counts scoped to the *other two* filters, and deriving those from one in-memory list
beats a round trip per chip. This is a small team's reading list, not a feed. If the
library ever grows past a few thousand rows, move counts into a single grouped query.

## Deploying

The server serves the built client and the API from one process, so this deploys as a
**single Node web service** plus a Postgres database plus a bucket.

```
build:  npm install && npm run build
start:  NODE_ENV=production npm start        # must be production, or the client is not served
health: /api/health
```

Run migrations as a release/pre-deploy step — **`npm run migrate:prod`**, not
`npm run migrate`. The latter needs `tsx`, a devDependency that production installs
prune. `migrate:prod` runs the compiled `dist/migrate.js` and is idempotent.

Required environment:

| variable       | value                                                        |
| -------------- | ------------------------------------------------------------ |
| `NODE_ENV`     | `production`                                                 |
| `DATABASE_URL` | from the managed database                                    |
| `DATABASE_SSL` | `require` — managed Postgres presents a cert Node won't verify |
| `S3_BUCKET`    | see below — **not optional in most deployments**              |
| `PORT`         | usually injected by the host                                  |

### Screenshots need somewhere that survives a deploy

Render, Railway and Fly all give a container an **ephemeral filesystem**: it is wiped on
every deploy and restart. Point `UPLOAD_DIR` at the container's own disk and every
screenshot 404s after the first redeploy — silently, because the rows still hold their
keys. Two ways out:

**A persistent disk** (what `render.yaml` does). Mount it and set `UPLOAD_DIR` to the
absolute mount path. Uses the local-storage driver, which is the path exercised in
testing. Requires a paid instance type, is tied to one instance so it does not scale
horizontally, and does not come with you if you change hosts.

**Object storage.** Set `S3_BUCKET`, `S3_ENDPOINT`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`
and `AWS_SECRET_ACCESS_KEY`, and remove the disk. Cloudflare R2 is the cheap default —
S3-compatible, no egress fees. Portable and scales past one instance.

Switching between them is env vars only; the driver is chosen by whether `S3_BUCKET` is
set. Note the S3 driver is written against the standard SDK but has only ever been
exercised against the local driver — test one upload right after switching.

### Access: deliberately open

**This deploys with no authentication.** Anyone who has the URL can read, edit and
delete the entire library — ideas, briefs, screenshots, all of it. That was a considered
call, not an oversight: the link is the only thing standing in front of the data.

What that means in practice:

- Treat the URL as a secret. Do not put it in a public README, a shared doc, or an
  issue tracker anyone can read.
- A search engine that reaches the URL will index it. There is no `robots.txt` and no
  `noindex` header.
- There is no audit trail. If something is deleted, nothing records who did it, and
  there is no undo — deleting an idea cascades to its brief and shots permanently.

When it stops being acceptable, the cheapest fixes in order of effort: put Cloudflare
Access or Tailscale in front of the service (no code), add a shared-password gate
(one session cookie, every `/api` route behind it), or build real accounts (a `user_id`
migration across every table — see **Not built**).

## Not built

- **Authentication.** There are no users, sessions or workspaces — anyone who can reach
  the server has full access. The handoff called this optional; add it before putting
  this anywhere public. The schema has no `user_id` columns yet, so that migration
  touches every table.
- **Pagination** on the ideas board (see above).
