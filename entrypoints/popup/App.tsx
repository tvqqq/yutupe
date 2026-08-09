import { ArrowDown, ArrowUp, Bell, Check, Download, FolderKanban, LayoutGrid, Plus, RefreshCw, Settings as SettingsIcon, Sparkles, Trash2, Upload, Users, X, Youtube } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppMessage, AppResponse } from '@/src/domain/messages';
import { groupChannelCount } from '@/src/domain/state';
import type { AppState, AuthStatus, Channel, Group, Video } from '@/src/domain/types';
import { EmptyState, FeedView, GroupIcon, VideoCard } from '@/src/ui/common';
import { useAppState } from '@/src/ui/use-app-state';

type Tab = 'feed' | 'suggestions' | 'groups' | 'channels' | 'settings';
const ICONS = ['📁', '💻', '🎮', '🎵', '🎓', '📰', '💰', '🏃', '🍳', '✈️', '🎨', '🔬'];
const COLORS = ['#22d3ee', '#38bdf8', '#818cf8', '#a78bfa', '#f472b6', '#fb7185', '#fb923c', '#facc15', '#4ade80'];

function Header({ tab, setTab, state, onClose }: { tab: Tab; setTab: (tab: Tab) => void; state: AppState; onClose?: () => void }) {
  const items: Array<[Tab, string, React.ReactNode, number | null]> = [
    ['feed', 'Feed', <LayoutGrid size={17} />, state.videos.length],
    ['suggestions', 'Gợi ý', <Sparkles size={17} />, null],
    ['groups', 'Groups', <FolderKanban size={17} />, state.groups.length],
    ['channels', 'Channels', <Users size={17} />, state.channels.length],
    ['settings', 'Cài đặt', <SettingsIcon size={17} />, null]
  ];
  return <header className="app-header">
    <div className="brand"><span className="brand-mark"><Youtube size={20} /></span><div><strong>YouTube Collections</strong><small>Focused subscription feed</small></div></div>
    <nav>{items.map(([id, label, icon, count]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{icon}{label}{count !== null && <span>{count}</span>}</button>)}{onClose && <button title="Đóng workspace" onClick={onClose}><X size={18} /></button>}</nav>
  </header>;
}

function SuggestionsPage({ state, act }: { state: AppState; act: (message: AppMessage) => Promise<unknown> }) {
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [videos, setVideos] = useState<Video[]>([]);
  const [busy, setBusy] = useState(false);
  const load = (value?: string) => {
    setBusy(true);
    void act({ type: 'FETCH_SUGGESTIONS', payload: { query: value?.trim() || undefined } }).then((response) => {
      const data = (response as AppResponse).data as { query: string; videos: Video[] };
      setActiveQuery(data.query); setVideos(data.videos);
    }).catch((error) => alert(error instanceof Error ? error.message : 'Không thể tải video gợi ý')).finally(() => setBusy(false));
  };
  useEffect(() => { load(); }, []);
  const topics = state.groups.slice().sort((a, b) => b.channelIds.length - a.channelIds.length).slice(0, 8).map((group) => group.name);
  return <section className="page suggestions-page"><div className="section-title"><div><h1>Trending dành cho bạn</h1><p>Video phổ biến gần đây dựa trên groups, lịch sử xem local hoặc chủ đề bạn nhập.</p></div></div><form className="suggest-search" onSubmit={(event) => { event.preventDefault(); load(query); }}><input className="field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Bạn muốn xem nội dung gì?" /><button className="primary" disabled={busy}>{busy ? 'Đang tìm…' : 'Tìm video trending'}</button></form>{topics.length > 0 && <div className="suggest-topics">{topics.map((topic) => <button className="chip" key={topic} onClick={() => { setQuery(topic); load(topic); }}>{topic}</button>)}</div>}<div className="feed-heading"><span>Chủ đề: <strong>{activeQuery || 'đang phân tích…'}</strong></span><span>{videos.length} video</span></div>{!videos.length ? <EmptyState title={busy ? 'Đang tìm video phù hợp…' : 'Chưa có gợi ý'} detail="Nhập một chủ đề hoặc tạo Groups để cá nhân hoá kết quả." /> : <div className="video-grid">{videos.map((video) => <VideoCard key={video.id} video={video} watched={Boolean(state.videoStates[video.id]?.watchedAt)} onAction={(message) => void act(message)} />)}</div>}</section>;
}

function GroupForm({ group, channels, onClose, act }: { group?: Group; channels: Channel[]; onClose: () => void; act: (message: AppMessage) => Promise<unknown> }) {
  const [name, setName] = useState(group?.name ?? '');
  const [icon, setIcon] = useState(group?.icon ?? '📁');
  const [color, setColor] = useState(group?.color ?? COLORS[0]!);
  const [iconDataUrl, setIconDataUrl] = useState(group?.iconDataUrl);
  const [channelIds, setChannelIds] = useState<Set<string>>(new Set(group?.channelIds ?? []));
  const [channelQuery, setChannelQuery] = useState('');
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
    await act({ type: 'UPSERT_GROUP', payload: { ...group, name, icon, color, iconDataUrl, channelIds: [...channelIds] } });
    onClose();
  };
  return <div className="modal-backdrop"><section className="modal">
    <div className="section-title"><div><h2>{group ? 'Sửa group' : 'Tạo group'}</h2><p>Một channel có thể thuộc nhiều group.</p></div><button className="ghost" onClick={onClose}>Đóng</button></div>
    <label className="form-label">Tên group<input className="field" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ví dụ: Tech & AI" /></label>
    <div className="form-label">Icon<div className="icon-picker">{ICONS.map((item) => <button key={item} className={icon === item && !iconDataUrl ? 'selected' : ''} onClick={() => { setIcon(item); setIconDataUrl(undefined); }}>{item}</button>)}<label className="upload-icon">{iconDataUrl ? <img src={iconDataUrl} alt="Custom icon" /> : <Upload size={17} />}<input type="file" accept="image/*" onChange={(event) => pickFile(event.target.files?.[0])} /></label></div></div>
    <div className="form-label">Màu<div className="color-picker">{COLORS.map((item) => <button key={item} className={color === item ? 'selected' : ''} style={{ background: item }} onClick={() => setColor(item)} aria-label={`Màu ${item}`} />)}</div></div>
    <div className="form-label group-channel-manager">Channels ({channelIds.size})<input className="field" value={channelQuery} onChange={(event) => setChannelQuery(event.target.value)} placeholder="Tìm channel để thêm hoặc xoá khỏi group…" /><div className="group-channel-list">{channels.filter((channel) => channel.title.toLocaleLowerCase().includes(channelQuery.toLocaleLowerCase())).map((channel) => <label key={channel.id}><input type="checkbox" checked={channelIds.has(channel.id)} onChange={() => setChannelIds((current) => { const next = new Set(current); next.has(channel.id) ? next.delete(channel.id) : next.add(channel.id); return next; })} />{channel.thumbnailUrl ? <img src={channel.thumbnailUrl} alt="" /> : <span>{channel.title[0]}</span>}<strong>{channel.title}</strong></label>)}</div></div>
    {error && <p className="error-text">{error}</p>}
    <div className="modal-actions"><button className="secondary" onClick={onClose}>Hủy</button><button className="primary" onClick={() => void save()}><Check size={16} />Lưu group</button></div>
  </section></div>;
}

