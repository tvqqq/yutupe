interface D1Result<T = unknown> { results?: T[]; success: boolean; error?: string; meta?: Record<string, unknown> }
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}
interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<Array<D1Result<T>>>;
}
interface WorkerExecutionContext { waitUntil(promise: Promise<unknown>): void }
interface ScheduledEvent { scheduledTime: number; cron: string }
interface WorkersAiBinding { run(model: string, input: Record<string, unknown>): Promise<unknown> }

export interface Env {
  DB: D1Database;
  AI?: WorkersAiBinding;
  GOOGLE_CLIENT_IDS: string;
  SESSION_SECRET: string;
  PUBLIC_BASE_URL: string;
  EXTENSION_ORIGINS: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  WORKERS_AI_MODEL?: string;
  WEBSUB_SECRET: string;
  WEBSUB_HUB_URL?: string;
}

interface Identity { sub: string; email?: string; exp: number }
interface ChannelInput { id: string; title: string; description?: string; url: string }
interface AiGroup { name: string; icon: string; color: string; channelIds: string[] }

const CHANNEL_ID = /^UC[A-Za-z0-9_-]{20,30}$/;
const HUB_DEFAULT = 'https://pubsubhubbub.appspot.com/subscribe';
const encoder = new TextEncoder();
const AI_GROUP_TAXONOMY = [
  { name: 'Công nghệ', icon: '💻', color: '#22d3ee' },
  { name: 'Tài chính & Đầu tư', icon: '💰', color: '#facc15' },
  { name: 'Kinh doanh', icon: '📈', color: '#fb923c' },
  { name: 'Tin tức', icon: '📰', color: '#f97316' },
  { name: 'Thể thao', icon: '🏃', color: '#38bdf8' },
  { name: 'Giải trí', icon: '🎬', color: '#f472b6' },
  { name: 'Âm nhạc', icon: '🎵', color: '#c084fc' },
  { name: 'Giáo dục', icon: '🎓', color: '#a78bfa' },
  { name: 'Du lịch & Đời sống', icon: '✈️', color: '#4ade80' },
  { name: 'Ẩm thực', icon: '🍳', color: '#fb7185' },
  { name: 'Sức khỏe', icon: '❤️', color: '#ef4444' },
  { name: 'Khác', icon: '📁', color: '#94a3b8' }
] as const;

function json(value: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
}

function errorResponse(message: string, status = 400, headers?: HeadersInit): Response {
  return json({ error: message }, status, headers);
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmac(secret: string, value: string, algorithm: 'SHA-256' | 'SHA-1' = 'SHA-256'): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: algorithm }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

export function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

async function issueSession(identity: Identity, env: Env): Promise<{ token: string; expiresIn: number }> {
  const expiresIn = 3600;
  const payload = base64Url(encoder.encode(JSON.stringify({ sub: identity.sub, email: identity.email, exp: Math.floor(Date.now() / 1000) + expiresIn })));
  const signature = base64Url(await hmac(env.SESSION_SECRET, `ytc1.${payload}`));
  return { token: `ytc1.${payload}.${signature}`, expiresIn };
}

async function verifySession(token: string, env: Env): Promise<Identity | null> {
  const [prefix, payload, signature] = token.split('.');
  if (prefix !== 'ytc1' || !payload || !signature) return null;
  const expected = base64Url(await hmac(env.SESSION_SECRET, `${prefix}.${payload}`));
  if (!safeEqual(signature, expected)) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload))) as Identity;
    if (!parsed.sub || parsed.exp <= Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch { return null; }
}

async function verifyGoogleToken(token: string, env: Env, kind: 'access_token' | 'id_token'): Promise<Identity | null> {
  const url = new URL('https://oauth2.googleapis.com/tokeninfo');
  url.searchParams.set(kind, token);
  const response = await fetch(url);
  if (!response.ok) return null;
  const value = await response.json() as { aud?: string; audience?: string; sub?: string; user_id?: string; email?: string; exp?: string; expires_in?: string };
  const audience = value.aud ?? value.audience;
  const allowed = env.GOOGLE_CLIENT_IDS.split(',').map((item) => item.trim()).filter(Boolean);
  if (!audience || !allowed.includes(audience)) return null;
  const sub = value.sub ?? value.user_id;
  if (!sub) return null;
  const exp = value.exp ? Number(value.exp) : Math.floor(Date.now() / 1000) + Number(value.expires_in ?? 300);
  if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return null;
  return { sub, email: value.email, exp };
}

