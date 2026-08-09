import { Bell, Check, Download, FolderKanban, LayoutGrid, Plus, RefreshCw, Settings as SettingsIcon, Sparkles, Trash2, Upload, Users, X, Youtube } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppMessage, AppResponse } from '@/src/domain/messages';
import { groupChannelCount } from '@/src/domain/state';
import type { AppState, AuthStatus, Channel, Group } from '@/src/domain/types';
import { EmptyState, FeedView, GroupIcon } from '@/src/ui/common';
import { useAppState } from '@/src/ui/use-app-state';

type Tab = 'feed' | 'groups' | 'channels' | 'settings';
const ICONS = ['📁', '💻', '🎮', '🎵', '🎓', '📰', '💰', '🏃', '🍳', '✈️', '🎨', '🔬'];
const COLORS = ['#22d3ee', '#38bdf8', '#818cf8', '#a78bfa', '#f472b6', '#fb7185', '#fb923c', '#facc15', '#4ade80'];

function classifyChannel(title: string): string[] {
  const text = title.toLocaleLowerCase();
  const rules: Array<[string, RegExp]> = [
    ['Tech', /tech|code|dev|software|lập trình|công nghệ/], ['Gaming', /game|gaming|esport/],
    ['Music', /music|records|official artist|âm nhạc|nhạc/], ['Education', /academy|learn|school|education|học|giáo dục/],
    ['News', /news|daily|times|tin tức/], ['Finance', /finance|invest|stock|crypto|tài chính|chứng khoán/],
    ['Fitness', /fitness|gym|workout|yoga/], ['Food', /food|cook|kitchen|ẩm thực|nấu ăn/], ['Travel', /travel|trip|du lịch/]
  ];
  return rules.filter(([, pattern]) => pattern.test(text)).map(([tag]) => tag);
}

function Header({ tab, setTab, state, onClose }: { tab: Tab; setTab: (tab: Tab) => void; state: AppState; onClose?: () => void }) {
  const items: Array<[Tab, string, React.ReactNode, number | null]> = [
    ['feed', 'Feed', <LayoutGrid size={17} />, state.videos.length],
    ['groups', 'Groups', <FolderKanban size={17} />, state.groups.length],
    ['channels', 'Channels', <Users size={17} />, state.channels.length],
    ['settings', 'Cài đặt', <SettingsIcon size={17} />, null]
  ];
  return <header className="app-header">
    <div className="brand"><span className="brand-mark"><Youtube size={20} /></span><div><strong>YouTube Collections</strong><small>Focused subscription feed</small></div></div>
    <nav>{items.map(([id, label, icon, count]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{icon}{label}{count !== null && <span>{count}</span>}</button>)}{onClose && <button title="Đóng workspace" onClick={onClose}><X size={18} /></button>}</nav>
  </header>;
}

function GroupForm({ group, onClose, act }: { group?: Group; onClose: () => void; act: (message: AppMessage) => Promise<unknown> }) {
  const [name, setName] = useState(group?.name ?? '');
  const [icon, setIcon] = useState(group?.icon ?? '📁');
  const [color, setColor] = useState(group?.color ?? COLORS[0]!);
  const [iconDataUrl, setIconDataUrl] = useState(group?.iconDataUrl);
  const [error, setError] = useState('');
  const pickFile = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 200_000) return setError('Icon phải là ảnh nhỏ hơn 200 KB.');
    const reader = new FileReader();
    reader.onload = () => setIconDataUrl(String(reader.result));
    reader.readAsDataURL(file);
  };
  const save = async () => {
    if (!name.trim()) return setError('Hãy nhập tên group.');
    await act({ type: 'UPSERT_GROUP', payload: { ...group, name, icon, color, iconDataUrl } });
    onClose();
  };
  return <div className="modal-backdrop"><section className="modal">
    <div className="section-title"><div><h2>{group ? 'Sửa group' : 'Tạo group'}</h2><p>Một channel có thể thuộc nhiều group.</p></div><button className="ghost" onClick={onClose}>Đóng</button></div>
    <label className="form-label">Tên group<input className="field" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ví dụ: Tech & AI" /></label>
    <div className="form-label">Icon<div className="icon-picker">{ICONS.map((item) => <button key={item} className={icon === item && !iconDataUrl ? 'selected' : ''} onClick={() => { setIcon(item); setIconDataUrl(undefined); }}>{item}</button>)}<label className="upload-icon">{iconDataUrl ? <img src={iconDataUrl} alt="Custom icon" /> : <Upload size={17} />}<input type="file" accept="image/*" onChange={(event) => pickFile(event.target.files?.[0])} /></label></div></div>
    <div className="form-label">Màu<div className="color-picker">{COLORS.map((item) => <button key={item} className={color === item ? 'selected' : ''} style={{ background: item }} onClick={() => setColor(item)} aria-label={`Màu ${item}`} />)}</div></div>
    {error && <p className="error-text">{error}</p>}
    <div className="modal-actions"><button className="secondary" onClick={onClose}>Hủy</button><button className="primary" onClick={() => void save()}><Check size={16} />Lưu group</button></div>
  </section></div>;
}

