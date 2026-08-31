/**
 * Pull a still out of a playing/paused video element.
 *
 * The video is a local file behind a blob: URL, so the canvas is never tainted
 * and the frame can be exported. Nothing here touches the network — only the
 * resulting still is uploaded, never the video.
 */
export function timestampLabel(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export async function grabFrame(
  video: HTMLVideoElement,
): Promise<{ file: File; label: string } | null> {
  if (!video.videoWidth || !video.videoHeight) return null;

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.92),
  );
  if (!blob) return null;

  const label = timestampLabel(video.currentTime);
  return {
    file: new File([blob], `frame-${label.replace(':', 'm')}s.jpg`, { type: 'image/jpeg' }),
    label,
  };
}
