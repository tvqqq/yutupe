import type { Video } from './types';

export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
}

export function videoThumbnailUrl(video: Pick<Video, 'id' | 'thumbnailUrl'>): string {
  return video.thumbnailUrl?.trim() || youtubeThumbnailUrl(video.id);
}