function GroupsPage({ state, act }: { state: AppState; act: (message: AppMessage) => Promise<unknown> }) {
  const [editing, setEditing] = useState<Group | 'new' | null>(null);
  return <section className="page">
    <div className="section-title"><div><h1>Groups</h1><p>Tổ chức subscription thành các bộ sưu tập theo chủ đề.</p></div><button className="primary" onClick={() => setEditing('new')}><Plus size={16} />Tạo group</button></div>
    {!state.groups.length ? <EmptyState title="Chưa có group" detail="Tạo group đầu tiên, sau đó mở Channels để thêm kênh." /> : <div className="group-grid">{state.groups.map((group) => <article className="group-card" key={group.id}>
      <GroupIcon group={group} size={42} /><div className="group-card-body"><strong>{group.name}</strong><span>{groupChannelCount(group, state.channels)} channels</span></div>
      <label className="switch-row"><Bell size={14} />Thông báo<input type="checkbox" checked={group.notifications} onChange={() => void act({ type: 'UPSERT_GROUP', payload: { ...group, notifications: !group.notifications } })} /></label>
      <div className="group-card-actions"><button className="secondary small" onClick={() => setEditing(group)}>Chỉnh sửa</button><button className="ghost danger-text" title="Xóa group" onClick={() => confirm(`Xóa group “${group.name}”?`) && void act({ type: 'DELETE_GROUP', payload: { groupId: group.id } })}><Trash2 size={15} /></button></div>
    </article>)}</div>}
    {editing && <GroupForm group={editing === 'new' ? undefined : editing} act={act} onClose={() => setEditing(null)} />}
  </section>;
}

function ChannelRow({ channel, state, act, selected, onSelect }: { channel: Channel; state: AppState; act: (message: AppMessage) => Promise<unknown>; selected: boolean; onSelect: () => void }) {
  const [tagInput, setTagInput] = useState(channel.tags.join(', '));
  const assigned = state.groups.filter((group) => group.channelIds.includes(channel.id)).map((group) => group.id);
  const toggleGroup = (groupId: string) => {
    const groupIds = assigned.includes(groupId) ? assigned.filter((id) => id !== groupId) : [...assigned, groupId];
    void act({ type: 'SET_CHANNEL_GROUPS', payload: { channelId: channel.id, groupIds } });
  };
  const smartTags = classifyChannel(channel.title);
  return <article className="channel-row">
    <input aria-label={`Chọn ${channel.title}`} type="checkbox" checked={selected} onChange={onSelect} />
    <div className="channel-identity">{channel.thumbnailUrl ? <img src={channel.thumbnailUrl} alt="" /> : <span>{channel.title.slice(0, 1).toUpperCase()}</span>}<div><a href={channel.url} target="_blank" rel="noreferrer">{channel.title}</a><small>{channel.status} · thấy gần đây</small></div></div>
    <div className="channel-groups">{state.groups.length ? state.groups.map((group) => <button key={group.id} className={assigned.includes(group.id) ? 'selected' : ''} onClick={() => toggleGroup(group.id)}><GroupIcon group={group} size={18} />{group.name}</button>) : <span className="muted">Tạo group trước</span>}</div>
    <div className="tag-editor"><input className="field" value={tagInput} onChange={(event) => setTagInput(event.target.value)} onBlur={() => void act({ type: 'UPDATE_CHANNEL_TAGS', payload: { channelId: channel.id, tags: tagInput.split(',') } })} placeholder="Tags, cách nhau bằng dấu phẩy" />{smartTags.length > 0 && <button className="spark-button" title="Gợi ý cục bộ" onClick={() => { const tags = [...new Set([...channel.tags, ...smartTags])]; setTagInput(tags.join(', ')); void act({ type: 'UPDATE_CHANNEL_TAGS', payload: { channelId: channel.id, tags } }); }}><Sparkles size={15} />Local</button>}{state.settings.cloudApiBaseUrl && <button className="spark-button" title="Gợi ý bằng AI cloud" onClick={() => void act({ type: 'AI_TAG_CHANNEL', payload: { channelId: channel.id } }).catch((error) => alert(error instanceof Error ? error.message : 'AI tagging thất bại'))}><Sparkles size={15} />AI</button>}</div>
    <button className="ghost danger-text" title="Chỉ xóa dữ liệu local, không unsubscribe YouTube" onClick={() => confirm(`Xóa dữ liệu local của “${channel.title}”? Việc này không unsubscribe trên YouTube.`) && void act({ type: 'REMOVE_CHANNEL_LOCAL', payload: { channelId: channel.id } })}><Trash2 size={16} /></button>
  </article>;
}

