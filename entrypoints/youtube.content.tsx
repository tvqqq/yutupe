import React from 'react';
import ReactDOM from 'react-dom/client';
import { sendMessage } from '@/src/lib/client';
import { getCurrentPageChannel, scanYouTubePage } from '@/src/youtube/parser';
import ContentApp, { OPEN_QUICK_GROUP_EVENT } from '@/src/youtube/ContentApp';
import '@/src/ui/design-system.css';
import '@/entrypoints/popup/style.css';
import '@/src/youtube/content.css';
import { EXTENSION_BRAND_CYAN, EXTENSION_ROUTE_HASH } from '@/src/config';
import { getAssignedGroupIds, STORAGE_KEY } from '@/src/domain/state';
import type { AppState, Channel } from '@/src/domain/types';

const OPEN_EVENT = 'youtube-collections:open';
const BTN_ID = 'youtube-collections-add-to-groups-btn';

let cachedState: AppState | null = null;

function installSidebarButton(): void {
  const target = document.querySelector(
    'ytd-guide-renderer ytd-guide-section-renderer #items, #guide-inner-content ytd-guide-section-renderer #items, ytd-guide-section-renderer #items, ytd-mini-guide-renderer #items'
  );
  if (!target) return;

  const existing = document.getElementById('youtube-collections-guide-entry');
  if (existing && document.contains(existing) && existing.parentElement === target) {
    syncSidebarButton();
    return;
  }

  if (existing) {
    existing.remove();
  }

  const button = document.createElement('button');
  button.id = 'youtube-collections-guide-entry';
  button.type = 'button';
  button.innerHTML = '<span aria-hidden="true" style="font-size:16px;line-height:1;display:inline-flex;align-items:center;">✦</span><span style="font-weight:650;">YouTube Collections</span>';
  Object.assign(button.style, {
    width: 'calc(100% - 16px)',
    margin: '4px 8px',
    height: '40px',
    border: '0',
    borderRadius: '10px',
    background: 'rgba(34,211,238,.12)',
    color: EXTENSION_BRAND_CYAN,
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '0 14px',
    font: '650 14px "Roboto", Arial, sans-serif',
    cursor: 'pointer',
    textAlign: 'left',
    boxSizing: 'border-box',
    flexShrink: '0',
    transition: 'background 0.15s'
  });
  button.addEventListener('mouseenter', () => { button.style.background = 'rgba(34,211,238,.22)'; });
  button.addEventListener('mouseleave', () => { button.style.background = location.hash === EXTENSION_ROUTE_HASH ? 'rgba(34,211,238,.22)' : 'rgba(34,211,238,.12)'; });
  button.addEventListener('click', (e) => {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent(OPEN_EVENT));
  });
  target.prepend(button);
  syncSidebarButton();
}

function syncSidebarButton(): void {
  const button = document.getElementById('youtube-collections-guide-entry');
  if (!button) return;
  button.style.background = location.hash === EXTENSION_ROUTE_HASH ? 'rgba(34,211,238,.22)' : 'rgba(34,211,238,.12)';
  button.setAttribute('aria-current', location.hash === EXTENSION_ROUTE_HASH ? 'page' : 'false');
}

function getSubscribeButtonTarget(): { parent: Element; insertAfter?: Element | null } | null {
  // 1. YouTube Watch Page
  const owner = document.querySelector(
    '#above-the-fold #owner, #top-row #owner, ytd-watch-metadata #owner, #owner.ytd-watch-metadata, #owner'
  );
  if (owner) {
    const subBtn = owner.querySelector('#subscribe-button, ytd-subscribe-button-renderer');
    return { parent: owner, insertAfter: subBtn };
  }

  const subBtnDirect = document.querySelector(
    'ytd-watch-metadata #subscribe-button, #subscribe-button.ytd-watch-metadata, #subscribe-button'
  );
  if (subBtnDirect && subBtnDirect.parentElement) {
    return { parent: subBtnDirect.parentElement, insertAfter: subBtnDirect };
  }

  // 2. YouTube Channel Page
  const channelActions = document.querySelector(
    '.page-header-view-model-wiz__page-header-actions, yt-page-header-renderer .page-header-view-model-wiz__page-header-actions, ytd-c4-tabbed-header-renderer #subscribe-button, yt-page-header-renderer #subscribe-button, #page-header-container #subscribe-button'
  );
  if (channelActions) {
    if (channelActions.id === 'subscribe-button' && channelActions.parentElement) {
      return { parent: channelActions.parentElement, insertAfter: channelActions };
    }
    return { parent: channelActions };
  }

  return null;
}

