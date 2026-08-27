import type { AppState, Channel, FeedFilter, Group, Video } from './types';
import { PRODUCTION_CLOUD_API_BASE_URL } from '../config';
import { videoThumbnailUrl } from './video';

export const STORAGE_KEY = 'youtube-collections-state-v1';
export const MAX_CACHED_VIDEOS = 8_000;
export const ENRICHMENT_STALE_MS = 24 * 60 * 60 * 1_000;
export const ENRICHMENT_MAX_RETRIES = 3;

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
      cloudApiBaseUrl: PRODUCTION_CLOUD_API_BASE_URL,
      cloudPermissionGranted: false,
      cloudHealthy: false,
      youtubeSyncChannelLimit: 25,
      enrichmentStatus: 'idle',
      enrichmentCursor: 0,
      enrichmentTotal: 0,
      blocklistKeywords: [],
      blocklistChannels: []
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
    settings: {
      ...base.settings,
      ...(candidate.settings ?? {}),
      blocklistKeywords: Array.isArray(candidate.settings?.blocklistKeywords) ? candidate.settings.blocklistKeywords : [],
      blocklistChannels: Array.isArray(candidate.settings?.blocklistChannels) ? candidate.settings.blocklistChannels : [],
      cloudApiBaseUrl: candidate.settings?.cloudApiBaseUrl?.trim() || PRODUCTION_CLOUD_API_BASE_URL
    },
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

export function queueChannelsForEnrichment(state: AppState, priorityChannelIds: string[] = [], force = false, timestamp = Date.now()): AppState {
  const priority = new Set(priorityChannelIds);
  const channels = state.channels.map((channel) => {
    if (!channel.uploadsPlaylistId) return { ...channel, enrichment: { ...channel.enrichment, status: 'ready' as const, retryCount: channel.enrichment?.retryCount ?? 0, priority: false, error: undefined, nextRetryAt: undefined } };
    const lastSuccess = Date.parse(channel.enrichment?.lastSuccessAt ?? '');
    const stale = force || !Number.isFinite(lastSuccess) || timestamp - lastSuccess >= ENRICHMENT_STALE_MS;
    if (!stale) return channel;
    return { ...channel, enrichment: { status: 'pending' as const, retryCount: 0, priority: priority.has(channel.id) || channel.enrichment?.priority, error: undefined, nextRetryAt: undefined } };
  });
  return withEnrichmentSummary({ ...state, channels });
}

export function withEnrichmentSummary(state: AppState): AppState {
  const total = state.channels.length;
  const retryable = state.channels.filter((channel) => channel.enrichment?.status === 'pending' || channel.enrichment?.status === 'loading' || (channel.enrichment?.status === 'error' && channel.enrichment.retryCount < ENRICHMENT_MAX_RETRIES)).length;
  const errors = state.channels.filter((channel) => channel.enrichment?.status === 'error').length;
  const settled = total - retryable;
  return {
    ...state,
    settings: {
      ...state.settings,
      enrichmentCursor: settled,
      enrichmentTotal: total,
      enrichmentErrorCount: errors,
      enrichmentStatus: retryable ? 'running' : total ? 'complete' : 'idle',
      lastEnrichmentAt: !retryable && total ? nowIso() : state.settings.lastEnrichmentAt
    }
  };
}

export function mergeDiscoveredVideos(items: Video[], discovered: Video[]): Video[] {
  const map = new Map(items.map((item) => [item.id, item]));
  for (const item of discovered) {
    const current = map.get(item.id);
    map.set(item.id, {
      ...current,
      ...item,
      thumbnailUrl: videoThumbnailUrl({ id: item.id, thumbnailUrl: item.thumbnailUrl ?? current?.thumbnailUrl }),
      discoveredAt: current?.discoveredAt ?? item.discoveredAt,
      publishedAt: item.publishedAt ?? current?.publishedAt
    });
  }
  return [...map.values()];
}

export function isValidCachedVideo(video: Video): boolean {
  const title = video.title?.trim();
  const channelTitle = video.channelTitle?.trim();
  if (!title || !channelTitle) return false;
  if (/^(untitled video|unknown|n\/a)$/iu.test(title) || /^(unknown channel|unknown|n\/a)$/iu.test(channelTitle)) return false;
  if (/^\d{1,3}:\d{2}(?::\d{2})?$/u.test(title)) return false;
  if (!/^[\w-]{6,20}$/u.test(video.id)) return false;
  try {
    const url = new URL(video.url);
    const urlId = url.searchParams.get('v') ?? (url.pathname.startsWith('/shorts/') ? url.pathname.split('/')[2] : undefined);
    return url.hostname.endsWith('youtube.com') && urlId === video.id;
  } catch { return false; }
}

