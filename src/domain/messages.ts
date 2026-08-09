import type { AppState, AuthStatus, DiscoveredPayload, Group, Settings, Video } from './types';

export type AppMessage =
  | { type: 'GET_STATE' }
  | { type: 'UPSERT_GROUP'; payload: Partial<Group> & Pick<Group, 'name' | 'icon' | 'color'> }
  | { type: 'DELETE_GROUP'; payload: { groupId: string } }
  | { type: 'REORDER_GROUP'; payload: { groupId: string; direction: 'up' | 'down' } }
  | { type: 'REORDER_GROUPS'; payload: { groupIds: string[] } }
  | { type: 'SET_CHANNEL_GROUPS'; payload: { channelId: string; groupIds: string[] } }
  | { type: 'UPDATE_CHANNEL_TAGS'; payload: { channelId: string; tags: string[] } }
  | { type: 'REMOVE_CHANNEL_LOCAL'; payload: { channelId: string } }
  | { type: 'DISCOVER'; payload: DiscoveredPayload }
  | { type: 'MARK_WATCHED'; payload: { videoId: string; watched: boolean } }
  | { type: 'HIDE_VIDEO'; payload: { videoId: string; hidden: boolean } }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<Settings> }
  | { type: 'GET_AUTH_STATUS' }
  | { type: 'CONNECT_GOOGLE' }
  | { type: 'DISCONNECT_GOOGLE' }
  | { type: 'SYNC_YOUTUBE_SUBSCRIPTIONS' }
  | { type: 'REFRESH_YOUTUBE_FEED'; payload: { groupId: string | null; perChannel?: number } }
  | { type: 'UNSUBSCRIBE_CHANNELS'; payload: { channelIds: string[] } }
  | { type: 'DRIVE_PUSH' }
  | { type: 'DRIVE_PULL' }
  | { type: 'AI_TAG_CHANNEL'; payload: { channelId: string } }
  | { type: 'AI_ORGANIZE_CHANNELS' }
  | { type: 'FETCH_SUGGESTIONS'; payload: { query?: string } }
  | { type: 'AI_UNSUBSCRIBE_SUGGESTIONS'; payload: { channelIds: string[] } }
  | { type: 'REGISTER_WEBSUB' }
  | { type: 'POLL_CLOUD_EVENTS' }
  | { type: 'CHECK_CLOUD_STATUS' }
  | { type: 'GRANT_CLOUD_PERMISSION'; payload: { baseUrl: string } }
  | { type: 'IMPORT_STATE'; payload: unknown }
  | { type: 'RESET_STATE' }
  | { type: 'OPEN_PANEL' }
  | { type: 'TOGGLE_PANEL' }
  | { type: 'ENRICH_CHANNEL_BATCH' }
  | { type: 'CLAIM_ENRICHMENT_BATCH' }
  | { type: 'APPLY_ENRICHMENT_BATCH'; payload: { channelIds: string[]; videos: Video[]; skippedChannelIds: string[]; quotaExceeded?: boolean; apiRequests?: number } }
  | { type: 'FAIL_ENRICHMENT_BATCH'; payload: { channelIds: string[]; error: string } };

export interface AppResponse {
  ok: boolean;
  state?: AppState;
  error?: string;
  newVideoCount?: number;
  authStatus?: AuthStatus;
  data?: unknown;
}
