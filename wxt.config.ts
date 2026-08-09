import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: '.',
  modules: ['@wxt-dev/module-react'],
  manifest: ({ browser }) => ({
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
    action: {
      default_title: 'YouTube Collections'
    },
    ...(browser === 'edge' ? { name: 'YouTube Collections for Edge' } : {})
  })
});
