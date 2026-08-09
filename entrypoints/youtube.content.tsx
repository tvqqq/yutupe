import React from 'react';
import ReactDOM from 'react-dom/client';
import { sendMessage } from '@/src/lib/client';
import { scanYouTubePage } from '@/src/youtube/parser';
import ContentApp from '@/src/youtube/ContentApp';
import '@/src/ui/design-system.css';
import '@/entrypoints/popup/style.css';
import '@/src/youtube/content.css';
import { EXTENSION_BRAND_CYAN, EXTENSION_ROUTE_HASH } from '@/src/config';

const OPEN_EVENT = 'youtube-collections:open';

function installSidebarButton(): void {
  if (document.getElementById('youtube-collections-guide-entry')) return;
  const target = document.querySelector('ytd-guide-section-renderer #items, ytd-mini-guide-renderer #items');
  if (!target) return;
  const button = document.createElement('button');
  button.id = 'youtube-collections-guide-entry';
  button.type = 'button';
  button.innerHTML = '<span aria-hidden="true">✦</span><span>YouTube Collections</span>';
  Object.assign(button.style, {
    width: 'calc(100% - 16px)', margin: '4px 8px', height: '40px', border: '0', borderRadius: '10px',
    background: 'rgba(34,211,238,.10)', color: EXTENSION_BRAND_CYAN, display: 'flex', alignItems: 'center', gap: '20px',
    padding: '0 14px', font: '650 14px Roboto, Arial, sans-serif', cursor: 'pointer', textAlign: 'left'
  });
  button.addEventListener('mouseenter', () => { button.style.background = 'rgba(34,211,238,.18)'; });
  button.addEventListener('mouseleave', () => { button.style.background = location.hash === EXTENSION_ROUTE_HASH ? 'rgba(34,211,238,.18)' : 'rgba(34,211,238,.10)'; });
  button.addEventListener('click', () => window.dispatchEvent(new CustomEvent(OPEN_EVENT)));
  target.prepend(button);
}

function syncSidebarButton(): void {
  const button = document.getElementById('youtube-collections-guide-entry');
  if (!button) return;
  button.style.background = location.hash === EXTENSION_ROUTE_HASH ? 'rgba(34,211,238,.18)' : 'rgba(34,211,238,.10)';
  button.setAttribute('aria-current', location.hash === EXTENSION_ROUTE_HASH ? 'page' : 'false');
}

export default defineContentScript({
  matches: ['https://www.youtube.com/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',
  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'youtube-collections',
      position: 'overlay',
      anchor: 'body',
      onMount(container) {
        const app = document.createElement('div');
        container.append(app);
        const root = ReactDOM.createRoot(app);
        root.render(<React.StrictMode><ContentApp openEvent={OPEN_EVENT} /></React.StrictMode>);
        return root;
      },
      onRemove(root) { root?.unmount(); }
    });
    ui.mount();

    browser.runtime.onMessage.addListener((message) => {
      if ((message as { type?: string }).type === 'TOGGLE_PANEL') window.dispatchEvent(new CustomEvent(OPEN_EVENT));
    });

    let timer: number | undefined;
    let invalidated = false;
    const sendFromContent = async (message: Parameters<typeof sendMessage>[0]) => {
      if (invalidated) return;
      try { await sendMessage(message); }
      catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        if (detail.includes('Extension context invalidated')) {
          invalidated = true;
          observer.disconnect();
          if (timer) window.clearTimeout(timer);
          return;
        }
        throw error;
      }
    };
    const discover = async () => {
      if (invalidated) return;
      installSidebarButton();
      syncSidebarButton();
      const payload = scanYouTubePage();
      const listId = new URL(location.href).searchParams.get('list');
      const preferenceSource = listId === 'WL' ? 'watch-later' : listId === 'LL' ? 'liked' : undefined;
      if (payload.videos.length) await sendFromContent({ type: 'DISCOVER', payload: { ...payload, preferenceSource } });
    };
    const schedule = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => { void discover().catch((error) => console.warn('[YouTube Collections] Discovery failed', error)); }, 900);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    ctx.onInvalidated(() => { invalidated = true; observer.disconnect(); if (timer) clearTimeout(timer); });
    schedule();
    window.addEventListener('hashchange', syncSidebarButton);
    window.addEventListener('popstate', syncSidebarButton);
    window.addEventListener('youtube-collections:route-change', syncSidebarButton);

    const trackWatchedClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href*="watch?v="], a[href^="/shorts/"]') : null;
      if (!target) return;
      const url = new URL(target.href, location.origin);
      const videoId = url.searchParams.get('v') ?? (url.pathname.startsWith('/shorts/') ? url.pathname.split('/')[2] : undefined);
      if (videoId) void sendFromContent({ type: 'MARK_WATCHED', payload: { videoId, watched: true } }).catch((error) => console.warn('[YouTube Collections] Watch tracking failed', error));
    };
    document.addEventListener('click', trackWatchedClick, true);
    ctx.onInvalidated(() => {
      document.removeEventListener('click', trackWatchedClick, true);
      window.removeEventListener('hashchange', syncSidebarButton);
      window.removeEventListener('popstate', syncSidebarButton);
      window.removeEventListener('youtube-collections:route-change', syncSidebarButton);
      // A reloaded/updated extension cannot reuse the old isolated world. Refreshing
      // the host page is the only way Chrome can inject the new content script.
      window.setTimeout(() => location.reload(), 100);
    });
  }
});