function GroupsPage({ state, act }: { state: AppState; act: (message: AppMessage) => Promise<unknown> }) {
  const [editing, setEditing] = useState<Group | 'new' | null>(null);
  const orderedGroups = state.groups.slice().sort((a, b) => a.position - b.position);
  return <section className="page">
    <div className="section-title"><div><h1>Groups</h1><p>Tổ chức subscription thành các bộ sưu tập theo chủ đề.</p></div><button className="primary" onClick={() => setEditing('new')}><Plus size={16} />Tạo group</button></div>
    {!orderedGroups.length ? <EmptyState title="Chưa có group" detail="Tạo group đầu tiên, sau đó mở Channels để thêm kênh." /> : <div className="group-grid">{orderedGroups.map((group, index) => <article className="group-card" key={group.id}>
      <GroupIcon group={group} size={42} /><div className="group-card-body"><strong>{group.name}</strong><span>{groupChannelCount(group, state.channels)} channels</span></div>
      <label className="switch-row"><Bell size={14} />Thông báo<input type="checkbox" checked={group.notifications} onChange={() => void act({ type: 'UPSERT_GROUP', payload: { ...group, notifications: !group.notifications } })} /></label>
      <div className="group-card-actions"><div className="group-priority"><button className="ghost small" disabled={index === 0} title="Ưu tiên hiển thị trước" onClick={() => void act({ type: 'REORDER_GROUP', payload: { groupId: group.id, direction: 'up' } })}><ArrowUp size={15} /></button><button className="ghost small" disabled={index === orderedGroups.length - 1} title="Chuyển xuống sau" onClick={() => void act({ type: 'REORDER_GROUP', payload: { groupId: group.id, direction: 'down' } })}><ArrowDown size={15} /></button><span>Ưu tiên {index + 1}</span></div><button className="secondary small" onClick={() => setEditing(group)}>Chỉnh sửa</button><button className="ghost danger-text" title="Xóa group" onClick={() => confirm(`Xóa group “${group.name}”?`) && void act({ type: 'DELETE_GROUP', payload: { groupId: group.id } })}><Trash2 size={15} /></button></div>
    </article>)}</div>}
    {editing && <GroupForm group={editing === 'new' ? undefined : editing} channels={state.channels} act={act} onClose={() => setEditing(null)} />}
  </section>;
}

