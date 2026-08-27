import { describe, expect, it } from 'vitest';
import { createInitialState } from './state';
import { recommendVideos } from './recommendations';
import type { AppState, Video } from './types';

const NOW = Date.parse('2026-08-09T12:00:00Z');
const video = (id: string, channelId: string, title: string, publishedAt: string, viewCount: number): Video => ({
  id, channelId, title, channelTitle: channelId, publishedAt, viewCount,
  url: `https://youtube.com/watch?v=${id}`, contentType: 'video', discoveredAt: publishedAt
});

describe('recommendVideos', () => {
  it('only recommends candidates from the last 30 days', () => {
    const state = createInitialState();
    const recent = video('recent', 'c1', 'React news', '2026-08-09T10:00:00Z', 10_000);
    const old = video('old', 'c1', 'React archive', '2026-06-01T10:00:00Z', 9_000_000);
    state.videos = [recent, old];
    expect(recommendVideos(state, state.videos, NOW).map((item) => item.video.id)).toEqual(['recent']);
  });

  it('does not treat discovery time as publication time', () => {
    const state = createInitialState();
    const unknownAge = { ...video('unknown', 'c1', 'Old rediscovered upload', '2026-08-09T10:00:00Z', 1_000_000), publishedAt: undefined };
    state.videos = [unknownAge];
    expect(recommendVideos(state, state.videos, NOW)).toEqual([]);
  });

  it('uses watch and not-interested history to personalize ranking', () => {
    const watched = video('watched', 'tech', 'React TypeScript tutorial', '2026-08-08T10:00:00Z', 100);
    const rejected = video('rejected', 'games', 'Gaming highlights', '2026-08-08T10:00:00Z', 100);
    const tech = video('tech-next', 'tech', 'Advanced React TypeScript', '2026-08-09T08:00:00Z', 1_000);
    const games = video('games-next', 'games', 'Gaming tournament', '2026-08-09T08:00:00Z', 1_000);
    const state: AppState = { ...createInitialState(), videos: [watched, rejected, tech, games], videoStates: { watched: { watchedAt: '2026-08-08T12:00:00Z' }, rejected: { hiddenAt: '2026-08-08T12:00:00Z' } } };
    const result = recommendVideos(state, [tech, games], NOW);
    expect(result[0]?.video.id).toBe('tech-next');
    expect(result[0]?.reasons).toContain('Hợp sở thích');
  });

  it('ranks fast-growing videos for cold start', () => {
    const hot = video('hot', 'c1', 'Hot', '2026-08-09T11:00:00Z', 50_000);
    const slow = video('slow', 'c2', 'Slow', '2026-08-02T12:00:00Z', 60_000);
    const state = { ...createInitialState(), videos: [hot, slow] };
    expect(recommendVideos(state, state.videos, NOW)[0]?.video.id).toBe('hot');
  });
});
