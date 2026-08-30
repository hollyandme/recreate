import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { api, type Brief } from '../lib/api';

/**
 * The A4 sheet a creator actually receives.
 *
 * Every fragile thing the prototype hit is gone here because the data lives on a
 * server: screenshots are plain <img> elements with real URLs, visible on screen
 * rather than revealed by @media print, and the comments are flowing text rather
 * than textareas (which print at their rendered height and clip). What remains
 * is page geometry, owned by @page and the .paper-page rules alone.
 */
export function PrintScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [brief, setBrief] = useState<Brief | null>(null);

  useEffect(() => {
    if (!id) return;
    let live = true;
    api
      .getBrief(Number(id))
      .then((b) => live && setBrief(b))
      .catch(() => live && navigate('/briefs', { replace: true }));
    return () => {
      live = false;
    };
  }, [id, navigate]);

  if (!brief) return null;

  const meta =
    [brief.creator ? `For ${brief.creator}` : '', brief.due ? `Due ${brief.due}` : '']
      .filter(Boolean)
      .join('  ·  ') || 'Shot list';

  return (
    <div className="print-wrap">
      <div className="print-toolbar no-print">
        <button className="btn btn-quiet" onClick={() => navigate(`/briefs/${brief.id}`)}>
          <i className="ph ph-arrow-left" />
          <span>Back to editing</span>
        </button>
        <button className="btn btn-accent" style={{ marginLeft: 'auto' }} onClick={() => window.print()}>
          <i className="ph ph-printer" />
          <span>Print / PDF</span>
        </button>
      </div>

      <article className="paper-page">
        <header className="paper-head">
          <span className="paper-kicker">Creator brief</span>
          <h2>{brief.title}</h2>
          <span className="paper-meta">{meta}</span>
        </header>

        <section className="paper-ref">
          <span className="paper-kicker">Reference</span>
          <a href={brief.reference.url}>{brief.reference.url}</a>
          <span>
            <strong>Hook</strong> — {brief.reference.hook}
          </span>
          <span>
            <strong>Body</strong> — {brief.reference.body}
          </span>
          {brief.intro && <span className="paper-pre">{brief.intro}</span>}
        </section>

        {brief.shots.map((shot, i) => (
          <section className="paper-shot" key={shot.id}>
            <div className="paper-frame">
              {shot.imageUrl && <img src={shot.imageUrl} alt="" />}
              <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                {shot.strokes.map((stroke, s) => (
                  <polyline
                    key={s}
                    points={stroke.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ')}
                    fill="none"
                    stroke="var(--stroke-paper)"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>
            </div>
            <div className="paper-shot-body">
              <span className="paper-shot-label">
                Shot {i + 1} · {shot.timestamp || 'no timestamp'}
              </span>
              <span className="paper-pre">{shot.comment}</span>
            </div>
          </section>
        ))}
      </article>
    </div>
  );
}
