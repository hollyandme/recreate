import type { Platform } from './api';

/**
 * Both platforms expose a public embed endpoint that frames in an iframe. No API
 * key, no OAuth. Private, deleted or age-restricted posts simply do not render,
 * which is why the card always pairs the frame with an "Open original" link.
 */
export function embedUrl(url: string): string {
  const ig = url.match(/instagram\.com\/(reel|reels|p|tv)\/([A-Za-z0-9_-]+)/);
  if (ig) return `https://www.instagram.com/${ig[1] === 'reels' ? 'reel' : ig[1]}/${ig[2]}/embed`;

  const tt = url.match(/tiktok\.com\/(?:@[\w.]+\/video|v|embed\/v2)\/(\d+)/);
  if (tt) return `https://www.tiktok.com/embed/v2/${tt[1]}`;

  return '';
}

export function platformIcon(platform: Platform): string {
  if (platform === 'TikTok') return 'ph ph-tiktok-logo';
  if (platform === 'Instagram') return 'ph ph-instagram-logo';
  return 'ph ph-link-simple';
}

/** TikTok's embed is taller than Instagram's; matching them would letterbox one. */
export function embedHeight(platform: Platform): number {
  return platform === 'TikTok' ? 750 : 660;
}

export function savedLabel(iso: string): string {
  const then = new Date(iso);
  const today = new Date();
  const sameDay =
    then.getFullYear() === today.getFullYear() &&
    then.getMonth() === today.getMonth() &&
    then.getDate() === today.getDate();
  if (sameDay) return 'today';
  const sameYear = then.getFullYear() === today.getFullYear();
  return then.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}
