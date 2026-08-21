import type { AppMessage, AppResponse } from '@/src/domain/messages';
import { createInitialState, ENRICHMENT_MAX_RETRIES, isValidCachedVideo, makeId, MAX_CACHED_VIDEOS, mergeDiscoveredChannels, mergeDiscoveredVideos, normalizeImportedState, nowIso, queueChannelsForEnrichment, retainOnlyChannelIds, sanitizeVideoCache, STORAGE_KEY, upsertById, withEnrichmentSummary } from '@/src/domain/state';
import type { AppState, Channel, Group, Video } from '@/src/domain/types';
import { connectGoogle, disconnectGoogle, getAuthStatus, requireAccessToken, requireIdentityToken } from '@/src/integrations/google-auth';
import { fetchPersonalizedSuggestions, fetchRecentUploadFeed, fetchSubscriptions, fetchUploadFeed, isYouTubeQuotaExceeded, unsubscribe } from '@/src/integrations/youtube-api';
import { applyDriveSnapshot, pullFromDrive, pushToDrive } from '@/src/integrations/drive-sync';
import { checkCloudHealth, getCloudStatus, organizeChannelsWithAi, pollCloudEvents, registerWebSub, suggestAiTags, suggestUnsubscriptionsWithAi } from '@/src/integrations/cloud-api';
import { PRODUCTION_CLOUD_API_BASE_URL } from '@/src/config';

function nextYouTubeQuotaReset(now = new Date()): string {
  const dateParts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(dateParts.find((part) => part.type === type)?.value);
  const localMidnightAsUtc = Date.UTC(value('year'), value('month') - 1, value('day') + 1);
  const probe = new Date(localMidnightAsUtc + 12 * 60 * 60_000);
  const zoneName = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', timeZoneName: 'longOffset' }).formatToParts(probe).find((part) => part.type === 'timeZoneName')?.value ?? 'GMT-08:00';
  const match = zoneName.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  const offsetMinutes = match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] ?? 0)) : -480;
  return new Date(localMidnightAsUtc - offsetMinutes * 60_000).toISOString();
}

function quotaBlocked(state: AppState): boolean {
  return Date.parse(state.settings.youtubeQuotaBlockedUntil ?? '') > Date.now();
}

function pacificDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function normalizeQuotaWindow(state: AppState): AppState {
  const date = pacificDateKey();
  if (state.settings.youtubeQuotaDate === date) return state;
  return { ...state, settings: { ...state.settings, youtubeQuotaDate: date, youtubeQuotaEstimatedUsed: 0, youtubeQuotaBlockedUntil: undefined } };
}

function withQuotaUsage(state: AppState, apiRequests = 0): AppState {
  const current = normalizeQuotaWindow(state);
  return { ...current, settings: { ...current.settings, youtubeQuotaEstimatedUsed: (current.settings.youtubeQuotaEstimatedUsed ?? 0) + apiRequests } };
}

function withQuotaStatus(state: AppState, exhausted: boolean): AppState {
  const current = normalizeQuotaWindow(state);
  if (!exhausted) return current;
  return { ...current, settings: { ...current.settings, youtubeQuotaLastErrorAt: nowIso(), youtubeQuotaBlockedUntil: nextYouTubeQuotaReset() } };
}

