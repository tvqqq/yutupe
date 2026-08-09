import type { AppMessage, AppResponse } from '@/src/domain/messages';
import { createInitialState, makeId, MAX_CACHED_VIDEOS, mergeDiscoveredChannels, mergeDiscoveredVideos, normalizeImportedState, nowIso, retainOnlyChannelIds, STORAGE_KEY, upsertById } from '@/src/domain/state';
import type { AppState, Channel, Group, Video } from '@/src/domain/types';
import { connectGoogle, disconnectGoogle, getAuthStatus, requireAccessToken, requireIdentityToken } from '@/src/integrations/google-auth';
import { fetchSubscriptions, fetchSuggestedVideos, fetchUploadFeed, unsubscribe } from '@/src/integrations/youtube-api';
import { applyDriveSnapshot, pullFromDrive, pushToDrive } from '@/src/integrations/drive-sync';
import { organizeChannelsWithAi, pollCloudEvents, registerWebSub, suggestAiTags } from '@/src/integrations/cloud-api';

async function readState(): Promise<AppState> {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  return (stored[STORAGE_KEY] as AppState | undefined) ?? createInitialState();
}

async function writeState(state: AppState): Promise<AppState> {
  const next = { ...state, updatedAt: nowIso() };
  await browser.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}

async function maybeNotify(state: AppState, videos: Video[]): Promise<void> {
  if (!state.settings.notificationsEnabled || !videos.length) return;
  const notifiedChannels = new Set(
    state.groups.filter((group) => group.notifications).flatMap((group) => group.channelIds)
  );
  const relevant = videos.filter((video) => notifiedChannels.has(video.channelId)).slice(0, 3);
  for (const video of relevant) {
    await browser.notifications.create(`video-${video.id}`, {
      type: 'basic',
      iconUrl: browser.runtime.getURL('/icon.svg'),
      title: video.channelTitle,
      message: video.title
    });
  }
}

function channelPath(url: string): string | null {
  try { return new URL(url).pathname.replace(/\/$/, '').toLocaleLowerCase(); } catch { return null; }
}

function canonicalizeChannels(state: AppState, apiChannels: Channel[]): AppState {
  const aliases = new Map<string, string>();
  const oldByPath = new Map(state.channels.map((channel) => [channelPath(channel.url), channel]).filter((entry): entry is [string, Channel] => Boolean(entry[0])));
  const enriched = apiChannels.map((channel) => {
    const path = channelPath(channel.url);
    const old = path ? oldByPath.get(path) : undefined;
    if (old && old.id !== channel.id) aliases.set(old.id, channel.id);
    const exact = state.channels.find((item) => item.id === channel.id);
    return { ...channel, tags: exact?.tags ?? old?.tags ?? channel.tags };
  });
  const aliasedIds = new Set(aliases.keys());
  const baseChannels = state.channels.filter((channel) => !aliasedIds.has(channel.id));
  return {
    ...state,
    channels: mergeDiscoveredChannels(baseChannels, enriched),
    groups: state.groups.map((group) => ({ ...group, channelIds: [...new Set(group.channelIds.map((id) => aliases.get(id) ?? id))] })),
    videos: state.videos.map((video) => ({ ...video, channelId: aliases.get(video.channelId) ?? video.channelId }))
  };
}

function retainOnlySubscriptions(state: AppState, apiChannels: Channel[]): AppState {
  const canonical = canonicalizeChannels(state, apiChannels);
  return retainOnlyChannelIds(canonical, apiChannels.map((channel) => channel.id));
}

async function hydrateLatestUploads(state: AppState, accessToken: string): Promise<AppState> {
  const { videos } = await fetchUploadFeed(accessToken, state.channels.filter((channel) => channel.uploadsPlaylistId), 1);
  const latest = new Map(videos.map((video) => [video.channelId, video.publishedAt ?? video.discoveredAt]));
  return {
    ...state,
    channels: state.channels.map((channel) => latest.has(channel.id) ? { ...channel, lastPublishedAt: latest.get(channel.id) } : channel),
    videos: mergeDiscoveredVideos(state.videos, videos).sort((a, b) => Date.parse(b.publishedAt ?? b.discoveredAt) - Date.parse(a.publishedAt ?? a.discoveredAt)).slice(0, MAX_CACHED_VIDEOS)
  };
}

