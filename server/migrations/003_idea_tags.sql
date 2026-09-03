-- Recreate — an idea can carry several tags.
--
-- The handoff assumed one tag per idea (ideas.tag_id). In practice a format is
-- often several things at once ("Talking Head Hook" + "How To Hook"), so tags
-- become a many-to-many via a join table. Existing single tags are carried over
-- so nothing is lost, then the old column is dropped.

CREATE TABLE IF NOT EXISTS idea_tags (
  idea_id BIGINT NOT NULL REFERENCES ideas (id) ON DELETE CASCADE,
  tag_id  BIGINT NOT NULL REFERENCES tags (id)  ON DELETE CASCADE,
  PRIMARY KEY (idea_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idea_tags_tag_id_idx ON idea_tags (tag_id);

-- Carry the one-tag-per-idea data across before the column goes.
INSERT INTO idea_tags (idea_id, tag_id)
  SELECT id, tag_id FROM ideas WHERE tag_id IS NOT NULL
  ON CONFLICT DO NOTHING;

DROP INDEX IF EXISTS ideas_tag_id_idx;
ALTER TABLE ideas DROP COLUMN IF EXISTS tag_id;
