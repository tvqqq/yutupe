import type { Channel, CloudVideoEvent } from '@/src/domain/types';

function apiUrl(baseUrl: string, path: string): string {
  if (!baseUrl.trim()) throw new Error('Hãy cấu hình Cloud API Base URL trước.');
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

async function request<T>(baseUrl: string, path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(baseUrl, path), {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  });
  if (!response.ok) throw new Error(`Cloud API ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return response.json() as Promise<T>;
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