async function authenticate(request: Request, env: Env): Promise<Identity | null> {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  const session = await verifySession(token, env);
  if (session) return session;
  if (token.split('.').length === 3) return verifyGoogleToken(token, env, 'id_token');
  return null;
}

export function isAllowedOrigin(origin: string | null, configuredOrigins: string): boolean {
  if (!origin) return true;
  const allowed = configuredOrigins.split(',').map((item) => item.trim()).filter(Boolean);
  return allowed.some((pattern) => {
    if (pattern === '*' || pattern === origin) return true;
    if (pattern.endsWith('*') && origin.startsWith(pattern.slice(0, -1))) return true;
    return false;
  });
}

function corsHeaders(request: Request, env: Env): HeadersInit | null {
  const origin = request.headers.get('origin');
  if (!origin) return {};
  if (!isAllowedOrigin(origin, env.EXTENSION_ORIGINS)) return null;
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-max-age': '86400',
    vary: 'Origin'
  };
}

async function readJson<T>(request: Request, maxBytes = 1_000_000): Promise<T> {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > maxBytes) throw new Error('Request body quá lớn.');
  const text = await request.text();
  if (text.length > maxBytes) throw new Error('Request body quá lớn.');
  return JSON.parse(text) as T;
}

async function saveUser(identity: Identity, env: Env): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO users(id,email,created_at,last_seen_at) VALUES(?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET email=excluded.email,last_seen_at=excluded.last_seen_at`).bind(identity.sub, identity.email ?? null, now, now).run();
}

async function rateLimit(identity: Identity, env: Env, bucket: string, limit: number): Promise<boolean> {
  const window = Math.floor(Date.now() / 60_000);
  const key = `${identity.sub}:${bucket}:${window}`;
  await env.DB.prepare(`INSERT INTO rate_limits(id,count,expires_at) VALUES(?,1,?)
    ON CONFLICT(id) DO UPDATE SET count=count+1`).bind(key, Date.now() + 120_000).run();
  const row = await env.DB.prepare('SELECT count FROM rate_limits WHERE id=?').bind(key).first<{ count: number }>();
  return (row?.count ?? limit + 1) <= limit;
}

function outputText(response: { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }): string {
  if (response.output_text) return response.output_text;
  for (const item of response.output ?? []) for (const content of item.content ?? []) if (content.type === 'output_text' && content.text) return content.text;
  throw new Error('AI response không có output text.');
}

async function openAiStructured<T>(env: Env, name: string, schema: Record<string, unknown>, instructions: string, input: unknown, maxOutputTokens = 4000): Promise<T> {
  if (!env.OPENAI_API_KEY && env.AI) {
    const result = await env.AI.run(env.WORKERS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct-fast', {
      messages: [
        { role: 'system', content: `${instructions}\nChỉ trả JSON đúng schema được yêu cầu.` },
        { role: 'user', content: JSON.stringify(input) }
      ],
      max_tokens: Math.min(maxOutputTokens, 8192),
      response_format: { type: 'json_schema', json_schema: schema }
    }) as { response?: unknown };
    if (typeof result.response === 'string') return JSON.parse(result.response) as T;
    if (result.response && typeof result.response === 'object') return result.response as T;
    throw new Error('Workers AI response không hợp lệ.');
  }
  if (!env.OPENAI_API_KEY) throw new Error('Backend chưa cấu hình AI provider.');
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || 'gpt-5.6',
      store: false,
      instructions,
      input: JSON.stringify(input),
      max_output_tokens: maxOutputTokens,
      text: { format: { type: 'json_schema', name, strict: true, schema } }
    })
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${(await response.text()).slice(0, 500)}`);
  const value = await response.json() as Parameters<typeof outputText>[0];
  return JSON.parse(outputText(value)) as T;
}

const tagsSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    tags: { type: 'array', items: { type: 'string' } },
    suggestedGroup: { type: ['string', 'null'] },
    confidence: { type: 'number' }
  }, required: ['tags', 'suggestedGroup', 'confidence']
};

const groupRulesSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    groups: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
      name: { type: 'string' }, keywords: { type: 'array', items: { type: 'string' }, maxItems: 12 }
    }, required: ['name', 'keywords'] } }
  }, required: ['groups']
};

const unsubscribeSuggestionsSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    recommendations: { type: 'array', maxItems: 20, items: { type: 'object', additionalProperties: false, properties: {
      channelId: { type: 'string' }, reason: { type: 'string' }, confidence: { type: 'number' }
    }, required: ['channelId', 'reason', 'confidence'] } }
  }, required: ['recommendations']
};

function normalizeChannels(value: unknown): ChannelInput[] {
  if (!Array.isArray(value)) throw new Error('channels phải là một array.');
  if (value.length > 1200) throw new Error('Tối đa 1.200 channels mỗi lần AI organize.');
  return value.map((item) => {
    const channel = item as Partial<ChannelInput>;
    if (!channel.id || !CHANNEL_ID.test(channel.id) || !channel.title || !channel.url) throw new Error('Channel payload không hợp lệ.');
    return { id: channel.id, title: channel.title.slice(0, 160), description: channel.description?.slice(0, 240), url: channel.url.slice(0, 500) };
  });
}

