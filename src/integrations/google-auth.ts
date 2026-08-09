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
  expiresAt: number;
  email?: string;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

async function readSession(): Promise<TokenSession | null> {
  const stored = await browser.storage.session.get(SESSION_KEY);
  return (stored[SESSION_KEY] as TokenSession | undefined) ?? null;
}

export async function getAuthStatus(): Promise<AuthStatus> {
  const session = await readSession();
  return session && session.expiresAt > Date.now() + 30_000
    ? { connected: true, email: session.email, expiresAt: session.expiresAt }
    : { connected: false };
}

export async function requireAccessToken(): Promise<string> {
  const session = await readSession();
  if (!session || session.expiresAt <= Date.now() + 30_000) {
    await browser.storage.session.remove(SESSION_KEY);
    throw new Error('Phiên Google đã hết hạn. Hãy kết nối lại.');
  }
  return session.accessToken;
}

export async function connectGoogle(clientId: string): Promise<AuthStatus> {
  if (!clientId.trim()) throw new Error('Hãy cấu hình Google OAuth Client ID trước.');
  const verifierBytes = crypto.getRandomValues(new Uint8Array(64));
  const verifier = base64Url(verifierBytes);
  const challenge = await sha256(verifier);
  const redirectUri = browser.identity.getRedirectURL('google-oauth');
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.search = new URLSearchParams({
    client_id: clientId.trim(),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    access_type: 'online',
    include_granted_scopes: 'true',
    prompt: 'consent'
  }).toString();

  const finalUrl = await browser.identity.launchWebAuthFlow({ url: authUrl.toString(), interactive: true });
  if (!finalUrl) throw new Error('Google OAuth không trả về redirect URL.');
  const resultUrl = new URL(finalUrl);
  const oauthError = resultUrl.searchParams.get('error');
  if (oauthError) throw new Error(`Google OAuth: ${oauthError}`);
  const code = resultUrl.searchParams.get('code');
  if (!code) throw new Error('Google OAuth không trả về authorization code.');

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId.trim(),
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  });
  if (!tokenResponse.ok) throw new Error(`Đổi OAuth token thất bại (${tokenResponse.status}).`);
  const token = await tokenResponse.json() as { access_token: string; expires_in: number };
  const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${token.access_token}` }
  });
  const profile = profileResponse.ok ? await profileResponse.json() as { email?: string } : {};
  const session: TokenSession = {
    accessToken: token.access_token,
    expiresAt: Date.now() + token.expires_in * 1_000,
    email: profile.email
  };
  await browser.storage.session.set({ [SESSION_KEY]: session });
  return { connected: true, email: session.email, expiresAt: session.expiresAt };
}

export async function disconnectGoogle(): Promise<void> {
  const session = await readSession();
  if (session?.accessToken) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(session.accessToken)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }).catch(() => undefined);
  }
  await browser.storage.session.remove(SESSION_KEY);
}
