import type { Channel, Video } from '@/src/domain/types';

const API = 'https://www.googleapis.com/youtube/v3';
const PERSONALIZATION_MIN_LONG_FORM_SECONDS = 180;

export class YouTubeApiError extends Error {
  readonly quotaExceeded: boolean;

  constructor(public readonly status: number, detail: string) {
    const quotaExceeded = status === 403 && /quotaExceeded|exceeded your.*quota/iu.test(detail);
    super(quotaExceeded
      ? 'YouTube API đã hết quota hôm nay. Feed mới vẫn được cập nhật bằng RSS; lịch sử sâu và metadata sẽ tiếp tục sau khi quota reset.'
      : `YouTube API ${status}: ${detail.slice(0, 300)}`);
    this.quotaExceeded = quotaExceeded;
  }
}

export function isYouTubeQuotaExceeded(error: unknown): boolean {
  return error instanceof YouTubeApiError && error.quotaExceeded;
}

async function apiJson<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    const detail = await response.text();
    throw new YouTubeApiError(response.status, detail);
  }
  return response.json() as Promise<T>;
}

function batches<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function thumbnail(value?: Record<string, { url: string }>): string | undefined {
  return value?.high?.url ?? value?.medium?.url ?? value?.default?.url;
}

function parseIsoDuration(value?: string): number | undefined {
  if (!value) return undefined;
  const match = value.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return undefined;
  return Number(match[1] ?? 0) * 86400 + Number(match[2] ?? 0) * 3600 + Number(match[3] ?? 0) * 60 + Number(match[4] ?? 0);
}

interface SubscriptionItem {
  id: string;
  snippet: { resourceId: { channelId: string }; title: string; publishedAt?: string; description?: string; thumbnails?: Record<string, { url: string }> };
}

export async function fetchSubscriptions(accessToken: string): Promise<Channel[]> {
  const subscriptions: SubscriptionItem[] = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({ part: 'snippet', mine: 'true', maxResults: '50' });
    if (pageToken) params.set('pageToken', pageToken);
    const page = await apiJson<{ items?: SubscriptionItem[]; nextPageToken?: string }>(`${API}/subscriptions?${params}`, accessToken);
    subscriptions.push(...(page.items ?? []));
    pageToken = page.nextPageToken ?? '';
  } while (pageToken);

  const detailMap = new Map<string, Channel>();
  for (const batch of batches(subscriptions, 50)) {
    const ids = batch.map((item) => item.snippet.resourceId.channelId);
    const params = new URLSearchParams({ part: 'snippet,contentDetails,statistics,status', id: ids.join(','), maxResults: '50' });
    const page = await apiJson<{ items?: Array<{
      id: string;
      snippet: { title: string; description?: string; customUrl?: string; thumbnails?: Record<string, { url: string }> };
      contentDetails?: { relatedPlaylists?: { uploads?: string } };
      statistics?: { subscriberCount?: string };
      status?: { privacyStatus?: string };
    }> }>(`${API}/channels?${params}`, accessToken);
    for (const item of page.items ?? []) {
      const subscription = batch.find((entry) => entry.snippet.resourceId.channelId === item.id);
      detailMap.set(item.id, {
        id: item.id,
        title: item.snippet.title,
        description: item.snippet.description,
        url: item.snippet.customUrl ? `https://www.youtube.com/${item.snippet.customUrl}` : `https://www.youtube.com/channel/${item.id}`,
        thumbnailUrl: thumbnail(item.snippet.thumbnails),
        subscriberCount: item.statistics?.subscriberCount ? Number(item.statistics.subscriberCount) : undefined,
        uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads,
        subscriptionId: subscription?.id,
        subscribedAt: subscription?.snippet.publishedAt,
        lastSeenAt: new Date().toISOString(),
        status: item.status?.privacyStatus === 'public' ? 'active' : 'unknown',
        tags: []
      });
    }
  }
  return subscriptions.map((item) => detailMap.get(item.snippet.resourceId.channelId) ?? {
    id: item.snippet.resourceId.channelId,
    title: item.snippet.title,
    description: item.snippet.description,
    url: `https://www.youtube.com/channel/${item.snippet.resourceId.channelId}`,
    thumbnailUrl: thumbnail(item.snippet.thumbnails),
    subscriptionId: item.id,
    subscribedAt: item.snippet.publishedAt,
    lastSeenAt: new Date().toISOString(),
    status: 'unknown',
    tags: []
  });
}

export interface UploadFeedResult {
  videos: Video[];
  skippedChannels: Array<{ channelId: string; channelTitle: string; playlistId: string; reason: string }>;
  source?: 'rss' | 'api';
  quotaExceeded?: boolean;
  apiRequests?: number;
}

