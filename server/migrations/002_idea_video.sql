-- A reference video per idea, so anyone opening a brief can scrub it and pull
-- their own frames rather than relying on whoever built the brief.
--
-- Like shots.image_key this is an object-storage key, never inline data. NULL
-- until a video is attached; ideas without one behave exactly as before.

ALTER TABLE ideas ADD COLUMN IF NOT EXISTS video_key TEXT;