function ChannelRow({ channel, state, act, selected, onSelect }: { channel: Channel; state: AppState; act: (message: AppMessage) => Promise<unknown>; selected: boolean; onSelect: () => void }) {
  const assigned = state.groups.filter((group) => group.channelIds.includes(channel.id)).map((group) => group.id);
  const toggleGroup = (groupId: string) => {
    const groupIds = assigned.includes(groupId) ? assigned.filter((id) => id !== groupId) : [...assigned, groupId];
    void act({ type: 'SET_CHANNEL_GROUPS', payload: { channelId: channel.id, groupIds } });
  };
  const subscribed = channel.subscribedAt ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(new Date(channel.subscribedAt)) : 'Không rõ ngày';
  const subscribers = channel.subscriberCount === undefined ? 'Ẩn số người đăng ký' : `${Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 }).format(channel.subscriberCount)} người đăng ký`;
  const latestVideo = channel.lastPublishedAt ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(channel.lastPublishedAt)) : 'Chưa tải feed';
  const assignedNames = state.groups.filter((group) => assigned.includes(group.id)).map((group) => group.name);
  return <article className="channel-row">
    <input aria-label={`Chọn ${channel.title}`} type="checkbox" checked={selected} onChange={onSelect} />
    <div className="channel-identity">{channel.thumbnailUrl ? <img src={channel.thumbnailUrl} alt="" /> : <span>{channel.title.slice(0, 1).toUpperCase()}</span>}<div><a href={channel.url} target="_blank" rel="noreferrer">{channel.title}</a><div className="assigned-group-pills">{assignedNames.length ? state.groups.filter((group) => assigned.includes(group.id)).map((group) => <span key={group.id} style={{ borderColor: `${group.color}66`, color: group.color }}><GroupIcon group={group} size={16} />{group.name}</span>) : <small>Chưa gán group</small>}</div></div></div>
    <div className="channel-stats"><strong>{subscribers}</strong><span>Đăng ký từ {subscribed}</span><span>Video mới nhất: {latestVideo}</span></div>
    <details className="group-dropdown"><summary>Chọn groups</summary><div>{state.groups.length ? state.groups.map((group) => <label key={group.id}><input type="checkbox" checked={assigned.includes(group.id)} onChange={() => toggleGroup(group.id)} /><GroupIcon group={group} size={20} /><span>{group.name}</span></label>) : <span className="muted">Hãy tạo group trước</span>}</div></details>
    <button className="ghost danger-text" title="Chỉ xóa dữ liệu local, không unsubscribe YouTube" onClick={() => confirm(`Xóa dữ liệu local của “${channel.title}”? Việc này không unsubscribe trên YouTube.`) && void act({ type: 'REMOVE_CHANNEL_LOCAL', payload: { channelId: channel.id } })}><Trash2 size={16} /></button>
  </article>;
}

