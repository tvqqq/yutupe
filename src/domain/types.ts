export type ContentType = 'video' | 'short' | 'live' | 'upcoming';
export type ChannelStatus = 'active' | 'inactive' | 'unavailable' | 'unknown';
export type ThemeMode = 'system' | 'light' | 'dark';
export type ChannelEnrichmentStatus = 'idle' | 'pending' | 'loading' | 'ready' | 'error';

export interface ChannelEnrichment {
  status: ChannelEnrichmentStatus;
  priority?: boolean;
  retryCount: number;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  nextRetryAt?: string;
  error?: string;
}

export interface Group {
  id: string;
  name: string;
  icon: string;
  iconDataUrl?: string;
  color: string;
  channelIds: string[];
  notifications: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface Channel {
  id: string;
  title: string;
  url: string;
  thumbnailUrl?: string;
  subscriberCount?: number;
  lastSeenAt: string;
  lastPublishedAt?: string;
  status: ChannelStatus;
  tags: string[];
  subscriptionId?: string;
  subscribedAt?: string;
  uploadsPlaylistId?: string;
  description?: string;
  enrichment?: ChannelEnrichment;
}

export interface Video {
  id: string;
  title: string;
  url: string;
  thumbnailUrl?: string;
  channelId: string;
  channelTitle: string;
  durationSeconds?: number;
  publishedAt?: string;
  publishedLabel?: string;
  viewCount?: number;
  contentType: ContentType;
  discoveredAt: string;
}

export interface VideoState {
  watchedAt?: string;
  hiddenAt?: string;
}

export interface Settings {
  theme: ThemeMode;
  hideWatched: boolean;
  defaultGroupId: string | null;
  notificationsEnabled: boolean;
  initialDiscoveryComplete: boolean;
  googleClientId: string;
  cloudApiBaseUrl: string;
  cloudPermissionGranted?: boolean;
  cloudHealthy?: boolean;
  cloudAiConfigured?: boolean;
  cloudAiModel?: string;
  webSubRegisteredCount?: number;
  webSubActiveCount?: number;
  webSubPendingCount?: number;
  lastWebSubRegistrationAt?: string;
  lastCloudPollAt?: string;
  youtubeSyncChannelLimit: number;
  lastYoutubeSyncAt?: string;
  lastDriveSyncAt?: string;
  cloudEventCursor?: string;
  enrichmentCursor?: number;
  enrichmentTotal?: number;
  enrichmentStatus?: 'idle' | 'running' | 'complete';
  lastEnrichmentAt?: string;
  enrichmentErrorCount?: number;
  youtubeQuotaBlockedUntil?: string;
  youtubeQuotaLastErrorAt?: string;
  youtubeQuotaDate?: string;
  youtubeQuotaEstimatedUsed?: number;
  cacheSanitizerVersion?: number;
  blocklistKeywords?: string[];
  blocklistChannels?: string[];
}

export interface AuthStatus {
  connected: boolean;
  email?: string;
  expiresAt?: number;
  redirectUri?: string;
}

export interface AppState {
  schemaVersion: 1;
  groups: Group[];
  channels: Channel[];
  videos: Video[];
  videoStates: Record<string, VideoState>;
  preferenceSignals?: {
    watchLater: Video[];
    liked: Video[];
    watchLaterUpdatedAt?: string;
    likedUpdatedAt?: string;
    suggestions?: {
      query: string;
      videos: Video[];
      likedCount: number;
      watchLaterCount: number;
      generatedAt: string;
    };
  };
  settings: Settings;
  updatedAt: string;
}

export type VideoSort = 'newest' | 'oldest' | 'duration-desc' | 'duration-asc' | 'popular';

export interface FeedFilter {
  groupId: string | null;
  query: string;
  contentTypes: ContentType[];
  duration: 'any' | 'short' | 'medium' | 'long';
  watched: 'all' | 'unwatched' | 'watched';
  sort: VideoSort;
}

export interface DiscoveredPayload {
  channels: Channel[];
  videos: Video[];
  preferenceSource?: 'watch-later' | 'liked';
}

export interface CloudVideoEvent {
  id: string;
  video: Video;
}
