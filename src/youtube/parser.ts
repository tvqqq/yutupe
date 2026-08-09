import type { Channel, ContentType, DiscoveredPayload, Video } from '@/src/domain/types';

const CARD_SELECTORS = [
  'ytd-rich-item-renderer',
  'ytd-video-renderer',
  'ytd-grid-video-renderer',
  'ytd-compact-video-renderer'
].join(',');

export function parseDuration(value: string): number | undefined {
  const parts = value.trim().split(':').map(Number);
  if (!parts.length || parts.some(Number.isNaN)) return undefined;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

export function parseCompactNumber(value: string): number | undefined {
  const normalized = value.toLocaleLowerCase().replace(/,/g, '.').replace(/\s/g, '');
  const match = normalized.match(/([\d.]+)(k|m|b|nghìn|triệu|tỷ)?/);
  if (!match?.[1]) return undefined;
  const base = Number(match[1]);
  if (Number.isNaN(base)) return undefined;
  const unit = match[2];
  const multiplier = unit === 'k' || unit === 'nghìn' ? 1_000 : unit === 'm' || unit === 'triệu' ? 1_000_000 : unit === 'b' || unit === 'tỷ' ? 1_000_000_000 : 1;
  return Math.round(base * multiplier);
}

function absoluteUrl(href: string): string {
  return new URL(href, 'https://www.youtube.com').toString();
}

function idFromChannelUrl(href: string): string {
  try {
    return `channel:${new URL(href, 'https://www.youtube.com').pathname.replace(/\/$/, '')}`;
  } catch {
    return `channel:${href}`;
  }
}

function contentTypeFor(card: Element, url: string, durationSeconds?: number): ContentType {
  const text = card.textContent?.toLocaleLowerCase() ?? '';
  if (url.includes('/shorts/')) return 'short';
  if (text.includes('upcoming') || text.includes('sắp công chiếu')) return 'upcoming';
  if (text.includes('live') || text.includes('trực tiếp')) return 'live';
  if (durationSeconds !== undefined && durationSeconds <= 60) return 'short';
  return 'video';
}

export function scanYouTubePage(root: ParentNode = document): DiscoveredPayload {
  const channels = new Map<string, Channel>();
  const videos = new Map<string, Video>();
  const discoveredAt = new Date().toISOString();

  for (const card of root.querySelectorAll(CARD_SELECTORS)) {
    const titleAnchor = card.querySelector<HTMLAnchorElement>('a#video-title-link, a#video-title, a[href*="/watch?v="], a[href^="/shorts/"]');
    if (!titleAnchor?.href) continue;
    const parsed = new URL(titleAnchor.href, location.origin);
    const videoId = parsed.searchParams.get('v') ?? (parsed.pathname.startsWith('/shorts/') ? parsed.pathname.split('/')[2] : undefined);
    if (!videoId) continue;

    const channelAnchor = card.querySelector<HTMLAnchorElement>('ytd-channel-name a, #channel-name a, a.yt-simple-endpoint[href^="/@"], a.yt-simple-endpoint[href^="/channel/"]');
    const channelTitle = channelAnchor?.textContent?.trim() || card.querySelector('#channel-name')?.textContent?.trim() || 'Unknown channel';
    const channelUrl = channelAnchor?.href ? absoluteUrl(channelAnchor.href) : `https://www.youtube.com/results?search_query=${encodeURIComponent(channelTitle)}`;
    const channelId = idFromChannelUrl(channelUrl);
    const durationText = card.querySelector<HTMLElement>('ytd-thumbnail-overlay-time-status-renderer, #time-status, .badge-shape-wiz__text')?.textContent ?? '';
    const durationSeconds = parseDuration(durationText);
    const metadata = [...card.querySelectorAll<HTMLElement>('#metadata-line span, .inline-metadata-item')].map((item) => item.textContent?.trim() ?? '');
    const viewLabel = metadata.find((item) => /view|lượt xem/i.test(item));
    const publishedLabel = metadata.find((item) => item && item !== viewLabel);
    const thumbnailUrl = card.querySelector<HTMLImageElement>('ytd-thumbnail img, img.yt-core-image')?.src || undefined;
    const title = titleAnchor.getAttribute('title') || titleAnchor.textContent?.trim() || 'Untitled video';

    channels.set(channelId, {
      id: channelId,
      title: channelTitle,
      url: channelUrl,
      thumbnailUrl: card.querySelector<HTMLImageElement>('#avatar img, ytd-channel-name img')?.src || undefined,
      lastSeenAt: discoveredAt,
      status: 'active',
      tags: []
    });
    videos.set(videoId, {
      id: videoId,
      title,
      url: absoluteUrl(titleAnchor.href),
      thumbnailUrl,
      channelId,
      channelTitle,
      durationSeconds,
      publishedLabel,
      viewCount: viewLabel ? parseCompactNumber(viewLabel) : undefined,
      contentType: contentTypeFor(card, titleAnchor.href, durationSeconds),
      discoveredAt
    });
  }

  return { channels: [...channels.values()], videos: [...videos.values()] };
}
