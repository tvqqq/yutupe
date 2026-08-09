import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Channel, Video } from '@/src/domain/types';
import { buildPreferenceQuery, fetchRecentUploadFeed, fetchUploadFeed } from './youtube-api';

const channel = (id: string, uploadsPlaylistId: string): Channel => ({
  id, uploadsPlaylistId, title: id, url: `https://youtube.com/channel/${id}`,
  lastSeenAt: new Date(0).toISOString(), status: 'active', tags: []
});

describe('buildPreferenceQuery', () => {
  const video = (id: string, title: string, channelTitle: string): Video => ({
    id, title, channelTitle, channelId: `channel-${id}`, url: `https://youtube.com/watch?v=${id}`,
    publishedAt: '2026-01-01T00:00:00Z', discoveredAt: '2026-01-01T00:00:00Z', contentType: 'video'
  });

  it('prioritizes repeated Likes and Watch Later topics while removing generic words', () => {
    const query = buildPreferenceQuery(
      [video('1', 'TypeScript architecture tutorial', 'Frontend Lab'), video('2', 'Advanced TypeScript patterns', 'Code Lab')],
      [video('3', 'TypeScript performance', 'Engineering')]
    );

    expect(query.split(' ')[0]).toBe('typescript');
    expect(query).not.toContain('video');
  });
});

describe('fetchUploadFeed', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('skips a missing uploads playlist and continues with healthy channels', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{"error":"missing"}', { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ contentDetails: { videoId: 'video-1' }, snippet: { title: 'Video', channelTitle: 'Good', publishedAt: '2026-01-01T00:00:00Z' } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: 'video-1', contentDetails: { duration: 'PT2M' }, statistics: { viewCount: '42' }, snippet: { liveBroadcastContent: 'none' } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchUploadFeed('token', [channel('bad', 'UU-bad'), channel('good', 'UU-good')]);

    expect(result.videos).toHaveLength(1);
    expect(result.skippedChannels).toMatchObject([{ channelId: 'bad', playlistId: 'UU-bad' }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not classify an ended live stream as currently live', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ contentDetails: { videoId: 'ended-live' }, snippet: { title: 'Ended stream', channelTitle: 'Channel', publishedAt: '2026-01-01T00:00:00Z' } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: 'ended-live', contentDetails: { duration: 'PT1H' }, snippet: { liveBroadcastContent: 'none' }, liveStreamingDetails: { actualEndTime: '2026-01-01T01:00:00Z' } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchUploadFeed('token', [channel('channel', 'UU-channel')]);

    expect(result.videos[0]?.contentType).toBe('video');
  });
});

describe('fetchRecentUploadFeed', () => {
  afterEach(() => vi.unstubAllGlobals());
  const rss = `<?xml version="1.0"?><feed><entry><yt:videoId>rss-video</yt:videoId><title>Latest &amp; greatest</title><published>2026-08-09T00:00:00Z</published><media:thumbnail url="https://i.ytimg.com/vi/rss-video/hqdefault.jpg" /></entry></feed>`;

  it('uses quota-free channel RSS and batches video details', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(rss, { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: 'rss-video', contentDetails: { duration: 'PT12M' }, statistics: { viewCount: '99' }, snippet: { liveBroadcastContent: 'none' } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchRecentUploadFeed('token', [channel('UC-rss', 'UU-rss')], 1);

    expect(result.source).toBe('rss');
    expect(result.videos[0]).toMatchObject({ id: 'rss-video', title: 'Latest & greatest', durationSeconds: 720, viewCount: 99 });
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/feeds/videos.xml?channel_id=UC-rss');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps RSS videos usable when the Data API quota is exhausted', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(rss, { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 403, message: 'exceeded your quota', errors: [{ reason: 'quotaExceeded' }] } }), { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchRecentUploadFeed('token', [channel('UC-rss', 'UU-rss')], 1);

    expect(result.quotaExceeded).toBe(true);
    expect(result.videos).toMatchObject([{ id: 'rss-video', contentType: 'video' }]);
  });
});