async function readState(): Promise<AppState> {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  let state = (stored[STORAGE_KEY] as AppState | undefined) ?? createInitialState();
  if (state.settings.cacheSanitizerVersion !== 2) {
    const sanitized = sanitizeVideoCache(state);
    state = { ...sanitized, settings: { ...sanitized.settings, cacheSanitizerVersion: 2 }, updatedAt: nowIso() };
    await browser.storage.local.set({ [STORAGE_KEY]: state });
  }
  if (state.settings.enrichmentStatus === 'running' && state.channels.some((channel) => !channel.enrichment)) state = queueChannelsForEnrichment(state);
  return state.settings.cloudApiBaseUrl?.trim()
    ? state
    : { ...state, settings: { ...state.settings, cloudApiBaseUrl: PRODUCTION_CLOUD_API_BASE_URL } };
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
    try {
      await browser.notifications.create(`video-${video.id}`, {
        type: 'basic',
        iconUrl: browser.runtime.getURL('/icon.png'),
        title: video.channelTitle,
        message: video.title
      });
    } catch {
      // Notification rendering is best-effort and must not discard a completed
      // cloud event sync when a browser or OS rejects an image payload.
    }
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
      const granted = await browser.permissions.contains({ origins: [`${origin}/*`] });
      if (!granted) throw new Error('Cloud origin này không có trong manifest production. Hãy dùng URL Worker đã được cấu hình và reload extension.');
      const health = granted ? await checkCloudHealth(message.payload.baseUrl) : undefined;
      const state = await readState();
      const saved = await writeState({ ...state, settings: { ...state.settings, cloudPermissionGranted: granted, cloudHealthy: Boolean(health?.ok) } });
      return { ok: true, state: saved, data: { granted, health } };
    }

    let state = await readState();
    if (message.type === 'GET_STATE') return { ok: true, state };
    if (message.type === 'GET_AUTH_STATUS') return { ok: true, authStatus: await getAuthStatus() };

    if (message.type === 'CONNECT_GOOGLE') {
      const authStatus = await connectGoogle(state.settings.googleClientId);
      let apiChannels: Channel[];
      try { apiChannels = await fetchSubscriptions(await requireAccessToken()); }
      catch (error) {
        if (!isYouTubeQuotaExceeded(error)) throw error;
        const saved = await writeState(withQuotaStatus(state, true));
        return { ok: true, state: saved, authStatus, data: { quotaFallback: true } };
      }
      state = retainOnlySubscriptions(state, apiChannels);
      state = queueChannelsForEnrichment({ ...state, settings: { ...state.settings, lastYoutubeSyncAt: nowIso() } });
      const saved = await writeState(state);
      if (state.channels.length) await browser.alarms.create('youtube-collections-enrichment', { when: Date.now() + 1_000 });
      return { ok: true, state: saved, authStatus };
    }

    if (message.type === 'DISCONNECT_GOOGLE') {
      await disconnectGoogle();
      return { ok: true, state, authStatus: { connected: false } };
    }

    if (message.type === 'SYNC_YOUTUBE_SUBSCRIPTIONS') {
      const accessToken = await requireAccessToken();
      let apiChannels: Channel[];
      try { apiChannels = await fetchSubscriptions(accessToken); }
      catch (error) {
        if (!isYouTubeQuotaExceeded(error)) throw error;
        const saved = await writeState(withQuotaStatus(state, true));
        return { ok: true, state: saved, data: { quotaFallback: true } };
      }
      state = retainOnlySubscriptions(state, apiChannels);
      state = queueChannelsForEnrichment({ ...state, settings: { ...state.settings, lastYoutubeSyncAt: nowIso() } });
      if (state.channels.length) await browser.alarms.create('youtube-collections-enrichment', { when: Date.now() + 1_000 });
    }

    if (message.type === 'CLAIM_ENRICHMENT_BATCH' || message.type === 'ENRICH_CHANNEL_BATCH') {
      const now = Date.now();
      const abandonedBefore = now - 2 * 60_000;
      state = { ...state, channels: state.channels.map((channel) => channel.enrichment?.status === 'loading' && Date.parse(channel.enrichment.lastAttemptAt ?? '1970-01-01') <= abandonedBefore && channel.enrichment.retryCount >= ENRICHMENT_MAX_RETRIES
        ? { ...channel, enrichment: { ...channel.enrichment, status: 'error', priority: false, error: 'Background worker bị gián đoạn quá số lần retry.', nextRetryAt: undefined } }
        : channel) };
      const batch = state.channels
        .filter((channel) => channel.uploadsPlaylistId && (channel.enrichment?.status === 'pending' || (channel.enrichment?.status === 'error' && channel.enrichment.retryCount < ENRICHMENT_MAX_RETRIES && Date.parse(channel.enrichment.nextRetryAt ?? '1970-01-01') <= now) || (channel.enrichment?.status === 'loading' && channel.enrichment.retryCount < ENRICHMENT_MAX_RETRIES && Date.parse(channel.enrichment.lastAttemptAt ?? '1970-01-01') <= abandonedBefore)))
        .sort((a, b) => Number(Boolean(b.enrichment?.priority)) - Number(Boolean(a.enrichment?.priority)) || Number(!b.lastPublishedAt) - Number(!a.lastPublishedAt) || Date.parse(a.enrichment?.lastAttemptAt ?? '1970-01-01') - Date.parse(b.enrichment?.lastAttemptAt ?? '1970-01-01'))
        // RSS calls do not consume Data API quota; 50 channels also fit in one
        // batched videos.list request for optional duration/view metadata.
        .slice(0, 50);
      if (!batch.length) {
        const saved = await writeState(withEnrichmentSummary(state));
        return { ok: true, state: saved, data: { channels: [] } };
      }
      const ids = new Set(batch.map((channel) => channel.id));
      state = withEnrichmentSummary({ ...state, channels: state.channels.map((channel) => ids.has(channel.id) ? { ...channel, enrichment: { ...channel.enrichment, status: 'loading', retryCount: (channel.enrichment?.retryCount ?? 0) + 1, lastAttemptAt: nowIso(), nextRetryAt: undefined, error: undefined } } : channel) });
      const saved = await writeState(state);
      return { ok: true, state: saved, data: { channels: batch } };
    }

    if (message.type === 'APPLY_ENRICHMENT_BATCH') {
      const ids = new Set(message.payload.channelIds);
      const skipped = new Set(message.payload.skippedChannelIds);
      const latest = new Map(message.payload.videos.map((video) => [video.channelId, video.publishedAt ?? video.discoveredAt]));
      const finishedAt = nowIso();
      state = withQuotaStatus(withQuotaUsage(withEnrichmentSummary({
        ...state,
        channels: state.channels.map((channel) => !ids.has(channel.id) ? channel : skipped.has(channel.id)
          ? { ...channel, status: 'unavailable', uploadsPlaylistId: undefined, enrichment: { ...channel.enrichment, status: 'error', priority: false, retryCount: ENRICHMENT_MAX_RETRIES, error: 'Uploads playlist không còn khả dụng.', nextRetryAt: undefined } }
          : { ...channel, lastPublishedAt: latest.get(channel.id) ?? channel.lastPublishedAt, enrichment: { ...channel.enrichment, status: 'ready', priority: false, retryCount: channel.enrichment?.retryCount ?? 0, lastSuccessAt: finishedAt, error: undefined, nextRetryAt: undefined } }),
        videos: mergeDiscoveredVideos(state.videos, message.payload.videos).sort((a, b) => Date.parse(b.publishedAt ?? b.discoveredAt) - Date.parse(a.publishedAt ?? a.discoveredAt)).slice(0, MAX_CACHED_VIDEOS)
      }), message.payload.apiRequests), Boolean(message.payload.quotaExceeded));
      const saved = await writeState(state);
      return { ok: true, state: saved, data: { complete: state.settings.enrichmentStatus !== 'running' } };
    }

    if (message.type === 'FAIL_ENRICHMENT_BATCH') {
      const ids = new Set(message.payload.channelIds);
      state = withEnrichmentSummary({ ...state, channels: state.channels.map((channel) => {
        if (!ids.has(channel.id)) return channel;
        const retryCount = channel.enrichment?.retryCount ?? 1;
        return { ...channel, enrichment: { ...channel.enrichment, status: 'error', retryCount, error: message.payload.error.slice(0, 240), nextRetryAt: retryCount < ENRICHMENT_MAX_RETRIES ? new Date(Date.now() + Math.min(5 * 60_000, 30_000 * 2 ** (retryCount - 1))).toISOString() : undefined } };
      }) });
      const saved = await writeState(state);
      return { ok: true, state: saved, data: { complete: state.settings.enrichmentStatus !== 'running' } };
    }

    if (message.type === 'REFRESH_YOUTUBE_FEED') {
      const accessToken = await requireAccessToken();
      const groupIds = message.payload.groupId ? new Set(state.groups.find((group) => group.id === message.payload.groupId)?.channelIds ?? []) : null;
      const requestedChannelIds = message.payload.channelIds?.length ? new Set(message.payload.channelIds) : null;
      const channels = state.channels
        .filter((channel) => (channel.uploadsPlaylistId || Boolean(requestedChannelIds && channel.id.startsWith('UC'))) && (!groupIds || groupIds.has(channel.id)) && (!requestedChannelIds || requestedChannelIds.has(channel.id)))
        .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt));
      // A selected group is an explicit request: fetch every channel in that group.
      // The configurable limit only protects the broad "All subscriptions" refresh.
      const feedChannels = groupIds || requestedChannelIds ? channels : channels.slice(0, state.settings.youtubeSyncChannelLimit);
      const perChannel = Math.max(1, Math.min(500, message.payload.perChannel ?? 25));
      state = normalizeQuotaWindow(state);
      const projectedDeepRequests = feedChannels.length * Math.ceil(perChannel / 50) + Math.ceil(feedChannels.length * perChannel / 50);
      const budgetWouldOverflow = (state.settings.youtubeQuotaEstimatedUsed ?? 0) + projectedDeepRequests > 8_000;
      let useQuotaFreeRecentFeed = perChannel <= 25 || quotaBlocked(state) || budgetWouldOverflow;
      let feedResult: Awaited<ReturnType<typeof fetchUploadFeed>>;
      try {
        feedResult = useQuotaFreeRecentFeed
          ? await fetchRecentUploadFeed(accessToken, feedChannels, Math.min(perChannel, 15), !quotaBlocked(state) && (state.settings.youtubeQuotaEstimatedUsed ?? 0) < 8_000)
          : await fetchUploadFeed(accessToken, feedChannels, perChannel, state.videos);
      } catch (error) {
        if (!isYouTubeQuotaExceeded(error)) throw error;
        state = withQuotaStatus(state, true);
        useQuotaFreeRecentFeed = true;
        feedResult = await fetchRecentUploadFeed(accessToken, feedChannels, 15, false);
      }
      const { videos, skippedChannels, quotaExceeded, source } = feedResult;
      state = withQuotaStatus(withQuotaUsage(state, feedResult.apiRequests), Boolean(quotaExceeded));
      const skippedIds = new Set(source === 'api' ? skippedChannels.map((item) => item.channelId) : []);
      if (skippedIds.size) {
        state = { ...state, channels: state.channels.map((channel) => skippedIds.has(channel.id) ? { ...channel, status: 'unavailable', uploadsPlaylistId: undefined, enrichment: { ...channel.enrichment, status: 'error', priority: false, retryCount: ENRICHMENT_MAX_RETRIES, error: 'Uploads playlist không còn khả dụng.', nextRetryAt: undefined } } : channel) };
      }
      const latestByChannel = new Map<string, string>();
      for (const video of videos) {
        const published = video.publishedAt ?? video.discoveredAt;
        if (!latestByChannel.get(video.channelId) || Date.parse(published) > Date.parse(latestByChannel.get(video.channelId)!)) latestByChannel.set(video.channelId, published);
      }
      const refreshedIds = new Set(feedChannels.map((channel) => channel.id));
      const nonShortVideos = videos.filter((v) => v.contentType !== 'short' && (v.durationSeconds === undefined || v.durationSeconds > 60) && !v.url.includes('/shorts/'));
      const cleanExistingVideos = state.videos.filter((v) => v.contentType !== 'short' && (v.durationSeconds === undefined || v.durationSeconds > 60) && !v.url.includes('/shorts/'));
      state = { ...state, videos: mergeDiscoveredVideos(cleanExistingVideos, nonShortVideos).sort((a, b) => Date.parse(b.publishedAt ?? b.discoveredAt) - Date.parse(a.publishedAt ?? a.discoveredAt)).slice(0, MAX_CACHED_VIDEOS), settings: { ...state.settings, lastYoutubeSyncAt: nowIso() } };
      const saved = await writeState(state);
      return { ok: true, state: saved, data: { videoCount: nonShortVideos.length, skippedChannels, source, quotaFallback: useQuotaFreeRecentFeed && (quotaBlocked(state) || Boolean(quotaExceeded)) } };
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
      const saved = await writeState(state);
      return { ok: true, state: saved, data: result };
    }

    if (message.type === 'DRIVE_PULL') {
      const snapshot = await pullFromDrive(await requireAccessToken());
      state = applyDriveSnapshot(state, snapshot);
      const saved = await writeState(state);
      return { ok: true, state: saved, data: { restoredFrom: snapshot.exportedAt, syncedAt: saved.settings.lastDriveSyncAt } };
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
      const requestedQuery = message.payload.query?.trim() ?? '';
      const cached = state.preferenceSignals?.suggestions;
      const cacheFresh = cached && Date.now() - Date.parse(cached.generatedAt) < 6 * 60 * 60_000 && (!requestedQuery || requestedQuery.toLocaleLowerCase() === cached.query.toLocaleLowerCase());
      if (cacheFresh || (quotaBlocked(state) && cached)) return { ok: true, state, data: { ...cached, cached: true, quotaFallback: quotaBlocked(state) } };
      if (quotaBlocked(state)) throw new Error('YouTube API đã hết quota hôm nay và chưa có gợi ý cache. Feed subscriptions vẫn tiếp tục cập nhật bằng RSS.');
      const likedFresh = state.preferenceSignals?.likedUpdatedAt && Date.now() - Date.parse(state.preferenceSignals.likedUpdatedAt) < 24 * 60 * 60_000;
      let result: Awaited<ReturnType<typeof fetchPersonalizedSuggestions>>;
      try { result = await fetchPersonalizedSuggestions(await requireAccessToken(), state.preferenceSignals?.watchLater ?? [], requestedQuery, likedFresh ? state.preferenceSignals?.liked : undefined); }
      catch (error) {
        if (!isYouTubeQuotaExceeded(error)) throw error;
        state = await writeState(withQuotaStatus(state, true));
        if (cached) return { ok: true, state, data: { ...cached, cached: true, quotaFallback: true } };
        throw error;
      }
      const generatedAt = nowIso();
      const suggestions = { query: result.query, videos: result.videos, likedCount: result.likedCount, watchLaterCount: result.watchLaterCount, generatedAt };
      state = { ...state, preferenceSignals: { watchLater: state.preferenceSignals?.watchLater ?? [], liked: result.liked, watchLaterUpdatedAt: state.preferenceSignals?.watchLaterUpdatedAt, likedUpdatedAt: likedFresh ? state.preferenceSignals?.likedUpdatedAt : generatedAt, suggestions } };
      const saved = await writeState(state);
      return { ok: true, state: saved, data: suggestions };
    }

    if (message.type === 'AI_UNSUBSCRIBE_SUGGESTIONS') {
      const requested = new Set(message.payload.channelIds);
      const signals = state.channels.filter((channel) => requested.has(channel.id)).map((channel) => {
        const cached = state.videos.filter((video) => video.channelId === channel.id);
        const rejected = cached.filter((video) => state.videoStates[video.id]?.hiddenAt);
        return { channelId: channel.id, channelTitle: channel.title, rejectedCount: rejected.length, cachedCount: cached.length, rejectedTitles: rejected.slice(-8).map((video) => video.title) };
      }).filter((signal) => signal.rejectedCount > 0);
      const data = await suggestUnsubscriptionsWithAi(state.settings.cloudApiBaseUrl, await requireIdentityToken(), signals);
      return { ok: true, state, data };
    }

    if (message.type === 'REGISTER_WEBSUB') {
      const channelIds = state.channels.filter((channel) => channel.id.startsWith('UC')).map((channel) => channel.id);
      const result = await registerWebSub(state.settings.cloudApiBaseUrl, await requireIdentityToken(), channelIds);
      const status = await getCloudStatus(state.settings.cloudApiBaseUrl, await requireIdentityToken());
      state = { ...state, settings: { ...state.settings, cloudHealthy: status.ok, cloudAiConfigured: status.aiConfigured, cloudAiModel: status.aiModel, webSubRegisteredCount: status.subscriptions, webSubActiveCount: status.activeSubscriptions, webSubPendingCount: status.pendingSubscriptions, lastWebSubRegistrationAt: nowIso() } };
      const saved = await writeState(state);
      return { ok: true, state: saved, data: { ...result, status } };
    }

    if (message.type === 'CHECK_CLOUD_STATUS') {
      const origin = new URL(state.settings.cloudApiBaseUrl).origin;
      const permissionGranted = await browser.permissions.contains({ origins: [`${origin}/*`] });
      if (!permissionGranted) {
        state = { ...state, settings: { ...state.settings, cloudPermissionGranted: false, cloudHealthy: false } };
        const saved = await writeState(state);
        return { ok: true, state: saved, data: { permissionGranted: false } };
      }
      const health = await checkCloudHealth(state.settings.cloudApiBaseUrl);
      const status = await getCloudStatus(state.settings.cloudApiBaseUrl, await requireIdentityToken());
      state = { ...state, settings: { ...state.settings, cloudPermissionGranted: true, cloudHealthy: health.ok && status.ok, cloudAiConfigured: status.aiConfigured, cloudAiModel: status.aiModel, webSubRegisteredCount: status.subscriptions, webSubActiveCount: status.activeSubscriptions, webSubPendingCount: status.pendingSubscriptions } };
      const saved = await writeState(state);
      return { ok: true, state: saved, data: { permissionGranted: true, health, status } };
    }

    if (message.type === 'POLL_CLOUD_EVENTS') {
      const result = await pollCloudEvents(state.settings.cloudApiBaseUrl, await requireIdentityToken(), state.settings.cloudEventCursor);
      const subscribedIds = new Set(state.channels.map((channel) => channel.id));
      const acceptedEvents = result.events.filter((event) => subscribedIds.has(event.video.channelId));
      const fresh = acceptedEvents.map((event) => event.video).filter((video) => !state.videos.some((item) => item.id === video.id));
      state = {
        ...state,
        videos: mergeDiscoveredVideos(state.videos, acceptedEvents.map((event) => event.video)).slice(0, MAX_CACHED_VIDEOS),
        settings: { ...state.settings, cloudEventCursor: result.cursor ?? state.settings.cloudEventCursor, lastCloudPollAt: nowIso() }
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
      state = queueChannelsForEnrichment({ ...state, groups: upsertById(state.groups, [group]) }, group.channelIds);
      if (group.channelIds.length && state.settings.enrichmentStatus === 'running') await browser.alarms.create('youtube-collections-enrichment', { when: Date.now() + 250 });
    }

    if (message.type === 'DELETE_GROUP') {
      state = { ...state, groups: state.groups.filter((group) => group.id !== message.payload.groupId) };
    }

    if (message.type === 'REORDER_GROUP') {
      const ordered = state.groups.slice().sort((a, b) => a.position - b.position);
      const index = ordered.findIndex((group) => group.id === message.payload.groupId);
      const target = message.payload.direction === 'up' ? index - 1 : index + 1;
      if (index >= 0 && target >= 0 && target < ordered.length) [ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!];
      state = { ...state, groups: ordered.map((group, position) => ({ ...group, position, updatedAt: nowIso() })) };
    }

    if (message.type === 'REORDER_GROUPS') {
      const requested = [...new Set(message.payload.groupIds)];
      if (requested.length !== state.groups.length || requested.some((id) => !state.groups.some((group) => group.id === id))) throw new Error('Danh sách thứ tự groups không hợp lệ.');
      const byId = new Map(state.groups.map((group) => [group.id, group]));
      state = { ...state, groups: requested.map((id, position) => ({ ...byId.get(id)!, position, updatedAt: nowIso() })) };
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
      state = queueChannelsForEnrichment(state, [message.payload.channelId]);
      if (state.settings.enrichmentStatus === 'running') await browser.alarms.create('youtube-collections-enrichment', { when: Date.now() + 250 });
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
      const validVideos = message.payload.videos.filter(isValidCachedVideo);
      const validChannelIds = new Set(validVideos.map((video) => video.channelId));
      const validChannels = message.payload.channels.filter((channel) => validChannelIds.has(channel.id));
      if (message.payload.preferenceSource) {
        const current = state.preferenceSignals ?? { watchLater: [], liked: [] };
        const key = message.payload.preferenceSource === 'watch-later' ? 'watchLater' : 'liked';
        const updatedAtKey = message.payload.preferenceSource === 'watch-later' ? 'watchLaterUpdatedAt' : 'likedUpdatedAt';
        state = { ...state, preferenceSignals: { ...current, [key]: mergeDiscoveredVideos(current[key], validVideos.filter((video) => video.contentType !== 'short')).slice(-200), [updatedAtKey]: nowIso() } };
      }
      if ((await getAuthStatus()).connected) {
        const saved = await writeState(state);
        return { ok: true, state: saved };
      }
      const wasInitialized = state.settings.initialDiscoveryComplete;
      const known = new Set(state.videos.map((video) => video.id));
      const fresh = validVideos.filter((video) => !known.has(video.id));
      newVideoCount = fresh.length;
      state = {
        ...state,
        channels: mergeDiscoveredChannels(state.channels, validChannels),
        videos: mergeDiscoveredVideos(state.videos, validVideos)
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

  type QueuedMessage = { message: AppMessage; resolve: (response: AppResponse) => void };
  const priorityMessages: QueuedMessage[] = [];
  const regularMessages: QueuedMessage[] = [];
  const priorityTypes = new Set<AppMessage['type']>(['UPSERT_GROUP', 'DELETE_GROUP', 'REORDER_GROUP', 'REORDER_GROUPS', 'SET_CHANNEL_GROUPS', 'CLAIM_ENRICHMENT_BATCH', 'APPLY_ENRICHMENT_BATCH', 'FAIL_ENRICHMENT_BATCH']);
  let queueRunning = false;
  const drainQueue = async () => {
    if (queueRunning) return;
    queueRunning = true;
    try {
      let item: QueuedMessage | undefined;
      while ((item = priorityMessages.shift() ?? regularMessages.shift())) item.resolve(await handleMessage(item.message));
    } finally { queueRunning = false; }
  };
  const enqueueMessage = (message: AppMessage, priority = priorityTypes.has(message.type)) => new Promise<AppResponse>((resolve) => {
    (priority ? priorityMessages : regularMessages).push({ message, resolve });
    void drainQueue();
  });
  browser.runtime.onMessage.addListener((message) => {
    return enqueueMessage(message as AppMessage);
  });

  const scheduleNextEnrichment = async (state?: AppState) => {
    const current = state ?? await readState();
    if (current.settings.enrichmentStatus !== 'running') return;
    const nextRetry = current.channels
      .filter((channel) => channel.enrichment?.status === 'error' && channel.enrichment.retryCount < ENRICHMENT_MAX_RETRIES && channel.enrichment.nextRetryAt)
      .map((channel) => Date.parse(channel.enrichment!.nextRetryAt!))
      .filter(Number.isFinite)
      .sort((a, b) => a - b)[0];
    const hasPending = current.channels.some((channel) => channel.enrichment?.status === 'pending');
    await browser.alarms.create('youtube-collections-enrichment', { when: hasPending ? Date.now() + 5_000 : Math.max(Date.now() + 5_000, nextRetry ?? Date.now() + 30_000) });
  };

  let enrichmentRunnerActive = false;
  const runEnrichmentBatch = async () => {
    if (enrichmentRunnerActive) return;
    enrichmentRunnerActive = true;
    try {
      const claimed = await enqueueMessage({ type: 'CLAIM_ENRICHMENT_BATCH' }, true);
      const channels = ((claimed.data as { channels?: Channel[] } | undefined)?.channels ?? []);
      if (!channels.length) { await scheduleNextEnrichment(claimed.state); return; }
      try {
        const current = await readState();
        const result = await fetchRecentUploadFeed(await requireAccessToken(), channels, 1, !quotaBlocked(current) && (normalizeQuotaWindow(current).settings.youtubeQuotaEstimatedUsed ?? 0) < 8_000);
        const applied = await enqueueMessage({ type: 'APPLY_ENRICHMENT_BATCH', payload: { channelIds: channels.map((channel) => channel.id), videos: result.videos, skippedChannelIds: [], quotaExceeded: result.quotaExceeded, apiRequests: result.apiRequests } }, true);
        await scheduleNextEnrichment(applied.state);
      } catch (error) {
        if (isYouTubeQuotaExceeded(error)) {
          const current = await readState();
          const blocked = await writeState(withQuotaStatus(current, true));
          await scheduleNextEnrichment(blocked);
          return;
        }
        const failed = await enqueueMessage({ type: 'FAIL_ENRICHMENT_BATCH', payload: { channelIds: channels.map((channel) => channel.id), error: error instanceof Error ? error.message : 'Background enrichment thất bại.' } }, true);
        await scheduleNextEnrichment(failed.state);
      }
    } finally { enrichmentRunnerActive = false; }
  };

  browser.runtime.onStartup.addListener(() => { void scheduleNextEnrichment(); });

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
    if (alarm.name === 'youtube-collections-enrichment') {
      void runEnrichmentBatch();
      return;
    }
    if (alarm.name !== 'youtube-collections-cloud-events') return;
    void readState().then(async (state) => {
      if (!state.settings.cloudApiBaseUrl || !(await getAuthStatus()).connected) return;
      await handleMessage({ type: 'POLL_CLOUD_EVENTS' });
    }).catch(() => undefined);
  });
});
