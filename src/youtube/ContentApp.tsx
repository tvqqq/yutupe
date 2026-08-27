import { useEffect, useRef, useState } from 'react';
import Dashboard from '@/entrypoints/popup/App';
import { EXTENSION_ROUTE_HASH } from '@/src/config';
import type { Channel } from '@/src/domain/types';
import { useAppState } from '@/src/ui/use-app-state';
import { QuickGroupModal } from './QuickGroupModal';

export const OPEN_QUICK_GROUP_EVENT = 'youtube-collections:open-quick-group';

export default function ContentApp({ openEvent }: { openEvent: string }) {
  const [open, setOpen] = useState(() => location.hash === EXTENSION_ROUTE_HASH);
  const [layout, setLayout] = useState({ top: 56, left: 72 });
  const [quickChannel, setQuickChannel] = useState<Channel | null>(null);
  const openedByExtension = useRef(false);
  const { state, act } = useAppState();

  const openDashboard = () => {
    if (location.hash === EXTENSION_ROUTE_HASH) return setOpen(true);
    openedByExtension.current = true;
    history.pushState({ ...history.state, youtubeCollections: true }, '', `/${EXTENSION_ROUTE_HASH}`);
    setOpen(true);
    window.dispatchEvent(new Event('youtube-collections:route-change'));
  };

  useEffect(() => {
    const syncRoute = () => setOpen(location.hash === EXTENSION_ROUTE_HASH);
    const listener = () => openDashboard();
    const quickListener = (event: Event) => {
      const customEvent = event as CustomEvent<{ channel: Channel }>;
      if (customEvent.detail?.channel) {
        setQuickChannel(customEvent.detail.channel);
      }
    };

    window.addEventListener(openEvent, listener);
    window.addEventListener(OPEN_QUICK_GROUP_EVENT, quickListener);
    window.addEventListener('hashchange', syncRoute);
    window.addEventListener('popstate', syncRoute);
    return () => {
      window.removeEventListener(openEvent, listener);
      window.removeEventListener(OPEN_QUICK_GROUP_EVENT, quickListener);
      window.removeEventListener('hashchange', syncRoute);
      window.removeEventListener('popstate', syncRoute);
    };
  }, [openEvent]);

  useEffect(() => {
    const measure = () => {
      const masthead = document.querySelector('ytd-masthead')?.getBoundingClientRect();
      const guide = document.querySelector('ytd-app #guide, ytd-guide-renderer')?.getBoundingClientRect();
      const nextTop = Math.max(56, Math.round(masthead?.bottom ?? 56));
      const nextLeft = Math.max(72, Math.round(guide?.right ?? 72));
      setLayout((prev) => (prev.top === nextTop && prev.left === nextLeft ? prev : { top: nextTop, left: nextLeft }));
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('yt-navigate-finish', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('yt-navigate-finish', measure);
    };
  }, []);

  useEffect(() => {
    if (!open && !quickChannel) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (quickChannel) {
          event.stopPropagation();
          event.stopImmediatePropagation();
          setQuickChannel(null);
          return;
        }
        if (open) {
          closePage();
          return;
        }
      }
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.closest('.ytc-quick-modal-card') || target.closest('.ytc-root'))) {
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.closest('.ytc-quick-modal-card') || target.closest('.ytc-root'))) {
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    window.addEventListener('keypress', handleKeyUp, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      window.removeEventListener('keypress', handleKeyUp, true);
    };
  }, [open, quickChannel]);

  const closePage = () => {
    if (location.hash !== EXTENSION_ROUTE_HASH) return setOpen(false);
    if (openedByExtension.current) { openedByExtension.current = false; history.back(); }
    else { history.replaceState(history.state, '', '/'); setOpen(false); window.dispatchEvent(new Event('youtube-collections:route-change')); }
  };

  const dark = document.documentElement.hasAttribute('dark');

  return (
    <>
      {open && (
        <div className="ytc-root is-open is-page" style={{ '--ytc-top': `${layout.top}px`, '--ytc-left': `${layout.left}px` } as React.CSSProperties} data-theme={dark ? 'dark' : 'light'}>
          <section className="ytc-workspace" aria-label="YouTube Collections page">
            <Dashboard embedded onClose={closePage} />
          </section>
        </div>
      )}
      {quickChannel && state && (
        <div className="ytc-root is-modal-root" data-theme={dark ? 'dark' : 'light'}>
          <QuickGroupModal
            channel={quickChannel}
            state={state}
            act={act}
            onClose={() => setQuickChannel(null)}
          />
        </div>
      )}
    </>
  );
}