function decodeXml(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function xmlText(source: string, tag: string): string | undefined {
  const match = source.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match?.[1] ? decodeXml(match[1].trim()) : undefined;
}

function parseChannelFeed(xml: string, channel: Channel, limit: number): Video[] {
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/gi) ?? [];
  return entries.slice(0, limit).flatMap((entry) => {
    const id = xmlText(entry, 'yt:videoId');
    const title = xmlText(entry, 'title');
    const publishedAt = xmlText(entry, 'published');
    if (!id || !title || !publishedAt) return [];
    const thumbnailUrl = entry.match(/<media:thumbnail[^>]+url="([^"]+)"/i)?.[1];
    return [{ id, title, url: `https://www.youtube.com/watch?v=${id}`, thumbnailUrl: thumbnailUrl ? decodeXml(thumbnailUrl) : undefined, channelId: channel.id, channelTitle: channel.title, publishedAt, contentType: 'video' as const, discoveredAt: new Date().toISOString() }];
  });
}

export async function fetchRecentUploadFeed(accessToken: string, channels: Channel[], perChannel = 15, includeDetails = true): Promise<UploadFeedResult> {
  const videos: Video[] = [];
  const skippedChannels: UploadFeedResult['skippedChannels'] = [];
  const limit = Math.max(1, Math.min(15, perChannel));
  for (const batch of batches(channels, 12)) {
    const results = await Promise.all(batch.map(async (channel) => {
      try {
        const response = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channel.id)}`);
        if (!response.ok) throw new Error(`RSS ${response.status}`);
        return parseChannelFeed(await response.text(), channel, limit);
      } catch (error) {
        skippedChannels.push({ channelId: channel.id, channelTitle: channel.title, playlistId: channel.uploadsPlaylistId ?? '', reason: error instanceof Error ? error.message : 'RSS unavailable' });
        return [];
      }
    }));
    videos.push(...results.flat());
  }

  let quotaExceeded = false;
  let apiRequests = 0;
  const details = new Map<string, { durationSeconds?: number; viewCount?: number; live?: string }>();
  for (const batch of includeDetails ? batches(videos, 50) : []) {
    try {
      apiRequests += 1;
      const params = new URLSearchParams({ part: 'contentDetails,statistics,snippet,liveStreamingDetails', id: batch.map((item) => item.id).join(',') });
      const page = await apiJson<{ items?: Array<{ id: string; contentDetails?: { duration?: string }; statistics?: { viewCount?: string }; snippet?: { liveBroadcastContent?: string }; liveStreamingDetails?: { actualEndTime?: string } }> }>(`${API}/videos?${params}`, accessToken);
      for (const item of page.items ?? []) details.set(item.id, { durationSeconds: parseIsoDuration(item.contentDetails?.duration), viewCount: item.statistics?.viewCount ? Number(item.statistics.viewCount) : undefined, live: item.liveStreamingDetails?.actualEndTime ? 'ended' : item.snippet?.liveBroadcastContent });
    } catch (error) {
      if (!isYouTubeQuotaExceeded(error)) throw error;
      quotaExceeded = true;
      break;
    }
  }
  return {
    videos: videos.map((video) => {
      const detail = details.get(video.id);
      const contentType = detail?.live === 'live' ? 'live' : detail?.live === 'upcoming' ? 'upcoming' : detail?.durationSeconds !== undefined && detail.durationSeconds <= 60 ? 'short' : 'video';
      return { ...video, durationSeconds: detail?.durationSeconds, viewCount: detail?.viewCount, contentType };
    }),
    skippedChannels,
    source: 'rss',
    quotaExceeded,
    apiRequests
  };
}

export async function fetchUploadFeed(accessToken: string, channels: Channel[], perChannel = 25, cachedVideos: Video[] = []): Promise<UploadFeedResult> {
  const snippets: Array<{ id: string; title: string; channelId: string; channelTitle: string; publishedAt: string; thumbnailUrl?: string }> = [];
  const skippedChannels: UploadFeedResult['skippedChannels'] = [];
  const cutoff = Date.now() - 365 * 86_400_000;
  let apiRequests = 0;
  for (const channel of channels) {
    if (!channel.uploadsPlaylistId) continue;
    let pageToken = '';
    let channelItemCount = 0;
    do {
      const params = new URLSearchParams({ part: 'snippet,contentDetails', playlistId: channel.uploadsPlaylistId, maxResults: String(Math.min(50, perChannel - channelItemCount)) });
      if (pageToken) params.set('pageToken', pageToken);
      let page: { items?: Array<{
        contentDetails?: { videoId?: string };
        snippet: { title: string; channelId?: string; channelTitle: string; publishedAt: string; thumbnails?: Record<string, { url: string }>; resourceId?: { videoId?: string } };
      }>; nextPageToken?: string };
      try { apiRequests += 1; page = await apiJson(`${API}/playlistItems?${params}`, accessToken); }
      catch (error) {
        if (!(error instanceof YouTubeApiError) || error.status !== 404) throw error;
        skippedChannels.push({ channelId: channel.id, channelTitle: channel.title, playlistId: channel.uploadsPlaylistId, reason: error.message });
        break;
      }
      const items = page.items ?? [];
      channelItemCount += items.length;
      for (const item of items) {
        const published = Date.parse(item.snippet.publishedAt);
        if (published < cutoff) continue;
        const id = item.contentDetails?.videoId ?? item.snippet.resourceId?.videoId;
        if (!id || item.snippet.title === 'Deleted video' || item.snippet.title === 'Private video') continue;
        snippets.push({ id, title: item.snippet.title, channelId: channel.id, channelTitle: channel.title, publishedAt: item.snippet.publishedAt, thumbnailUrl: thumbnail(item.snippet.thumbnails) });
      }
      const reachedYear = items.some((item) => Date.parse(item.snippet.publishedAt) < cutoff);
      pageToken = reachedYear ? '' : page.nextPageToken ?? '';
    } while (pageToken && channelItemCount < perChannel);
  }

  const cached = new Map(cachedVideos.map((video) => [video.id, video]));
  const details = new Map<string, { durationSeconds?: number; viewCount?: number; live?: string }>(snippets.flatMap((item) => {
    const video = cached.get(item.id);
    return video && (video.durationSeconds !== undefined || video.viewCount !== undefined) ? [[item.id, { durationSeconds: video.durationSeconds, viewCount: video.viewCount, live: video.contentType }]] : [];
  }));
  const missingDetails = snippets.filter((item) => !details.has(item.id));
  for (const batch of batches(missingDetails, 50)) {
    apiRequests += 1;
    const params = new URLSearchParams({ part: 'contentDetails,statistics,snippet,liveStreamingDetails', id: batch.map((item) => item.id).join(',') });
    const page = await apiJson<{ items?: Array<{ id: string; contentDetails?: { duration?: string }; statistics?: { viewCount?: string }; snippet?: { liveBroadcastContent?: string }; liveStreamingDetails?: { actualEndTime?: string; scheduledStartTime?: string } }> }>(`${API}/videos?${params}`, accessToken);
    for (const item of page.items ?? []) details.set(item.id, { durationSeconds: parseIsoDuration(item.contentDetails?.duration), viewCount: item.statistics?.viewCount ? Number(item.statistics.viewCount) : undefined, live: item.liveStreamingDetails?.actualEndTime ? 'ended' : item.snippet?.liveBroadcastContent });
  }
  const videos = snippets.map((item) => {
    const detail = details.get(item.id);
    const contentType = detail?.live === 'live' ? 'live' : detail?.live === 'upcoming' ? 'upcoming' : (detail?.durationSeconds ?? 999) <= 60 ? 'short' : 'video';
    return { ...item, url: `https://www.youtube.com/watch?v=${item.id}`, durationSeconds: detail?.durationSeconds, viewCount: detail?.viewCount, contentType, discoveredAt: new Date().toISOString() } satisfies Video;
  });
  return { videos, skippedChannels, source: 'api', apiRequests };
}

export async function fetchSuggestedVideos(accessToken: string, query: string): Promise<Video[]> {
  const publishedAfter = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const searchParams = new URLSearchParams({ part: 'snippet', type: 'video', order: 'viewCount', maxResults: '24', q: query, publishedAfter, safeSearch: 'moderate' });
  const search = await apiJson<{ items?: Array<{ id: { videoId?: string }; snippet: { title: string; channelId: string; channelTitle: string; publishedAt: string; thumbnails?: Record<string, { url: string }> } }> }>(`${API}/search?${searchParams}`, accessToken);
  const items = (search.items ?? []).filter((item) => item.id.videoId);
  const ids = items.map((item) => item.id.videoId!).join(',');
  if (!ids) return [];
  const detailParams = new URLSearchParams({ part: 'contentDetails,statistics,snippet,liveStreamingDetails', id: ids });
  const detailPage = await apiJson<{ items?: Array<{ id: string; contentDetails?: { duration?: string }; statistics?: { viewCount?: string }; snippet?: { liveBroadcastContent?: string }; liveStreamingDetails?: { actualEndTime?: string } }> }>(`${API}/videos?${detailParams}`, accessToken);
  const details = new Map((detailPage.items ?? []).map((item) => [item.id, item]));
  return items.map((item) => {
    const id = item.id.videoId!; const detail = details.get(id);
    const durationSeconds = parseIsoDuration(detail?.contentDetails?.duration);
    const live = detail?.liveStreamingDetails?.actualEndTime ? 'ended' : detail?.snippet?.liveBroadcastContent;
    const contentType = live === 'live' ? 'live' : live === 'upcoming' ? 'upcoming' : (durationSeconds ?? 999) <= 60 ? 'short' : 'video';
    return { id, title: item.snippet.title, url: `https://www.youtube.com/watch?v=${id}`, thumbnailUrl: thumbnail(item.snippet.thumbnails), channelId: item.snippet.channelId, channelTitle: item.snippet.channelTitle, publishedAt: item.snippet.publishedAt, durationSeconds, viewCount: detail?.statistics?.viewCount ? Number(detail.statistics.viewCount) : undefined, contentType, discoveredAt: new Date().toISOString() } satisfies Video;
  }).filter((video) => video.contentType !== 'short' && (video.durationSeconds ?? 0) > PERSONALIZATION_MIN_LONG_FORM_SECONDS);
}

export async function fetchLikedVideos(accessToken: string, limit = 100): Promise<Video[]> {
  const videos: Video[] = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({ part: 'snippet,contentDetails,statistics,liveStreamingDetails', myRating: 'like', maxResults: String(Math.min(50, limit - videos.length)) });
    if (pageToken) params.set('pageToken', pageToken);
    const page = await apiJson<{
      items?: Array<{
        id: string;
        snippet: { title: string; channelId: string; channelTitle: string; publishedAt: string; thumbnails?: Record<string, { url: string }> };
        contentDetails?: { duration?: string };
        statistics?: { viewCount?: string };
        liveStreamingDetails?: { actualEndTime?: string };
      }>;
      nextPageToken?: string;
    }>(`${API}/videos?${params}`, accessToken);
    for (const item of page.items ?? []) {
      const durationSeconds = parseIsoDuration(item.contentDetails?.duration);
      if ((durationSeconds ?? 0) <= PERSONALIZATION_MIN_LONG_FORM_SECONDS) continue;
      videos.push({ id: item.id, title: item.snippet.title, url: `https://www.youtube.com/watch?v=${item.id}`, thumbnailUrl: thumbnail(item.snippet.thumbnails), channelId: item.snippet.channelId, channelTitle: item.snippet.channelTitle, publishedAt: item.snippet.publishedAt, durationSeconds, viewCount: item.statistics?.viewCount ? Number(item.statistics.viewCount) : undefined, contentType: 'video', discoveredAt: new Date().toISOString() });
    }
    pageToken = page.nextPageToken ?? '';
  } while (pageToken && videos.length < limit);
  return videos.slice(0, limit);
}

