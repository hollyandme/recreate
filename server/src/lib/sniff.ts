/**
 * Identify an image from its leading bytes rather than its declared MIME type.
 *
 * The type a browser reports is guesswork built on the file extension, and it is
 * routinely empty or wrong depending on where the file came from. Trusting it
 * meant real screenshots were rejected for having no type at all. The bytes do
 * not lie, so they decide.
 */
export type SniffedType =
  | 'image/png'
  | 'image/jpeg'
  | 'image/gif'
  | 'image/webp'
  | 'image/avif'
  | 'image/heic';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(buf: Buffer, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buf[offset + i] === b);
}

export function sniffImageType(buf: Buffer): SniffedType | null {
  if (startsWith(buf, PNG)) return 'image/png';
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (buf.subarray(0, 4).toString('latin1') === 'GIF8') return 'image/gif';

  // RIFF containers: bytes 0-3 "RIFF", 8-11 names the format.
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'image/webp';
  }

  // ISO-BMFF: bytes 4-7 are "ftyp", then a brand naming the flavour.
  if (buf.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('latin1');
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
    // HEIC is recognised so it can be refused with a useful message: browsers
    // will not render it, so accepting it would store an invisible screenshot.
    if (['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) return 'image/heic';
  }

  return null;
}
