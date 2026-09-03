import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { api, type Brief, type Shot, type Stroke } from '../lib/api';
import { useLibrary } from '../lib/store';
import { AutoInput, AutoTextarea } from '../components/AutoField';
import { ShotFrame } from '../components/ShotFrame';
import { VideoScrubber } from '../components/VideoScrubber';
import { grabFrame } from '../lib/frame';

export function BriefsScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const lib = useLibrary();

  const briefId = id ? Number(id) : null;
  const [brief, setBrief] = useState<Brief | null>(null);
  const [drawShot, setDrawShot] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [grabbing, setGrabbing] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);

  const guard = useCallback((fn: () => Promise<unknown>) => {
    fn().catch((err) => setProblem(err instanceof Error ? err.message : 'Something went wrong'));
  }, []);

  useEffect(() => {
    if (briefId === null) {
      setBrief(null);
      return;
    }
    let live = true;
    setDrawShot(null);
    api
      .getBrief(briefId)
      .then((b) => {
        if (live) {
          setBrief(b);
          setProblem(null);
        }
      })
      .catch(() => {
        // The brief is gone (or the id is nonsense) — fall back to the picker
        // rather than leaving a dead route on screen.
        if (live) navigate('/briefs', { replace: true });
      });
    return () => {
      live = false;
    };
  }, [briefId, navigate]);

  const patchShot = (shotId: number, patch: Partial<Pick<Shot, 'timestamp' | 'comment' | 'strokes'>>) =>
    guard(async () => {
      const updated = await api.updateShot(shotId, patch);
      setBrief((b) => (b ? { ...b, shots: b.shots.map((s) => (s.id === shotId ? updated : s)) } : b));
    });

  const replaceShot = (updated: Shot) =>
    setBrief((b) => (b ? { ...b, shots: b.shots.map((s) => (s.id === updated.id ? updated : s)) } : b));

  /** Grab the frame on screen and append it as a new shot, timestamp filled in. */
  const addShotFromFrame = () =>
    guard(async () => {
      const video = videoRef.current;
      if (!video || !brief) return;
      const grabbed = await grabFrame(video);
      if (!grabbed) {
        setProblem('Could not read that frame — let the video load, then try again.');
        return;
      }
      setGrabbing(true);
      try {
        const shot = await api.addShot(brief.id);
        const withImage = await api.uploadShotImage(shot.id, grabbed.file);
        const withTs = await api.updateShot(shot.id, { timestamp: grabbed.label });
        setBrief((b) => (b ? { ...b, shots: [...b.shots, { ...withImage, ...withTs }] } : b));
      } finally {
        setGrabbing(false);
      }
    });

  /** Same, but fills a shot that already exists rather than adding one. */
  const fillShotFromFrame = (shotId: number) =>
    guard(async () => {
      const video = videoRef.current;
      if (!video) return;
      const grabbed = await grabFrame(video);
      if (!grabbed) {
        setProblem('Could not read that frame — let the video load, then try again.');
        return;
      }
      const withImage = await api.uploadShotImage(shotId, grabbed.file);
      const withTs = await api.updateShot(shotId, { timestamp: grabbed.label });
      setBrief((b) =>
        b
          ? { ...b, shots: b.shots.map((x) => (x.id === shotId ? { ...withImage, ...withTs } : x)) }
          : b,
      );
    });

  return (
    <div className="screen">
      <header className="page-head no-print">
        <div>
          <div className="kicker">Creator briefs</div>
          <h1 className="page-title">Shot by shot, ready to send</h1>
        </div>
        {brief && (
          <button className="btn btn-quiet" onClick={() => navigate(`/briefs/${brief.id}/print`)}>
            <i className="ph ph-file-text" />
            <span>Print view</span>
          </button>
        )}
      </header>

      {problem && (
        <div className="fallback" role="alert">
          <i className="ph ph-warning-circle" />
          <span>{problem}</span>
        </div>
      )}

      {brief ? (
        <section className="glass brief-sheet">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)' }}>
              <AutoInput
                className="input brief-title"
                placeholder="Brief title"
                value={brief.title}
                onSave={(v) =>
                  guard(async () => {
                    await api.updateBrief(brief.id, { title: v });
                    setBrief((b) => (b ? { ...b, title: v } : b));
                  })
                }
              />
              <button
                className="icon-quiet is-lg no-print"
                title="Delete this brief"
                onClick={() =>
                  guard(async () => {
                    if (!window.confirm('Delete this brief?')) return;
                    await api.deleteBrief(brief.id);
                    await lib.refresh();
                    navigate('/briefs');
                  })
                }
              >
                <i className="ph ph-trash" />
              </button>
            </div>
            <div className="row">
              <AutoInput
                className="input input-pill-md"
                style={{ flex: '1 1 200px', minWidth: 0 }}
                placeholder="For which creator?"
                value={brief.creator}
                onSave={(v) =>
                  guard(async () => {
                    await api.updateBrief(brief.id, { creator: v });
                    setBrief((b) => (b ? { ...b, creator: v } : b));
                  })
                }
              />
              <AutoInput
                className="input input-pill-md"
                style={{ flex: '0 1 160px', minWidth: 0 }}
                placeholder="Due date"
                value={brief.due}
                onSave={(v) =>
                  guard(async () => {
                    await api.updateBrief(brief.id, { due: v });
                    setBrief((b) => (b ? { ...b, due: v } : b));
                  })
                }
              />
            </div>
          </div>

          {/* Read live off the idea, so editing a hook updates every brief citing it. */}
          <div className="reference">
            <div className="reference-head">
              <span className="label-xxs">Reference</span>
              <a href={brief.reference.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                {brief.reference.sourceHandle}
              </a>
              <span>{brief.reference.tag}</span>
            </div>
            <div className="reference-url">
              <i className="ph ph-link-simple" />
              <a href={brief.reference.url} target="_blank" rel="noreferrer">
                {brief.reference.url}
              </a>
            </div>
            <div className="reference-comments">
              <span>
                <span className="lead">Hook — </span>
                {brief.reference.hook}
              </span>
              <span>
                <span className="lead">Body — </span>
                {brief.reference.body}
              </span>
            </div>
            <AutoTextarea
              className="input"
              rows={2}
              placeholder="Anything the creator should know before the shot list"
              value={brief.intro}
              onSave={(v) =>
                guard(async () => {
                  await api.updateBrief(brief.id, { intro: v });
                  setBrief((b) => (b ? { ...b, intro: v } : b));
                })
              }
            />
          </div>

          <VideoScrubber
            ref={videoRef}
            videoUrl={brief.reference.videoUrl}
            uploading={uploadingVideo}
            grabbing={grabbing}
            hasShots={brief.shots.length > 0}
            onGrab={addShotFromFrame}
            onUpload={(file) =>
              guard(async () => {
                setUploadingVideo(true);
                try {
                  await api.uploadIdeaVideo(brief.ideaId, file);
                  setBrief(await api.getBrief(brief.id));
                  await lib.refresh();
                } finally {
                  setUploadingVideo(false);
                }
              })
            }
            onRemove={() =>
              guard(async () => {
                if (!window.confirm('Remove the reference video? Shots already grabbed stay.')) return;
                await api.clearIdeaVideo(brief.ideaId);
                setBrief(await api.getBrief(brief.id));
                await lib.refresh();
              })
            }
          />

          <div className="shot-list">
            {brief.shots.map((shot, i) => (
              <div className="brief-shot" key={shot.id}>
                <ShotFrame
                  shot={shot}
                  drawing={drawShot === shot.id}
                  onUpload={(file) => guard(async () => replaceShot(await api.uploadShotImage(shot.id, file)))}
                  onClearImage={() => guard(async () => replaceShot(await api.clearShotImage(shot.id)))}
                  onCommitStroke={(stroke: Stroke) =>
                    patchShot(shot.id, { strokes: [...shot.strokes, stroke] })
                  }
                />
                <div className="shot-body">
                  <div className="shot-toolbar">
                    <span className="shot-n">{i + 1}</span>
                    <AutoInput
                      className="input input-pill-sm shot-ts"
                      placeholder="0:00"
                      value={shot.timestamp}
                      onSave={(v) => patchShot(shot.id, { timestamp: v })}
                    />
                    <span
                      className="pill pill-sm push no-print"
                      title="Replace this shot with the current video frame"
                      onClick={() => fillShotFromFrame(shot.id)}
                    >
                      <i className="ph ph-crop" />
                      <span>Grab</span>
                    </span>
                    <span
                      className={`pill pill-sm no-print${drawShot === shot.id ? ' is-on' : ''}`}
                      title="Draw on this frame"
                      onClick={() => setDrawShot((cur) => (cur === shot.id ? null : shot.id))}
                    >
                      <i className="ph ph-pencil-simple" />
                      <span>{drawShot === shot.id ? 'Done' : 'Draw'}</span>
                    </span>
                    {shot.strokes.length > 0 && (
                      <>
                        <span
                          className="pill pill-sm no-print"
                          title="Remove the last line drawn"
                          onClick={() => patchShot(shot.id, { strokes: shot.strokes.slice(0, -1) })}
                        >
                          <i className="ph ph-arrow-u-up-left" />
                          <span>Undo line</span>
                        </span>
                        <span
                          className="pill pill-sm no-print"
                          title="Remove all drawing on this frame"
                          onClick={() => patchShot(shot.id, { strokes: [] })}
                        >
                          <i className="ph ph-eraser" />
                          <span>Clear ({shot.strokes.length})</span>
                        </span>
                      </>
                    )}
                    <button
                      className="icon-quiet is-sm no-print"
                      title="Remove this shot"
                      onClick={() =>
                        guard(async () => {
                          await api.deleteShot(shot.id);
                          setBrief((b) => (b ? { ...b, shots: b.shots.filter((s) => s.id !== shot.id) } : b));
                        })
                      }
                    >
                      <i className="ph ph-trash" />
                    </button>
                  </div>
                  <AutoTextarea
                    className="input shot-comment"
                    rows={5}
                    placeholder="What happens here, and what the creator should copy"
                    value={shot.comment}
                    onSave={(v) => patchShot(shot.id, { comment: v })}
                  />
                </div>
              </div>
            ))}
          </div>

          <button
            className="btn btn-accent no-print"
            style={{ alignSelf: 'flex-start' }}
            onClick={() =>
              guard(async () => {
                const shot = await api.addShot(brief.id);
                setBrief((b) => (b ? { ...b, shots: [...b.shots, shot] } : b));
              })
            }
          >
            <i className="ph ph-plus" />
            <span>Add a shot</span>
          </button>
        </section>
      ) : (
        <div className="empty-state">
          <i className="ph ph-list-numbers" />
          <span>
            Open a format idea and hit Recreate → Creator Brief to start one. Screenshots are dropped in
            by hand — grab the frames from the original post.
          </span>
        </div>
      )}
    </div>
  );
}