function organizeChannelsLocally(channels: Channel[]): Array<{ name: string; icon: string; color: string; channelIds: string[] }> {
  const rules: Array<{ name: string; icon: string; color: string; pattern: RegExp }> = [
    { name: 'Công nghệ', icon: '💻', color: '#22d3ee', pattern: /tech|code|software|ai\b|công nghệ|lập trình|điện thoại|review/iu },
    { name: 'Tài chính', icon: '💰', color: '#facc15', pattern: /finance|stock|invest|crypto|tài chính|chứng khoán|đầu tư|bất động sản/iu },
    { name: 'Du lịch & Đời sống', icon: '✈️', color: '#4ade80', pattern: /travel|vlog|du lịch|đời sống|ẩm thực|food|camping/iu },
    { name: 'Thể thao', icon: '🏃', color: '#38bdf8', pattern: /sport|football|bóng đá|fitness|gym|running/iu },
    { name: 'Giải trí', icon: '🎬', color: '#f472b6', pattern: /music|game|show|movie|nhạc|phim|giải trí|gaming/iu },
    { name: 'Giáo dục', icon: '🎓', color: '#a78bfa', pattern: /learn|academy|education|course|học|giáo dục|kiến thức/iu },
    { name: 'Tin tức', icon: '📰', color: '#fb923c', pattern: /news|daily|times|tin tức|báo/iu }
  ];
  const groups = rules.map(({ pattern: _pattern, ...rule }) => ({ ...rule, channelIds: [] as string[] }));
  const other = { name: 'Khác', icon: '📁', color: '#94a3b8', channelIds: [] as string[] };
  for (const channel of channels) {
    const text = `${channel.title} ${channel.description ?? ''}`;
    const index = rules.findIndex((rule) => rule.pattern.test(text));
    (index >= 0 ? groups[index]! : other).channelIds.push(channel.id);
  }
  return [...groups, other].filter((group) => group.channelIds.length);
}

