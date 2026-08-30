import './lib/env.js';
import { pool, query, one } from './lib/db.js';
import { detectPlatform } from './lib/links.js';

/**
 * The prototype's mock library, so a fresh database has something to look at.
 * Optional and idempotent — it does nothing if any idea already exists.
 */
const TAGS = [
  'hook', 'process', 'no voiceover', 'fast cut', 'comparison',
  'carousel', 'retention', 'talking head', 'screen record',
];

// Handles are explicit: an Instagram permalink carries no @handle, so deriving
// one from the URL would read as "instagram.com" for half the demo library.
const IDEAS = [
  {
    url: 'https://www.tiktok.com/@studiokettle/video/7381920448512377110',
    source: '@studiokettle',
    note: 'Silent build, single fixed camera, caption carries the whole story',
    hook: 'No talking — the first frame is already mid-build, so there is nothing to skip past.',
    body: 'One unbroken take, caption card every few seconds carrying the explanation.',
    tag: 'no voiceover',
    status: 'To try',
  },
  {
    url: 'https://www.instagram.com/reel/C9wKb2xQrLp',
    source: '@petertheorem',
    note: 'Opens mid-sentence on the punchline, then rewinds to explain',
    hook: 'Starts on the conclusion, no setup — the confusion is the hook.',
    body: 'Rewinds and walks the reasoning back in order, ends where it opened.',
    tag: 'hook',
    status: 'To try',
  },
  {
    url: 'https://www.tiktok.com/@lowfihouse/video/7377100294851203334',
    source: '@lowfihouse',
    note: 'Three versions of the same layout, cut hard every four seconds',
    hook: '', body: '', tag: 'fast cut', status: 'Tried',
  },
  {
    url: 'https://www.instagram.com/p/C8ryyTgOm4B',
    source: '@formandtable',
    note: 'Carousel where slide one is only a question, answered on slide six',
    hook: '', body: '', tag: 'carousel', status: 'To try',
  },
  {
    url: 'https://www.tiktok.com/@archivemode/video/7362540118662859522',
    source: '@archivemode',
    note: 'Screen recording sped up 8×, real-time voice over the top',
    hook: '', body: '', tag: 'screen record', status: 'Tried',
  },
];

async function main(): Promise<void> {
  const existing = await one<{ n: number }>('SELECT COUNT(*)::int AS n FROM ideas');
  if ((existing?.n ?? 0) > 0) {
    console.log('Ideas already present — leaving the database alone.');
    await pool.end();
    return;
  }

  const tagIds = new Map<string, number>();
  for (const name of TAGS) {
    const row = await one<{ id: number }>(
      `INSERT INTO tags (name) VALUES ($1)
       ON CONFLICT (lower(name)) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [name],
    );
    tagIds.set(name, row!.id);
  }

  // Oldest first, spaced a few days apart, so "saved" dates read plausibly.
  for (const [i, idea] of [...IDEAS].reverse().entries()) {
    await query(
      `INSERT INTO ideas (url, platform, source_handle, note, hook, body, tag_id, status, saved_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() - make_interval(days => $9))`,
      [
        idea.url,
        detectPlatform(idea.url),
        idea.source,
        idea.note,
        idea.hook,
        idea.body,
        tagIds.get(idea.tag) ?? null,
        idea.status,
        (IDEAS.length - 1 - i) * 4,
      ],
    );
  }

  console.log(`Seeded ${TAGS.length} tags and ${IDEAS.length} ideas.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
