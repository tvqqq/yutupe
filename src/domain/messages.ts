import type { AppState, AuthStatus, DiscoveredPayload, Group, Settings } from './types';

export type AppMessage =
  | { type: 'GET_STATE' }
  | { type: 'UPSERT_GROUP'; payload: Partial<Group> & Pick<Group, 'name' | 'icon' | 'color'> }
  | { type: 'DELETE_GROUP'; payload: { groupId: string } }
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
  | { type: 'REFRESH_YOUTUBE_FEED'; payload: { groupId: string | null } }
  | { type: 'UNSUBSCRIBE_CHANNELS'; payload: { channelIds: string[] } }
  | { type: 'DRIVE_PUSH' }
  | { type: 'DRIVE_PULL' }
  | { type: 'AI_TAG_CHANNEL'; payload: { channelId: string } }
  | { type: 'REGISTER_WEBSUB' }
  | { type: 'POLL_CLOUD_EVENTS' }
  | { type: 'GRANT_CLOUD_PERMISSION'; payload: { baseUrl: string } }
  | { type: 'IMPORT_STATE'; payload: unknown }
  | { type: 'RESET_STATE' }
  | { type: 'OPEN_PANEL' }
  | { type: 'TOGGLE_PANEL' };

export interface AppResponse {
  ok: boolean;
  state?: AppState;
  error?: string;
  newVideoCount?: number;
  authStatus?: AuthStatus;
  data?: unknown;
}
