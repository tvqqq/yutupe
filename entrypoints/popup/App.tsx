import { Bell, Check, CircleAlert, Download, ExternalLink, FolderKanban, GripVertical, LayoutGrid, Pencil, Plus, RefreshCw, Settings as SettingsIcon, Sparkles, Trash2, Upload, Users, X, Youtube } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppMessage, AppResponse } from '@/src/domain/messages';
import { groupFeedSections } from '@/src/domain/feed-sections';
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
  const [sourceCounts, setSourceCounts] = useState({ liked: 0, watchLater: 0 });
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [recommendations, setRecommendations] = useState<Array<{ channelId: string; reason: string; confidence: number }>>([]);
  const load = (value?: string) => {
    setBusy(true);
    void act({ type: 'FETCH_SUGGESTIONS', payload: { query: value?.trim() || undefined } }).then((response) => {
      const data = (response as AppResponse).data as { query: string; videos: Video[]; likedCount: number; watchLaterCount: number };
      setActiveQuery(data.query); setVideos(data.videos); setSourceCounts({ liked: data.likedCount, watchLater: data.watchLaterCount });
    }).catch((error) => alert(error instanceof Error ? error.message : 'Không thể tải video gợi ý')).finally(() => setBusy(false));
  };
  useEffect(() => { load(); }, []);
  const sections = useMemo(() => groupFeedSections(videos), [videos]);
  const rejectedVideos = state.videos.filter((video) => state.videoStates[video.id]?.hiddenAt).sort((a, b) => Date.parse(state.videoStates[b.id]?.hiddenAt ?? '') - Date.parse(state.videoStates[a.id]?.hiddenAt ?? ''));
  const rejectionStats = state.channels.map((channel) => { const cached = state.videos.filter((video) => video.channelId === channel.id); return { channel, cachedCount: cached.length, rejectedCount: cached.filter((video) => state.videoStates[video.id]?.hiddenAt).length }; }).filter((item) => item.rejectedCount >= 2).sort((a, b) => b.rejectedCount - a.rejectedCount);
  const analyze = async () => {
    setAiBusy(true); setAiError('');
    try { const response = await act({ type: 'AI_UNSUBSCRIBE_SUGGESTIONS', payload: { channelIds: rejectionStats.map((item) => item.channel.id) } }) as AppResponse; setRecommendations(((response.data as { recommendations?: typeof recommendations })?.recommendations ?? [])); }
    catch (value) { setAiError(value instanceof Error ? value.message : 'Không thể phân tích feedback bằng AI.'); }
    finally { setAiBusy(false); }
  };
  return <section className="page suggestions-page">
    <div className="suggestions-hero"><div><span><Sparkles size={14} /> PERSONALIZATION LAB</span><h1>Gợi ý</h1><p>Video dài phù hợp với sở thích từ Likes và Watch Later. YouTube Shorts luôn được loại bỏ.</p></div><div><strong>{videos.length}</strong><small>videos ready</small></div></div>
    <div className="personalization-sources">
      <div><span className="source-icon">♥</span><span><strong>{sourceCounts.liked} video đã thích</strong><small>Đọc trực tiếp từ tài khoản YouTube</small></span></div>
      <div><span className="source-icon">＋</span><span><strong>{sourceCounts.watchLater} video Watch Later</strong><small>{sourceCounts.watchLater ? 'Đã thu thập từ playlist trên YouTube' : 'Mở playlist để extension thu thập tín hiệu'}</small></span>{!sourceCounts.watchLater && <a href="https://www.youtube.com/playlist?list=WL" target="_blank" rel="noreferrer">Mở Watch Later <ExternalLink size={13} /></a>}</div>
    </div>
    <form className="suggest-search" onSubmit={(event) => { event.preventDefault(); load(query); }}><input className="field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nhập chủ đề để ưu tiên (không bắt buộc)" /><button className="primary" disabled={busy}>{busy ? <RefreshCw className="spin" size={16} /> : <Sparkles size={16} />}{busy ? 'Đang phân tích…' : 'Tạo gợi ý'}</button></form>
    <div className="feed-heading"><span>Chủ đề suy ra: <strong>{activeQuery || 'đang phân tích…'}</strong></span><span>{videos.length} video dài</span></div>
    {!videos.length ? <EmptyState title={busy ? 'Đang phân tích Likes và Watch Later…' : 'Chưa có gợi ý'} detail="Hãy Like một vài video hoặc mở playlist Watch Later, sau đó tạo lại gợi ý." /> : <div className="feed-sections personalization-feed">{sections.map((section) => <section className="feed-section" key={section.id}><header><div><h2>{section.title}</h2><p>{section.detail}</p></div><span>{section.videos.length}</span></header><div className="video-grid">{section.videos.map((video) => <VideoCard key={video.id} video={video} watched={Boolean(state.videoStates[video.id]?.watchedAt)} onAction={(message) => void act(message)} />)}</div></section>)}</div>}
    <section className="feedback-panel"><header><div><span className="feedback-icon"><Sparkles size={18} /></span><div><h2>AI unsubscribe advisor</h2><p>AI phân tích các channel có nhiều video bị đánh dấu Không xem. Extension không tự unsubscribe.</p></div></div><button className="secondary" disabled={aiBusy || !rejectionStats.length} onClick={() => void analyze()}>{aiBusy ? <RefreshCw className="spin" size={16} /> : <Sparkles size={16} />}{aiBusy ? 'Đang phân tích…' : 'Phân tích bằng AI'}</button></header>{aiError && <p className="integration-notice">{aiError}</p>}{!rejectionStats.length ? <p className="feedback-empty">Cần ít nhất 2 video “Không xem” từ cùng một channel để bắt đầu phân tích.</p> : <div className="unsubscribe-grid">{rejectionStats.map(({ channel, rejectedCount, cachedCount }) => { const result = recommendations.find((item) => item.channelId === channel.id); return <article key={channel.id}><div className="unsubscribe-channel">{channel.thumbnailUrl ? <img src={channel.thumbnailUrl} alt="" /> : <span>{channel.title[0]}</span>}<div><strong>{channel.title}</strong><small>{rejectedCount}/{cachedCount} video đã chọn Không xem</small></div></div>{result ? <p>{result.reason}<span>{Math.round(result.confidence * 100)}% confidence</span></p> : <p className="muted-copy">Chờ AI đánh giá mức độ phù hợp.</p>}<button className="danger-button small" disabled={!result || !channel.subscriptionId} onClick={() => confirm(`UNSUBSCRIBE thật channel “${channel.title}” trên YouTube?`) && void act({ type: 'UNSUBSCRIBE_CHANNELS', payload: { channelIds: [channel.id] } }).catch((error) => alert(error instanceof Error ? error.message : 'Unsubscribe thất bại'))}><Trash2 size={14} />Unsubscribe</button></article>; })}</div>}</section>
    <section className="rejected-panel"><div className="feed-heading"><span><strong>Đã chọn Không xem</strong> · dùng làm tín hiệu cá nhân hóa</span><span>{rejectedVideos.length} video</span></div>{rejectedVideos.length ? <div className="rejected-video-list">{rejectedVideos.slice(0, 30).map((video) => <article key={video.id}>{video.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" /> : <span /> }<div><strong>{video.title}</strong><small>{video.channelTitle}</small></div><button className="secondary small" onClick={() => void act({ type: 'HIDE_VIDEO', payload: { videoId: video.id, hidden: false } })}>Hoàn tác</button></article>)}</div> : <EmptyState title="Chưa có negative feedback" detail="Bấm “Không xem” trên video ở Feed để lưu tín hiệu tại đây." />}</section>
  </section>;
}

function GroupForm({ group, channels, onClose, onSaved, act }: { group?: Group; channels: Channel[]; onClose: () => void; onSaved: (message: string) => void; act: (message: AppMessage) => Promise<unknown> }) {
  const [name, setName] = useState(group?.name ?? '');
  const [icon, setIcon] = useState(group?.icon ?? '📁');
  const [color, setColor] = useState(group?.color ?? COLORS[0]!);
  const [iconDataUrl, setIconDataUrl] = useState(group?.iconDataUrl);
  const [channelIds, setChannelIds] = useState<Set<string>>(new Set(group?.channelIds ?? []));
  const [channelQuery, setChannelQuery] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const pickFile = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 200_000) return setError('Icon phải là ảnh nhỏ hơn 200 KB.');
    const reader = new FileReader();
    reader.onload = () => setIconDataUrl(String(reader.result));
    reader.readAsDataURL(file);
  };
  const save = async () => {
    if (!name.trim()) return setError('Hãy nhập tên group.');
    setSaving(true); setError('');
    try {
      await act({ type: 'UPSERT_GROUP', payload: { ...group, name, icon, color, iconDataUrl, channelIds: [...channelIds] } });
      onSaved(group ? `Đã cập nhật “${name.trim()}”.` : `Đã tạo group “${name.trim()}”.`);
      onClose();
    } catch (value) { setError(value instanceof Error ? value.message : 'Không thể lưu group.'); }
    finally { setSaving(false); }
  };
  return <div className="modal-backdrop"><section className="modal group-modal" aria-busy={saving}>
    <div className="group-modal-kicker"><Sparkles size={14} /> COLLECTION CONFIG</div>
    <div className="section-title"><div><h2>{group ? 'Sửa group' : 'Tạo group'}</h2><p>Một channel có thể thuộc nhiều group.</p></div><button className="ghost" disabled={saving} onClick={onClose}>Đóng</button></div>
    <label className="form-label">Tên group<input className="field" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ví dụ: Tech & AI" /></label>
    <div className="form-label">Icon<div className="icon-picker">{ICONS.map((item) => <button key={item} className={icon === item && !iconDataUrl ? 'selected' : ''} onClick={() => { setIcon(item); setIconDataUrl(undefined); }}>{item}</button>)}<label className="upload-icon">{iconDataUrl ? <img src={iconDataUrl} alt="Custom icon" /> : <Upload size={17} />}<input type="file" accept="image/*" onChange={(event) => pickFile(event.target.files?.[0])} /></label></div></div>
    <div className="form-label">Màu<div className="color-picker">{COLORS.map((item) => <button key={item} className={color === item ? 'selected' : ''} style={{ background: item }} onClick={() => setColor(item)} aria-label={`Màu ${item}`} />)}</div></div>
    <div className="form-label group-channel-manager">Channels ({channelIds.size})<input className="field" value={channelQuery} onChange={(event) => setChannelQuery(event.target.value)} placeholder="Tìm channel để thêm hoặc xoá khỏi group…" /><div className="group-channel-list">{channels.filter((channel) => channel.title.toLocaleLowerCase().includes(channelQuery.toLocaleLowerCase())).map((channel) => <label key={channel.id}><input type="checkbox" checked={channelIds.has(channel.id)} onChange={() => setChannelIds((current) => { const next = new Set(current); next.has(channel.id) ? next.delete(channel.id) : next.add(channel.id); return next; })} />{channel.thumbnailUrl ? <img src={channel.thumbnailUrl} alt="" /> : <span>{channel.title[0]}</span>}<strong>{channel.title}</strong></label>)}</div></div>
    {error && <p className="error-text">{error}</p>}
    {saving && <div className="group-save-pending"><RefreshCw className="spin" size={16} /><span><strong>Đang lưu group…</strong><small>Group được lưu ngay; video của các channel sẽ tự cập nhật sau.</small></span></div>}
    <div className="modal-actions"><button className="secondary" disabled={saving} onClick={onClose}>Hủy</button><button className="primary" disabled={saving || !name.trim()} onClick={() => void save()}>{saving ? <RefreshCw className="spin" size={16} /> : <Check size={16} />}{saving ? 'Đang lưu…' : 'Lưu group'}</button></div>
  </section></div>;
}

function GroupsPage({ state, act }: { state: AppState; act: (message: AppMessage) => Promise<unknown> }) {
  const [editing, setEditing] = useState<Group | 'new' | null>(null);
  const [pending, setPending] = useState('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [sorting, setSorting] = useState(false);
  const [draftOrder, setDraftOrder] = useState<string[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const orderedGroups = state.groups.slice().sort((a, b) => a.position - b.position);
  const visibleGroups = sorting ? draftOrder.map((id) => orderedGroups.find((group) => group.id === id)).filter((group): group is Group => Boolean(group)) : orderedGroups;
  const run = async (key: string, message: AppMessage, success: string) => {
    setPending(key); setNotice(null);
    try { await act(message); setNotice({ type: 'success', text: success }); }
    catch (value) { setNotice({ type: 'error', text: value instanceof Error ? value.message : 'Thao tác group thất bại.' }); }
    finally { setPending(''); }
  };
  const saved = (text: string) => setNotice({ type: 'success', text });
  const startSorting = () => { setDraftOrder(orderedGroups.map((group) => group.id)); setSorting(true); setNotice(null); };
  const moveBefore = (targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    setDraftOrder((current) => { const next = current.filter((id) => id !== draggedId); next.splice(next.indexOf(targetId), 0, draggedId); return next; });
  };
  const saveOrder = async () => {
    setPending('sorting'); setNotice(null);
    try { await act({ type: 'REORDER_GROUPS', payload: { groupIds: draftOrder } }); setSorting(false); setNotice({ type: 'success', text: 'Đã cập nhật thứ tự Groups trên Feed navbar.' }); }
    catch (value) { setNotice({ type: 'error', text: value instanceof Error ? value.message : 'Không thể lưu thứ tự groups.' }); }
    finally { setPending(''); setDraggedId(null); }
  };
  return <section className="page groups-page">
    <div className="groups-hero"><div><span className="groups-eyebrow"><Sparkles size={14} /> SUBSCRIPTION COLLECTIONS</span><h1>Groups</h1><p>Sắp xếp kênh theo chủ đề và quyết định thứ tự xuất hiện trên Feed navbar.</p></div><div className="groups-hero-actions"><span><strong>{orderedGroups.length}</strong><small>groups</small></span><span><strong>{state.channels.length}</strong><small>channels</small></span>{sorting ? <div className="sorting-actions"><button className="secondary" disabled={Boolean(pending)} onClick={() => { setSorting(false); setDraggedId(null); }}>Hủy</button><button className="primary" disabled={Boolean(pending)} onClick={() => void saveOrder()}>{pending === 'sorting' ? <RefreshCw className="spin" size={16} /> : <Check size={16} />}{pending === 'sorting' ? 'Đang lưu…' : 'Lưu thứ tự'}</button></div> : <><button className="secondary" disabled={Boolean(pending) || orderedGroups.length < 2} onClick={startSorting}><GripVertical size={16} />Sắp xếp</button><button className="primary" disabled={Boolean(pending)} onClick={() => setEditing('new')}><Plus size={16} />Tạo group</button></>}</div></div>
    {sorting && <div className="sorting-hint"><GripVertical size={17} /><span><strong>Chế độ sắp xếp đang bật</strong>Kéo thả cards bằng handle, sau đó bấm “Lưu thứ tự”.</span></div>}
    {notice && <div className={`group-notice ${notice.type}`} role="status">{notice.type === 'success' ? <Check size={16} /> : <X size={16} />}<span>{notice.text}</span><button className="ghost small" onClick={() => setNotice(null)}><X size={14} /></button></div>}
    {!orderedGroups.length ? <EmptyState title="Chưa có group" detail="Tạo group đầu tiên, sau đó mở Channels để thêm kênh." /> : <div className={`group-grid${sorting ? ' sorting' : ''}`}>{visibleGroups.map((group, index) => {
      const cardPending = pending.startsWith(`${group.id}:`);
      return <article className={`group-card${cardPending ? ' pending' : ''}${draggedId === group.id ? ' dragging' : ''}`} style={{ '--group-color': group.color } as React.CSSProperties} key={group.id} aria-busy={cardPending} draggable={sorting} onDragStart={(event) => { if (!sorting) return; setDraggedId(group.id); event.dataTransfer.effectAllowed = 'move'; }} onDragOver={(event) => { if (sorting) { event.preventDefault(); moveBefore(group.id); } }} onDragEnd={() => setDraggedId(null)}>
        <div className="group-card-accent" /><div className="group-card-head"><span className="group-rank">#{String(index + 1).padStart(2, '0')}</span>{sorting && <span className="group-drag-handle" title="Kéo để sắp xếp"><GripVertical size={18} /></span>}</div>
        <div className="group-card-main"><GroupIcon group={group} size={46} /><div className="group-card-body"><strong>{group.name}</strong><span>{groupChannelCount(group, state.channels)} channels trong collection</span></div></div>
        <button className={`group-notification${group.notifications ? ' active' : ''}`} role="switch" aria-checked={group.notifications} disabled={Boolean(pending) || sorting} onClick={() => void run(`${group.id}:notification`, { type: 'UPSERT_GROUP', payload: { ...group, notifications: !group.notifications } }, `${group.notifications ? 'Đã tắt' : 'Đã bật'} thông báo cho “${group.name}”.`)}><Bell size={15} /><span><strong>Thông báo</strong><small>{group.notifications ? 'Đang bật cho video mới' : 'Đang tắt'}</small></span><i /></button>
        <div className="group-card-actions"><span className="group-position">Vị trí {index + 1}</span><div><button className="secondary icon-button" disabled={Boolean(pending) || sorting} title={`Chỉnh sửa ${group.name}`} aria-label={`Chỉnh sửa ${group.name}`} onClick={() => setEditing(group)}><Pencil size={15} /></button><button className="ghost danger-text icon-button" disabled={Boolean(pending) || sorting} title="Xóa group" onClick={() => confirm(`Xóa group “${group.name}”?`) && void run(`${group.id}:delete`, { type: 'DELETE_GROUP', payload: { groupId: group.id } }, `Đã xóa group “${group.name}”.`)}><Trash2 size={15} /></button></div></div>
        {cardPending && <div className="group-card-pending"><RefreshCw className="spin" size={18} /><span>Đang xử lý…</span></div>}
      </article>;
    })}</div>}
    {editing && <GroupForm group={editing === 'new' ? undefined : editing} channels={state.channels} act={act} onSaved={saved} onClose={() => setEditing(null)} />}
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
  const latestVideo = channel.lastPublishedAt ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(channel.lastPublishedAt)) : channel.enrichment?.status === 'loading' ? 'Đang cập nhật…' : channel.enrichment?.status === 'error' ? 'Cập nhật lỗi' : 'Chưa tải feed';
  const assignedNames = state.groups.filter((group) => assigned.includes(group.id)).map((group) => group.name);
  return <article className="channel-row">
    <input aria-label={`Chọn ${channel.title}`} type="checkbox" checked={selected} onChange={onSelect} />
    <div className="channel-identity">{channel.thumbnailUrl ? <img src={channel.thumbnailUrl} alt="" /> : <span>{channel.title.slice(0, 1).toUpperCase()}</span>}<div><a href={channel.url} target="_blank" rel="noreferrer">{channel.title}</a><div className="assigned-group-pills">{assignedNames.length ? state.groups.filter((group) => assigned.includes(group.id)).map((group) => <span key={group.id} style={{ borderColor: `${group.color}66`, color: group.color }}><GroupIcon group={group} size={16} />{group.name}</span>) : <small>Chưa gán group</small>}</div></div></div>
    <div className="channel-stats"><strong>{subscribers}</strong><span>Đăng ký từ {subscribed}</span><span>Video mới nhất: {latestVideo}</span></div>
    <details className="group-dropdown"><summary>Chọn groups</summary><div>{state.groups.length ? state.groups.map((group) => <label key={group.id}><input type="checkbox" checked={assigned.includes(group.id)} onChange={() => toggleGroup(group.id)} /><GroupIcon group={group} size={20} /><span>{group.name}</span></label>) : <span className="muted">Hãy tạo group trước</span>}</div></details>
    <button className="ghost danger-text" title="Chỉ xóa dữ liệu local, không unsubscribe YouTube" onClick={() => confirm(`Xóa dữ liệu local của “${channel.title}”? Việc này không unsubscribe trên YouTube.`) && void act({ type: 'REMOVE_CHANNEL_LOCAL', payload: { channelId: channel.id } })}><Trash2 size={16} /></button>
  </article>;
}

import { detectDeadChannels } from '@/src/domain/dead-channels';

function DeadChannelsPanel({ state }: { state: AppState; act?: (message: AppMessage) => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(20);
  const deadChannels = useMemo(() => detectDeadChannels(state.channels, state.videos), [state.channels, state.videos]);

  if (!deadChannels.length) return null;

  const displayedChannels = deadChannels.slice(0, visibleCount);
  const remainingCount = Math.max(0, deadChannels.length - visibleCount);

  return (
    <div className="dead-channels-panel">
      <div className="section-title">
        <div>
          <h3><Sparkles size={16} /> Kênh không hoạt động / không khả dụng ({deadChannels.length})</h3>
          <p>Phát hiện các kênh đã lâu không ra video hoặc playlist bị ngưng.</p>
        </div>
        <button className="secondary small" onClick={() => setOpen(!open)}>
          {open ? 'Thu gọn' : 'Xem chi tiết'}
        </button>
      </div>
      {open && (
        <>
          <div className="unsubscribe-grid" style={{ marginTop: 10 }}>
            {displayedChannels.map(({ channel, reason, latestVideoTitle }) => (
              <article key={channel.id}>
                <div className="unsubscribe-channel">
                  {channel.thumbnailUrl ? <img src={channel.thumbnailUrl} alt="" /> : <span>{channel.title[0]}</span>}
                  <div>
                    <strong>{channel.title}</strong>
                    <small>{reason}</small>
                  </div>
                </div>
                {latestVideoTitle && <p className="muted-copy">Video cuối: {latestVideoTitle}</p>}
                <a
                  href={channel.url}
                  target="_blank"
                  rel="noreferrer"
                  className="secondary small"
                  style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  <ExternalLink size={14} /> Xem kênh trên YouTube
                </a>
              </article>
            ))}
          </div>
          {remainingCount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
              <button
                className="secondary small"
                onClick={() => setVisibleCount((prev) => prev + 30)}
              >
                Hiển thị thêm {Math.min(30, remainingCount)} kênh (còn lại {remainingCount})
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ChannelsPage({ state, act }: { state: AppState; act: (message: AppMessage) => Promise<unknown> }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'subscribers' | 'az' | 'recent' | 'latest-video'>('subscribers');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState('');
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const enrichmentTotal = state.settings.enrichmentTotal ?? 0;
  const enrichmentCursor = Math.min(state.settings.enrichmentCursor ?? 0, enrichmentTotal);
  const enrichmentPercent = enrichmentTotal ? Math.round(enrichmentCursor / enrichmentTotal * 100) : 100;
  const enrichmentErrors = state.settings.enrichmentErrorCount ?? 0;
  const quotaBlockedUntil = state.settings.youtubeQuotaBlockedUntil && Date.parse(state.settings.youtubeQuotaBlockedUntil) > Date.now() ? state.settings.youtubeQuotaBlockedUntil : undefined;
  const channels = useMemo(() => state.channels.filter((channel) => channel.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => sort === 'subscribers' ? (b.subscriberCount ?? -1) - (a.subscriberCount ?? -1) || a.title.localeCompare(b.title) : sort === 'az' ? a.title.localeCompare(b.title) : sort === 'latest-video' ? Date.parse(b.lastPublishedAt ?? '1970-01-01') - Date.parse(a.lastPublishedAt ?? '1970-01-01') : Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt)), [state.channels, query, sort]);
  const runAction = async (key: string, message: AppMessage, success: string) => {
    setBusy(key); setActionNotice(null);
    try { await act(message); setActionNotice({ type: 'success', text: success }); return true; }
    catch (value) { setActionNotice({ type: 'error', text: value instanceof Error ? value.message : 'Thao tác thất bại.' }); return false; }
    finally { setBusy(''); }
  };
  return <section className="page">
    <div className="section-title"><div><h1>Channels</h1><p>Quản lý subscriptions, thông tin channel và gán nhiều group.</p></div><div className="channel-actions"><button className="secondary small" disabled={Boolean(busy)} title="Tải lại danh sách channel bạn đang subscribe và metadata cơ bản" onClick={() => void runAction('sync', { type: 'SYNC_YOUTUBE_SUBSCRIPTIONS' }, 'Danh sách subscriptions đã được cập nhật; metadata video tiếp tục chạy nền.')}><RefreshCw className={busy === 'sync' ? 'spin' : ''} size={14} />{busy === 'sync' ? 'Đang đồng bộ…' : 'Cập nhật subscriptions'}</button><button className="secondary small" disabled={Boolean(busy)} title="Tải video mới từ các uploads playlist, không thay đổi danh sách subscriptions" onClick={() => void runAction('feed', { type: 'REFRESH_YOUTUBE_FEED', payload: { groupId: null } }, 'Feed video mới đã được cập nhật.')}><RefreshCw className={busy === 'feed' ? 'spin' : ''} size={14} />{busy === 'feed' ? 'Đang tải video…' : 'Cập nhật Feed'}</button>{selected.size > 0 && <button className="danger-button small" disabled={Boolean(busy)} onClick={() => { const names = state.channels.filter((item) => selected.has(item.id)).map((item) => item.title); if (!confirm(`UNSUBSCRIBE thật ${names.length} channel trên YouTube?\n\n${names.join('\n')}`)) return; void runAction('unsubscribe', { type: 'UNSUBSCRIBE_CHANNELS', payload: { channelIds: [...selected] } }, `Đã unsubscribe ${selected.size} channel.`).then(() => setSelected(new Set())); }}><Trash2 size={14} />{busy === 'unsubscribe' ? 'Đang unsubscribe…' : `Unsubscribe ${selected.size}`}</button>}</div></div>
    <div className="channel-sync-guide"><div><strong>1 · Cập nhật subscriptions</strong><span>Dùng khi vừa subscribe/unsubscribe trên YouTube. Danh sách channel hiện ra trước, metadata bổ sung chạy nền.</span></div><div><strong>2 · Cập nhật Feed</strong><span>Dùng để lấy video mới của các channel đã có. Không tải lại danh sách subscriptions.</span></div></div>
    {busy && <div className="channel-action-loading" role="status"><RefreshCw className="spin" size={17} /><span><strong>{busy === 'sync' ? 'Đang đọc subscriptions từ YouTube…' : busy === 'feed' ? 'Đang tải video mới từ uploads playlists…' : busy === 'ai' ? 'AI đang phân loại channels…' : 'Đang xử lý yêu cầu…'}</strong><small>Tác vụ có thể mất một lúc với tài khoản có nhiều channel. Bạn có thể tiếp tục xem trạng thái tại đây.</small></span></div>}
    {actionNotice && <div className={`channel-action-notice ${actionNotice.type}`}><span>{actionNotice.text}</span><button className="ghost small" onClick={() => setActionNotice(null)}><X size={14} /></button></div>}
    {quotaBlockedUntil && <div className="enrichment-warning"><span className="enrichment-warning-icon"><CircleAlert size={18} /></span><div><strong>YouTube Data API đã hết quota</strong><small>Video mới vẫn cập nhật bằng RSS không tốn quota. Metadata chi tiết và lịch sử sâu sẽ tiếp tục sau {new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(quotaBlockedUntil))}.</small></div></div>}
    {state.settings.enrichmentStatus === 'running' && <div className="enrichment-progress"><div className="enrichment-copy"><RefreshCw className="spin" size={16} /><span><strong>Subscriptions đã sẵn sàng — Groups dùng được ngay</strong><small>Video mới nhất đang được bổ sung theo độ ưu tiên: {enrichmentCursor}/{enrichmentTotal} channels{enrichmentErrors ? ` · ${enrichmentErrors} đang retry` : ''}</small></span></div><div className="enrichment-bar"><span style={{ width: `${enrichmentPercent}%` }} /></div></div>}
    {state.settings.enrichmentStatus === 'complete' && enrichmentErrors > 0 && <div className="enrichment-warning"><span className="enrichment-warning-icon"><CircleAlert size={18} /></span><div><strong>Một số channel chưa cập nhật được metadata</strong><small>Feed và Groups vẫn dùng bình thường. Extension sẽ thử lại ở lần cập nhật subscriptions tiếp theo.</small></div><div className="enrichment-error-count"><strong>{enrichmentErrors}</strong><span>channel lỗi</span></div></div>}
    <DeadChannelsPanel state={state} act={act} />
    <div className="ai-organize"><div><Sparkles size={18} /><span><strong>AI Groups</strong><small>{state.settings.cloudApiBaseUrl ? 'Dùng AI cloud để tạo và phân loại groups.' : 'Chưa có Cloud API: dùng Smart Groups local, không cần cấu hình thêm.'}</small></span></div><button className="secondary" disabled={Boolean(busy) || !state.channels.length} onClick={() => void runAction('ai', { type: 'AI_ORGANIZE_CHANNELS' }, 'AI đã hoàn tất phân loại groups.')}><Sparkles size={15} />{busy === 'ai' ? 'Đang phân loại…' : state.settings.cloudApiBaseUrl ? 'Tạo groups bằng AI' : 'Tạo Smart Groups'}</button></div>
    <div className="channel-toolbar"><input className="field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm channel…" /><select value={sort} onChange={(event) => setSort(event.target.value as 'subscribers' | 'az' | 'recent' | 'latest-video')}><option value="subscribers">Nhiều người đăng ký nhất</option><option value="az">A–Z</option><option value="latest-video">Video hoạt động gần đây</option><option value="recent">Phát hiện gần đây</option></select></div>
    {!channels.length ? <EmptyState title="Chưa tìm thấy channel" detail="Kết nối Google rồi bấm Sync YouTube, hoặc cuộn trang YouTube để thu thập local." /> : <div className="channel-list">{channels.map((channel) => <ChannelRow key={channel.id} channel={channel} state={state} act={act} selected={selected.has(channel.id)} onSelect={() => setSelected((current) => { const next = new Set(current); if (next.has(channel.id)) next.delete(channel.id); else next.add(channel.id); return next; })} />)}</div>}
  </section>;
}

function IntegrationsPanel({ state, act }: { state: AppState; act: (message: AppMessage) => Promise<unknown> }) {
  const [auth, setAuth] = useState<AuthStatus>({ connected: false });
  const [authLoading, setAuthLoading] = useState(true);
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
      if (message.type === 'CONNECT_GOOGLE' && response.authStatus?.connected) await act({ type: 'CHECK_CLOUD_STATUS' });
      const feedReport = response.data as { videoCount?: number; skippedChannels?: Array<{ channelTitle: string }>; granted?: boolean; registered?: number; queued?: number; permissionGranted?: boolean; fileId?: string; syncedAt?: string; restoredFrom?: string; status?: { activeSubscriptions?: number; pendingSubscriptions?: number } } | undefined;
      const skipped = feedReport?.skippedChannels ?? [];
      setNotice(feedReport?.restoredFrom
        ? `Đã khôi phục backup tạo lúc ${new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(feedReport.restoredFrom))}.`
        : feedReport?.fileId
          ? `Đã backup lên vùng dữ liệu riêng của ứng dụng trên Google Drive lúc ${new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(feedReport.syncedAt ?? Date.now()))}.`
          : feedReport?.granted
        ? 'Cloud API production đã được xác minh và health check thành công.'
        : feedReport?.permissionGranted === false
          ? 'Origin Cloud chưa có trong manifest. Hãy reload bản extension production mới nhất.'
          : feedReport?.registered !== undefined
            ? `Đã đưa ${feedReport.registered} channels vào hàng đợi WebSub; active ${feedReport.status?.activeSubscriptions ?? 0}, pending ${feedReport.status?.pendingSubscriptions ?? feedReport.queued ?? 0}.`
            : skipped.length
              ? `${label}: tải ${feedReport?.videoCount ?? 0} video; bỏ qua ${skipped.length} channel không còn uploads playlist (${skipped.map((item) => item.channelTitle).join(', ')}).`
              : `${label}: hoàn tất${feedReport?.videoCount !== undefined ? `, tải ${feedReport.videoCount} video` : ''}.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : `${label}: thất bại.`); }
    finally { setBusy(''); }
  };
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await act({ type: 'GET_AUTH_STATUS' }) as AppResponse;
        if (!active) return;
        if (response.authStatus) setAuth(response.authStatus);
        if (response.authStatus?.connected) await act({ type: 'CHECK_CLOUD_STATUS' });
      } catch (error) {
        if (active) setNotice(error instanceof Error ? error.message : 'Không thể tải trạng thái integrations.');
      } finally { if (active) setAuthLoading(false); }
    })();
    return () => { active = false; };
  }, [act]);
  return <div className="integration-section">
    <div className="section-title"><div><h2>Google & Cloud integrations</h2><p>OAuth token chỉ lưu trong browser session và phải kết nối lại sau khi restart.</p></div><span className={authLoading ? 'status-badge loading' : auth.connected ? 'status-badge connected' : 'status-badge'}>{authLoading ? 'Đang kiểm tra…' : auth.connected ? auth.email || 'Connected' : 'Not connected'}</span></div>
    {authLoading ? <div className="integration-loading"><RefreshCw className="spin" size={20} /><span><strong>Đang tải Google & Cloud integrations…</strong><small>Kiểm tra OAuth session, Cloud health và WebSub status.</small></span></div> : <>
    {!manifestClientId && <label className="form-label">Google OAuth Client ID<input className="field" value={state.settings.googleClientId} placeholder="...apps.googleusercontent.com" onChange={(event) => void act({ type: 'UPDATE_SETTINGS', payload: { googleClientId: event.target.value } })} /></label>}
    <div className={`cloud-status-card ${state.settings.cloudHealthy ? 'healthy' : ''}`}>
      <span className="cloud-status-dot" />
      <div><strong>{state.settings.cloudHealthy ? 'Cloud đang hoạt động' : hasCloudUrl ? 'Cloud chưa được xác minh' : 'Cloud chưa cấu hình'}</strong><small>{state.settings.cloudHealthy ? `AI ${state.settings.cloudAiConfigured ? `sẵn sàng · ${state.settings.cloudAiModel ?? 'model đã cấu hình'}` : 'chưa có API key'} · WebSub ${state.settings.webSubActiveCount ?? 0} active / ${state.settings.webSubPendingCount ?? 0} pending` : 'Deploy backend, nhập HTTPS URL rồi cấp quyền cho extension.'}</small></div>
    </div>
    <label className="form-label">Số channel tối đa mỗi lần refresh feed<input className="field" type="number" min="1" max="100" value={state.settings.youtubeSyncChannelLimit} onChange={(event) => void act({ type: 'UPDATE_SETTINGS', payload: { youtubeSyncChannelLimit: Math.max(1, Math.min(100, Number(event.target.value) || 25)) } })} /></label>
    <div className="integration-actions">
      {!auth.connected ? <button className="primary" disabled={Boolean(busy) || !hasGoogleClientId} onClick={() => void run('Kết nối Google', { type: 'CONNECT_GOOGLE' })}>{busy === 'Kết nối Google' ? <><RefreshCw className="spin" size={16} />Đang kết nối Google…</> : 'Kết nối Google'}</button> : <button className="secondary" disabled={Boolean(busy)} onClick={() => void run('Ngắt kết nối', { type: 'DISCONNECT_GOOGLE' })}>Ngắt kết nối</button>}
      <button className="secondary" disabled={Boolean(busy) || !auth.connected} onClick={() => void run('Sync subscriptions', { type: 'SYNC_YOUTUBE_SUBSCRIPTIONS' })}>Sync subscriptions</button>
      <button className="secondary" disabled={Boolean(busy) || !auth.connected} onClick={() => void run('Refresh API feed', { type: 'REFRESH_YOUTUBE_FEED', payload: { groupId: null } })}>Refresh feed</button>
      <button className="secondary" disabled={Boolean(busy) || !auth.connected} title="Ghi đè backup mới nhất trong vùng dữ liệu riêng của ứng dụng trên Google Drive" onClick={() => void run('Backup lên Drive', { type: 'DRIVE_PUSH' })}>{busy === 'Backup lên Drive' ? <><RefreshCw className="spin" size={16} />Đang backup…</> : 'Backup lên Drive'}</button>
      <button className="secondary" disabled={Boolean(busy) || !auth.connected} title="Khôi phục groups, channel assignments, watched state và một số tùy chọn từ backup mới nhất" onClick={() => confirm('Khôi phục từ Drive sẽ thay thế groups, channel assignments và watched state hiện tại. Tiếp tục?') && void run('Khôi phục từ Drive', { type: 'DRIVE_PULL' })}>{busy === 'Khôi phục từ Drive' ? <><RefreshCw className="spin" size={16} />Đang khôi phục…</> : 'Khôi phục từ Drive'}</button>
      <button className="secondary" disabled={Boolean(busy) || !hasCloudUrl} onClick={() => void run('Cloud permission', { type: 'GRANT_CLOUD_PERMISSION', payload: { baseUrl: state.settings.cloudApiBaseUrl } })}>Xác minh Cloud API</button>
      <button className="secondary" disabled={Boolean(busy) || !auth.connected || !cloudReady} onClick={() => void run('Cloud status', { type: 'CHECK_CLOUD_STATUS' })}>Kiểm tra Cloud</button>
      <button className="secondary" disabled={Boolean(busy) || !auth.connected || !cloudReady || !state.channels.length} onClick={() => void run('WebSub registration', { type: 'REGISTER_WEBSUB' })}>Đăng ký WebSub</button>
      <button className="secondary" disabled={Boolean(busy) || !auth.connected || !cloudReady} onClick={() => void run('Cloud events', { type: 'POLL_CLOUD_EVENTS' })}>Đồng bộ events</button>
    </div>
    {notice && <p className="integration-notice">{notice}</p>}
    <p className="integration-meta">YouTube sync: {state.settings.lastYoutubeSyncAt ?? 'chưa chạy'} · API estimate hôm nay: {state.settings.youtubeQuotaEstimatedUsed ?? 0}/8.000 soft limit · Drive sync: {state.settings.lastDriveSyncAt ?? 'chưa chạy'} · Cloud poll: {state.settings.lastCloudPollAt ?? 'chưa chạy'}</p>
    </>}
  </div>;
}

function SettingsPage({ state, act }: { state: AppState; act: (message: AppMessage) => Promise<unknown> }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [newKeyword, setNewKeyword] = useState('');
  const keywords = state.settings.blocklistKeywords ?? [];

  const addKeyword = () => {
    const val = newKeyword.trim();
    if (!val || keywords.includes(val)) return;
    void act({ type: 'UPDATE_SETTINGS', payload: { blocklistKeywords: [...keywords, val] } });
    setNewKeyword('');
  };

  const removeKeyword = (target: string) => {
    void act({ type: 'UPDATE_SETTINGS', payload: { blocklistKeywords: keywords.filter((k) => k !== target) } });
  };

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
    <div className="section-title"><div><h1>Cài đặt</h1><p>Giao diện, watched state, blocklist từ khóa và backup.</p></div></div>
    <div className="settings-card"><div><strong>Giao diện</strong><span>Theo hệ thống, sáng hoặc tối.</span></div><select value={state.settings.theme} onChange={(event) => void act({ type: 'UPDATE_SETTINGS', payload: { theme: event.target.value as AppState['settings']['theme'] } })}><option value="system">Hệ thống</option><option value="light">Sáng</option><option value="dark">Tối</option></select></div>
    <div className="settings-card"><div><strong>Ẩn video đã xem</strong><span>Video vẫn còn trong backup và bộ lọc “Đã xem”.</span></div><input type="checkbox" checked={state.settings.hideWatched} onChange={() => void act({ type: 'UPDATE_SETTINGS', payload: { hideWatched: !state.settings.hideWatched } })} /></div>
    <div className="settings-card"><div><strong>Thông báo local</strong><span>Chỉ hoạt động khi YouTube đang mở và phát hiện video mới thuộc group bật thông báo.</span></div><input type="checkbox" checked={state.settings.notificationsEnabled} onChange={() => void act({ type: 'UPDATE_SETTINGS', payload: { notificationsEnabled: !state.settings.notificationsEnabled } })} /></div>

    <div className="blocklist-section">
      <div className="section-title">
        <div>
          <h3>Bộ lọc từ khóa (Blocklist)</h3>
          <p>Tự động ẩn các video có tiêu đề chứa từ khóa bạn chọn (ví dụ: SPOILER, REACTION).</p>
        </div>
      </div>
      <form style={{ display: 'flex', gap: 8 }} onSubmit={(e) => { e.preventDefault(); addKeyword(); }}>
        <input className="field" style={{ flex: 1 }} value={newKeyword} onChange={(e) => setNewKeyword(e.target.value)} placeholder="Nhập từ khóa muốn ẩn…" />
        <button type="submit" className="primary small" disabled={!newKeyword.trim()}>Thêm từ khóa</button>
      </form>
      <div className="blocklist-pills">
        {keywords.map((kw) => (
          <span key={kw} className="blocklist-pill">
            {kw}
            <button title="Xóa từ khóa" onClick={() => removeKeyword(kw)}><X size={14} /></button>
          </span>
        ))}
        {!keywords.length && <span className="muted-copy">Chưa có từ khóa nào trong blocklist.</span>}
      </div>
    </div>

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