async function aiTags(request: Request, env: Env, identity: Identity, cors: HeadersInit): Promise<Response> {
  if (!(await rateLimit(identity, env, 'ai', 20))) return errorResponse('Đã vượt giới hạn AI 20 requests/phút.', 429, cors);
  const body = await readJson<{ channel?: ChannelInput }>(request);
  const channel = normalizeChannels(body.channel ? [body.channel] : [])[0];
  if (!channel) return errorResponse('Thiếu channel.', 400, cors);
  const result = await openAiStructured<{ tags: string[]; suggestedGroup: string | null; confidence: number }>(env, 'channel_tags', tagsSchema,
    'Phân loại kênh YouTube bằng tiếng Việt. Trả 2-6 tag ngắn, một group phù hợp và confidence 0-1. Không suy diễn nội dung nhạy cảm.', channel);
  return json({ tags: [...new Set(result.tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 6), suggestedGroup: result.suggestedGroup ?? undefined, confidence: Math.max(0, Math.min(1, result.confidence)) }, 200, cors);
}

async function aiUnsubscribeSuggestions(request: Request, env: Env, identity: Identity, cors: HeadersInit): Promise<Response> {
  if (!(await rateLimit(identity, env, 'ai-unsubscribe', 8))) return errorResponse('Đã vượt giới hạn phân tích AI 8 requests/phút.', 429, cors);
  const body = await readJson<{ signals?: Array<{ channelId?: string; channelTitle?: string; rejectedCount?: number; cachedCount?: number; rejectedTitles?: string[] }> }>(request);
  const signals = (Array.isArray(body.signals) ? body.signals : []).slice(0, 100).flatMap((item) => {
    if (!item.channelId || !CHANNEL_ID.test(item.channelId) || !item.channelTitle) return [];
    return [{ channelId: item.channelId, channelTitle: item.channelTitle.slice(0, 160), rejectedCount: Math.max(0, Number(item.rejectedCount) || 0), cachedCount: Math.max(1, Number(item.cachedCount) || 1), rejectedTitles: (Array.isArray(item.rejectedTitles) ? item.rejectedTitles : []).filter((title): title is string => typeof title === 'string').slice(0, 8).map((title) => title.slice(0, 180)) }];
  });
  if (!signals.length) return json({ recommendations: [] }, 200, cors);
  try {
    const result = await openAiStructured<{ recommendations: Array<{ channelId: string; reason: string; confidence: number }> }>(env, 'unsubscribe_recommendations', unsubscribeSuggestionsSchema,
      'Phân tích negative feedback của người dùng. Chỉ đề xuất unsubscribe khi có tín hiệu lặp lại đủ mạnh, không chỉ vì một video. Viết lý do ngắn bằng tiếng Việt, dựa trên rejectedCount, tỷ lệ trong cachedCount và tiêu đề bị từ chối. Không tạo channel ID mới.', { signals }, 2600);
    const allowed = new Set(signals.map((signal) => signal.channelId));
    return json({ recommendations: result.recommendations.filter((item) => allowed.has(item.channelId)).map((item) => ({ channelId: item.channelId, reason: item.reason.trim().slice(0, 240), confidence: Math.max(0, Math.min(1, item.confidence)) })).filter((item) => item.confidence >= .55) }, 200, cors);
  } catch {
    return json({ recommendations: signals.filter((signal) => signal.rejectedCount >= 3 && signal.rejectedCount / signal.cachedCount >= .4).map((signal) => ({ channelId: signal.channelId, reason: `${signal.rejectedCount}/${signal.cachedCount} video gần đây đã bị đánh dấu Không xem.`, confidence: Math.min(.95, .55 + signal.rejectedCount / signal.cachedCount * .35) })) }, 200, cors);
  }
}

function normalizedGroupName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function mergeAiGroupBatches(channels: ChannelInput[], batches: Array<{ groups?: AiGroup[] }>): AiGroup[] {
  const allowed = new Set(channels.map((channel) => channel.id));
  const assigned = new Set<string>();
  const taxonomyByName = new Map(AI_GROUP_TAXONOMY.map((group) => [normalizedGroupName(group.name), group]));
  const idsByName = new Map(AI_GROUP_TAXONOMY.map((group) => [group.name, [] as string[]]));
  for (const batch of batches) {
    for (const group of Array.isArray(batch.groups) ? batch.groups : []) {
      if (!group || typeof group.name !== 'string' || !Array.isArray(group.channelIds)) continue;
      const taxonomy = taxonomyByName.get(normalizedGroupName(group.name)) ?? AI_GROUP_TAXONOMY[AI_GROUP_TAXONOMY.length - 1]!;
      const ids = idsByName.get(taxonomy.name)!;
      for (const id of group.channelIds) if (typeof id === 'string' && allowed.has(id) && !assigned.has(id)) { assigned.add(id); ids.push(id); }
    }
  }
  const fallback = idsByName.get('Khác')!;
  for (const channel of channels) if (!assigned.has(channel.id)) fallback.push(channel.id);
  return AI_GROUP_TAXONOMY.map((group) => ({ ...group, channelIds: idsByName.get(group.name)! })).filter((group) => group.channelIds.length);
}

const AI_GROUP_KEYWORDS: Record<string, string[]> = {
  'Công nghệ': ['tech', 'technology', 'công nghệ', 'software', 'developer', 'coding', 'code', 'computer', 'điện thoại', 'review'],
  'Tài chính & Đầu tư': ['tài chính', 'đầu tư', 'chứng khoán', 'stock', 'crypto', 'bitcoin', 'finance', 'wealth'],
  'Kinh doanh': ['kinh doanh', 'business', 'marketing', 'startup', 'doanh nghiệp', 'sales'],
  'Tin tức': ['tin tức', 'news', 'báo', 'thời sự', 'truyền hình', 'tv', 'media'],
  'Thể thao': ['thể thao', 'sport', 'football', 'bóng đá', 'bóng rổ', 'fitness', 'gym', 'cycling'],
  'Giải trí': ['giải trí', 'entertainment', 'show', 'movie', 'phim', 'comedy', 'vlog'],
  'Âm nhạc': ['âm nhạc', 'music', 'official artist', 'singer', 'records', 'band'],
  'Giáo dục': ['giáo dục', 'education', 'academy', 'university', 'school', 'học', 'tutorial'],
  'Du lịch & Đời sống': ['du lịch', 'travel', 'đời sống', 'lifestyle', 'daily', 'family'],
  'Ẩm thực': ['ẩm thực', 'food', 'cooking', 'kitchen', 'cook', 'ăn'],
  'Sức khỏe': ['sức khỏe', 'health', 'medical', 'doctor', 'bác sĩ', 'y khoa']
};

export function fallbackAiGroups(channels: ChannelInput[], extraKeywords: Record<string, string[]> = {}): { groups: AiGroup[] } {
  const idsByName = new Map<string, string[]>(AI_GROUP_TAXONOMY.map((group) => [group.name, []]));
  for (const channel of channels) {
    const haystack = `${channel.title} ${channel.description ?? ''}`.normalize('NFC').toLocaleLowerCase();
    const name = Object.entries(AI_GROUP_KEYWORDS).find(([groupName, keywords]) => [...keywords, ...(extraKeywords[groupName] ?? [])].some((keyword) => haystack.includes(keyword.toLocaleLowerCase())))?.[0] ?? 'Khác';
    idsByName.get(name)!.push(channel.id);
  }
  return { groups: AI_GROUP_TAXONOMY.map((group) => ({ ...group, channelIds: idsByName.get(group.name)! })).filter((group) => group.channelIds.length) };
}

async function aiGroups(request: Request, env: Env, identity: Identity, cors: HeadersInit): Promise<Response> {
  if (!(await rateLimit(identity, env, 'ai-groups', 4))) return errorResponse('Đã vượt giới hạn AI Groups 4 requests/phút.', 429, cors);
  const body = await readJson<{ channels?: ChannelInput[] }>(request, 2_000_000);
  const channels = normalizeChannels(body.channels);
  if (!channels.length) return json({ groups: [] }, 200, cors);
  const taxonomy = AI_GROUP_TAXONOMY.map((group) => group.name).join(', ');
  // Learn compact classification rules in one AI call. Classifying hundreds of
  // channels with one call truncates JSON; one call per batch exceeds the Worker
  // subrequest limit. Applying AI-generated rules locally avoids both failure modes.
  const sampleSize = Math.min(240, channels.length);
  const sample = Array.from({ length: sampleSize }, (_, index) => channels[Math.floor(index * channels.length / sampleSize)]!);
  let extraKeywords: Record<string, string[]> = {};
  try {
    const rules = await openAiStructured<{ groups: Array<{ name: string; keywords: string[] }> }>(env, 'youtube_channel_group_rules', groupRulesSchema,
      `Dựa trên mẫu tên kênh, bổ sung từ khóa ngắn để nhận diện các nhóm cố định sau: ${taxonomy}. Chỉ dùng chính xác các tên nhóm này. Mỗi nhóm tối đa 12 từ khóa tiếng Việt hoặc tiếng Anh.`,
      { groups: AI_GROUP_TAXONOMY.map((group) => group.name), channels: sample.map(({ title, description }) => ({ title, description: description?.slice(0, 80) })) }, 3000);
    const taxonomyByName = new Map(AI_GROUP_TAXONOMY.map((group) => [normalizedGroupName(group.name), group.name]));
    for (const group of rules.groups) {
      const name = taxonomyByName.get(normalizedGroupName(group.name));
      if (name) extraKeywords[name] = group.keywords.filter((keyword) => typeof keyword === 'string').slice(0, 12);
    }
  } catch (error) {
    console.warn('AI group rules fallback', error instanceof Error ? error.message : error);
  }
  return json(fallbackAiGroups(channels, extraKeywords), 200, cors);
}

function topicFor(channelId: string): string { return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`; }

async function subscribeHub(channelId: string, env: Env): Promise<void> {
  const body = new URLSearchParams({
    'hub.callback': `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/v1/websub/callback`,
    'hub.mode': 'subscribe',
    'hub.topic': topicFor(channelId),
    'hub.verify': 'async',
    'hub.lease_seconds': '864000',
    'hub.secret': env.WEBSUB_SECRET
  });
  const response = await fetch(env.WEBSUB_HUB_URL || HUB_DEFAULT, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  if (!response.ok && response.status !== 202 && response.status !== 204) throw new Error(`Hub ${response.status}: ${(await response.text()).slice(0, 200)}`);
  await env.DB.prepare(`UPDATE channel_subscriptions SET state='verifying',last_error=NULL,attempts=attempts+1,updated_at=? WHERE channel_id=?`).bind(new Date().toISOString(), channelId).run();
}

async function renewPending(env: Env, limit = 50): Promise<void> {
  const threshold = new Date(Date.now() + 86_400_000).toISOString();
  const rows = await env.DB.prepare(`SELECT channel_id FROM channel_subscriptions WHERE lease_expires_at IS NULL OR lease_expires_at<? ORDER BY updated_at ASC LIMIT ?`).bind(threshold, limit).all<{ channel_id: string }>();
  for (const row of rows.results ?? []) {
    try { await subscribeHub(row.channel_id, env); }
    catch (error) { await env.DB.prepare(`UPDATE channel_subscriptions SET state='error',last_error=?,attempts=attempts+1,updated_at=? WHERE channel_id=?`).bind(error instanceof Error ? error.message.slice(0, 500) : 'Unknown error', new Date().toISOString(), row.channel_id).run(); }
  }
  await env.DB.prepare('DELETE FROM rate_limits WHERE expires_at<?').bind(Date.now()).run();
  await env.DB.prepare(`DELETE FROM events WHERE created_at<?`).bind(new Date(Date.now() - 30 * 86_400_000).toISOString()).run();
  await env.DB.prepare(`DELETE FROM channel_subscriptions WHERE NOT EXISTS (SELECT 1 FROM user_channels WHERE user_channels.channel_id=channel_subscriptions.channel_id)`).run();
}

async function registerChannels(request: Request, env: Env, identity: Identity, cors: HeadersInit, ctx: WorkerExecutionContext): Promise<Response> {
  const body = await readJson<{ channelIds?: string[] }>(request);
  const channelIds = [...new Set(body.channelIds ?? [])];
  if (!channelIds.length || channelIds.length > 2000 || channelIds.some((id) => !CHANNEL_ID.test(id))) return errorResponse('channelIds không hợp lệ (1-2.000 IDs).', 400, cors);
  const now = new Date().toISOString();
  // Treat registration as a full snapshot so channels unsubscribed on YouTube stop producing events for this user.
  await env.DB.prepare('DELETE FROM user_channels WHERE user_id=?').bind(identity.sub).run();
  for (let index = 0; index < channelIds.length; index += 40) {
    const chunk = channelIds.slice(index, index + 40);
    await env.DB.batch([
      ...chunk.map((id) => env.DB.prepare(`INSERT INTO channel_subscriptions(channel_id,state,attempts,updated_at) VALUES(?,'pending',0,?) ON CONFLICT(channel_id) DO NOTHING`).bind(id, now)),
      ...chunk.map((id) => env.DB.prepare(`INSERT INTO user_channels(user_id,channel_id,created_at) VALUES(?,?,?) ON CONFLICT(user_id,channel_id) DO NOTHING`).bind(identity.sub, id, now))
    ]);
  }
  ctx.waitUntil(renewPending(env, 25));
  return json({ registered: channelIds.length, queued: channelIds.length }, 202, cors);
}

function xmlValue(xml: string, tag: string): string | undefined {
  return xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`, 'i'))?.[1]?.trim();
}

