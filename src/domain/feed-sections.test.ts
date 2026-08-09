import { describe, expect, it } from 'vitest';
import type { Video } from './types';
import { groupFeedSections } from './feed-sections';

const video = (id: string, publishedAt: string, contentType: Video['contentType'] = 'video'): Video => ({
  id, title: id, url: `https://youtube.com/watch?v=${id}`, channelId: 'channel', channelTitle: 'Channel',
  contentType, publishedAt, discoveredAt: publishedAt
});

describe('groupFeedSections', () => {
  it('groups all content by recency without a separate live module', () => {
    const now = Date.parse('2026-08-09T12:00:00Z');
    const sections = groupFeedSections([
      video('old', '2026-07-01T00:00:00Z'),
      video('today', '2026-08-09T01:00:00Z'),
      video('live', '2026-07-01T00:00:00Z', 'live'),
      video('week', '2026-08-05T00:00:00Z')
    ], now);
    expect(sections.map((section) => [section.id, section.videos.map((item) => item.id)])).toEqual([
      ['today', ['today']], ['week', ['week']], ['two-months', ['old', 'live']]
    ]);
  });
});
