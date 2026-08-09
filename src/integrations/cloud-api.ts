import type { Channel, CloudVideoEvent } from '@/src/domain/types';

const CLOUD_SESSION_KEY = 'youtube-collections-cloud-session-v1';

interface CloudSession { baseUrl: string; token: string; expiresAt: number }

function apiUrl(baseUrl: string, path: string): string {
  if (!baseUrl.trim()) throw new Error('Hãy cấu hình Cloud API Base URL trước.');
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

async function request<T>(baseUrl: string, path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const bearer = await getCloudBearer(baseUrl, accessToken);
  const response = await fetch(apiUrl(baseUrl, path), {
    ...init,
    headers: {
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  });
  if (!response.ok) throw new Error(`Cloud API ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return response.json() as Promise<T>;
}

async function getCloudBearer(baseUrl: string, googleToken: string): Promise<string> {
  if (googleToken.split('.').length === 3) return googleToken;
  const stored = await browser.storage.session.get(CLOUD_SESSION_KEY);
  const session = stored[CLOUD_SESSION_KEY] as CloudSession | undefined;
  if (session?.baseUrl === baseUrl && session.expiresAt > Date.now() + 30_000) return session.token;
  const response = await fetch(apiUrl(baseUrl, '/v1/auth/google'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken: googleToken })
  });
  if (!response.ok) throw new Error(`Cloud auth ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const result = await response.json() as { token: string; expiresIn?: number };
  const next: CloudSession = { baseUrl, token: result.token, expiresAt: Date.now() + (result.expiresIn ?? 3600) * 1_000 };
  await browser.storage.session.set({ [CLOUD_SESSION_KEY]: next });
  return next.token;
}

export async function suggestAiTags(baseUrl: string, accessToken: string, channel: Channel): Promise<{ tags: string[]; suggestedGroup?: string; confidence?: number }> {
  return request(baseUrl, '/v1/ai/tags', accessToken, {
    method: 'POST',
    body: JSON.stringify({ channel: { id: channel.id, title: channel.title, description: channel.description, url: channel.url } })
  });
}

export async function registerWebSub(baseUrl: string, accessToken: string, channelIds: string[]): Promise<{ registered: number }> {
  return request(baseUrl, '/v1/websub/subscriptions', accessToken, {
    method: 'POST', body: JSON.stringify({ channelIds })
  });
}

export async function pollCloudEvents(baseUrl: string, accessToken: string, cursor?: string): Promise<{ events: CloudVideoEvent[]; cursor?: string }> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  return request(baseUrl, `/v1/events${params.size ? `?${params}` : ''}`, accessToken);
}