function updateButtonAppearance(button: HTMLElement, assignedCount: number) {
  const isDark = document.documentElement.hasAttribute('dark');
  const currentTheme = isDark ? 'dark' : 'light';
  const prevCount = button.getAttribute('data-assigned-count');
  const prevTheme = button.getAttribute('data-applied-theme');

  if (prevCount === String(assignedCount) && prevTheme === currentTheme) {
    return;
  }

  const hasGroups = assignedCount > 0;
  button.setAttribute('data-assigned-count', String(assignedCount));
  button.setAttribute('data-applied-theme', currentTheme);
  button.setAttribute('title', hasGroups ? `Đang ở trong ${assignedCount} groups (Bấm để chỉnh sửa)` : 'Thêm kênh vào Groups (YouTube Collections)');

  const textEl = button.querySelector('.ytc-btn-text');
  if (textEl) {
    const nextText = hasGroups ? `Groups (${assignedCount})` : 'Add to groups';
    if (textEl.textContent !== nextText) {
      textEl.textContent = nextText;
    }
  }

  if (hasGroups) {
    button.style.background = isDark ? 'rgba(34, 211, 238, 0.16)' : 'rgba(6, 182, 212, 0.12)';
    button.style.color = isDark ? '#22d3ee' : '#0891b2';
    button.style.border = `1px solid ${isDark ? 'rgba(34, 211, 238, 0.4)' : 'rgba(6, 182, 212, 0.35)'}`;
  } else {
    button.style.background = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
    button.style.color = isDark ? '#f1f1f1' : '#0f0f0f';
    button.style.border = '1px solid transparent';
  }
}

function syncAddToGroupsButton(): void {
  const button = document.getElementById(BTN_ID);
  if (!button) return;

  const channel = getCurrentPageChannel(document);
  if (!channel || !cachedState) {
    updateButtonAppearance(button, 0);
    return;
  }

  const assigned = getAssignedGroupIds(cachedState, channel);
  updateButtonAppearance(button, assigned.length);
}

