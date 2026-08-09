import { describe, expect, it } from 'vitest';
import { mergeAiGroupBatches, parseAtomVideo, parseCursor, safeEqual } from './worker';

describe('cloud worker helpers', () => {
  it('parses a YouTube Atom entry', () => {
    const xml = `<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"><entry><yt:videoId>abc123</yt:videoId><yt:channelId>UC1234567890123456789012</yt:channelId><title>Video &amp; test</title><published>2026-08-09T00:00:00Z</published><author><name>Kênh thử</name></author><media:group><media:thumbnail url="https://i.ytimg.com/vi/abc123/hqdefault.jpg" /></media:group></entry></feed>`;
    expect(parseAtomVideo(xml)).toEqual({ id: 'abc123', channelId: 'UC1234567890123456789012', title: 'Video & test', channelTitle: 'Kênh thử', publishedAt: '2026-08-09T00:00:00Z', thumbnailUrl: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg' });
  });

  it('rejects malformed entries and cursor values', () => {
    expect(parseAtomVideo('<feed />')).toBeNull();
    expect(parseCursor(null)).toBe(0);
    expect(parseCursor('z')).toBe(35);
    expect(parseCursor('!')).toBe(0);
  });

  it('compares signatures without early exit', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'ab')).toBe(false);
  });

  it('merges batched AI groups, rejects unknown IDs and preserves unassigned channels', () => {
    const channels = [
      { id: 'UC1234567890123456789012', title: 'Tech', url: 'https://youtube.com/a' },
      { id: 'UC1234567890123456789013', title: 'Unknown', url: 'https://youtube.com/b' }
    ];
    expect(mergeAiGroupBatches(channels, [{ groups: [{ name: 'Công nghệ', icon: 'x', color: '#000000', channelIds: ['UC1234567890123456789012', 'UC_NOT_ALLOWED'] }] }])).toEqual([
      { name: 'Công nghệ', icon: '💻', color: '#22d3ee', channelIds: ['UC1234567890123456789012'] },
      { name: 'Khác', icon: '📁', color: '#94a3b8', channelIds: ['UC1234567890123456789013'] }
    ]);
  });
});
