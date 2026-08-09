import { describe, expect, it } from 'vitest';
import { createInitialState } from '../domain/state';
import { applyDriveSnapshot, type DriveSnapshot } from './drive-sync';

describe('Drive snapshot', () => {
  it('restores user data without overwriting integration configuration or video cache', () => {
    const state = createInitialState();
    state.settings.googleClientId = 'client-id';
    state.settings.cloudApiBaseUrl = 'https://api.example.com';
    state.videos = [{ id: 'v1', title: 'Cached', url: '', channelId: 'c1', channelTitle: 'Channel', contentType: 'video', discoveredAt: '' }];
    const snapshot: DriveSnapshot = {
      schemaVersion: 1,
      exportedAt: '',
      groups: [{ id: 'g1', name: 'Tech', icon: '💻', color: '#00f', channelIds: ['c1'], notifications: true, position: 0, createdAt: '', updatedAt: '' }],
      channels: [{ id: 'c1', title: 'Channel', url: '', lastSeenAt: '', status: 'active', tags: ['Tech'] }],
      videoStates: { v1: { watchedAt: 'now' } },
      preferences: { theme: 'dark', hideWatched: true, defaultGroupId: 'g1', notificationsEnabled: true, youtubeSyncChannelLimit: 10 }
    };
    const restored = applyDriveSnapshot(state, snapshot);
    expect(restored.groups[0]?.id).toBe('g1');
    expect(restored.videoStates.v1?.watchedAt).toBe('now');
    expect(restored.videos).toHaveLength(1);
    expect(restored.settings.googleClientId).toBe('client-id');
    expect(restored.settings.cloudApiBaseUrl).toBe('https://api.example.com');
  });
});
