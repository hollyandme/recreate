import { useRef, useState } from 'react';
import type { Shot, Stroke } from '../lib/api';

/**
 * A shot's screenshot slot, its annotation layer, and the draw overlay.
 *
 * The image is a plain <img> pointing at a real URL — no shadow DOM, no data
 * URL, nothing revealed only by @media print. That is what makes the printed
 * sheet reliable; the prototype had to bake frames into local storage precisely
 * because it had no backend to serve them from.
 */
interface Props {
  shot: Shot;
  drawing: boolean;
  onUpload: (file: File) => void;
  onClearImage: () => void;
  onCommitStroke: (stroke: Stroke) => void;
}

export function ShotFrame({ shot, drawing, onUpload, onClearImage, onCommitStroke }: Props) {
  const [over, setOver] = useState(false);
  // The stroke being drawn lives in a ref as well as in state: the ref is what
  // the pointer handlers read and write (always current, never a stale closure),
  // and the state copy exists only to trigger a repaint of the polyline.
  const [live, setLive] = useState<Stroke | null>(null);
  const liveRef = useRef<Stroke | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const pointAt = (e: React.PointerEvent<HTMLDivElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [
      Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)),
      Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100)),
    ];
  };

  // Never drop a file silently. The browser's reported type is unreliable — it
  // is routinely empty for a perfectly good PNG — so anything the user picked is
  // sent, and the server decides from the actual bytes. A rejection then comes
  // back as a message the user can act on, rather than as nothing happening.
  const takeFile = (file: File | undefined) => {
    if (file) onUpload(file);
  };

  // Strokes commit on pointer-up; until then the in-progress one is drawn on top.
  const endStroke = () => {
    const stroke = liveRef.current;
    liveRef.current = null;
    setLive(null);
    if (stroke && stroke.length > 1) onCommitStroke(stroke);
  };

  const strokes = live && live.length > 1 ? [...shot.strokes, live] : shot.strokes;

  return (
    <div className="shot-frame">
      <div
        className={`slot${over ? ' is-over' : ''}${shot.imageUrl ? ' has-image' : ''}`}
        onClick={() => {
          if (!shot.imageUrl) fileInput.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          takeFile(e.dataTransfer.files[0]);
        }}
      >
        {shot.imageUrl ? (
          <img src={shot.imageUrl} alt="" />
        ) : (
          <span className="slot-empty">
            <i className="ph ph-image" />
            <span>Drop the frame</span>
          </span>
        )}
      </div>

      {/* Deliberately a sibling of the slot, not a child: opening the picker
          calls .click() on it, and from inside the slot that click bubbles
          straight back into the slot's own onClick and re-enters it. */}
      <input
        ref={fileInput}
        type="file"
        accept="image/*,.png,.jpg,.jpeg,.gif,.webp,.avif"
        hidden
        onChange={(e) => {
          takeFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {shot.imageUrl && !drawing && (
        <button className="slot-clear no-print" title="Remove this screenshot" onClick={onClearImage}>
          <i className="ph ph-x" />
        </button>
      )}

      {/* Normalised coordinates plus non-scaling-stroke: the annotation scales
          with the frame and stays a hairline at any size, on screen or on paper. */}
      <svg className="annotations" viewBox="0 0 100 100" preserveAspectRatio="none">
        {strokes.map((stroke, i) => (
          <polyline
            key={i}
            points={stroke.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ')}
            fill="none"
            stroke="var(--stroke-screen)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      {drawing && (
        <div
          className="draw-layer no-print"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            const start: Stroke = [pointAt(e)];
            liveRef.current = start;
            setLive(start);
          }}
          onPointerMove={(e) => {
            const cur = liveRef.current;
            if (!cur) return;
            // Read the geometry now: currentTarget is nulled once the handler
            // returns, so it cannot be touched from inside a state updater.
            const p = pointAt(e);
            const last = cur[cur.length - 1]!;
            // Drop sub-pixel jitter so a stroke stays a short list of points.
            if (Math.abs(p[0] - last[0]) + Math.abs(p[1] - last[1]) < 0.6) return;
            const next: Stroke = [...cur, p];
            liveRef.current = next;
            setLive(next);
          }}
          onPointerUp={endStroke}
          onPointerLeave={endStroke}
        />
      )}
    </div>
  );
}