function ChannelsPage({ state, act }: { state: AppState; act: (message: AppMessage) => Promise<unknown> }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'az' | 'recent'>('az');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const channels = useMemo(() => state.channels.filter((channel) => `${channel.title} ${channel.tags.join(' ')}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => sort === 'az' ? a.title.localeCompare(b.title) : Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt)), [state.channels, query, sort]);
  return <section className="page">
    <div className="section-title"><div><h1>Channels</h1><p>Gán group, AI tags, sync subscription và unsubscribe thật.</p></div><div className="channel-actions"><button className="secondary small" disabled={busy} onClick={() => { setBusy(true); void act({ type: 'SYNC_YOUTUBE_SUBSCRIPTIONS' }).catch((error) => alert(error instanceof Error ? error.message : 'Sync thất bại')).finally(() => setBusy(false)); }}><RefreshCw size={14} />Sync YouTube</button><button className="secondary small" disabled={busy} onClick={() => { setBusy(true); void act({ type: 'REFRESH_YOUTUBE_FEED', payload: { groupId: null } }).catch((error) => alert(error instanceof Error ? error.message : 'Refresh thất bại')).finally(() => setBusy(false)); }}>Refresh feed</button>{selected.size > 0 && <button className="danger-button small" disabled={busy} onClick={() => { const names = state.channels.filter((item) => selected.has(item.id)).map((item) => item.title); if (!confirm(`UNSUBSCRIBE thật ${names.length} channel trên YouTube?\n\n${names.join('\n')}`)) return; setBusy(true); void act({ type: 'UNSUBSCRIBE_CHANNELS', payload: { channelIds: [...selected] } }).then(() => setSelected(new Set())).catch((error) => alert(error instanceof Error ? error.message : 'Unsubscribe thất bại')).finally(() => setBusy(false)); }}><Trash2 size={14} />Unsubscribe {selected.size}</button>}</div></div>
    <div className="channel-toolbar"><input className="field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm channel hoặc tag…" /><select value={sort} onChange={(event) => setSort(event.target.value as 'az' | 'recent')}><option value="az">A–Z</option><option value="recent">Hoạt động gần đây</option></select></div>
    {!channels.length ? <EmptyState title="Chưa tìm thấy channel" detail="Kết nối Google rồi bấm Sync YouTube, hoặc cuộn trang YouTube để thu thập local." /> : <div className="channel-list">{channels.map((channel) => <ChannelRow key={channel.id} channel={channel} state={state} act={act} selected={selected.has(channel.id)} onSelect={() => setSelected((current) => { const next = new Set(current); if (next.has(channel.id)) next.delete(channel.id); else next.add(channel.id); return next; })} />)}</div>}
  </section>;
}

function IntegrationsPanel({ state, act }: { state: AppState; act: (message: AppMessage) => Promise<unknown> }) {
  const [auth, setAuth] = useState<AuthStatus>({ connected: false });
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const manifestClientId = browser.runtime.getManifest().oauth2?.client_id;
  const hasGoogleClientId = Boolean(manifestClientId || state.settings.googleClientId.trim());
  const run = async (label: string, message: AppMessage) => {
    setBusy(label); setNotice('');
    try {
      const response = await act(message) as AppResponse;
      if (response.authStatus) setAuth(response.authStatus);
      const feedReport = response.data as { videoCount?: number; skippedChannels?: Array<{ channelTitle: string }> } | undefined;
      const skipped = feedReport?.skippedChannels ?? [];
      setNotice(skipped.length
        ? `${label}: tải ${feedReport?.videoCount ?? 0} video; bỏ qua ${skipped.length} channel không còn uploads playlist (${skipped.map((item) => item.channelTitle).join(', ')}).`
        : `${label}: hoàn tất${feedReport?.videoCount !== undefined ? `, tải ${feedReport.videoCount} video` : ''}.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : `${label}: thất bại.`); }
    finally { setBusy(''); }
  };
  useEffect(() => { void act({ type: 'GET_AUTH_STATUS' }).then((response) => { const status = (response as AppResponse).authStatus; if (status) setAuth(status); }); }, [act]);
  return <div className="integration-section">
    <div className="section-title"><div><h2>Google & Cloud integrations</h2><p>OAuth token chỉ lưu trong browser session và phải kết nối lại sau khi restart.</p></div><span className={auth.connected ? 'status-badge connected' : 'status-badge'}>{auth.connected ? auth.email || 'Connected' : 'Not connected'}</span></div>
    <label className="form-label">Google OAuth Client ID<input className="field" value={state.settings.googleClientId} placeholder={manifestClientId ? 'Đã cấu hình trong manifest build' : '...apps.googleusercontent.com'} onChange={(event) => void act({ type: 'UPDATE_SETTINGS', payload: { googleClientId: event.target.value } })} /></label>
    <label className="form-label">Cloud API Base URL<input className="field" value={state.settings.cloudApiBaseUrl} placeholder="https://api.example.com" onChange={(event) => void act({ type: 'UPDATE_SETTINGS', payload: { cloudApiBaseUrl: event.target.value } })} /></label>
    <label className="form-label">Số channel tối đa mỗi lần refresh feed<input className="field" type="number" min="1" max="100" value={state.settings.youtubeSyncChannelLimit} onChange={(event) => void act({ type: 'UPDATE_SETTINGS', payload: { youtubeSyncChannelLimit: Math.max(1, Math.min(100, Number(event.target.value) || 25)) } })} /></label>
    <div className="integration-actions">
      {!auth.connected ? <button className="primary" disabled={Boolean(busy) || !hasGoogleClientId} onClick={() => void run('Kết nối Google', { type: 'CONNECT_GOOGLE' })}>Kết nối Google</button> : <button className="secondary" disabled={Boolean(busy)} onClick={() => void run('Ngắt kết nối', { type: 'DISCONNECT_GOOGLE' })}>Ngắt kết nối</button>}
      <button className="secondary" disabled={Boolean(busy) || !auth.connected} onClick={() => void run('Sync subscriptions', { type: 'SYNC_YOUTUBE_SUBSCRIPTIONS' })}>Sync subscriptions</button>
      <button className="secondary" disabled={Boolean(busy) || !auth.connected} onClick={() => void run('Refresh API feed', { type: 'REFRESH_YOUTUBE_FEED', payload: { groupId: null } })}>Refresh feed</button>
      <button className="secondary" disabled={Boolean(busy) || !auth.connected} onClick={() => void run('Drive backup', { type: 'DRIVE_PUSH' })}>Push Drive</button>
      <button className="secondary" disabled={Boolean(busy) || !auth.connected} onClick={() => confirm('Pull Drive sẽ thay thế groups, channel assignments và watched state hiện tại. Tiếp tục?') && void run('Drive restore', { type: 'DRIVE_PULL' })}>Pull Drive</button>
      <button className="secondary" disabled={Boolean(busy) || !state.settings.cloudApiBaseUrl} onClick={() => void run('Cloud permission', { type: 'GRANT_CLOUD_PERMISSION', payload: { baseUrl: state.settings.cloudApiBaseUrl } })}>Cho phép Cloud API</button>
      <button className="secondary" disabled={Boolean(busy) || !auth.connected || !state.settings.cloudApiBaseUrl} onClick={() => void run('WebSub registration', { type: 'REGISTER_WEBSUB' })}>Register WebSub</button>
      <button className="secondary" disabled={Boolean(busy) || !auth.connected || !state.settings.cloudApiBaseUrl} onClick={() => void run('Cloud events', { type: 'POLL_CLOUD_EVENTS' })}>Poll cloud events</button>
    </div>
    {notice && <p className="integration-notice">{notice}</p>}
    <p className="integration-meta">YouTube sync: {state.settings.lastYoutubeSyncAt ?? 'chưa chạy'} · Drive sync: {state.settings.lastDriveSyncAt ?? 'chưa chạy'}</p>
  </div>;
}

