import type { Channel, Video } from './types';

export interface DeadChannelResult {
  channel: Channel;
  reason: string;
  daysInactive?: number;
  latestVideoTitle?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Detects inactive or unavailable channels from the user's subscription list.
 * Channels are categorized by:
 * - Unavailable: Uploads playlist deleted or channel closed.
 * - Inactive: No new video published in >180 days (6 months) or >365 days (1 year).
 * - Empty: No videos retrieved despite being subscribed.
 */
export function detectDeadChannels(channels: Channel[], videos: Video[], now = Date.now()): DeadChannelResult[] {
  const latestByChannel = new Map<string, Video>();
  for (const video of videos) {
    const existing = latestByChannel.get(video.channelId);
    const videoDate = Date.parse(video.publishedAt ?? video.discoveredAt);
    if (!existing || videoDate > Date.parse(existing.publishedAt ?? existing.discoveredAt)) {
      latestByChannel.set(video.channelId, video);
    }
  }

  const results: DeadChannelResult[] = [];

  for (const channel of channels) {
    if (channel.status === 'unavailable') {
      results.push({
        channel,
        reason: 'Channel hoặc playlist không còn khả dụng trên YouTube'
      });
      continue;
    }

    const latestVideo = latestByChannel.get(channel.id);
    const lastPublishedStr = channel.lastPublishedAt ?? latestVideo?.publishedAt ?? latestVideo?.discoveredAt;

    if (lastPublishedStr) {
      const publishedTime = Date.parse(lastPublishedStr);
      if (Number.isFinite(publishedTime)) {
        const daysInactive = Math.floor((now - publishedTime) / DAY_MS);
        if (daysInactive >= 180) {
          results.push({
            channel,
            reason: daysInactive >= 365 ? `Không ra video mới trong hơn ${Math.floor(daysInactive / 30)} tháng (${Math.floor(daysInactive / 365)} năm)` : `Không ra video mới trong ${Math.floor(daysInactive / 30)} tháng`,
            daysInactive,
            latestVideoTitle: latestVideo?.title
          });
          continue;
        }
      }
    }
  }

  return results.sort((a, b) => (b.daysInactive ?? 9999) - (a.daysInactive ?? 9999));
}
