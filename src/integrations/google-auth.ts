import type { AuthStatus } from '@/src/domain/types';

const SESSION_KEY = 'youtube-collections-google-auth-v1';
const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/drive.appdata'
];

interface TokenSession {
  accessToken: string;
  idToken?: string;
  expiresAt: number;
  email?: string;
  clientId?: string;
}

export function shouldUseNativeGoogleAuth(targetBrowser: string, manifestClientId?: string): boolean {
  return targetBrowser === 'chrome' && Boolean(manifestClientId?.trim());
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function parseOAuthImplicitResponse(finalUrl: string, expectedState: string): { accessToken: string; expiresIn: number } {
  const resultUrl = new URL(finalUrl);
  const params = new URLSearchParams(resultUrl.hash.replace(/^#/, ''));
  const oauthError = params.get('error');
  if (oauthError) throw new Error(`Google OAuth: ${oauthError}`);
  if (params.get('state') !== expectedState) throw new Error('Google OAuth state không hợp lệ. Hãy thử kết nối lại.');
  const accessToken = params.get('access_token');
  if (!accessToken) throw new Error('Google OAuth không trả về access token.');
  const parsedExpiresIn = Number(params.get('expires_in'));
  return { accessToken, expiresIn: Number.isFinite(parsedExpiresIn) && parsedExpiresIn > 0 ? parsedExpiresIn : 3600 };
}

export function buildOAuthAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  interactive: boolean;
  email?: string;
}): string {
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.search = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: 'token',
    scope: SCOPES.join(' '),
    state: input.state,
    include_granted_scopes: 'true',
    prompt: input.interactive ? 'consent' : 'none',
    ...(input.email ? { login_hint: input.email } : {})
  }).toString();
  return authUrl.toString();
}

async function readSession(): Promise<TokenSession | null> {
  const stored = await browser.storage.session.get(SESSION_KEY);
  return (stored[SESSION_KEY] as TokenSession | undefined) ?? null;
}

async function readGoogleProfile(accessToken: string): Promise<{ email?: string }> {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return response.ok ? await response.json() as { email?: string } : {};
}

async function refreshNativeChromeSession(interactive: boolean, current?: TokenSession | null): Promise<TokenSession> {
  const result = await browser.identity.getAuthToken({ interactive, scopes: SCOPES });
  const accessToken = typeof result === 'string' ? result : result?.token;
  if (!accessToken) throw new Error('Chrome Identity không trả về access token.');
  const profile = current?.email ? {} : await readGoogleProfile(accessToken);
  const session: TokenSession = {
    accessToken,
    // This timestamp is UI metadata only. Chrome Identity owns token expiry and
    // refreshes its cache whenever getAuthToken is called non-interactively.
    expiresAt: Date.now() + 55 * 60_000,
    email: current?.email ?? profile.email
  };
  await browser.storage.session.set({ [SESSION_KEY]: session });
  return session;
}

async function refreshWebAuthSession(interactive: boolean, suppliedClientId = ''): Promise<TokenSession> {
  const current = await readSession();
  const manifestClientId = browser.runtime.getManifest().oauth2?.client_id?.trim();
  const clientId = manifestClientId || suppliedClientId.trim() || current?.clientId;
  if (!clientId) throw new Error('Hãy cấu hình Google OAuth Client ID trước.');
  const oauthState = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const redirectUri = browser.identity.getRedirectURL('google-oauth');
  const url = buildOAuthAuthorizationUrl({
    clientId,
    redirectUri,
    state: oauthState,
    interactive,
    email: current?.email
  });
  const finalUrl = await browser.identity.launchWebAuthFlow({ url, interactive });
  if (!finalUrl) throw new Error('Google OAuth không trả về redirect URL.');
  const token = parseOAuthImplicitResponse(finalUrl, oauthState);
  const profile = current?.email ? {} : await readGoogleProfile(token.accessToken);
  const session: TokenSession = {
    accessToken: token.accessToken,
    expiresAt: Date.now() + token.expiresIn * 1_000,
    email: current?.email ?? profile.email,
    clientId
  };
  await browser.storage.session.set({ [SESSION_KEY]: session });
  return session;
}

async function refreshGoogleSession(interactive: boolean, clientId = ''): Promise<TokenSession> {
  const manifestClientId = browser.runtime.getManifest().oauth2?.client_id;
  if (import.meta.env.CHROME && shouldUseNativeGoogleAuth('chrome', manifestClientId)) {
    return refreshNativeChromeSession(interactive, await readSession());
  }
  return refreshWebAuthSession(interactive, clientId);
}

export function getRedirectUri(): string {
  try {
    return browser.identity?.getRedirectURL ? browser.identity.getRedirectURL('google-oauth') : '';
  } catch {
    return '';
  }
}

export async function getAuthStatus(): Promise<AuthStatus> {
  const redirectUri = getRedirectUri();
  const session = await readSession();
  if (session && session.expiresAt > Date.now() + 30_000) {
    return { connected: true, email: session.email, expiresAt: session.expiresAt, redirectUri };
  }
  try {
    const refreshed = await refreshGoogleSession(false);
    return { connected: true, email: refreshed.email, expiresAt: refreshed.expiresAt, redirectUri };
  } catch {
    if (session) await browser.storage.session.remove(SESSION_KEY);
    return { connected: false, redirectUri };
  }
}

export async function requireAccessToken(): Promise<string> {
  const session = await readSession();
  if (session && session.expiresAt > Date.now() + 30_000) return session.accessToken;
  try {
    return (await refreshGoogleSession(false)).accessToken;
  } catch {
    await browser.storage.session.remove(SESSION_KEY);
    throw new Error('Phiên Google đã hết hạn. Hãy kết nối lại.');
  }
}

export async function requireIdentityToken(): Promise<string> {
  let session = await readSession();
  if (!session || session.expiresAt <= Date.now() + 30_000) {
    try { session = await refreshGoogleSession(false); }
    catch { throw new Error('Phiên Cloud identity đã hết hạn. Hãy kết nối lại Google.'); }
  }
  return session.idToken ?? session.accessToken;
}

export async function connectGoogle(clientId: string): Promise<AuthStatus> {
  const session = await refreshGoogleSession(true, clientId);
  return { connected: true, email: session.email, expiresAt: session.expiresAt, redirectUri: getRedirectUri() };
}

export async function disconnectGoogle(): Promise<void> {
  const session = await readSession();
  if (session?.accessToken) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(session.accessToken)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }).catch(() => undefined);
  }
  if (import.meta.env.CHROME && session?.accessToken && browser.runtime.getManifest().oauth2?.client_id) {
    await browser.identity.removeCachedAuthToken({ token: session.accessToken }).catch(() => undefined);
  }
  await browser.storage.session.remove(SESSION_KEY);
}
