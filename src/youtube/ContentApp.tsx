import { ChevronDown, FolderKanban } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Dashboard from '@/entrypoints/popup/App';
import { EXTENSION_ROUTE_HASH } from '@/src/config';

export default function ContentApp({ openEvent }: { openEvent: string }) {
  const [open, setOpen] = useState(() => location.hash === EXTENSION_ROUTE_HASH);
  const [layout, setLayout] = useState({ top: 56, left: 72 });
  const openedByExtension = useRef(false);
  useEffect(() => {
    const syncRoute = () => setOpen(location.hash === EXTENSION_ROUTE_HASH);
    const listener = () => {
      if (location.hash === EXTENSION_ROUTE_HASH) return setOpen(true);
      openedByExtension.current = true;
      history.pushState({ ...history.state, youtubeCollections: true }, '', `/${EXTENSION_ROUTE_HASH}`);
      setOpen(true);
      window.dispatchEvent(new Event('youtube-collections:route-change'));
    };
    window.addEventListener(openEvent, listener);
    window.addEventListener('hashchange', syncRoute);
    window.addEventListener('popstate', syncRoute);
    return () => { window.removeEventListener(openEvent, listener); window.removeEventListener('hashchange', syncRoute); window.removeEventListener('popstate', syncRoute); };
  }, [openEvent]);
  useEffect(() => {
    const measure = () => {
      const masthead = document.querySelector('ytd-masthead')?.getBoundingClientRect();
      const guide = document.querySelector('ytd-app #guide, ytd-guide-renderer')?.getBoundingClientRect();
      setLayout({ top: Math.max(56, Math.round(masthead?.bottom ?? 56)), left: Math.max(72, Math.round(guide?.right ?? 72)) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.documentElement);
    window.addEventListener('yt-navigate-finish', measure);
    return () => { observer.disconnect(); window.removeEventListener('yt-navigate-finish', measure); };
  }, []);
  const closePage = () => {
    if (location.hash !== EXTENSION_ROUTE_HASH) return setOpen(false);
    if (openedByExtension.current) { openedByExtension.current = false; history.back(); }
    else { history.replaceState(history.state, '', '/'); setOpen(false); window.dispatchEvent(new Event('youtube-collections:route-change')); }
  };
  const dark = document.documentElement.hasAttribute('dark');
  return <div className={`ytc-root${open ? ' is-open is-page' : ''}`} style={{ '--ytc-top': `${layout.top}px`, '--ytc-left': `${layout.left}px` } as React.CSSProperties} data-theme={dark ? 'dark' : 'light'}>
    <button className="ytc-launcher" onClick={() => window.dispatchEvent(new CustomEvent(openEvent))} title="YouTube Collections"><FolderKanban size={21} /><ChevronDown size={13} /></button>
    {open && <section className="ytc-workspace" aria-label="YouTube Collections page"><Dashboard embedded onClose={closePage} /></section>}
  </div>;
}
