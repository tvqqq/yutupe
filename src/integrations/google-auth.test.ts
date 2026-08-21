import { describe, expect, it } from 'vitest';
import { buildOAuthAuthorizationUrl, parseOAuthCodeResponse, parseOAuthImplicitResponse, shouldUseNativeGoogleAuth } from './google-auth';

describe('Google auth browser routing', () => {
  it('uses getAuthToken only for Chrome builds with a manifest client ID', () => {
    expect(shouldUseNativeGoogleAuth('chrome', 'client.apps.googleusercontent.com')).toBe(true);
    expect(shouldUseNativeGoogleAuth('chrome', '')).toBe(false);
  });

  it('uses launchWebAuthFlow for Edge even when the manifest has a client ID', () => {
    expect(shouldUseNativeGoogleAuth('edge', 'client.apps.googleusercontent.com')).toBe(false);
  });

  it('uses launchWebAuthFlow for Firefox even when the manifest has a client ID', () => {
    expect(shouldUseNativeGoogleAuth('firefox', 'client.apps.googleusercontent.com')).toBe(false);
  });
});

describe('Google implicit OAuth response', () => {
  it('accepts an access token only when state matches', () => {
    expect(parseOAuthImplicitResponse(
      'https://extension.chromiumapp.org/google-oauth#access_token=token-123&expires_in=1800&state=expected',
      'expected'
    )).toEqual({ accessToken: 'token-123', expiresIn: 1800 });
  });

  it('rejects a mismatched state', () => {
    expect(() => parseOAuthImplicitResponse(
      'https://extension.chromiumapp.org/google-oauth#access_token=token-123&state=unexpected',
      'expected'
    )).toThrow('state không hợp lệ');
  });
});

describe('Google authorization code OAuth response', () => {
  it('accepts authorization code when state matches in search params', () => {
    expect(parseOAuthCodeResponse(
      'https://extension.chromiumapp.org/google-oauth?code=code-456&state=expected',
      'expected'
    )).toBe('code-456');
  });

  it('accepts authorization code when state matches in hash params', () => {
    expect(parseOAuthCodeResponse(
      'https://extension.chromiumapp.org/google-oauth#code=code-789&state=expected',
      'expected'
    )).toBe('code-789');
  });

  it('rejects code when state is mismatched', () => {
    expect(() => parseOAuthCodeResponse(
      'https://extension.chromiumapp.org/google-oauth?code=code-456&state=unexpected',
      'expected'
    )).toThrow('state không hợp lệ');
  });
});

describe('Google OAuth authorization URL', () => {
  it('uses consent only for a user-initiated connection', () => {
    const url = new URL(buildOAuthAuthorizationUrl({
      clientId: 'client-id', redirectUri: 'https://extension.chromiumapp.org/google-oauth', state: 'state', interactive: true
    }));
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('response_type')).toBe('token');
    expect(url.searchParams.get('login_hint')).toBeNull();
  });

  it('uses prompt none and the known account for silent renewal', () => {
    const url = new URL(buildOAuthAuthorizationUrl({
      clientId: 'client-id', redirectUri: 'https://extension.chromiumapp.org/google-oauth', state: 'state', interactive: false, email: 'user@example.com'
    }));
    expect(url.searchParams.get('prompt')).toBe('none');
    expect(url.searchParams.get('response_type')).toBe('token');
    expect(url.searchParams.get('login_hint')).toBe('user@example.com');
    expect(url.searchParams.get('state')).toBe('state');
  });
});