function decodeXml(value?: string): string | undefined {
  return value?.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
}

export function parseAtomVideo(xml: string): { id: string; channelId: string; title: string; channelTitle: string; publishedAt?: string; thumbnailUrl?: string } | null {
  const entry = xml.match(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/i)?.[1];
  if (!entry) return null;
  const id = decodeXml(xmlValue(entry, 'yt:videoId'));
  const channelId = decodeXml(xmlValue(entry, 'yt:channelId'));
  const title = decodeXml(xmlValue(entry, 'title'));
  const channelTitle = decodeXml(xmlValue(entry, 'name'));
  const publishedAt = decodeXml(xmlValue(entry, 'published'));
  const thumbnailUrl = entry.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i)?.[1];
  if (!id || !channelId || !CHANNEL_ID.test(channelId) || !title) return null;
  return { id, channelId, title, channelTitle: channelTitle || channelId, publishedAt, thumbnailUrl: decodeXml(thumbnailUrl) };
}

async function verifyWebSubSignature(request: Request, body: string, env: Env): Promise<boolean> {
  const supplied = request.headers.get('x-hub-signature')?.match(/^sha1=([a-f0-9]+)$/i)?.[1]?.toLowerCase();
  if (!supplied) return false;
  const bytes = await hmac(env.WEBSUB_SECRET, body, 'SHA-1');
  const expected = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return safeEqual(supplied, expected);
}

