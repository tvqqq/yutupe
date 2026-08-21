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
  refreshToken?: string;
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

export function generateCodeVerifier(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64Url(bytes);
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64Url(new Uint8Array(digest));
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

export function parseOAuthCodeResponse(finalUrl: string, expectedState: string): string {
  const resultUrl = new URL(finalUrl);
  const hashParams = new URLSearchParams(resultUrl.hash.replace(/^#/, ''));
  const searchParams = resultUrl.searchParams;
  const oauthError = searchParams.get('error') || hashParams.get('error');
  if (oauthError) throw new Error(`Google OAuth: ${oauthError}`);
  const state = searchParams.get('state') || hashParams.get('state');
  if (state !== expectedState) throw new Error('Google OAuth state không hợp lệ. Hãy thử kết nối lại.');
  const code = searchParams.get('code') || hashParams.get('code');
  if (!code) throw new Error('Google OAuth không trả về authorization code.');
  return code;
}

export function buildOAuthAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  interactive: boolean;
  email?: string;
}): string {
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  const params: Record<string, string> = {
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: 'token',
    scope: SCOPES.join(' '),
    state: input.state,
    include_granted_scopes: 'true',
    prompt: input.interactive ? 'consent' : 'none'
  };

  if (input.email) {
    params.login_hint = input.email;
  }

  authUrl.search = new URLSearchParams(params).toString();
  return authUrl.toString();
}

async function readSession(): Promise<TokenSession | null> {
  try {
    const local = await browser.storage.local.get(SESSION_KEY);
    if (local[SESSION_KEY]) return local[SESSION_KEY] as TokenSession;
  } catch {}
  try {
    const session = await browser.storage.session.get(SESSION_KEY);
    if (session[SESSION_KEY]) return session[SESSION_KEY] as TokenSession;
  } catch {}
  return null;
}

async function writeSession(session: TokenSession): Promise<void> {
  try {
    await browser.storage.local.set({ [SESSION_KEY]: session });
  } catch {}
  try {
    await browser.storage.session.set({ [SESSION_KEY]: session });
  } catch {}
}

async function clearSession(): Promise<void> {
  try {
    await browser.storage.local.remove(SESSION_KEY);
  } catch {}
  try {
    await browser.storage.session.remove(SESSION_KEY);
  } catch {}
}

async function readGoogleProfile(accessToken: string): Promise<{ email?: string }> {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return response.ok ? (await response.json() as { email?: string }) : {};
}

async function refreshNativeChromeSession(interactive: boolean, current?: TokenSession | null): Promise<TokenSession> {
  const result = await browser.identity.getAuthToken({ interactive, scopes: SCOPES });
  const accessToken = typeof result === 'string' ? result : result?.token;
  if (!accessToken) throw new Error('Chrome Identity không trả về access token.');
  const profile = current?.email ? {} : await readGoogleProfile(accessToken);
  const session: TokenSession = {
    accessToken,
    expiresAt: Date.now() + 55 * 60_000,
    email: current?.email ?? profile.email
  };
  await writeSession(session);
  return session;
}

export async function launchWebAuthViaWindow(authUrl: string, redirectUri: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let authTabId: number | undefined;
    let authWindowId: number | undefined;
    let settled = false;

    const cleanup = () => {
      try { browser.tabs?.onUpdated?.removeListener(onUpdated); } catch {}
      try { browser.tabs?.onRemoved?.removeListener(onRemoved); } catch {}
      if (authWindowId !== undefined) {
        browser.windows?.remove(authWindowId).catch(() => undefined);
      } else if (authTabId !== undefined) {
        browser.tabs?.remove(authTabId).catch(() => undefined);
      }
    };

    const finish = (result: { url?: string; error?: Error }) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (result.error) reject(result.error);
      else if (result.url) resolve(result.url);
      else reject(new Error('Google OAuth không trả về redirect URL.'));
    };

    const onUpdated = (tabId: number, changeInfo: { url?: string }, tab?: { url?: string }) => {
      if (tabId !== authTabId) return;
      const targetUrl = changeInfo.url || tab?.url;
      if (!targetUrl) return;
      if (
        targetUrl.startsWith(redirectUri) ||
        ((targetUrl.includes('chromiumapp.org') || targetUrl.includes('extensions.allizom.org')) &&
          (targetUrl.includes('access_token=') || targetUrl.includes('error=')))
      ) {
        finish({ url: targetUrl });
      }
    };

    const onRemoved = (tabId: number) => {
      if (tabId === authTabId) {
        finish({ error: new Error('Cửa sổ đăng nhập Google đã bị đóng.') });
      }
    };

    try {
      browser.tabs?.onUpdated?.addListener(onUpdated);
      browser.tabs?.onRemoved?.addListener(onRemoved);
    } catch {}

    const openPopup = async () => {
      try {
        if (browser.windows?.create) {
          const win = await browser.windows.create({
            url: authUrl,
            type: 'popup',
            width: 520,
            height: 680,
            focused: true
          });
          authWindowId = win?.id;
          authTabId = win?.tabs?.[0]?.id;
          if (!authTabId && win?.id) {
            const tabs = await browser.tabs.query({ windowId: win.id }).catch(() => []);
            if (tabs[0]?.id) authTabId = tabs[0].id;
          }
          return;
        }
      } catch {}

      if (browser.tabs?.create) {
        const tab = await browser.tabs.create({ url: authUrl, active: true });
        authTabId = tab?.id;
        return;
      }

      finish({ error: new Error('Không thể mở cửa sổ đăng nhập Google.') });
    };

    void openPopup();
  });
}

