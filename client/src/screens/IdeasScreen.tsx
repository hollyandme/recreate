import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api, type Idea, type Platform, type Status } from '../lib/api';
import { embedUrl, platformIcon, savedLabel } from '../lib/embed';
import { useLibrary } from '../lib/store';
import { DOWNLOADER_BY_PLATFORM, openDownloader } from '../lib/download';
import { AutoTextarea } from '../components/AutoField';

type PlatformFilter = 'All' | Platform;
type StatusFilter = 'Any' | Status;
type TagFilter = 'any' | 'untagged' | number;

export function IdeasScreen() {
  const lib = useLibrary();
  const navigate = useNavigate();

  const [newUrl, setNewUrl] = useState('');
  const [newNote, setNewNote] = useState('');
  const [newTagIds, setNewTagIds] = useState<number[]>([]);
  const [newTagName, setNewTagName] = useState('');

  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('All');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('Any');
  const [tagFilter, setTagFilter] = useState<TagFilter>('any');

  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // Close the "Add format" popup on Escape.
  useEffect(() => {
    if (!addOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAddOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [addOpen]);

  const guard = async (fn: () => Promise<unknown>) => {
    try {
      setProblem(null);
      await fn();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Something went wrong');
    }
  };

  // Counts on the tag chips are scoped to the other two filters, so switching
  // to TikTok immediately reports how many TikTok ideas carry each tag.
  const scoped = useMemo(
    () =>
      lib.ideas
        .filter((x) => platformFilter === 'All' || x.platform === platformFilter)
        .filter((x) => statusFilter === 'Any' || x.status === statusFilter),
    [lib.ideas, platformFilter, statusFilter],
  );

  const rows = useMemo(
    () =>
      scoped.filter((x) =>
        tagFilter === 'any'
          ? true
          : tagFilter === 'untagged'
            ? x.tagIds.length === 0
            : x.tagIds.includes(tagFilter),
      ),
    [scoped, tagFilter],
  );

  // Only tags actually in use get a filter chip, plus "Untagged" if any idea is.
  const tagChips = useMemo(() => {
    const inUse = lib.tags.filter((t) => lib.ideas.some((x) => x.tagIds.includes(t.id)));
    const chips: { key: TagFilter; label: string; count: number }[] = [
      { key: 'any', label: 'All', count: scoped.length },
      ...inUse.map((t) => ({
        key: t.id as TagFilter,
        label: t.name,
        count: scoped.filter((x) => x.tagIds.includes(t.id)).length,
      })),
    ];
    if (lib.ideas.some((x) => x.tagIds.length === 0)) {
      chips.push({
        key: 'untagged',
        label: 'Untagged',
        count: scoped.filter((x) => x.tagIds.length === 0).length,
      });
    }
    return chips;
  }, [lib.tags, lib.ideas, scoped]);

  const saveIdea = () =>
    guard(async () => {
      const url = newUrl.trim();
      if (!url) return;
      setSaving(true);
      try {
        await lib.addIdea({ url, note: newNote.trim(), tagIds: newTagIds });
        setNewUrl('');
        setNewNote('');
        setNewTagIds([]);
        setAddOpen(false);
      } finally {
        setSaving(false);
      }
    });

  const createTag = () =>
    guard(async () => {
      const tag = await lib.createTag(newTagName);
      if (!tag) return;
      setNewTagName('');
      // Newly created tags are pre-selected for the idea being saved.
      setNewTagIds((ids) => (ids.includes(tag.id) ? ids : [...ids, tag.id]));
    });

  const destroyTag = (id: number, name: string) =>
    guard(async () => {
      const used = lib.ideas.filter((x) => x.tagIds.includes(id)).length;
      if (
        used > 0 &&
        !window.confirm(
          `Delete the tag "${name}"? It is on ${used} ${used === 1 ? 'idea' : 'ideas'} and will be removed from them.`,
        )
      ) {
        return;
      }
      await lib.removeTag(id);
      setNewTagIds((ids) => ids.filter((x) => x !== id));
      if (tagFilter === id) setTagFilter('any');
    });

  const openBrief = (idea: Idea) =>
    guard(async () => {
      const brief = await api.openBrief(idea.id);
      navigate(`/briefs/${brief.id}`);
    });

  return (
    <div className="screen">
      <header className="page-head">
        <div>
          <div className="kicker-row">
            <span className="medallion">
              <i className="ph ph-bookmarks-simple" />
            </span>
            <span className="kicker">Format ideas</span>
          </div>
          <h1 className="page-title">A library of ideas worth stealing</h1>
        </div>
        <button className="addbtn" onClick={() => setAddOpen(true)}>
          <i className="ph ph-plus" />
          <span>Add format</span>
        </button>
      </header>

      {(problem ?? lib.error) && (
        <div className="fallback" role="alert">
          <i className="ph ph-warning-circle" />
          <span>{problem ?? lib.error}</span>
        </div>
      )}

      {addOpen && (
        <div className="modal-backdrop" onClick={() => setAddOpen(false)}>
          <section
            className="glass panel modal"
            role="dialog"
            aria-modal="true"
            aria-label="Add a format"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div className="panel-head" style={{ flex: 1 }}>
                <h2>Save a link</h2>
                <span>Paste an Instagram or TikTok URL and say what caught your eye</span>
              </div>
              <button className="icon-quiet is-bordered" title="Close" onClick={() => setAddOpen(false)}>
                <i className="ph ph-x" />
              </button>
            </div>

            <div className="row">
              <input
                className="input input-pill"
                style={{ flex: '1 1 300px', minWidth: 0 }}
                placeholder="https://www.tiktok.com/@handle/video/…"
                value={newUrl}
                autoFocus
                onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveIdea();
                }}
              />
              <input
                className="input input-pill"
                style={{ flex: '1 1 240px', minWidth: 0 }}
                placeholder="What is the format doing?"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveIdea();
                }}
              />
              <button
                className="btn btn-accent"
                onClick={() => void saveIdea()}
                disabled={saving || !newUrl.trim()}
              >
                <i className="ph ph-bookmark-simple" />
                <span>Save</span>
              </button>
            </div>

            <div className="divider-top">
              <span className="label-xs">Tags for this idea · pick any number · × deletes a tag from the library</span>
              <div className="row-tight">
                {lib.tags.map((t) => {
                  const on = newTagIds.includes(t.id);
                  return (
                    <span key={t.id} className={`chip chip-split${on ? ' is-on' : ''}`}>
                      <span
                        className="chip-body"
                        onClick={() =>
                          setNewTagIds((ids) =>
                            on ? ids.filter((x) => x !== t.id) : [...ids, t.id],
                          )
                        }
                      >
                        <i className={on ? 'ph-fill ph-check-circle' : 'ph ph-tag'} />
                        <span>{t.name}</span>
                      </span>
                      <span
                        className="icon-x"
                        title={
                          t.ideaCount > 0
                            ? `Delete this tag everywhere (on ${t.ideaCount} ${t.ideaCount === 1 ? 'idea' : 'ideas'})`
                            : 'Delete this tag'
                        }
                        onClick={() => void destroyTag(t.id, t.name)}
                      >
                        <i className="ph ph-x" />
                      </span>
                    </span>
                  );
                })}

                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--s2)', marginLeft: 2 }}>
                  <input
                    className="input input-pill-sm"
                    style={{ width: 148 }}
                    placeholder="Create a tag"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void createTag();
                    }}
                  />
                  <span className="icon-round" title="Create tag" onClick={() => void createTag()}>
                    <i className="ph ph-plus" />
                  </span>
                </span>
              </div>
            </div>
          </section>
        </div>
      )}

      <div className="row-tight">
        <Segmented
          name="platform"
          value={platformFilter}
          options={['All', 'Instagram', 'TikTok'] as const}
          onChange={setPlatformFilter}
        />
        <Segmented
          name="status"
          value={statusFilter}
          options={['Any', 'To try', 'Tried'] as const}
          labels={{ Any: 'Any status' }}
          onChange={setStatusFilter}
        />
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>
          {rows.length} {rows.length === 1 ? 'idea' : 'ideas'}
        </span>
      </div>

      <div className="row-tight">
        <span className="label-xs" style={{ marginRight: 3, color: 'rgba(246,236,230,0.45)' }}>
          Tag
        </span>
        {tagChips.map((chip) => (
          <span
            key={String(chip.key)}
            className={`chip${tagFilter === chip.key ? ' is-on' : ''}`}
            onClick={() => setTagFilter(chip.key)}
          >
            <span>{chip.label}</span>
            <span className="chip-count">{chip.count}</span>
          </span>
        ))}
      </div>

      <div className="board">
        {rows.map((idea) => (
          <IdeaCard
            key={idea.id}
            idea={idea}
            onBrief={() => void openBrief(idea)}
            onProblem={setProblem}
          />
        ))}
      </div>

      {rows.length === 0 && !lib.loading && (
        <div className="empty-state">
          <i className="ph ph-bookmarks-simple" />
          <span>
            {lib.ideas.length === 0
              ? 'Nothing saved yet. Hit “Add format” to save your first link.'
              : 'No saved idea matches these filters.'}
          </span>
        </div>
      )}
    </div>
  );
}

