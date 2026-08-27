import type { AppState, Video } from './types';

export interface VideoRecommendation {
  video: Video;
  score: number;
  reasons: string[];
}

const DAY = 86_400_000;
const STOP_WORDS = new Set(['video', 'official', 'youtube', 'channel', 'mới', 'nhất', 'và', 'của', 'cho', 'với', 'the', 'and', 'from', 'this', 'that', 'trên', 'một', 'các']);

function tokens(value: string): string[] {
  return value.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[\p{L}\p{N}]{3,}/gu)?.filter((token) => !STOP_WORDS.has(token)) ?? [];
}

function minMax(value: number, min: number, max: number): number {
  return max <= min ? (value > 0 ? 1 : 0) : (value - min) / (max - min);
}

/**
 * Explainable, local recommendation ranker. It deliberately only ranks videos
 * from the last 30 days and learns from watched/hidden actions already stored by
 * the extension. Popularity uses log views; momentum uses views per hour.
 */
export function recommendVideos(state: AppState, videos: Video[], now = Date.now()): VideoRecommendation[] {
  const channelAffinity = new Map<string, number>();
  const interests = new Map<string, number>();
  const channelMap = new Map(state.channels.map((channel) => [channel.id, channel]));

  for (const video of state.videos) {
    const videoState = state.videoStates[video.id];
    const signal = videoState?.watchedAt ? 1 : videoState?.hiddenAt ? -2 : 0;
    if (!signal) continue;
    channelAffinity.set(video.channelId, (channelAffinity.get(video.channelId) ?? 0) + signal);
    const channel = channelMap.get(video.channelId);
    for (const token of tokens(`${video.title} ${video.channelTitle} ${(channel?.tags ?? []).join(' ')}`)) {
      interests.set(token, (interests.get(token) ?? 0) + signal);
    }
  }

  const candidates = videos.filter((video) => {
    const published = Date.parse(video.publishedAt ?? '');
    const age = now - published;
    return Number.isFinite(published) && age >= -DAY && age <= 30 * DAY && !state.videoStates[video.id]?.hiddenAt;
  });
  if (!candidates.length) return [];

  const metrics = candidates.map((video) => {
    const ageHours = Math.max(1, (now - Date.parse(video.publishedAt!)) / 3_600_000);
    const views = Math.max(0, video.viewCount ?? 0);
    return { video, popularity: Math.log10(views + 1), velocity: Math.log10(views / ageHours + 1), ageHours };
  });
  const popularities = metrics.map((item) => item.popularity);
  const velocities = metrics.map((item) => item.velocity);
  const minPopularity = Math.min(...popularities); const maxPopularity = Math.max(...popularities);
  const minVelocity = Math.min(...velocities); const maxVelocity = Math.max(...velocities);
  const hasHistory = [...channelAffinity.values()].some((value) => value > 0) || [...interests.values()].some((value) => value > 0);

  const ranked = metrics.map(({ video, popularity, velocity, ageHours }) => {
    const affinity = Math.max(-1, Math.min(1, (channelAffinity.get(video.channelId) ?? 0) / 3));
    const channel = channelMap.get(video.channelId);
    const videoTokens = new Set(tokens(`${video.title} ${video.channelTitle} ${(channel?.tags ?? []).join(' ')}`));
    const positiveMatches = [...videoTokens].reduce((sum, token) => sum + Math.max(0, interests.get(token) ?? 0), 0);
    const negativeMatches = [...videoTokens].reduce((sum, token) => sum + Math.max(0, -(interests.get(token) ?? 0)), 0);
    const interest = Math.max(-1, Math.min(1, (positiveMatches - negativeMatches * 1.5) / 5));
    const hot = minMax(velocity, minVelocity, maxVelocity);
    const popular = minMax(popularity, minPopularity, maxPopularity);
    const freshness = Math.max(0, 1 - ageHours / (30 * 24));
    const personalization = hasHistory ? interest * .30 + affinity * .25 : 0;
    const score = personalization + hot * .25 + popular * .10 + freshness * .10;
    const reasons: string[] = [];
    if (interest > .15) reasons.push('Hợp sở thích');
    if (affinity > .15) reasons.push('Channel bạn thường xem');
    if (hot >= .7 && (video.viewCount ?? 0) > 0) reasons.push('Views tăng nhanh');
    else if (popular >= .75 && (video.viewCount ?? 0) > 0) reasons.push('Đang được quan tâm');
    if (ageHours <= 24) reasons.push('Mới hôm nay');
    return { video, score, reasons: reasons.slice(0, 2) };
  }).sort((a, b) => b.score - a.score);

  // Keep a selective recommendation shelf while guaranteeing useful cold-start results.
  const limit = Math.min(60, Math.max(6, Math.ceil(ranked.length * .2)));
  const threshold = hasHistory ? .32 : .28;
  const selected = ranked.filter((item) => item.score >= threshold).slice(0, limit);
  return (selected.length >= Math.min(3, ranked.length) ? selected : ranked.slice(0, Math.min(limit, Math.max(3, ranked.length))))
    .map((item) => ({ ...item, reasons: item.reasons.length ? item.reasons : ['Phù hợp để xem tiếp'] }));
}
