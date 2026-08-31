import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api, type Idea, type Platform, type Status } from '../lib/api';
import { embedHeight, embedUrl, platformIcon, savedLabel } from '../lib/embed';
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
  const [newTagSel, setNewTagSel] = useState<number | null>(null);
  const [newTagName, setNewTagName] = useState('');

  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('All');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('Any');
  const [tagFilter, setTagFilter] = useState<TagFilter>('any');

  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

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
        tagFilter === 'any' ? true : tagFilter === 'untagged' ? x.tagId === null : x.tagId === tagFilter,
      ),
    [scoped, tagFilter],
  );

  // Only tags actually in use get a filter chip, plus "Untagged" if any idea is.
  const tagChips = useMemo(() => {
    const inUse = lib.tags.filter((t) => lib.ideas.some((x) => x.tagId === t.id));
    const chips: { key: TagFilter; label: string; count: number }[] = [
      { key: 'any', label: 'All', count: scoped.length },
      ...inUse.map((t) => ({
        key: t.id as TagFilter,
        label: t.name,
        count: scoped.filter((x) => x.tagId === t.id).length,
      })),
    ];
    if (lib.ideas.some((x) => x.tagId === null)) {
      chips.push({ key: 'untagged', label: 'Untagged', count: scoped.filter((x) => x.tagId === null).length });
    }
    return chips;
  }, [lib.tags, lib.ideas, scoped]);

  const saveIdea = () =>
    guard(async () => {
      const url = newUrl.trim();
      if (!url) return;
      setSaving(true);
      try {
        await lib.addIdea({ url, note: newNote.trim(), tagId: newTagSel });
        setNewUrl('');
        setNewNote('');
        setNewTagSel(null);
      } finally {
        setSaving(false);
      }
    });

  const createTag = () =>
    guard(async () => {
      const tag = await lib.createTag(newTagName);
      if (!tag) return;
      setNewTagName('');
      setNewTagSel(tag.id);
    });

  const destroyTag = (id: number, name: string) =>
    guard(async () => {
      const used = lib.ideas.filter((x) => x.tagId === id).length;
      if (
        used > 0 &&
        !window.confirm(
          `Delete the tag "${name}"? It is on ${used} ${used === 1 ? 'idea' : 'ideas'} and will be removed from them.`,
        )
      ) {
        return;
      }
      await lib.removeTag(id);
      if (newTagSel === id) setNewTagSel(null);
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
      </header>

      {(problem ?? lib.error) && (
        <div className="fallback" role="alert">
          <i className="ph ph-warning-circle" />
          <span>{problem ?? lib.error}</span>
        </div>
      )}

      <section className="glass panel">
        <div className="panel-head">
          <h2>Save a link</h2>
          <span>Paste an Instagram or TikTok URL and say what caught your eye</span>
        </div>

        <div className="row">
          <input
            className="input input-pill"
            style={{ flex: '1 1 300px', minWidth: 0 }}
            placeholder="https://www.tiktok.com/@handle/video/…"
            value={newUrl}
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
          <button className="btn btn-accent" onClick={() => void saveIdea()} disabled={saving || !newUrl.trim()}>
            <i className="ph ph-bookmark-simple" />
            <span>Save</span>
          </button>
        </div>

        <div className="divider-top">
          <span className="label-xs">Tag for this idea · × deletes a tag from the library</span>
          <div className="row-tight">
            {lib.tags.map((t) => {
              const on = newTagSel === t.id;
              return (
                <span key={t.id} className={`chip chip-split${on ? ' is-on' : ''}`}>
                  <span className="chip-body" onClick={() => setNewTagSel(on ? null : t.id)}>
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
              ? 'Nothing saved yet. Paste a link above.'
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
  const addable = lib.tags.filter((t) => t.id !== idea.tagId);

  const assignTag = (tagId: number | null) => {
    setPickerOpen(false);
    setDraftTag('');
    guard(() => lib.patchIdea(idea.id, { tagId }));
  };

  const commitDraft = () =>
    guard(async () => {
      const tag = await lib.createTag(draftTag);
      if (!tag) return;
      setDraftTag('');
      setPickerOpen(false);
      await lib.patchIdea(idea.id, { tagId: tag.id });
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
        <a
          className="icon-quiet is-bordered"
          href={idea.url}
          target="_blank"
          rel="noreferrer"
          title="Open the original"
          style={{ marginLeft: 'auto', textDecoration: 'none' }}
        >
          <i className="ph ph-arrow-up-right" />
        </a>
      </div>

      {embed ? (
        <div className="embed-wrap">
          <div className="embed-frame" style={{ height: embedHeight(idea.platform) }}>
            <iframe src={embed} loading="lazy" allowFullScreen scrolling="auto" title={idea.sourceHandle} />
          </div>
          <div className="embed-note">
            <i className="ph ph-info" />
            <span>Nothing playing means the post is private or removed.</span>
            <a href={idea.url} target="_blank" rel="noreferrer">
              Open original
            </a>
          </div>
        </div>
      ) : (
        <div className="fallback">
          <i className="ph ph-video-camera-slash" />
          <span>No embeddable video at this link</span>
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
        {idea.tag && (
          <span className="chip chip-split is-on" style={{ cursor: 'default' }}>
            <span>{idea.tag}</span>
            <span className="icon-x" title="Remove tag" onClick={() => assignTag(null)}>
              <i className="ph ph-x" />
            </span>
          </span>
        )}
        <span className="pill pill-dashed" onClick={() => setPickerOpen((v) => !v)}>
          <i className="ph ph-tag" style={{ fontSize: 12 }} />
          <span>{idea.tagId === null ? 'Tag' : 'Change'}</span>
        </span>
      </div>

      {pickerOpen && (
        <div className="tag-picker">
          <span className="label-xs" style={{ fontSize: 10, color: 'var(--muted)' }}>
            {idea.tagId === null ? 'Pick a tag' : 'Replace the tag'}
          </span>
          <div className="row-tight">
            {addable.map((t) => (
              <span
                key={t.id}
                className="chip"
                style={{ background: 'rgba(255,255,255,0.07)' }}
                onClick={() => assignTag(t.id)}
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
        <span
          className={`pill${idea.status === 'Tried' ? ' is-on' : ''}`}
          onClick={() =>
            guard(() => lib.patchIdea(idea.id, { status: idea.status === 'Tried' ? 'To try' : 'Tried' }))
          }
        >
          <i className={idea.status === 'Tried' ? 'ph-fill ph-check-circle' : 'ph ph-flag'} />
          <span>{idea.status}</span>
        </span>
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
