import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Channel } from '@/src/domain/types';
import { fetchUploadFeed } from './youtube-api';

const channel = (id: string, uploadsPlaylistId: string): Channel => ({
  id, uploadsPlaylistId, title: id, url: `https://youtube.com/channel/${id}`,
  lastSeenAt: new Date(0).toISOString(), status: 'active', tags: []
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
});
