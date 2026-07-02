/**
 * Detects whether a URL is a Bilibili embed (which react-player cannot
 * control programmatically) and returns the iframe src we should use.
 * For everything else we return null and let react-player handle it.
 */
export function getBilibiliEmbed(url: string): string | null {
  if (!url) return null;
  // Match bilibili.com / b23.tv video pages.
  const bv = url.match(/bilibili\.com\/video\/(BV\w+)/i);
  if (bv) {
    return `https://player.bilibili.com/player.html?bvid=${bv[1]}&high_quality=1&autoplay=1`;
  }
  const av = url.match(/bilibili\.com\/video\/av(\d+)/i);
  if (av) {
    return `https://player.bilibili.com/player.html?aid=${av[1]}&high_quality=1&autoplay=1`;
  }
  if (/b23\.tv\//i.test(url)) {
    // b23.tv short links need a redirect resolve; we can still embed via the
    // player by passing the raw URL as the iframe src.
    return url;
  }
  return null;
}

export function isBilibili(url: string): boolean {
  return /bilibili\.com|b23\.tv/i.test(url);
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}
