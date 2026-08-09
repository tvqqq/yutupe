import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: '.',
  modules: ['@wxt-dev/module-react'],
  manifest: ({ browser }) => {
    const googleClientId = (browser === 'edge' ? process.env.WXT_GOOGLE_CLIENT_ID_EDGE : process.env.WXT_GOOGLE_CLIENT_ID_CHROME)?.trim();
    const extensionKey = (browser === 'edge' ? process.env.WXT_EXTENSION_KEY_EDGE : process.env.WXT_EXTENSION_KEY_CHROME)?.trim();
    return ({
    name: 'YouTube Collections',
    short_name: 'YT Collections',
    description: 'Group subscriptions and watch a focused YouTube feed.',
    minimum_chrome_version: '120',
    permissions: ['storage', 'notifications', 'identity', 'activeTab', 'alarms'],
    host_permissions: [
      'https://www.youtube.com/*',
      'https://www.googleapis.com/*',
      'https://oauth2.googleapis.com/*',
      'https://accounts.google.com/*'
    ],
    optional_host_permissions: ['https://*/*'],
    action: {
      default_title: 'YouTube Collections'
    },
    ...(googleClientId ? { oauth2: { client_id: googleClientId, scopes: [
      'openid',
      'email',
      'https://www.googleapis.com/auth/youtube.force-ssl',
      'https://www.googleapis.com/auth/drive.appdata'
    ] } } : {}),
    ...(extensionKey ? { key: extensionKey } : {}),
    ...(browser === 'edge' ? { name: 'YouTube Collections for Edge' } : {})
  }); }
});
