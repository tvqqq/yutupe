import { ChevronDown, FolderKanban } from 'lucide-react';
import { useEffect, useState } from 'react';
import Dashboard from '@/entrypoints/popup/App';

export default function ContentApp({ openEvent }: { openEvent: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const listener = () => setOpen(true);
    window.addEventListener(openEvent, listener);
    return () => window.removeEventListener(openEvent, listener);
  }, [openEvent]);
  const dark = document.documentElement.hasAttribute('dark');
  return <div className={`ytc-root${open ? ' is-open' : ''}`} data-theme={dark ? 'dark' : 'light'}>
    <button className="ytc-launcher" onClick={() => setOpen((value) => !value)} title="YouTube Collections"><FolderKanban size={21} /><ChevronDown size={13} /></button>
    {open && <section className="ytc-workspace"><Dashboard embedded onClose={() => setOpen(false)} /></section>}
  </div>;
}
