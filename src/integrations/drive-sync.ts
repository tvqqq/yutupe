import type { AppState, Channel, Group, Settings, VideoState } from '../domain/types';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FILE_NAME = 'youtube-collections-sync-v1.json';

export interface DriveSnapshot {
  schemaVersion: 1;
  exportedAt: string;
  groups: Group[];
  channels: Channel[];
  videoStates: Record<string, VideoState>;
  preferences: Pick<Settings, 'theme' | 'hideWatched' | 'defaultGroupId' | 'notificationsEnabled' | 'youtubeSyncChannelLimit'>;
}

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

async function findFile(accessToken: string): Promise<{ id: string; modifiedTime?: string } | null> {
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    q: `name = '${FILE_NAME}' and trashed = false`,
    fields: 'files(id,modifiedTime)',
    orderBy: 'modifiedTime desc',
    pageSize: '1'
  });
  const response = await fetch(`${DRIVE_API}/files?${params}`, { headers: authHeaders(accessToken) });
  if (!response.ok) throw await driveError(response, 'Tìm backup');
  const result = await response.json() as { files?: Array<{ id: string; modifiedTime?: string }> };
  return result.files?.[0] ?? null;
}

async function driveError(response: Response, action: string): Promise<Error> {
  let detail = '';
  try {
    const body = await response.json() as { error?: { message?: string } };
    detail = body.error?.message?.trim() ?? '';
  } catch { detail = (await response.text().catch(() => '')).trim(); }
  const scopeHint = response.status === 401 || response.status === 403
    ? ' Hãy ngắt kết nối rồi kết nối lại Google để cấp quyền Drive.'
    : '';
  return new Error(`${action} trên Google Drive thất bại (${response.status})${detail ? `: ${detail}` : '.'}${scopeHint}`);
}

function snapshotFromState(state: AppState): DriveSnapshot {
  const { theme, hideWatched, defaultGroupId, notificationsEnabled, youtubeSyncChannelLimit } = state.settings;
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    groups: state.groups,
    channels: state.channels,
    videoStates: state.videoStates,
    preferences: { theme, hideWatched, defaultGroupId, notificationsEnabled, youtubeSyncChannelLimit }
  };
}

export async function pushToDrive(accessToken: string, state: AppState): Promise<{ fileId: string; syncedAt: string }> {
  let file = await findFile(accessToken);
  if (!file) {
    const createResponse = await fetch(`${DRIVE_API}/files?fields=id`, {
      method: 'POST',
      headers: { ...authHeaders(accessToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' })
    });
    if (!createResponse.ok) throw await driveError(createResponse, 'Tạo backup');
    file = await createResponse.json() as { id: string };
  }
  const uploadResponse = await fetch(`${UPLOAD_API}/files/${encodeURIComponent(file.id)}?uploadType=media`, {
    method: 'PATCH',
    headers: { ...authHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify(snapshotFromState(state))
  });
  if (!uploadResponse.ok) throw await driveError(uploadResponse, 'Upload backup');
  return { fileId: file.id, syncedAt: new Date().toISOString() };
}

export async function pullFromDrive(accessToken: string): Promise<DriveSnapshot> {
  const file = await findFile(accessToken);
  if (!file) throw new Error('Chưa có backup YouTube Collections trên Google Drive.');
  const response = await fetch(`${DRIVE_API}/files/${encodeURIComponent(file.id)}?alt=media`, { headers: authHeaders(accessToken) });
  if (!response.ok) throw await driveError(response, 'Tải backup');
  const snapshot = await response.json() as DriveSnapshot;
  if (snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.groups) || !Array.isArray(snapshot.channels)) throw new Error('Drive snapshot không hợp lệ.');
  return snapshot;
}

export function applyDriveSnapshot(state: AppState, snapshot: DriveSnapshot): AppState {
  return {
    ...state,
    groups: snapshot.groups,
    channels: snapshot.channels,
    videoStates: snapshot.videoStates ?? {},
    settings: { ...state.settings, ...snapshot.preferences, lastDriveSyncAt: new Date().toISOString() }
  };
}
