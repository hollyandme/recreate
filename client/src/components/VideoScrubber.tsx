import { forwardRef, useRef, useState } from 'react';

/**
 * The reference video for a brief, stored against the idea so anyone opening
 * the brief can scrub it and pull their own frames.
 *
 * It is served same-origin from /api/files, which is what lets a frame be drawn
 * to a canvas and exported — a cross-origin video would taint the canvas and
 * make grabbing impossible.
 */
interface Props {
  videoUrl: string | null;
  uploading: boolean;
  grabbing: boolean;
  hasShots: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
  onGrab: () => void;
}

export const VideoScrubber = forwardRef<HTMLVideoElement, Props>(function VideoScrubber(
  { videoUrl, uploading, grabbing, hasShots, onUpload, onRemove, onGrab },
  ref,
) {
  const [decodeError, setDecodeError] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  return (
    <div className="video-ref no-print">
      <div className="video-ref-head">
        <span className="label-xxs">Reference video</span>
        <span className="video-ref-note">
          {videoUrl
            ? 'Scrub to a moment, then grab it as a shot'
            : 'Optional — attach the video to pull frames straight into shots'}
        </span>
        {videoUrl && (
          <>
            <span className="pill pill-sm" onClick={() => input.current?.click()}>
              <i className="ph ph-arrows-clockwise" />
              <span>Replace</span>
            </span>
            <span className="pill pill-sm" onClick={onRemove}>
              <i className="ph ph-trash" />
              <span>Remove</span>
            </span>
          </>
        )}
      </div>

      {videoUrl ? (
        <div className="video-ref-body">
          <video
            ref={ref}
            src={videoUrl}
            controls
            playsInline
            preload="metadata"
            className="video-ref-player"
            onError={() => setDecodeError(true)}
            onLoadedMetadata={() => setDecodeError(false)}
          />
          {decodeError ? (
            <div className="fallback" role="alert">
              <i className="ph ph-warning-circle" />
              <span>
                This browser cannot play that video. iPhone .mov files are often HEVC, which
                Chrome will not decode — re-attach it as an MP4 (H.264) or WebM.
              </span>
            </div>
          ) : (
            <div className="video-ref-actions">
              <button className="btn btn-accent" onClick={onGrab} disabled={grabbing}>
                <i className="ph ph-crop" />
                <span>{grabbing ? 'Adding…' : 'Add shot from this frame'}</span>
              </button>
              <span className="video-ref-hint">
                The timestamp fills itself in
                {hasShots ? ' — or use Grab on a shot below to fill that one instead.' : '.'}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div
          className={`video-drop${over ? ' is-over' : ''}${uploading ? ' is-busy' : ''}`}
          onClick={() => !uploading && input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            if (!uploading && e.dataTransfer.files[0]) onUpload(e.dataTransfer.files[0]);
          }}
        >
          <i className="ph ph-film-strip" />
          <span>{uploading ? 'Uploading video…' : 'Drop a video here, or click to choose'}</span>
        </div>
      )}

      <input
        ref={input}
        type="file"
        accept="video/*,.mp4,.webm,.mov,.m4v"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.target.value = '';
        }}
      />
    </div>
  );
});
