import { describe, expect, it } from 'vitest';
import { createInitialState, ENRICHMENT_MAX_RETRIES, mergeDiscoveredChannels, mergeDiscoveredVideos, normalizeImportedState, queueChannelsForEnrichment, retainOnlyChannelIds, selectFeed, upsertById, withEnrichmentSummary } from './state';
import type { AppState, FeedFilter, Video } from './types';

const videos: Video[] = [
  { id: 'a', title: 'React course', url: 'https://youtube.com/watch?v=a', channelId: 'c1', channelTitle: 'Dev', durationSeconds: 600, viewCount: 100, contentType: 'video', discoveredAt: '2026-01-02T00:00:00Z' },
  { id: 'b', title: 'Daily short', url: 'https://youtube.com/shorts/b', channelId: 'c2', channelTitle: 'News', durationSeconds: 50, viewCount: 900, contentType: 'short', discoveredAt: '2026-01-03T00:00:00Z' },
  { id: 'c', title: 'Long interview', url: 'https://youtube.com/watch?v=c', channelId: 'c1', channelTitle: 'Dev', durationSeconds: 3600, viewCount: 300, contentType: 'video', discoveredAt: '2026-01-01T00:00:00Z' }
];

function state(): AppState {
  return {
    ...createInitialState(),
    groups: [{ id: 'g1', name: 'Tech', icon: '💻', color: '#00ffff', channelIds: ['c1'], notifications: false, position: 0, createdAt: '', updatedAt: '' }],
    videos,
    videoStates: { a: { watchedAt: '2026-01-05T00:00:00Z' } }
  };
}

const filter: FeedFilter = { groupId: null, query: '', contentTypes: [], duration: 'any', watched: 'all', sort: 'newest' };

describe('selectFeed', () => {
  it('filters by group and watched state', () => {
    expect(selectFeed(state(), { ...filter, groupId: 'g1', watched: 'unwatched' }).map((item) => item.id)).toEqual(['c']);
  });

  it('filters duration and content type', () => {
    expect(selectFeed(state(), { ...filter, duration: 'short', contentTypes: ['short'] }).map((item) => item.id)).toEqual(['b']);
  });

  it('sorts by popularity and duration', () => {
    expect(selectFeed(state(), { ...filter, sort: 'popular' }).map((item) => item.id)).toEqual(['b', 'c', 'a']);
    expect(selectFeed(state(), { ...filter, sort: 'duration-desc' }).map((item) => item.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('state helpers', () => {
  it('upserts without losing existing fields', () => {
    expect(upsertById([{ id: '1', name: 'old', keep: true }], [{ id: '1', name: 'new' }])).toEqual([{ id: '1', name: 'new', keep: true }]);
  });

  it('rejects an unsupported import schema', () => {
    expect(() => normalizeImportedState({ schemaVersion: 2 })).toThrow(/chưa được hỗ trợ/);
  });

  it('preserves user tags and the original discovery timestamp during rescans', () => {
    const currentChannel = { id: 'c1', title: 'Dev', url: '', lastSeenAt: 'old', status: 'active' as const, tags: ['custom'] };
    const rescannedChannel = { ...currentChannel, lastSeenAt: 'new', tags: [] };
    expect(mergeDiscoveredChannels([currentChannel], [rescannedChannel])[0]?.tags).toEqual(['custom']);
    expect(mergeDiscoveredVideos([videos[0]!], [{ ...videos[0]!, discoveredAt: '2026-02-01T00:00:00Z' }])[0]?.discoveredAt).toBe('2026-01-02T00:00:00Z');
  });

  it('removes non-subscription channels, videos and group assignments', () => {
    const current = { ...state(), channels: [{ id: 'c1', title: 'Subscribed', url: '', lastSeenAt: '', status: 'active' as const, tags: [] }, { id: 'mock', title: 'Recommendation', url: '', lastSeenAt: '', status: 'active' as const, tags: [] }], videos: [...videos, { ...videos[0]!, id: 'mock-video', channelId: 'mock' }], groups: [{ ...state().groups[0]!, channelIds: ['c1', 'mock'] }] };
    const result = retainOnlyChannelIds(current, ['c1']);
    expect(result.channels.map((item) => item.id)).toEqual(['c1']);
    expect(result.videos.some((item) => item.channelId === 'mock')).toBe(false);
    expect(result.groups[0]?.channelIds).toEqual(['c1']);
  });

  it('queues only missing or stale channel enrichment and prioritizes a selected group', () => {
    const now = Date.parse('2026-08-09T10:00:00Z');
    const current = { ...state(), channels: [
      { id: 'fresh', title: 'Fresh', url: '', lastSeenAt: '', status: 'active' as const, tags: [], uploadsPlaylistId: 'UUfresh', enrichment: { status: 'ready' as const, retryCount: 0, lastSuccessAt: '2026-08-09T09:00:00Z' } },
      { id: 'missing', title: 'Missing', url: '', lastSeenAt: '', status: 'active' as const, tags: [], uploadsPlaylistId: 'UUmissing' }
    ] };
    const result = queueChannelsForEnrichment(current, ['missing'], false, now);
    expect(result.channels.find((channel) => channel.id === 'fresh')?.enrichment?.status).toBe('ready');
    expect(result.channels.find((channel) => channel.id === 'missing')?.enrichment).toMatchObject({ status: 'pending', priority: true, retryCount: 0 });
    expect(result.settings.enrichmentStatus).toBe('running');
  });

  it('settles exhausted enrichment errors instead of showing a permanent running state', () => {
    const current = { ...state(), channels: [{ id: 'failed', title: 'Failed', url: '', lastSeenAt: '', status: 'active' as const, tags: [], enrichment: { status: 'error' as const, retryCount: ENRICHMENT_MAX_RETRIES, error: 'quota' } }] };
    const result = withEnrichmentSummary(current);
    expect(result.settings).toMatchObject({ enrichmentStatus: 'complete', enrichmentCursor: 1, enrichmentTotal: 1, enrichmentErrorCount: 1 });
  });
});
