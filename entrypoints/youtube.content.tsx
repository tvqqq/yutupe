import React from 'react';
import ReactDOM from 'react-dom/client';
import { sendMessage } from '@/src/lib/client';
import { scanYouTubePage } from '@/src/youtube/parser';
import ContentApp from '@/src/youtube/ContentApp';
import '@/src/ui/design-system.css';
import '@/entrypoints/popup/style.css';
import '@/src/youtube/content.css';

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
    background: 'transparent', color: 'inherit', display: 'flex', alignItems: 'center', gap: '20px',
    padding: '0 14px', font: '500 14px Roboto, Arial, sans-serif', cursor: 'pointer', textAlign: 'left'
  });
  button.addEventListener('mouseenter', () => { button.style.background = 'rgba(127,127,127,.16)'; });
  button.addEventListener('mouseleave', () => { button.style.background = 'transparent'; });
  button.addEventListener('click', () => window.dispatchEvent(new CustomEvent(OPEN_EVENT)));
  target.prepend(button);
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
    const discover = async () => {
      installSidebarButton();
      const payload = scanYouTubePage();
      if (payload.videos.length) await sendMessage({ type: 'DISCOVER', payload });
    };
    const schedule = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => void discover(), 900);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    ctx.onInvalidated(() => { observer.disconnect(); if (timer) clearTimeout(timer); });
    schedule();

    document.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href*="watch?v="], a[href^="/shorts/"]') : null;
      if (!target) return;
      const url = new URL(target.href, location.origin);
      const videoId = url.searchParams.get('v') ?? (url.pathname.startsWith('/shorts/') ? url.pathname.split('/')[2] : undefined);
      if (videoId) void sendMessage({ type: 'MARK_WATCHED', payload: { videoId, watched: true } });
    }, true);
  }
});