async function webSubCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const topic = url.searchParams.get('hub.topic') ?? '';
    const challenge = url.searchParams.get('hub.challenge');
    const leaseSeconds = Math.min(1_209_600, Math.max(60, Number(url.searchParams.get('hub.lease_seconds') ?? 864000)));
    const channelId = new URL(topic).searchParams.get('channel_id');
    if (!challenge || !channelId || !CHANNEL_ID.test(channelId) || !['subscribe', 'unsubscribe'].includes(mode ?? '')) return new Response('Invalid verification request', { status: 400 });
    if (mode === 'subscribe') await env.DB.prepare(`UPDATE channel_subscriptions SET state='active',lease_expires_at=?,last_error=NULL,updated_at=? WHERE channel_id=?`).bind(new Date(Date.now() + leaseSeconds * 1000).toISOString(), new Date().toISOString(), channelId).run();
    else await env.DB.prepare(`UPDATE channel_subscriptions SET state='expired',lease_expires_at=NULL,updated_at=? WHERE channel_id=?`).bind(new Date().toISOString(), channelId).run();
    return new Response(challenge, { headers: { 'content-type': 'text/plain' } });
  }
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const body = await request.text();
  if (body.length > 256_000 || !(await verifyWebSubSignature(request, body, env))) return new Response('Invalid signature', { status: 401 });
  const video = parseAtomVideo(body);
  if (!video) return new Response('Ignored', { status: 202 });
  const users = await env.DB.prepare('SELECT user_id FROM user_channels WHERE channel_id=?').bind(video.channelId).all<{ user_id: string }>();
  const now = new Date().toISOString();
  const eventId = `${video.channelId}:${video.id}`;
  for (const row of users.results ?? []) await env.DB.prepare(`INSERT INTO events(id,user_id,video_id,title,url,channel_id,channel_title,thumbnail_url,published_at,discovered_at,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,id) DO NOTHING`).bind(eventId, row.user_id, video.id, video.title, `https://www.youtube.com/watch?v=${video.id}`, video.channelId, video.channelTitle, video.thumbnailUrl ?? null, video.publishedAt ?? null, now, now).run();
  return new Response('Accepted', { status: 202 });
}

