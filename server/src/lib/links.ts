/**
 * Deriving platform and handle from a pasted URL. Ported from the prototype so
 * a link saved in the design behaves identically here.
 */
export type Platform = 'Instagram' | 'TikTok' | 'Link';

export function detectPlatform(url: string): Platform {
  if (/tiktok/i.test(url)) return 'TikTok';
  if (/instagram/i.test(url)) return 'Instagram';
  return 'Link';
}

export function detectSource(url: string): string {
  const at = url.match(/@([A-Za-z0-9._]+)/);
  if (at) return '@' + at[1];
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return 'unknown source';
  }
}