export function sanitizeVideoCache(state: AppState): AppState {
  const canonicalChannelIds = new Set(state.channels.filter((channel) => channel.id.startsWith('UC')).map((channel) => channel.id));
  const videos = state.videos
    .filter((video) => isValidCachedVideo(video) && (!canonicalChannelIds.size || canonicalChannelIds.has(video.channelId)))
    .map((video) => ({ ...video, thumbnailUrl: videoThumbnailUrl(video) }));
  const keepChannelIds = canonicalChannelIds.size ? canonicalChannelIds : new Set(videos.map((video) => video.channelId));
  const channels = state.channels.filter((channel) => keepChannelIds.has(channel.id));
  const watchLater = state.preferenceSignals?.watchLater.filter(isValidCachedVideo) ?? [];
  const liked = state.preferenceSignals?.liked.filter(isValidCachedVideo) ?? [];
  const suggestedVideos = state.preferenceSignals?.suggestions?.videos.filter(isValidCachedVideo) ?? [];
  const preferencesClean = !state.preferenceSignals || (watchLater.length === state.preferenceSignals.watchLater.length && liked.length === state.preferenceSignals.liked.length && suggestedVideos.length === (state.preferenceSignals.suggestions?.videos.length ?? 0));
  if (videos.length === state.videos.length && channels.length === state.channels.length && preferencesClean) return state;
  const channelIds = new Set(channels.map((channel) => channel.id));
  const videoIds = new Set(videos.map((video) => video.id));
  return {
    ...state,
    videos,
    channels,
    groups: state.groups.map((group) => ({ ...group, channelIds: group.channelIds.filter((id) => channelIds.has(id)) })),
    videoStates: Object.fromEntries(Object.entries(state.videoStates).filter(([videoId]) => videoIds.has(videoId))),
    preferenceSignals: state.preferenceSignals ? {
      ...state.preferenceSignals,
      watchLater,
      liked,
      suggestions: state.preferenceSignals.suggestions ? { ...state.preferenceSignals.suggestions, videos: suggestedVideos } : undefined
    } : undefined
  };
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

export function normalizeChannelPath(urlOrId: string): string {
  try {
    const raw = urlOrId.replace(/^channel:/, '');
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      return new URL(raw).pathname.replace(/\/$/, '').toLocaleLowerCase();
    }
    return raw.replace(/\/$/, '').toLocaleLowerCase();
  } catch {
    return urlOrId.replace(/^channel:/, '').replace(/\/$/, '').toLocaleLowerCase();
  }
}

export function findMatchingChannel(state: AppState, candidate: { id?: string; url?: string; title?: string }): Channel | null {
  if (!candidate) return null;
  const candidatePath = candidate.url ? normalizeChannelPath(candidate.url) : candidate.id ? normalizeChannelPath(candidate.id) : '';
  const candidateTitle = candidate.title?.trim().toLocaleLowerCase();
  const candidateId = candidate.id;

  return state.channels.find((c) => {
    if (candidateId && c.id === candidateId) return true;
    if (candidatePath && normalizeChannelPath(c.url) === candidatePath) return true;
    if (candidatePath && normalizeChannelPath(c.id) === candidatePath) return true;
    if (candidateTitle && c.title?.trim().toLocaleLowerCase() === candidateTitle) return true;
    return false;
  }) ?? null;
}

export function getAssignedGroupIds(state: AppState, candidate: { id: string; url?: string; title?: string }): string[] {
  const matched = findMatchingChannel(state, candidate);
  const candidatePath = candidate.url ? normalizeChannelPath(candidate.url) : normalizeChannelPath(candidate.id);
  const candidateTitle = candidate.title?.trim().toLocaleLowerCase();

  const allPossibleIds = new Set<string>();
  allPossibleIds.add(candidate.id);
  if (matched) allPossibleIds.add(matched.id);

  for (const c of state.channels) {
    if (candidatePath && (normalizeChannelPath(c.url) === candidatePath || normalizeChannelPath(c.id) === candidatePath)) {
      allPossibleIds.add(c.id);
    }
    if (candidateTitle && c.title?.trim().toLocaleLowerCase() === candidateTitle) {
      allPossibleIds.add(c.id);
    }
  }

  const assigned = new Set<string>();
  for (const group of state.groups) {
    for (const gid of group.channelIds) {
      if (allPossibleIds.has(gid)) {
        assigned.add(group.id);
        break;
      }
      if (candidatePath && normalizeChannelPath(gid) === candidatePath) {
        assigned.add(group.id);
        break;
      }
    }
  }
  return [...assigned];
}

export function selectFeed(state: AppState, filter: FeedFilter): Video[] {
  const channelIds = channelsForGroup(state, filter.groupId);
  const query = filter.query.trim().toLocaleLowerCase();
  const blockKeywords = (state.settings.blocklistKeywords ?? []).map((k) => k.trim().toLocaleLowerCase()).filter(Boolean);
  const blockChannels = new Set((state.settings.blocklistChannels ?? []).map((c) => c.trim().toLocaleLowerCase()));

  const result = state.videos.filter((video) => {
    // Exclude Shorts completely from feed
    if (video.contentType === 'short' || video.url.includes('/shorts/') || (video.durationSeconds !== undefined && video.durationSeconds <= 60)) {
      return false;
    }

    const videoState = state.videoStates[video.id];
    const watched = Boolean(videoState?.watchedAt);
    if (videoState?.hiddenAt) return false;
    if (channelIds && !channelIds.has(video.channelId)) return false;
    if (filter.contentTypes.length && !filter.contentTypes.includes(video.contentType)) return false;
    if (!matchesDuration(video.durationSeconds, filter.duration)) return false;
    if (filter.watched === 'watched' && !watched) return false;
    if (filter.watched === 'unwatched' && watched) return false;
    if (state.settings.hideWatched && watched && filter.watched !== 'watched') return false;

    // Blocklist checks
    if (blockChannels.has(video.channelId.toLocaleLowerCase()) || blockChannels.has(video.channelTitle.toLocaleLowerCase())) return false;
    if (blockKeywords.length) {
      const fullText = `${video.title} ${video.channelTitle}`.toLocaleLowerCase();
      if (blockKeywords.some((keyword) => fullText.includes(keyword))) return false;
    }

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

export function retainOnlyChannelIds(state: AppState, channelIds: Iterable<string>): AppState {
  const ids = new Set(channelIds);
  return {
    ...state,
    channels: state.channels.filter((channel) => ids.has(channel.id)),
    groups: state.groups.map((group) => ({ ...group, channelIds: group.channelIds.filter((id) => ids.has(id)) })),
    videos: state.videos.filter((video) => ids.has(video.channelId))
  };
}