async function refreshWebAuthSession(interactive: boolean, suppliedClientId = ''): Promise<TokenSession> {
  const current = await readSession();
  const manifestClientId = browser.runtime.getManifest().oauth2?.client_id?.trim();
  const clientId = manifestClientId || suppliedClientId.trim() || current?.clientId;
  if (!clientId) throw new Error('Hãy cấu hình Google OAuth Client ID trước.');

  const oauthState = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const redirectUri = browser.identity.getRedirectURL('google-oauth');

  const authUrl = buildOAuthAuthorizationUrl({
    clientId,
    redirectUri,
    state: oauthState,
    interactive,
    email: current?.email
  });

  let finalUrl: string | undefined;
  try {
    finalUrl = await browser.identity.launchWebAuthFlow({ url: authUrl, interactive });
  } catch (error) {
    if (!interactive) throw error;
    try {
      finalUrl = await launchWebAuthViaWindow(authUrl, redirectUri);
    } catch (fallbackError) {
      const origMsg = error instanceof Error ? error.message : '';
      if (origMsg.includes('could not be loaded') || origMsg.includes('canceled') || origMsg.includes('failure')) {
        throw new Error(
          `Google OAuth thất bại: Không thể tải trang xác thực (${origMsg}). Hãy kiểm tra:\n` +
          `1. Extension đang chạy từ build .output/edge-mv3.\n` +
          `2. Authorized redirect URI "${redirectUri}" đã được thêm vào Google Cloud Console cho Client ID "${clientId}".`
        );
      }
      throw fallbackError;
    }
  }

  if (!finalUrl) throw new Error('Google OAuth không trả về redirect URL.');

  const token = parseOAuthImplicitResponse(finalUrl, oauthState);
  const profile = current?.email ? {} : await readGoogleProfile(token.accessToken);
  const session: TokenSession = {
    accessToken: token.accessToken,
    expiresAt: Date.now() + token.expiresIn * 1_000,
    email: current?.email ?? profile.email,
    clientId
  };
  await writeSession(session);
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

  if (session) {
    try {
      const refreshed = await refreshGoogleSession(false);
      return { connected: true, email: refreshed.email, expiresAt: refreshed.expiresAt, redirectUri };
    } catch {
      // Don't nuke session on silent renewal failure
      return { connected: false, email: session.email, expiresAt: session.expiresAt, redirectUri };
    }
  }

  return { connected: false, redirectUri };
}

export async function requireAccessToken(): Promise<string> {
  const session = await readSession();
  if (session && session.expiresAt > Date.now() + 30_000) return session.accessToken;
  try {
    return (await refreshGoogleSession(false)).accessToken;
  } catch {
    throw new Error('Phiên Google đã hết hạn. Hãy bấm "Kết nối Google" để gia hạn.');
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
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }).catch(() => undefined);
  }
  if (import.meta.env.CHROME && session?.accessToken && browser.runtime.getManifest().oauth2?.client_id) {
    await browser.identity.removeCachedAuthToken({ token: session.accessToken }).catch(() => undefined);
  }
  await clearSession();
}