function installAddToGroupsButton(): void {
  const target = getSubscribeButtonTarget();
  if (!target) return;

  const existing = document.getElementById(BTN_ID) as HTMLButtonElement | null;
  if (existing && document.contains(existing) && existing.parentElement === target.parent) {
    syncAddToGroupsButton();
    return;
  }

  if (existing) {
    existing.remove();
  }

  const button = document.createElement('button');
  button.id = BTN_ID;
  button.type = 'button';
  button.className = 'ytc-add-to-groups-btn';
  button.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
      <line x1="12" y1="10" x2="12" y2="16"/>
      <line x1="9" y1="13" x2="15" y2="13"/>
    </svg>
    <span class="ytc-btn-text">Add to groups</span>
  `;

  Object.assign(button.style, {
    height: '36px',
    minHeight: '36px',
    borderRadius: '18px',
    border: '1px solid transparent',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '0 14px',
    font: '500 14px "Roboto", "Arial", sans-serif',
    cursor: 'pointer',
    margin: '0 4px 0 8px',
    verticalAlign: 'middle',
    boxSizing: 'border-box',
    whiteSpace: 'nowrap',
    flexShrink: '0',
    zIndex: '10',
    position: 'relative',
    lineHeight: '36px',
    transition: 'background 0.15s, border-color 0.15s, color 0.15s'
  });

  button.addEventListener('mouseenter', () => {
    const isDark = document.documentElement.hasAttribute('dark');
    const count = Number(button.getAttribute('data-assigned-count') || 0);
    if (count > 0) {
      button.style.background = isDark ? 'rgba(34, 211, 238, 0.25)' : 'rgba(6, 182, 212, 0.2)';
    } else {
      button.style.background = isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)';
    }
  });

  button.addEventListener('mouseleave', () => {
    const count = Number(button.getAttribute('data-assigned-count') || 0);
    updateButtonAppearance(button, count);
  });

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    event.preventDefault();
    const channel = getCurrentPageChannel(document);
    if (channel) {
      window.dispatchEvent(new CustomEvent(OPEN_QUICK_GROUP_EVENT, { detail: { channel } }));
    } else {
      const fallbackTitle = document.querySelector('h1.ytd-watch-metadata, #title h1')?.textContent?.trim() || document.title;
      const fallbackChannel: Channel = {
        id: `channel:${location.pathname}`,
        title: fallbackTitle,
        url: location.href,
        lastSeenAt: new Date().toISOString(),
        status: 'active',
        tags: []
      };
      window.dispatchEvent(new CustomEvent(OPEN_QUICK_GROUP_EVENT, { detail: { channel: fallbackChannel } }));
    }
  });

  if (target.insertAfter && target.insertAfter.nextElementSibling) {
    target.parent.insertBefore(button, target.insertAfter.nextElementSibling);
  } else {
    target.parent.appendChild(button);
  }

  syncAddToGroupsButton();
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

    // Load initial storage state for button badge sync
    browser.storage.local.get(STORAGE_KEY).then((stored) => {
      cachedState = (stored[STORAGE_KEY] as AppState | undefined) ?? null;
      syncAddToGroupsButton();
    }).catch(() => undefined);

    const onStorageChange = (changes: Record<string, Browser.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[STORAGE_KEY]?.newValue) {
        cachedState = changes[STORAGE_KEY].newValue as AppState;
        syncAddToGroupsButton();
      }
    };
    browser.storage.onChanged.addListener(onStorageChange);

    browser.runtime.onMessage.addListener((message) => {
      if ((message as { type?: string }).type === 'TOGGLE_PANEL') window.dispatchEvent(new CustomEvent(OPEN_EVENT));
    });

    let timer: number | undefined;
    let invalidated = false;

    const installUI = () => {
      if (invalidated) return;
      installSidebarButton();
      syncSidebarButton();
      installAddToGroupsButton();
      syncAddToGroupsButton();
    };

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
      installUI();
      if (location.hash === EXTENSION_ROUTE_HASH) return;
      const payload = scanYouTubePage();
      const listId = new URL(location.href).searchParams.get('list');
      const preferenceSource = listId === 'WL' ? 'watch-later' : listId === 'LL' ? 'liked' : undefined;
      if (payload.videos.length) await sendFromContent({ type: 'DISCOVER', payload: { ...payload, preferenceSource } });
    };

    const schedule = () => {
      if (invalidated) return;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void discover().catch((error) => console.warn('[YouTube Collections] Discovery failed', error));
      }, 600);
    };

    const observer = new MutationObserver(() => {
      schedule();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    const intervalId = window.setInterval(installUI, 1000);

    ctx.onInvalidated(() => {
      invalidated = true;
      observer.disconnect();
      if (timer) clearTimeout(timer);
      window.clearInterval(intervalId);
      browser.storage.onChanged.removeListener(onStorageChange);
    });

    installUI();
    schedule();

    const onNavChange = () => {
      installUI();
      schedule();
    };

    window.addEventListener('hashchange', onNavChange);
    window.addEventListener('popstate', onNavChange);
    window.addEventListener('yt-navigate-finish', onNavChange);
    window.addEventListener('yt-page-data-updated', onNavChange);
    window.addEventListener('youtube-collections:route-change', onNavChange);

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
      window.removeEventListener('hashchange', onNavChange);
      window.removeEventListener('popstate', onNavChange);
      window.removeEventListener('yt-navigate-finish', onNavChange);
      window.removeEventListener('yt-page-data-updated', onNavChange);
      window.removeEventListener('youtube-collections:route-change', onNavChange);
      window.setTimeout(() => location.reload(), 100);
    });
  }
});