/* ── Segmented control ────────────────────────────────────────────────────── */
function Segmented<T extends string>({
  name,
  value,
  options,
  labels,
  onChange,
}: {
  name: string;
  value: T;
  options: readonly T[];
  labels?: Partial<Record<T, string>>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg">
      {options.map((opt) => (
        <label key={opt} className="seg-opt">
          <input type="radio" name={name} checked={value === opt} onChange={() => onChange(opt)} />
          <span>{labels?.[opt] ?? opt}</span>
        </label>
      ))}
    </div>
  );
}

/* ── Media tile ───────────────────────────────────────────────────────────── */
/**
 * A self-contained 9:16 tile matching the dashboard's post tiles. An attached
 * video file plays inline (click to toggle); otherwise the platform embed fills
 * the same frame; a saved link with no embed shows a Preview placeholder.
 */
function MediaTile({ idea, embed }: { idea: Idea; embed: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [embedLoaded, setEmbedLoaded] = useState(false);

  const toggleVideo = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play().catch(() => {});
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  const openBtn = (
    <a
      className="idea-media-open"
      href={idea.url}
      target="_blank"
      rel="noreferrer"
      title="Open original"
      onClick={(e) => e.stopPropagation()}
    >
      <i className="ph ph-arrow-up-right" />
    </a>
  );

  // 1) A downloaded video file plays truly inline (click toggles play/pause).
  if (idea.videoUrl) {
    return (
      <div className="idea-media" onClick={toggleVideo} style={{ cursor: 'pointer' }}>
        <video
          ref={videoRef}
          className="idea-media-fill"
          src={idea.videoUrl}
          playsInline
          loop
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />
        {!playing && (
          <span className="idea-media-play">
            <i className="ph-fill ph-play" />
          </span>
        )}
        {openBtn}
      </div>
    );
  }

  // 2) No file: the first click loads the platform player inline, rather than
  // the embed's default of jumping to the post — so every tile plays in place.
  if (embed) {
    return (
      <div
        className="idea-media"
        onClick={() => setEmbedLoaded(true)}
        style={{ cursor: embedLoaded ? 'default' : 'pointer' }}
      >
        {embedLoaded ? (
          <iframe
            className="idea-media-fill"
            src={embed}
            loading="lazy"
            allow="autoplay; encrypted-media; fullscreen; clipboard-write"
            allowFullScreen
            scrolling="no"
            title={idea.sourceHandle}
          />
        ) : (
          <span className="idea-media-play">
            <i className="ph-fill ph-play" />
          </span>
        )}
        {openBtn}
      </div>
    );
  }

  return (
    <div className="idea-media idea-media--empty">
      <span className="idea-media-badge">
        <i className="ph ph-image-square" />
        Preview
      </span>
      <span className="idea-media-empty-note">No embeddable video at this link</span>
    </div>
  );
}

/* ── One saved idea ───────────────────────────────────────────────────────── */
function IdeaCard({
  idea,
  onBrief,
  onProblem,
}: {
  idea: Idea;
  onBrief: () => void;
  onProblem: (msg: string) => void;
}) {
  const lib = useLibrary();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftTag, setDraftTag] = useState('');
  const [copied, setCopied] = useState(false);

  const guard = (fn: () => Promise<unknown>) => {
    fn().catch((err) => onProblem(err instanceof Error ? err.message : 'Something went wrong'));
  };

  const embed = embedUrl(idea.url);
  const downloader = DOWNLOADER_BY_PLATFORM[idea.platform];
  // Tags an idea doesn't already carry — the ones worth offering in the picker.
  const addable = lib.tags.filter((t) => !idea.tagIds.includes(t.id));
  // idea.tagIds and idea.tags are parallel arrays (both name-ordered server-side).
  const ownTags = idea.tagIds.map((id, i) => ({ id, name: idea.tags[i] ?? '' }));

  const addTag = (tagId: number) => {
    setPickerOpen(false);
    setDraftTag('');
    if (idea.tagIds.includes(tagId)) return;
    guard(() => lib.patchIdea(idea.id, { tagIds: [...idea.tagIds, tagId] }));
  };

  const removeTag = (tagId: number) => {
    guard(() => lib.patchIdea(idea.id, { tagIds: idea.tagIds.filter((x) => x !== tagId) }));
  };

  const commitDraft = () =>
    guard(async () => {
      const tag = await lib.createTag(draftTag);
      if (!tag) return;
      setDraftTag('');
      setPickerOpen(false);
      if (idea.tagIds.includes(tag.id)) return;
      await lib.patchIdea(idea.id, { tagIds: [...idea.tagIds, tag.id] });
    });

  const remove = () =>
    guard(async () => {
      const warning = idea.briefId
        ? 'Delete this idea? Its creator brief and every shot in it go too.'
        : 'Delete this idea?';
      if (!window.confirm(warning)) return;
      await lib.removeIdea(idea.id);
    });

  return (
    <article className="idea-card">
      <div className="idea-head">
        <span className="idea-avatar">
          <i className={platformIcon(idea.platform)} />
        </span>
        <div className="idea-id">
          <span className="idea-handle">{idea.sourceHandle}</span>
          <span className="idea-date">Saved {savedLabel(idea.savedAt)}</span>
        </div>
        <button
          className={`status-toggle${idea.status === 'Tried' ? ' is-tried' : ''}`}
          style={{ marginLeft: 'auto' }}
          title={idea.status === 'Tried' ? 'Mark as to try' : 'Mark as tried'}
          onClick={() =>
            guard(() => lib.patchIdea(idea.id, { status: idea.status === 'Tried' ? 'To try' : 'Tried' }))
          }
        >
          <i className={idea.status === 'Tried' ? 'ph-fill ph-check-circle' : 'ph ph-flag'} />
          <span>{idea.status}</span>
        </button>
        <a
          className="icon-quiet is-bordered"
          href={idea.url}
          target="_blank"
          rel="noreferrer"
          title="Open the original"
          style={{ textDecoration: 'none' }}
        >
          <i className="ph ph-arrow-up-right" />
        </a>
      </div>

      <MediaTile idea={idea} embed={embed} />
      {embed && !idea.videoUrl && (
        <div className="embed-note">
          <i className="ph ph-info" />
          <span>Click to play here. Nothing playing means the post is private or removed.</span>
          <a href={idea.url} target="_blank" rel="noreferrer">
            Open original
          </a>
        </div>
      )}

      <p className="idea-note">{idea.note || 'No note yet'}</p>

      <div className="inset-block">
        <label className="field-stack">
          <span className="label-xxs">Hook</span>
          <AutoTextarea
            className="input"
            rows={2}
            placeholder="What the first two seconds do"
            value={idea.hook}
            onSave={(v) => guard(() => lib.patchIdea(idea.id, { hook: v }))}
          />
        </label>
        <label className="field-stack">
          <span className="label-xxs">Body</span>
          <AutoTextarea
            className="input"
            rows={3}
            placeholder="How the rest of it is built"
            value={idea.body}
            onSave={(v) => guard(() => lib.patchIdea(idea.id, { body: v }))}
          />
        </label>
        <span className="save-state">
          {idea.hook || idea.body ? 'Saved' : 'Two comment fields — hook and body'}
        </span>
      </div>

      <div className="row-tight">
        {ownTags.map((t) => (
          <span key={t.id} className="chip chip-split is-on" style={{ cursor: 'default' }}>
            <span>{t.name}</span>
            <span className="icon-x" title="Remove tag" onClick={() => removeTag(t.id)}>
              <i className="ph ph-x" />
            </span>
          </span>
        ))}
        <span className="pill pill-dashed" onClick={() => setPickerOpen((v) => !v)}>
          <i className="ph ph-tag" style={{ fontSize: 12 }} />
          <span>{idea.tagIds.length === 0 ? 'Tag' : 'Add tag'}</span>
        </span>
      </div>

      {pickerOpen && (
        <div className="tag-picker">
          <span className="label-xs" style={{ fontSize: 10, color: 'var(--muted)' }}>
            Add a tag
          </span>
          <div className="row-tight">
            {addable.map((t) => (
              <span
                key={t.id}
                className="chip"
                style={{ background: 'rgba(255,255,255,0.07)' }}
                onClick={() => addTag(t.id)}
              >
                {t.name}
              </span>
            ))}
            {addable.length === 0 && (
              <span style={{ fontSize: 11, color: 'rgba(246,236,230,0.45)' }}>
                {lib.tags.length === 0 ? 'No tags in the library yet.' : 'Every tag is already on this card.'}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
            <input
              className="input input-pill-sm"
              style={{ flex: '1 1 auto', minWidth: 0 }}
              placeholder="Create and add a tag"
              value={draftTag}
              onChange={(e) => setDraftTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitDraft();
              }}
            />
            <span className="icon-round" title="Create and add" onClick={commitDraft}>
              <i className="ph ph-plus" />
            </span>
          </div>
        </div>
      )}

      <div className="card-foot">
        <span className="pill" onClick={onBrief}>
          <i className="ph ph-list-numbers" />
          <span>Brief</span>
        </span>
        {downloader && (
          <span
            className="pill"
            title={`Copy this link and open ${downloader.name} to download the video`}
            onClick={async () => {
              const ok = await openDownloader(idea.url, downloader);
              setCopied(ok);
              window.setTimeout(() => setCopied(false), 2500);
            }}
          >
            <i className={idea.videoUrl ? 'ph-fill ph-check-circle' : 'ph ph-download-simple'} />
            <span>{copied ? 'Link copied' : 'Get video'}</span>
          </span>
        )}
        <button className="icon-quiet" title="Remove" style={{ marginLeft: 'auto' }} onClick={remove}>
          <i className="ph ph-trash" />
        </button>
      </div>
    </article>
  );
}
