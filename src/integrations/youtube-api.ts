import type { Channel, Video } from '@/src/domain/types';

const API = 'https://www.googleapis.com/youtube/v3';

async function apiJson<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`YouTube API ${response.status}: ${detail.slice(0, 300)}`);
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
  snippet: { resourceId: { channelId: string }; title: string; description?: string; thumbnails?: Record<string, { url: string }> };
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
    lastSeenAt: new Date().toISOString(),
    status: 'unknown',
    tags: []
  });
}

export async function fetchUploadFeed(accessToken: string, channels: Channel[], perChannel = 5): Promise<Video[]> {
  const snippets: Array<{ id: string; title: string; channelId: string; channelTitle: string; publishedAt: string; thumbnailUrl?: string }> = [];
  for (const channel of channels) {
    if (!channel.uploadsPlaylistId) continue;
    const params = new URLSearchParams({ part: 'snippet,contentDetails', playlistId: channel.uploadsPlaylistId, maxResults: String(perChannel) });
    const page = await apiJson<{ items?: Array<{
      contentDetails?: { videoId?: string };
      snippet: { title: string; channelId?: string; channelTitle: string; publishedAt: string; thumbnails?: Record<string, { url: string }>; resourceId?: { videoId?: string } };
    }> }>(`${API}/playlistItems?${params}`, accessToken);
    for (const item of page.items ?? []) {
      const id = item.contentDetails?.videoId ?? item.snippet.resourceId?.videoId;
      if (!id || item.snippet.title === 'Deleted video' || item.snippet.title === 'Private video') continue;
      snippets.push({ id, title: item.snippet.title, channelId: channel.id, channelTitle: channel.title, publishedAt: item.snippet.publishedAt, thumbnailUrl: thumbnail(item.snippet.thumbnails) });
    }
  }

  const details = new Map<string, { durationSeconds?: number; viewCount?: number; live?: string }>();
  for (const batch of batches(snippets, 50)) {
    const params = new URLSearchParams({ part: 'contentDetails,statistics,snippet', id: batch.map((item) => item.id).join(',') });
    const page = await apiJson<{ items?: Array<{ id: string; contentDetails?: { duration?: string }; statistics?: { viewCount?: string }; snippet?: { liveBroadcastContent?: string } }> }>(`${API}/videos?${params}`, accessToken);
    for (const item of page.items ?? []) details.set(item.id, { durationSeconds: parseIsoDuration(item.contentDetails?.duration), viewCount: item.statistics?.viewCount ? Number(item.statistics.viewCount) : undefined, live: item.snippet?.liveBroadcastContent });
  }
  return snippets.map((item) => {
    const detail = details.get(item.id);
    const contentType = detail?.live === 'live' ? 'live' : detail?.live === 'upcoming' ? 'upcoming' : (detail?.durationSeconds ?? 999) <= 60 ? 'short' : 'video';
    return { ...item, url: `https://www.youtube.com/watch?v=${item.id}`, durationSeconds: detail?.durationSeconds, viewCount: detail?.viewCount, contentType, discoveredAt: new Date().toISOString() } satisfies Video;
  });
}

export async function unsubscribe(accessToken: string, subscriptionId: string): Promise<void> {
  const response = await fetch(`${API}/subscriptions?id=${encodeURIComponent(subscriptionId)}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (response.status !== 204) throw new Error(`YouTube unsubscribe thất bại (${response.status}): ${(await response.text()).slice(0, 200)}`);
}
