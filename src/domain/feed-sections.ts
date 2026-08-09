import type { Video } from './types';

export interface FeedSection { id: string; title: string; detail: string; videos: Video[] }

export function groupFeedSections(videos: Video[], now = Date.now()): FeedSection[] {
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const day = 86_400_000;
  const buckets: FeedSection[] = [
    { id: 'today', title: 'Mới hôm nay', detail: 'Video mới nhất từ subscriptions', videos: [] },
    { id: 'week', title: '7 ngày gần đây', detail: 'Danh sách để xem tiếp', videos: [] },
    { id: 'month', title: '30 ngày gần đây', detail: 'Video chưa xem trong tháng', videos: [] },
    { id: 'two-months', title: '60 ngày gần đây', detail: 'Video chưa xem trong hai tháng', videos: [] },
    { id: 'year', title: 'Trong 1 năm gần đây', detail: 'Kho lưu trữ chưa xem', videos: [] }
  ];
  for (const video of videos) {
    const timestamp = Date.parse(video.publishedAt ?? video.discoveredAt);
    const age = startOfToday.getTime() - timestamp;
    if (age <= 0) buckets[0]!.videos.push(video);
    else if (age <= 7 * day) buckets[1]!.videos.push(video);
    else if (age <= 30 * day) buckets[2]!.videos.push(video);
    else if (age <= 60 * day) buckets[3]!.videos.push(video);
    else if (age <= 365 * day) buckets[4]!.videos.push(video);
  }
  return buckets.filter((section) => section.videos.length);
}