function ChannelsPage({ state, act }: { state: AppState; act: (message: AppMessage) => Promise<unknown> }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'az' | 'recent' | 'latest-video'>('az');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const enrichmentTotal = state.settings.enrichmentTotal ?? 0;
  const enrichmentCursor = Math.min(state.settings.enrichmentCursor ?? 0, enrichmentTotal);
  const enrichmentPercent = enrichmentTotal ? Math.round(enrichmentCursor / enrichmentTotal * 100) : 100;
  const channels = useMemo(() => state.channels.filter((channel) => channel.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => sort === 'az' ? a.title.localeCompare(b.title) : sort === 'latest-video' ? Date.parse(b.lastPublishedAt ?? '1970-01-01') - Date.parse(a.lastPublishedAt ?? '1970-01-01') : Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt)), [state.channels, query, sort]);
  return <section className="page">
    <div className="section-title"><div><h1>Channels</h1><p>Quản lý subscriptions, thông tin channel và gán nhiều group.</p></div><div className="channel-actions"><button className="secondary small" disabled={busy} onClick={() => { setBusy(true); void act({ type: 'SYNC_YOUTUBE_SUBSCRIPTIONS' }).catch((error) => alert(error instanceof Error ? error.message : 'Sync thất bại')).finally(() => setBusy(false)); }}><RefreshCw size={14} />Sync YouTube</button><button className="secondary small" disabled={busy} onClick={() => { setBusy(true); void act({ type: 'REFRESH_YOUTUBE_FEED', payload: { groupId: null } }).catch((error) => alert(error instanceof Error ? error.message : 'Refresh thất bại')).finally(() => setBusy(false)); }}>Refresh feed</button>{selected.size > 0 && <button className="danger-button small" disabled={busy} onClick={() => { const names = state.channels.filter((item) => selected.has(item.id)).map((item) => item.title); if (!confirm(`UNSUBSCRIBE thật ${names.length} channel trên YouTube?\n\n${names.join('\n')}`)) return; setBusy(true); void act({ type: 'UNSUBSCRIBE_CHANNELS', payload: { channelIds: [...selected] } }).then(() => setSelected(new Set())).catch((error) => alert(error instanceof Error ? error.message : 'Unsubscribe thất bại')).finally(() => setBusy(false)); }}><Trash2 size={14} />Unsubscribe {selected.size}</button>}</div></div>
    {state.settings.enrichmentStatus === 'running' && <div className="enrichment-progress"><div><RefreshCw className="spin" size={16} /><span><strong>Subscriptions đã sẵn sàng</strong><small>Đang bổ sung video mới nhất trong nền: {enrichmentCursor}/{enrichmentTotal} channels</small></span></div><div><span style={{ width: `${enrichmentPercent}%` }} /></div></div>}
    <div className="ai-organize"><div><Sparkles size={18} /><span><strong>AI Groups</strong><small>{state.settings.cloudApiBaseUrl ? 'Dùng AI cloud để tạo và phân loại groups.' : 'Chưa có Cloud API: dùng Smart Groups local, không cần cấu hình thêm.'}</small></span></div><button className="secondary" disabled={busy || !state.channels.length} onClick={() => { setBusy(true); void act({ type: 'AI_ORGANIZE_CHANNELS' }).catch((error) => alert(error instanceof Error ? error.message : 'Phân loại groups thất bại')).finally(() => setBusy(false)); }}><Sparkles size={15} />{state.settings.cloudApiBaseUrl ? 'Tạo groups bằng AI' : 'Tạo Smart Groups'}</button></div>
    <div className="channel-toolbar"><input className="field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm channel…" /><select value={sort} onChange={(event) => setSort(event.target.value as 'az' | 'recent' | 'latest-video')}><option value="az">A–Z</option><option value="latest-video">Video hoạt động gần đây</option><option value="recent">Phát hiện gần đây</option></select></div>
    {!channels.length ? <EmptyState title="Chưa tìm thấy channel" detail="Kết nối Google rồi bấm Sync YouTube, hoặc cuộn trang YouTube để thu thập local." /> : <div className="channel-list">{channels.map((channel) => <ChannelRow key={channel.id} channel={channel} state={state} act={act} selected={selected.has(channel.id)} onSelect={() => setSelected((current) => { const next = new Set(current); if (next.has(channel.id)) next.delete(channel.id); else next.add(channel.id); return next; })} />)}</div>}
  </section>;
}