function SettingsPage({ state, act }: { state: AppState; act: (message: AppMessage) => Promise<unknown> }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const exportData = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `youtube-collections-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url);
  };
  const importData = async (file?: File) => {
    if (!file) return;
    try { await act({ type: 'IMPORT_STATE', payload: JSON.parse(await file.text()) }); } catch (error) { alert(error instanceof Error ? error.message : 'Import thất bại'); }
  };
  return <section className="page settings-page">
    <div className="section-title"><div><h1>Cài đặt</h1><p>Giao diện, watched state, notifications và backup.</p></div></div>
    <div className="settings-card"><div><strong>Giao diện</strong><span>Theo hệ thống, sáng hoặc tối.</span></div><select value={state.settings.theme} onChange={(event) => void act({ type: 'UPDATE_SETTINGS', payload: { theme: event.target.value as AppState['settings']['theme'] } })}><option value="system">Hệ thống</option><option value="light">Sáng</option><option value="dark">Tối</option></select></div>
    <div className="settings-card"><div><strong>Ẩn video đã xem</strong><span>Video vẫn còn trong backup và bộ lọc “Đã xem”.</span></div><input type="checkbox" checked={state.settings.hideWatched} onChange={() => void act({ type: 'UPDATE_SETTINGS', payload: { hideWatched: !state.settings.hideWatched } })} /></div>
    <div className="settings-card"><div><strong>Thông báo local</strong><span>Chỉ hoạt động khi YouTube đang mở và phát hiện video mới thuộc group bật thông báo.</span></div><input type="checkbox" checked={state.settings.notificationsEnabled} onChange={() => void act({ type: 'UPDATE_SETTINGS', payload: { notificationsEnabled: !state.settings.notificationsEnabled } })} /></div>
    <div className="settings-card backup-card"><div><strong>Backup dữ liệu</strong><span>Export/import JSON gồm groups, channels và watched state.</span></div><div><button className="secondary" onClick={exportData}><Download size={16} />Export</button><button className="secondary" onClick={() => fileRef.current?.click()}><Upload size={16} />Import</button><input ref={fileRef} hidden type="file" accept="application/json" onChange={(event) => void importData(event.target.files?.[0])} /></div></div>
    <div className="settings-card danger-zone"><div><strong>Reset extension</strong><span>Xóa toàn bộ dữ liệu local. Không thể hoàn tác nếu chưa export.</span></div><button className="danger-button" onClick={() => confirm('Xóa toàn bộ dữ liệu local?') && void act({ type: 'RESET_STATE' })}><Trash2 size={16} />Reset</button></div>
    <div className="mvp-note"><Sparkles size={18} /><div><strong>Local-first + optional cloud</strong><p>OAuth, YouTube API và Drive chạy trực tiếp với Google. AI/WebSub dùng Cloud API riêng để giữ secret và webhook ngoài extension.</p></div></div>
    <IntegrationsPanel state={state} act={act} />
  </section>;
}

export default function App({ embedded = false, onClose }: { embedded?: boolean; onClose?: () => void }) {
  const { state, error, act, refresh } = useAppState();
  const [tab, setTab] = useState<Tab>('feed');
  if (error) return <main className="boot"><strong>Không tải được extension</strong><span>{error}</span><button className="primary" onClick={() => void refresh()}><RefreshCw size={16} />Thử lại</button></main>;
  if (!state) return <main className="boot"><RefreshCw className="spin" /><span>Đang chuẩn bị collections…</span></main>;
  const theme = state.settings.theme === 'system'
    ? (document.documentElement.hasAttribute('dark') ? 'dark' : 'light')
    : state.settings.theme;
  return <div className={`dashboard theme-${theme}${embedded ? ' embedded' : ''}`}><Header tab={tab} setTab={setTab} state={state} onClose={onClose} /><main className="app-main">{tab === 'feed' && <FeedView state={state} act={act} />}{tab === 'groups' && <GroupsPage state={state} act={act} />}{tab === 'channels' && <ChannelsPage state={state} act={act} />}{tab === 'settings' && <SettingsPage state={state} act={act} />}</main></div>;
}