async function handleMessage(message: AppMessage): Promise<AppResponse> {
  try {
    if (message.type === 'OPEN_PANEL') {
      return { ok: true };
    }

    if (message.type === 'GRANT_CLOUD_PERMISSION') {
      if (!message.payload.baseUrl) throw new Error('Hãy nhập Cloud API Base URL trước.');
      const origin = new URL(message.payload.baseUrl).origin;
      if (!origin.startsWith('https://')) throw new Error('Cloud API phải dùng HTTPS.');
      const granted = await browser.permissions.request({ origins: [`${origin}/*`] });
      return { ok: true, data: { granted } };
    }

    let state = await readState();
    if (message.type === 'GET_STATE') return { ok: true, state };
    if (message.type === 'GET_AUTH_STATUS') return { ok: true, authStatus: await getAuthStatus() };

    if (message.type === 'CONNECT_GOOGLE') {
      const authStatus = await connectGoogle(state.settings.googleClientId);
      const apiChannels = await fetchSubscriptions(await requireAccessToken());
      state = retainOnlySubscriptions(state, apiChannels);
      state = await hydrateLatestUploads(state, await requireAccessToken());
      state = { ...state, settings: { ...state.settings, lastYoutubeSyncAt: nowIso() } };
      return { ok: true, state: await writeState(state), authStatus };
    }

    if (message.type === 'DISCONNECT_GOOGLE') {
      await disconnectGoogle();
      return { ok: true, state, authStatus: { connected: false } };
    }

    if (message.type === 'SYNC_YOUTUBE_SUBSCRIPTIONS') {
      const accessToken = await requireAccessToken();
      const apiChannels = await fetchSubscriptions(accessToken);
      state = retainOnlySubscriptions(state, apiChannels);
      state = await hydrateLatestUploads(state, accessToken);
      state = { ...state, settings: { ...state.settings, lastYoutubeSyncAt: nowIso() } };
    }

    if (message.type === 'REFRESH_YOUTUBE_FEED') {
      const accessToken = await requireAccessToken();
      const groupIds = message.payload.groupId ? new Set(state.groups.find((group) => group.id === message.payload.groupId)?.channelIds ?? []) : null;
      const channels = state.channels
        .filter((channel) => channel.uploadsPlaylistId && (!groupIds || groupIds.has(channel.id)))
        .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt));
      // A selected group is an explicit request: fetch every channel in that group.
      // The configurable limit only protects the broad "All subscriptions" refresh.
      const feedChannels = groupIds ? channels : channels.slice(0, state.settings.youtubeSyncChannelLimit);
      const perChannel = Math.max(1, Math.min(500, message.payload.perChannel ?? 25));
      const { videos, skippedChannels } = await fetchUploadFeed(accessToken, feedChannels, perChannel);
      const skippedIds = new Set(skippedChannels.map((item) => item.channelId));
      if (skippedIds.size) {
        state = { ...state, channels: state.channels.map((channel) => skippedIds.has(channel.id) ? { ...channel, status: 'unavailable', uploadsPlaylistId: undefined } : channel) };
      }
      const latestByChannel = new Map<string, string>();
      for (const video of videos) {
        const published = video.publishedAt ?? video.discoveredAt;
        if (!latestByChannel.get(video.channelId) || Date.parse(published) > Date.parse(latestByChannel.get(video.channelId)!)) latestByChannel.set(video.channelId, published);
      }
      state = { ...state, channels: state.channels.map((channel) => latestByChannel.has(channel.id) ? { ...channel, lastPublishedAt: latestByChannel.get(channel.id) } : channel) };
      state = { ...state, videos: mergeDiscoveredVideos(state.videos, videos).sort((a, b) => Date.parse(b.publishedAt ?? b.discoveredAt) - Date.parse(a.publishedAt ?? a.discoveredAt)).slice(0, MAX_CACHED_VIDEOS), settings: { ...state.settings, lastYoutubeSyncAt: nowIso() } };
      const saved = await writeState(state);
      return { ok: true, state: saved, data: { videoCount: videos.length, skippedChannels } };
    }

    if (message.type === 'UNSUBSCRIBE_CHANNELS') {
      const accessToken = await requireAccessToken();
      const succeeded: string[] = [];
      const failed: Array<{ channelId: string; error: string }> = [];
      for (const channelId of message.payload.channelIds) {
        const channel = state.channels.find((item) => item.id === channelId);
        if (!channel?.subscriptionId) { failed.push({ channelId, error: 'Thiếu subscription ID. Hãy sync YouTube trước.' }); continue; }
        try { await unsubscribe(accessToken, channel.subscriptionId); succeeded.push(channelId); }
        catch (error) { failed.push({ channelId, error: error instanceof Error ? error.message : 'Unknown error' }); }
      }
      const removed = new Set(succeeded);
      state = {
        ...state,
        channels: state.channels.filter((channel) => !removed.has(channel.id)),
        videos: state.videos.filter((video) => !removed.has(video.channelId)),
        groups: state.groups.map((group) => ({ ...group, channelIds: group.channelIds.filter((id) => !removed.has(id)) }))
      };
      const saved = await writeState(state);
      return { ok: true, state: saved, data: { succeeded, failed } };
    }

    if (message.type === 'DRIVE_PUSH') {
      const result = await pushToDrive(await requireAccessToken(), state);
      state = { ...state, settings: { ...state.settings, lastDriveSyncAt: result.syncedAt } };
    }

    if (message.type === 'DRIVE_PULL') {
      state = applyDriveSnapshot(state, await pullFromDrive(await requireAccessToken()));
      state = retainOnlySubscriptions(state, await fetchSubscriptions(await requireAccessToken()));
    }

    if (message.type === 'AI_TAG_CHANNEL') {
      const channel = state.channels.find((item) => item.id === message.payload.channelId);
      if (!channel) throw new Error('Không tìm thấy channel.');
      const suggestion = await suggestAiTags(state.settings.cloudApiBaseUrl, await requireIdentityToken(), channel);
      state = { ...state, channels: state.channels.map((item) => item.id === channel.id ? { ...item, tags: [...new Set([...item.tags, ...suggestion.tags])] } : item) };
      const saved = await writeState(state);
      return { ok: true, state: saved, data: suggestion };
    }

    if (message.type === 'AI_ORGANIZE_CHANNELS') {
      const result = state.settings.cloudApiBaseUrl
        ? await organizeChannelsWithAi(state.settings.cloudApiBaseUrl, await requireIdentityToken(), state.channels)
        : { groups: organizeChannelsLocally(state.channels) };
      const now = nowIso();
      for (const suggestion of result.groups) {
        const existing = state.groups.find((group) => group.name.toLocaleLowerCase() === suggestion.name.toLocaleLowerCase());
        const group: Group = { id: existing?.id ?? makeId('group'), name: suggestion.name, icon: suggestion.icon ?? existing?.icon ?? '✨', color: suggestion.color ?? existing?.color ?? '#a78bfa', channelIds: [...new Set(suggestion.channelIds.filter((id) => state.channels.some((channel) => channel.id === id)))], notifications: existing?.notifications ?? false, position: existing?.position ?? state.groups.length, createdAt: existing?.createdAt ?? now, updatedAt: now };
        state = { ...state, groups: upsertById(state.groups, [group]) };
      }
    }

    if (message.type === 'FETCH_SUGGESTIONS') {
      const watched = Object.entries(state.videoStates).filter(([, value]) => value.watchedAt).sort((a, b) => Date.parse(b[1].watchedAt!) - Date.parse(a[1].watchedAt!));
      const recentVideo = watched.length ? state.videos.find((video) => video.id === watched[0]![0]) : undefined;
      const inferred = state.groups.slice().sort((a, b) => b.channelIds.length - a.channelIds.length)[0]?.name ?? recentVideo?.channelTitle ?? 'technology';
      const query = message.payload.query?.trim() || inferred;
      return { ok: true, state, data: { query, videos: await fetchSuggestedVideos(await requireAccessToken(), query) } };
    }

    if (message.type === 'REGISTER_WEBSUB') {
      const channelIds = state.channels.filter((channel) => channel.id.startsWith('UC')).map((channel) => channel.id);
      const result = await registerWebSub(state.settings.cloudApiBaseUrl, await requireIdentityToken(), channelIds);
      return { ok: true, state, data: result };
    }

    if (message.type === 'POLL_CLOUD_EVENTS') {
      const result = await pollCloudEvents(state.settings.cloudApiBaseUrl, await requireIdentityToken(), state.settings.cloudEventCursor);
      const subscribedIds = new Set(state.channels.map((channel) => channel.id));
      const acceptedEvents = result.events.filter((event) => subscribedIds.has(event.video.channelId));
      const fresh = acceptedEvents.map((event) => event.video).filter((video) => !state.videos.some((item) => item.id === video.id));
      state = {
        ...state,
        videos: mergeDiscoveredVideos(state.videos, acceptedEvents.map((event) => event.video)).slice(0, MAX_CACHED_VIDEOS),
        settings: { ...state.settings, cloudEventCursor: result.cursor ?? state.settings.cloudEventCursor }
      };
      await maybeNotify(state, fresh);
    }

    if (message.type === 'UPSERT_GROUP') {
      const existing = message.payload.id ? state.groups.find((group) => group.id === message.payload.id) : undefined;
      const now = nowIso();
      const group: Group = {
        id: existing?.id ?? makeId('group'),
        name: message.payload.name.trim(),
        icon: message.payload.icon || '📁',
        iconDataUrl: message.payload.iconDataUrl,
        color: message.payload.color || '#38bdf8',
        channelIds: message.payload.channelIds ?? existing?.channelIds ?? [],
        notifications: message.payload.notifications ?? existing?.notifications ?? false,
        position: message.payload.position ?? existing?.position ?? state.groups.length,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      };
      if (!group.name) throw new Error('Tên group không được để trống.');
      state = { ...state, groups: upsertById(state.groups, [group]) };
    }

    if (message.type === 'DELETE_GROUP') {
      state = { ...state, groups: state.groups.filter((group) => group.id !== message.payload.groupId) };
    }

    if (message.type === 'SET_CHANNEL_GROUPS') {
      const selected = new Set(message.payload.groupIds);
      state = {
        ...state,
        groups: state.groups.map((group) => ({
          ...group,
          channelIds: selected.has(group.id)
            ? [...new Set([...group.channelIds, message.payload.channelId])]
            : group.channelIds.filter((id) => id !== message.payload.channelId),
          updatedAt: nowIso()
        }))
      };
    }

    if (message.type === 'UPDATE_CHANNEL_TAGS') {
      state = {
        ...state,
        channels: state.channels.map((channel) =>
          channel.id === message.payload.channelId
            ? { ...channel, tags: [...new Set(message.payload.tags.map((tag) => tag.trim()).filter(Boolean))] }
            : channel
        )
      };
    }

    if (message.type === 'REMOVE_CHANNEL_LOCAL') {
      state = {
        ...state,
        channels: state.channels.filter((channel) => channel.id !== message.payload.channelId),
        videos: state.videos.filter((video) => video.channelId !== message.payload.channelId),
        groups: state.groups.map((group) => ({
          ...group,
          channelIds: group.channelIds.filter((id) => id !== message.payload.channelId)
        }))
      };
    }

    let newVideoCount: number | undefined;
    if (message.type === 'DISCOVER') {
      if ((await getAuthStatus()).connected) return { ok: true, state };
      const wasInitialized = state.settings.initialDiscoveryComplete;
      const known = new Set(state.videos.map((video) => video.id));
      const fresh = message.payload.videos.filter((video) => !known.has(video.id));
      newVideoCount = fresh.length;
      state = {
        ...state,
        channels: mergeDiscoveredChannels(state.channels, message.payload.channels),
        videos: mergeDiscoveredVideos(state.videos, message.payload.videos)
          .sort((a, b) => Date.parse(b.discoveredAt) - Date.parse(a.discoveredAt))
          .slice(0, MAX_CACHED_VIDEOS),
        settings: { ...state.settings, initialDiscoveryComplete: true }
      };
      if (wasInitialized) await maybeNotify(state, fresh);
    }

    if (message.type === 'MARK_WATCHED') {
      const current = state.videoStates[message.payload.videoId] ?? {};
      state = {
        ...state,
        videoStates: {
          ...state.videoStates,
          [message.payload.videoId]: { ...current, watchedAt: message.payload.watched ? nowIso() : undefined }
        }
      };
    }

    if (message.type === 'HIDE_VIDEO') {
      const current = state.videoStates[message.payload.videoId] ?? {};
      state = {
        ...state,
        videoStates: {
          ...state.videoStates,
          [message.payload.videoId]: { ...current, hiddenAt: message.payload.hidden ? nowIso() : undefined }
        }
      };
    }

    if (message.type === 'UPDATE_SETTINGS') {
      state = { ...state, settings: { ...state.settings, ...message.payload } };
    }

    if (message.type === 'IMPORT_STATE') {
      state = normalizeImportedState(message.payload);
      if ((await getAuthStatus()).connected) state = retainOnlySubscriptions(state, await fetchSubscriptions(await requireAccessToken()));
    }
    if (message.type === 'RESET_STATE') state = createInitialState();

    const saved = await writeState(state);
    return { ok: true, state: saved, newVideoCount };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(async () => {
    const current = await browser.storage.local.get(STORAGE_KEY);
    if (!current[STORAGE_KEY]) await writeState(createInitialState());
    await browser.alarms.create('youtube-collections-cloud-events', { periodInMinutes: 5 });
  });

  let mutationQueue = Promise.resolve<AppResponse>({ ok: true });
  browser.runtime.onMessage.addListener((message) => {
    const task = mutationQueue.then(() => handleMessage(message as AppMessage));
    mutationQueue = task.catch((error) => ({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }));
    return task;
  });

  browser.action.onClicked.addListener(async (tab) => {
    if (!tab.id || !tab.url?.startsWith('https://www.youtube.com/')) return;
    await browser.tabs.sendMessage(tab.id, { type: 'TOGGLE_PANEL' } satisfies AppMessage).catch(() => undefined);
  });

  browser.notifications.onClicked.addListener(async (notificationId) => {
    if (!notificationId.startsWith('video-')) return;
    const state = await readState();
    const video = state.videos.find((item) => `video-${item.id}` === notificationId);
    if (video) await browser.tabs.create({ url: video.url });
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== 'youtube-collections-cloud-events') return;
    void readState().then(async (state) => {
      if (!state.settings.cloudApiBaseUrl || !(await getAuthStatus()).connected) return;
      await handleMessage({ type: 'POLL_CLOUD_EVENTS' });
    }).catch(() => undefined);
  });
});
