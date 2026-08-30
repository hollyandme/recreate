/**
 * Shrink oversized screenshots before upload.
 *
 * A full-screen Retina PNG is routinely 15-25 MB, while the slot displays it at
 * 168x296 and the print sheet at 180x318. Sending the original wastes the
 * user's bandwidth and the bucket, and used to fail outright against the upload
 * limit — with no useful error.
 *
 * 1600px on the long edge is still far more detail than either use needs
 * (~750dpi in the print box), so nothing visible is lost.
 */
const MAX_EDGE = 1600;
const LEAVE_ALONE_BELOW = 2 * 1024 * 1024;

export async function prepareImage(file: File): Promise<File> {
  if (file.size <= LEAVE_ALONE_BELOW) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.9),
    );

    // If re-encoding did not actually help, keep the original rather than
    // trading a lossless screenshot for a larger JPEG.
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    // createImageBitmap refuses formats the browser cannot decode (HEIC, say).
    // Send the original and let the server give a proper answer.
    return file;
  }
}