const PREFERENCE_STOP_WORDS = new Set(['video', 'official', 'channel', 'youtube', 'with', 'from', 'this', 'that', 'your', 'của', 'với', 'cho', 'trong', 'những', 'một', 'được', 'và', 'the', 'and']);

export function buildPreferenceQuery(liked: Video[], watchLater: Video[]): string {
  const scores = new Map<string, number>();
  const collect = (video: Video, weight: number) => {
    const tokens = `${video.title} ${video.channelTitle}`.normalize('NFC').toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    for (const token of new Set(tokens)) if (token.length >= 3 && !PREFERENCE_STOP_WORDS.has(token)) scores.set(token, (scores.get(token) ?? 0) + weight);
  };
  liked.slice(0, 50).forEach((video) => collect(video, 2));
  watchLater.slice(0, 50).forEach((video) => collect(video, 1));
  return [...scores.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, 4).map(([token]) => token).join(' ') || 'documentary technology';
}

export async function fetchPersonalizedSuggestions(accessToken: string, watchLater: Video[], customQuery?: string, cachedLiked?: Video[]): Promise<{ query: string; videos: Video[]; likedCount: number; watchLaterCount: number; liked: Video[] }> {
  const liked = cachedLiked ?? await fetchLikedVideos(accessToken);
  const longWatchLater = watchLater.filter((video) => video.contentType !== 'short' && (video.durationSeconds === undefined || video.durationSeconds > PERSONALIZATION_MIN_LONG_FORM_SECONDS));
  const query = customQuery?.trim() || buildPreferenceQuery(liked, longWatchLater);
  const seedIds = new Set([...liked, ...longWatchLater].map((video) => video.id));
  const videos = (await fetchSuggestedVideos(accessToken, query)).filter((video) => !seedIds.has(video.id) && video.contentType !== 'short' && (video.durationSeconds ?? 0) > PERSONALIZATION_MIN_LONG_FORM_SECONDS);
  return { query, videos, likedCount: liked.length, watchLaterCount: longWatchLater.length, liked };
}

export async function unsubscribe(accessToken: string, subscriptionId: string): Promise<void> {
  const response = await fetch(`${API}/subscriptions?id=${encodeURIComponent(subscriptionId)}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (response.status !== 204) throw new Error(`YouTube unsubscribe thất bại (${response.status}): ${(await response.text()).slice(0, 200)}`);
}
