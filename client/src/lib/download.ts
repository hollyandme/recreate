/**
 * Neither platform lets you fetch the video file from a post URL, so getting one
 * means using an external downloader. This just hands the link over: the URL is
 * copied and the site opened in a new tab, so it works whatever query-parameter
 * scheme that site happens to use today, and keeps working when they change it.
 *
 * Nothing is sent anywhere from here — the copy is local and the tab is the
 * user's own. Downloading someone's video is their call to make; this only
 * saves the copy-paste.
 */
export const DOWNLOADER_BY_PLATFORM: Record<string, { name: string; url: string } | undefined> = {
  TikTok: { name: 'ssstik.io', url: 'https://ssstik.io/' },
  Instagram: { name: 'snapinsta.to', url: 'https://snapinsta.to/en46' },
  // 'Link' has no entry on purpose: an arbitrary URL is not something either
  // downloader handles, so the button simply does not appear on those cards.
};

export async function openDownloader(postUrl: string, site: { url: string }): Promise<boolean> {
  let copied = false;
  try {
    await navigator.clipboard.writeText(postUrl);
    copied = true;
  } catch {
    // Clipboard needs permission and a secure context; the tab still opens.
  }
  window.open(site.url, '_blank', 'noopener,noreferrer');
  return copied;
}
