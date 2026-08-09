import type { AppState, Channel, FeedFilter, Group, Video } from './types';

export const STORAGE_KEY = 'youtube-collections-state-v1';
export const MAX_CACHED_VIDEOS = 2_000;

export function nowIso(): string {
  return new Date().toISOString();
}

export function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function createInitialState(): AppState {
  const now = nowIso();
  return {
    schemaVersion: 1,
    groups: [],
    channels: [],
    videos: [],
    videoStates: {},
    settings: {
      theme: 'system',
      hideWatched: false,
      defaultGroupId: null,
      notificationsEnabled: false,
      initialDiscoveryComplete: false,
      googleClientId: '',
      cloudApiBaseUrl: '',
      youtubeSyncChannelLimit: 25
    },
    updatedAt: now
  };
}

export function normalizeImportedState(value: unknown): AppState {
  if (!value || typeof value !== 'object') throw new Error('File import không hợp lệ.');
  const candidate = value as Partial<AppState>;
  if (candidate.schemaVersion !== 1) throw new Error('Phiên bản dữ liệu chưa được hỗ trợ.');
  const base = createInitialState();
  return {
    ...base,
    ...candidate,
    groups: Array.isArray(candidate.groups) ? candidate.groups : [],
    channels: Array.isArray(candidate.channels) ? candidate.channels : [],
    videos: Array.isArray(candidate.videos) ? candidate.videos.slice(0, MAX_CACHED_VIDEOS) : [],
    videoStates: candidate.videoStates && typeof candidate.videoStates === 'object' ? candidate.videoStates : {},
    settings: { ...base.settings, ...(candidate.settings ?? {}) },
    updatedAt: nowIso()
  };
}

export function upsertById<T extends { id: string }>(items: T[], nextItems: T[]): T[] {
  const map = new Map(items.map((item) => [item.id, item]));
  for (const item of nextItems) map.set(item.id, { ...map.get(item.id), ...item });
  return [...map.values()];
}

export function mergeDiscoveredChannels(items: Channel[], discovered: Channel[]): Channel[] {
  const map = new Map(items.map((item) => [item.id, item]));
  for (const item of discovered) {
    const current = map.get(item.id);
    map.set(item.id, {
      ...current,
      ...item,
      tags: current?.tags ?? item.tags,
      status: current?.status === 'unavailable' ? current.status : item.status
    });
  }
  return [...map.values()];
}

export function mergeDiscoveredVideos(items: Video[], discovered: Video[]): Video[] {
  const map = new Map(items.map((item) => [item.id, item]));
  for (const item of discovered) {
    const current = map.get(item.id);
    map.set(item.id, {
      ...current,
      ...item,
      discoveredAt: current?.discoveredAt ?? item.discoveredAt,
      publishedAt: item.publishedAt ?? current?.publishedAt
    });
  }
  return [...map.values()];
}

export function channelsForGroup(state: AppState, groupId: string | null): Set<string> | null {
  if (!groupId) return null;
  const group = state.groups.find((item) => item.id === groupId);
  return new Set(group?.channelIds ?? []);
}

function matchesDuration(seconds: number | undefined, duration: FeedFilter['duration']): boolean {
  if (duration === 'any') return true;
  if (seconds === undefined) return false;
  if (duration === 'short') return seconds < 4 * 60;
  if (duration === 'medium') return seconds >= 4 * 60 && seconds <= 20 * 60;
  return seconds > 20 * 60;
}

export function selectFeed(state: AppState, filter: FeedFilter): Video[] {
  const channelIds = channelsForGroup(state, filter.groupId);
  const query = filter.query.trim().toLocaleLowerCase();
  const result = state.videos.filter((video) => {
    const videoState = state.videoStates[video.id];
    const watched = Boolean(videoState?.watchedAt);
    if (videoState?.hiddenAt) return false;
    if (channelIds && !channelIds.has(video.channelId)) return false;
    if (filter.contentTypes.length && !filter.contentTypes.includes(video.contentType)) return false;
    if (!matchesDuration(video.durationSeconds, filter.duration)) return false;
    if (filter.watched === 'watched' && !watched) return false;
    if (filter.watched === 'unwatched' && watched) return false;
    if (state.settings.hideWatched && watched && filter.watched !== 'watched') return false;
    if (query && !`${video.title} ${video.channelTitle}`.toLocaleLowerCase().includes(query)) return false;
    return true;
  });

  return result.sort((a, b) => {
    if (filter.sort === 'duration-desc') return (b.durationSeconds ?? -1) - (a.durationSeconds ?? -1);
    if (filter.sort === 'duration-asc') return (a.durationSeconds ?? Number.MAX_SAFE_INTEGER) - (b.durationSeconds ?? Number.MAX_SAFE_INTEGER);
    if (filter.sort === 'popular') return (b.viewCount ?? -1) - (a.viewCount ?? -1);
    const aDate = Date.parse(a.publishedAt ?? a.discoveredAt);
    const bDate = Date.parse(b.publishedAt ?? b.discoveredAt);
    return filter.sort === 'oldest' ? aDate - bDate : bDate - aDate;
  });
}

export function groupChannelCount(group: Group, channels: Channel[]): number {
  const ids = new Set(channels.map((channel) => channel.id));
  return group.channelIds.filter((id) => ids.has(id)).length;
}
