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

export function idFromChannelUrl(href: string): string {
  try {
    return `channel:${new URL(href, 'https://www.youtube.com').pathname.replace(/\/$/, '')}`;
  } catch {
    return `channel:${href}`;
  }
}

function contentTypeFor(card: Element, url: string, durationSeconds?: number): ContentType {
  const badges = [...card.querySelectorAll<HTMLElement>('ytd-badge-supported-renderer, .badge-shape-wiz__text, ytd-thumbnail-overlay-time-status-renderer')]
    .map((item) => item.textContent?.trim().toLocaleLowerCase() ?? '');
  if (url.includes('/shorts/')) return 'short';
  if (badges.some((text) => text === 'upcoming' || text === 'sắp công chiếu')) return 'upcoming';
  if (badges.some((text) => text === 'live' || text === 'trực tiếp')) return 'live';
  if (durationSeconds !== undefined && durationSeconds <= 60) return 'short';
  return 'video';
}

export function scanYouTubePage(root: ParentNode = document): DiscoveredPayload {
  const channels = new Map<string, Channel>();
  const videos = new Map<string, Video>();
  const discoveredAt = new Date().toISOString();

  for (const card of root.querySelectorAll(CARD_SELECTORS)) {
    // Thumbnail anchors appear before headings in YouTube's DOM and often only
    // contain the duration text. Never use a generic watch link as the title.
    const titleAnchor = card.querySelector<HTMLAnchorElement>('a#video-title-link, a#video-title, h3 a[href*="/watch?v="], h3 a[href^="/shorts/"]');
    if (!titleAnchor?.href) continue;
    const parsed = new URL(titleAnchor.href, location.origin);
    const videoId = parsed.searchParams.get('v') ?? (parsed.pathname.startsWith('/shorts/') ? parsed.pathname.split('/')[2] : undefined);
    if (!videoId) continue;

    const channelAnchor = card.querySelector<HTMLAnchorElement>('ytd-channel-name a, #channel-name a, a.yt-simple-endpoint[href^="/@"], a.yt-simple-endpoint[href^="/channel/"]');
    const channelTitle = channelAnchor?.textContent?.trim() || card.querySelector('#channel-name')?.textContent?.trim();
    if (!channelTitle) continue;
    const channelUrl = channelAnchor?.href ? absoluteUrl(channelAnchor.href) : `https://www.youtube.com/results?search_query=${encodeURIComponent(channelTitle)}`;
    const channelId = idFromChannelUrl(channelUrl);
    const durationText = card.querySelector<HTMLElement>('ytd-thumbnail-overlay-time-status-renderer, #time-status, .badge-shape-wiz__text')?.textContent ?? '';
    const durationSeconds = parseDuration(durationText);
    const metadata = [...card.querySelectorAll<HTMLElement>('#metadata-line span, .inline-metadata-item')].map((item) => item.textContent?.trim() ?? '');
    const viewLabel = metadata.find((item) => /view|lượt xem/i.test(item));
    const publishedLabel = metadata.find((item) => item && item !== viewLabel);
    const thumbnailUrl = card.querySelector<HTMLImageElement>('ytd-thumbnail img, img.yt-core-image')?.src || undefined;
    const title = titleAnchor.getAttribute('title')?.trim() || titleAnchor.textContent?.trim();
    if (!title || /^\d{1,3}:\d{2}(?::\d{2})?$/u.test(title)) continue;
    const contentType = contentTypeFor(card, titleAnchor.href, durationSeconds);
    if (contentType === 'short' || parsed.pathname.startsWith('/shorts/')) continue;

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

export function getCurrentPageChannel(root: ParentNode = document): Channel | null {
  const discoveredAt = new Date().toISOString();

  // 1. Try Watch Page owner section
  const watchOwner = root.querySelector(
    'ytd-watch-metadata ytd-video-owner-renderer, ytd-video-owner-renderer, #owner.ytd-watch-metadata, #owner, ytd-watch-metadata'
  );
  if (watchOwner) {
    const channelAnchor = watchOwner.querySelector<HTMLAnchorElement>(
      'a.yt-simple-endpoint[href*="/@"], a.yt-simple-endpoint[href*="/channel/"], a.yt-simple-endpoint[href*="/c/"], a.yt-simple-endpoint[href*="/user/"], #channel-name a, ytd-channel-name a, a#avatar'
    );
    const channelTitle = channelAnchor?.textContent?.trim() || watchOwner.querySelector('#channel-name, ytd-channel-name, #upload-info #channel-name, .ytd-channel-name')?.textContent?.trim();
    if (channelTitle) {
      const href = channelAnchor?.getAttribute('href') || channelAnchor?.href;
      const channelUrl = href ? absoluteUrl(href) : `https://www.youtube.com/results?search_query=${encodeURIComponent(channelTitle)}`;
      const channelId = idFromChannelUrl(channelUrl);
      const avatarImg = watchOwner.querySelector<HTMLImageElement>('#avatar img, yt-img-shadow img, img.yt-core-image, yt-avatar-shape img');
      const subText = watchOwner.querySelector<HTMLElement>('#owner-sub-count, yt-formatted-string#owner-sub-count')?.textContent ?? '';
      return {
        id: channelId,
        title: channelTitle,
        url: channelUrl,
        thumbnailUrl: avatarImg?.src || undefined,
        subscriberCount: parseCompactNumber(subText),
        lastSeenAt: discoveredAt,
        status: 'active',
        tags: []
      };
    }
  }

  // 2. Try Channel Page Header
  const channelHeader = root.querySelector('yt-page-header-renderer, ytd-c4-tabbed-header-renderer, ytd-page-header-renderer, #page-header-container');
  if (channelHeader) {
    const titleEl = channelHeader.querySelector(
      '.page-header-view-model-wiz__page-header-title, #channel-name, #page-header-container h1, yt-page-header-renderer h1, yt-formatted-string.ytd-channel-name'
    );
    const channelTitle = titleEl?.textContent?.trim();
    if (channelTitle) {
      const canonicalHref = (typeof document !== 'undefined' ? document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href : undefined);
      const isChannelPath = typeof location !== 'undefined' && (location.pathname.startsWith('/@') || location.pathname.startsWith('/channel/') || location.pathname.startsWith('/c/') || location.pathname.startsWith('/user/'));
      const channelUrl = canonicalHref && (canonicalHref.includes('/@') || canonicalHref.includes('/channel/'))
        ? canonicalHref
        : isChannelPath
          ? `${location.origin}${location.pathname}`
          : `https://www.youtube.com/results?search_query=${encodeURIComponent(channelTitle)}`;
      const channelId = idFromChannelUrl(channelUrl);
      const avatarImg = channelHeader.querySelector<HTMLImageElement>('#avatar img, yt-avatar-shape img, .page-header-view-model-wiz__avatar img, yt-img-shadow img');
      const subText = channelHeader.querySelector<HTMLElement>('#subscriber-count, .page-header-view-model-wiz__page-header-content-metadata span, yt-formatted-string#subscriber-count')?.textContent ?? '';
      return {
        id: channelId,
        title: channelTitle,
        url: channelUrl,
        thumbnailUrl: avatarImg?.src || undefined,
        subscriberCount: parseCompactNumber(subText),
        lastSeenAt: discoveredAt,
        status: 'active',
        tags: []
      };
    }
  }

  return null;
}