function IntegrationsPanel({ state, act }: { state: AppState; act: (message: AppMessage) => Promise<unknown> }) {
  const [auth, setAuth] = useState<AuthStatus>({ connected: false });
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const manifestClientId = browser.runtime.getManifest().oauth2?.client_id;
  const hasGoogleClientId = Boolean(manifestClientId || state.settings.googleClientId.trim());
  const hasCloudUrl = Boolean(state.settings.cloudApiBaseUrl.trim());
  const cloudReady = hasCloudUrl && Boolean(state.settings.cloudPermissionGranted);
  const run = async (label: string, message: AppMessage) => {
    setBusy(label); setNotice('');
    try {
      const response = await act(message) as AppResponse;
      if (response.authStatus) setAuth(response.authStatus);
      const feedReport = response.data as { videoCount?: number; skippedChannels?: Array<{ channelTitle: string }>; granted?: boolean; registered?: number; queued?: number; permissionGranted?: boolean; status?: { activeSubscriptions?: number; pendingSubscriptions?: number } } | undefined;
      const skipped = feedReport?.skippedChannels ?? [];
      setNotice(feedReport?.granted
        ? 'Cloud API đã được cấp quyền và health check thành công.'
        : feedReport?.permissionGranted === false
          ? 'Origin Cloud chưa được cấp quyền. Hãy bấm “Cho phép Cloud API”.'
          : feedReport?.registered !== undefined
            ? `Đã đưa ${feedReport.registered} channels vào hàng đợi WebSub; active ${feedReport.status?.activeSubscriptions ?? 0}, pending ${feedReport.status?.pendingSubscriptions ?? feedReport.queued ?? 0}.`
            : skipped.length
              ? `${label}: tải ${feedReport?.videoCount ?? 0} video; bỏ qua ${skipped.length} channel không còn uploads playlist (${skipped.map((item) => item.channelTitle).join(', ')}).`
              : `${label}: hoàn tất${feedReport?.videoCount !== undefined ? `, tải ${feedReport.videoCount} video` : ''}.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : `${label}: thất bại.`); }
    finally { setBusy(''); }
  };
  useEffect(() => { void act({ type: 'GET_AUTH_STATUS' }).then((response) => { const status = (response as AppResponse).authStatus; if (status) setAuth(status); }); }, [act]);
  return <div className="integration-section">
    <div className="section-title"><div><h2>Google & Cloud integrations</h2><p>OAuth token chỉ lưu trong browser session và phải kết nối lại sau khi restart.</p></div><span className={auth.connected ? 'status-badge connected' : 'status-badge'}>{auth.connected ? auth.email || 'Connected' : 'Not connected'}</span></div>
    <label className="form-label">Google OAuth Client ID<input className="field" value={state.settings.googleClientId} placeholder={manifestClientId ? 'Đã cấu hình trong manifest build' : '...apps.googleusercontent.com'} onChange={(event) => void act({ type: 'UPDATE_SETTINGS', payload: { googleClientId: event.target.value } })} /></label>
    <label className="form-label">Cloud API Base URL<input className="field" value={state.settings.cloudApiBaseUrl} placeholder="https://youtube-collections-cloud.your-account.workers.dev" onChange={(event) => void act({ type: 'UPDATE_SETTINGS', payload: { cloudApiBaseUrl: event.target.value.trim(), cloudPermissionGranted: false, cloudHealthy: false } })} /></label>
    <div className={`cloud-status-card ${state.settings.cloudHealthy ? 'healthy' : ''}`}>
      <span className="cloud-status-dot" />
      <div><strong>{state.settings.cloudHealthy ? 'Cloud đang hoạt động' : hasCloudUrl ? 'Cloud chưa được xác minh' : 'Cloud chưa cấu hình'}</strong><small>{state.settings.cloudHealthy ? `AI ${state.settings.cloudAiConfigured ? `sẵn sàng · ${state.settings.cloudAiModel ?? 'model đã cấu hình'}` : 'chưa có API key'} · WebSub ${state.settings.webSubActiveCount ?? 0} active / ${state.settings.webSubPendingCount ?? 0} pending` : 'Deploy backend, nhập HTTPS URL rồi cấp quyền cho extension.'}</small></div>
    </div>
    <label className="form-label">Số channel tối đa mỗi lần refresh feed<input className="field" type="number" min="1" max="100" value={state.settings.youtubeSyncChannelLimit} onChange={(event) => void act({ type: 'UPDATE_SETTINGS', payload: { youtubeSyncChannelLimit: Math.max(1, Math.min(100, Number(event.target.value) || 25)) } })} /></label>
    <div className="integration-actions">
      {!auth.connected ? <button className="primary" disabled={Boolean(busy) || !hasGoogleClientId} onClick={() => void run('Kết nối Google', { type: 'CONNECT_GOOGLE' })}>Kết nối Google</button> : <button className="secondary" disabled={Boolean(busy)} onClick={() => void run('Ngắt kết nối', { type: 'DISCONNECT_GOOGLE' })}>Ngắt kết nối</button>}
      <button className="secondary" disabled={Boolean(busy) || !auth.connected} onClick={() => void run('Sync subscriptions', { type: 'SYNC_YOUTUBE_SUBSCRIPTIONS' })}>Sync subscriptions</button>
      <button className="secondary" disabled={Boolean(busy) || !auth.connected} onClick={() => void run('Refresh API feed', { type: 'REFRESH_YOUTUBE_FEED', payload: { groupId: null } })}>Refresh feed</button>
      <button className="secondary" disabled={Boolean(busy) || !auth.connected} onClick={() => void run('Drive backup', { type: 'DRIVE_PUSH' })}>Push Drive</button>
      <button className="secondary" disabled={Boolean(busy) || !auth.connected} onClick={() => confirm('Pull Drive sẽ thay thế groups, channel assignments và watched state hiện tại. Tiếp tục?') && void run('Drive restore', { type: 'DRIVE_PULL' })}>Pull Drive</button>
      <button className="secondary" disabled={Boolean(busy) || !hasCloudUrl} onClick={() => void run('Cloud permission', { type: 'GRANT_CLOUD_PERMISSION', payload: { baseUrl: state.settings.cloudApiBaseUrl } })}>Xác minh Cloud API</button>
      <button className="secondary" disabled={Boolean(busy) || !auth.connected || !cloudReady} onClick={() => void run('Cloud status', { type: 'CHECK_CLOUD_STATUS' })}>Kiểm tra Cloud</button>
      <button className="secondary" disabled={Boolean(busy) || !auth.connected || !cloudReady || !state.channels.length} onClick={() => void run('WebSub registration', { type: 'REGISTER_WEBSUB' })}>Đăng ký WebSub</button>
      <button className="secondary" disabled={Boolean(busy) || !auth.connected || !cloudReady} onClick={() => void run('Cloud events', { type: 'POLL_CLOUD_EVENTS' })}>Đồng bộ events</button>
    </div>
    {notice && <p className="integration-notice">{notice}</p>}
    <p className="integration-meta">YouTube sync: {state.settings.lastYoutubeSyncAt ?? 'chưa chạy'} · Drive sync: {state.settings.lastDriveSyncAt ?? 'chưa chạy'} · Cloud poll: {state.settings.lastCloudPollAt ?? 'chưa chạy'}</p>
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
  return <div className={`dashboard theme-${theme}${embedded ? ' embedded' : ''}`}><Header tab={tab} setTab={setTab} state={state} onClose={onClose} /><main className="app-main">{tab === 'feed' && <FeedView state={state} act={act} />}{tab === 'suggestions' && <SuggestionsPage state={state} act={act} />}{tab === 'groups' && <GroupsPage state={state} act={act} />}{tab === 'channels' && <ChannelsPage state={state} act={act} />}{tab === 'settings' && <SettingsPage state={state} act={act} />}</main></div>;
}