export function parseCursor(cursor: string | null): number {
  if (!cursor) return 0;
  const value = Number.parseInt(cursor, 36);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

async function eventsInbox(request: Request, env: Env, identity: Identity, cors: HeadersInit): Promise<Response> {
  const cursor = parseCursor(new URL(request.url).searchParams.get('cursor'));
  const rows = await env.DB.prepare(`SELECT seq,id,video_id,title,url,channel_id,channel_title,thumbnail_url,published_at,discovered_at FROM events WHERE user_id=? AND seq>? ORDER BY seq ASC LIMIT 200`).bind(identity.sub, cursor).all<{
    seq: number; id: string; video_id: string; title: string; url: string; channel_id: string; channel_title: string; thumbnail_url?: string; published_at?: string; discovered_at: string;
  }>();
  const items = rows.results ?? [];
  const next = items.length ? items[items.length - 1]!.seq.toString(36) : cursor.toString(36);
  return json({ events: items.map((row) => ({ id: row.id, video: { id: row.video_id, title: row.title, url: row.url, thumbnailUrl: row.thumbnail_url, channelId: row.channel_id, channelTitle: row.channel_title, publishedAt: row.published_at, contentType: 'video', discoveredAt: row.discovered_at } })), cursor: next }, 200, cors);
}

async function cloudStatus(env: Env, identity: Identity, cors: HeadersInit): Promise<Response> {
  const subscriptions = await env.DB.prepare(`SELECT COUNT(*) count FROM user_channels WHERE user_id=?`).bind(identity.sub).first<{ count: number }>();
  const active = await env.DB.prepare(`SELECT COUNT(*) count FROM channel_subscriptions cs JOIN user_channels uc ON uc.channel_id=cs.channel_id WHERE uc.user_id=? AND cs.state='active'`).bind(identity.sub).first<{ count: number }>();
  const events = await env.DB.prepare(`SELECT COUNT(*) count FROM events WHERE user_id=?`).bind(identity.sub).first<{ count: number }>();
  return json({ ok: true, aiConfigured: Boolean(env.OPENAI_API_KEY || env.AI), aiModel: env.OPENAI_API_KEY ? env.OPENAI_MODEL || 'gpt-5.6' : env.WORKERS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct-fast', subscriptions: subscriptions?.count ?? 0, activeSubscriptions: active?.count ?? 0, pendingSubscriptions: Math.max(0, (subscriptions?.count ?? 0) - (active?.count ?? 0)), events: events?.count ?? 0 }, 200, cors);
}

async function deleteAccount(env: Env, identity: Identity, cors: HeadersInit): Promise<Response> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM events WHERE user_id=?').bind(identity.sub),
    env.DB.prepare('DELETE FROM user_channels WHERE user_id=?').bind(identity.sub),
    env.DB.prepare('DELETE FROM users WHERE id=?').bind(identity.sub)
  ]);
  return json({ deleted: true }, 200, cors);
}

