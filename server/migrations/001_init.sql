-- Recreate — initial schema.
--
-- Shapes that come straight from the handoff and are not incidental:
--   * one tag per idea            -> ideas.tag_id is a nullable FK, not a join table
--   * one brief per idea          -> briefs.idea_id is UNIQUE
--   * annotations stay vector     -> shots.strokes is JSONB in a normalised 0-100 space
--   * screenshots live in storage -> shots.image_key is an object key, never a data URL
--
-- Deliberately absent: anything analytics-shaped. No views, engagement, velocity,
-- trend labels or cadence scoring. An earlier product had them and they were removed.

CREATE TABLE IF NOT EXISTS tags (
  id   BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL
);

-- Tag names are unique case-insensitively: "Hook" and "hook" are one tag.
CREATE UNIQUE INDEX IF NOT EXISTS tags_name_lower_key ON tags (lower(name));

CREATE TABLE IF NOT EXISTS ideas (
  id            BIGSERIAL PRIMARY KEY,
  url           TEXT NOT NULL,
  platform      TEXT NOT NULL CHECK (platform IN ('Instagram', 'TikTok', 'Link')),
  source_handle TEXT NOT NULL DEFAULT '',
  note          TEXT NOT NULL DEFAULT '',
  hook          TEXT NOT NULL DEFAULT '',
  body          TEXT NOT NULL DEFAULT '',
  -- SET NULL is the "deleting a tag clears it off every idea using it" rule,
  -- enforced by the database rather than by whichever handler happens to run.
  tag_id        BIGINT REFERENCES tags (id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'To try' CHECK (status IN ('To try', 'Tried')),
  saved_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ideas_tag_id_idx   ON ideas (tag_id);
CREATE INDEX IF NOT EXISTS ideas_saved_at_idx ON ideas (saved_at DESC);

CREATE TABLE IF NOT EXISTS briefs (
  id         BIGSERIAL PRIMARY KEY,
  -- UNIQUE is the "one brief per video" rule. CASCADE is the answer to the
  -- handoff's open question about orphaned briefs: deleting an idea takes its
  -- brief with it, and the confirm dialog says so before it happens.
  idea_id    BIGINT NOT NULL UNIQUE REFERENCES ideas (id) ON DELETE CASCADE,
  title      TEXT NOT NULL DEFAULT '',
  creator    TEXT NOT NULL DEFAULT '',
  -- Free text, not a date: the design's "Due date" is an open field and the
  -- team writes things like "Fri" or "before the shoot" in it.
  due        TEXT NOT NULL DEFAULT '',
  intro      TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shots (
  id              BIGSERIAL PRIMARY KEY,
  brief_id        BIGINT NOT NULL REFERENCES briefs (id) ON DELETE CASCADE,
  position        INTEGER NOT NULL,
  timestamp_label TEXT NOT NULL DEFAULT '',
  comment         TEXT NOT NULL DEFAULT '',
  -- Object-storage key. NULL until the user drops a screenshot in.
  image_key       TEXT,
  -- [[ [x, y], ... ], ...] with x/y in 0-100 relative to the frame, so a stroke
  -- survives any render size and prints as vector rather than a flattened raster.
  strokes         JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS shots_brief_position_idx ON shots (brief_id, position);