async function route(request: Request, env: Env, ctx: WorkerExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/health') return json({ ok: true, service: 'youtube-collections-cloud', time: new Date().toISOString() });
  if (url.pathname === '/v1/websub/callback') return webSubCallback(request, env);
  const cors = corsHeaders(request, env);
  if (cors === null) return errorResponse('Origin không được phép.', 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (url.pathname === '/v1/auth/google' && request.method === 'POST') {
    const body = await readJson<{ accessToken?: string }>(request);
    if (!body.accessToken) return errorResponse('Thiếu accessToken.', 400, cors);
    const identity = await verifyGoogleToken(body.accessToken, env, 'access_token');
    if (!identity) return errorResponse('Google token không hợp lệ hoặc sai OAuth audience.', 401, cors);
    await saveUser(identity, env);
    return json(await issueSession(identity, env), 200, cors);
  }
  const identity = await authenticate(request, env);
  if (!identity) return errorResponse('Unauthorized.', 401, cors);
  await saveUser(identity, env);
  if (url.pathname === '/v1/status' && request.method === 'GET') return cloudStatus(env, identity, cors);
  if (url.pathname === '/v1/ai/tags' && request.method === 'POST') return aiTags(request, env, identity, cors);
  if (url.pathname === '/v1/ai/groups' && request.method === 'POST') return aiGroups(request, env, identity, cors);
  if (url.pathname === '/v1/ai/unsubscribe-suggestions' && request.method === 'POST') return aiUnsubscribeSuggestions(request, env, identity, cors);
  if (url.pathname === '/v1/websub/subscriptions' && request.method === 'POST') return registerChannels(request, env, identity, cors, ctx);
  if (url.pathname === '/v1/events' && request.method === 'GET') return eventsInbox(request, env, identity, cors);
  if (url.pathname === '/v1/account' && request.method === 'DELETE') return deleteAccount(env, identity, cors);
  return errorResponse('Not found.', 404, cors);
}

export default {
  async fetch(request: Request, env: Env, ctx: WorkerExecutionContext): Promise<Response> {
    try { return await route(request, env, ctx); }
    catch (error) {
      console.error('Request failed', new URL(request.url).pathname, error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error);
      return errorResponse(error instanceof Error ? error.message : 'Internal error', 500, corsHeaders(request, env) ?? undefined);
    }
  },
  async scheduled(_event: ScheduledEvent, env: Env, ctx: WorkerExecutionContext): Promise<void> { ctx.waitUntil(renewPending(env, 75)); }
};
