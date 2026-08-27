import { Check, CheckCircle2, Clock3, Eye, EyeOff, Play, RefreshCw, Search, Sparkles, Undo2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { selectFeed } from '@/src/domain/state';
import { groupFeedSections } from '@/src/domain/feed-sections';
import { recommendVideos, type VideoRecommendation } from '@/src/domain/recommendations';
import { videoThumbnailUrl, youtubeThumbnailUrl } from '../domain/video';
import type { AppState, ContentType, FeedFilter, Group, Video } from '@/src/domain/types';
import type { AppMessage } from '@/src/domain/messages';
import { useYutupeHotkeys } from './hotkeys';

export const DEFAULT_FILTER: FeedFilter = {
  groupId: null,
  query: '',
  contentTypes: [],
  duration: 'any',
  watched: 'unwatched',
  sort: 'newest'
};

export function GroupIcon({ group, size = 28 }: { group: Group; size?: number }) {
  if (group.iconDataUrl) return <img className="group-icon-image" src={group.iconDataUrl} width={size} height={size} alt="" />;
  return <span className="group-icon" style={{ background: `${group.color}22`, color: group.color, width: size, height: size }}>{group.icon}</span>;
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty"><div className="empty-orb">✦</div><strong>{title}</strong><span>{detail}</span></div>;
}

export function FeedControls({ state, filter, onChange, recommendedOnly = false, onRecommendedChange, recommendedCount = 0, compact = false }: {
  state: AppState;
  filter: FeedFilter;
  onChange: (filter: FeedFilter) => void;
  recommendedOnly?: boolean;
  onRecommendedChange?: (value: boolean) => void;
  recommendedCount?: number;
  compact?: boolean;
}) {
  const toggleType = (type: ContentType) => {
    const contentTypes = filter.contentTypes.includes(type) ? filter.contentTypes.filter((item) => item !== type) : [...filter.contentTypes, type];
    onChange({ ...filter, contentTypes });
  };
  const unreadCount = (channelIds?: string[]) => {
    const ids = channelIds ? new Set(channelIds) : null;
    return state.videos.filter((video) => (!ids || ids.has(video.channelId)) && !state.videoStates[video.id]?.watchedAt && !state.videoStates[video.id]?.hiddenAt).length;
  };
  return <div className={compact ? 'controls controls-compact' : 'controls'}>
    <div className="group-strip">
      <button className={!filter.groupId && !recommendedOnly ? 'chip active' : 'chip'} onClick={() => onChange({ ...filter, groupId: null })}>Tất cả <span className="chip-count">{unreadCount()}</span></button>
      <button className={recommendedOnly ? 'chip ai-recommend-chip active' : 'chip ai-recommend-chip'} onClick={() => onRecommendedChange?.(true)}><Sparkles size={17} />AI Recommend <span className="chip-count">{recommendedCount}</span></button>
      {state.groups.slice().sort((a, b) => a.position - b.position).map((group) => <button key={group.id} className={filter.groupId === group.id ? 'chip active' : 'chip'} onClick={() => onChange({ ...filter, groupId: group.id, watched: 'unwatched' })}><GroupIcon group={group} size={20} />{group.name}<span className="chip-count">{unreadCount(group.channelIds)}</span></button>)}
    </div>
    <div className="filter-row">
      <label className="search"><Search size={15} /><input value={filter.query} onChange={(event) => onChange({ ...filter, query: event.target.value })} placeholder="Tìm video hoặc channel… (Hotkey: /)" />{filter.query && <button aria-label="Xóa tìm kiếm" onClick={() => onChange({ ...filter, query: '' })}><X size={14} /></button>}</label>
      <select aria-label="Độ dài" value={filter.duration} onChange={(event) => onChange({ ...filter, duration: event.target.value as FeedFilter['duration'] })}>
        <option value="any">Mọi độ dài</option><option value="short">Dưới 4 phút</option><option value="medium">4–20 phút</option><option value="long">Trên 20 phút</option>
      </select>
      <select aria-label="Đã xem" value={filter.watched} onChange={(event) => onChange({ ...filter, watched: event.target.value as FeedFilter['watched'] })}>
        <option value="all">Tất cả</option><option value="unwatched">Chưa xem</option><option value="watched">Đã xem</option>
      </select>
      <select aria-label="Sắp xếp" value={filter.sort} onChange={(event) => onChange({ ...filter, sort: event.target.value as FeedFilter['sort'] })}>
        <option value="newest">Mới nhất</option><option value="oldest">Cũ nhất</option><option value="duration-desc">Dài nhất</option><option value="duration-asc">Ngắn nhất</option><option value="popular">Phổ biến</option>
      </select>
    </div>
    <div className="type-row">
      {(['video', 'live', 'upcoming'] as ContentType[]).map((type) => <button key={type} onClick={() => toggleType(type)} className={filter.contentTypes.includes(type) ? 'type-pill selected' : 'type-pill'}>{type === 'video' ? 'Video' : type === 'live' ? 'Live' : 'Upcoming'}</button>)}
    </div>
  </div>;
}

function formatDuration(seconds?: number): string | null {
  if (seconds === undefined) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}` : `${minutes}:${String(rest).padStart(2, '0')}`;
}

function formatPublishedAt(video: Video): string {
  const value = video.publishedAt ?? video.discoveredAt;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return video.publishedLabel ?? 'Không rõ ngày đăng';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function VideoCard({ video, watched, recommendation, onAction }: { video: Video; watched: boolean; recommendation?: VideoRecommendation; onAction: (message: AppMessage) => void | Promise<unknown> }) {
  return <article className={watched ? 'video-card watched' : 'video-card'} data-video-id={video.id}>
    <a href={video.url} target="_blank" rel="noreferrer" className="thumb" onClick={() => onAction({ type: 'MARK_WATCHED', payload: { videoId: video.id, watched: true } })}>
      <img src={videoThumbnailUrl(video)} alt="" onError={(event) => {
        const fallback = youtubeThumbnailUrl(video.id);
        if (event.currentTarget.src !== fallback) event.currentTarget.src = fallback;
      }} />
      {formatDuration(video.durationSeconds) && <span className="duration">{formatDuration(video.durationSeconds)}</span>}
      {video.contentType !== 'video' && <span className={`content-badge ${video.contentType}`}>{video.contentType}</span>}
      {recommendation && <span className="ai-recommend-badge" tabIndex={0} aria-label={`AI đề xuất: ${recommendation.reasons.join(' · ')}`} data-tooltip={recommendation.reasons.join(' · ')}><Sparkles size={12} /><span>AI</span></span>}
    </a>
    <div className="video-body">
      <a className="video-title" href={video.url} target="_blank" rel="noreferrer">{video.title}</a>
      <span className="channel-title">{video.channelTitle}</span>
      <span className="video-meta"><Clock3 size={13} />{formatPublishedAt(video)}{video.viewCount ? ` · ${Intl.NumberFormat('vi', { notation: 'compact' }).format(video.viewCount)} lượt xem` : ''}</span>
      <div className="card-actions">
        <button className="watched-action" onClick={() => onAction({ type: 'MARK_WATCHED', payload: { videoId: video.id, watched: !watched } })}>{watched ? <Eye size={15} /> : <Check size={15} />}{watched ? 'Hoàn tác đã xem' : 'Đánh dấu đã xem'}</button>
        <button className="not-interested-action" aria-label="Không xem video này" title="Không xem · Ẩn video và dùng làm tín hiệu cá nhân hóa" onClick={() => onAction({ type: 'HIDE_VIDEO', payload: { videoId: video.id, hidden: true } })}><EyeOff size={16} /></button>
      </div>
    </div>
  </article>;
}

export function FeedView({ state, act, compact = false }: { state: AppState; act: (message: AppMessage) => Promise<unknown>; compact?: boolean }) {
  const [filter, setFilter] = useState<FeedFilter>({ ...DEFAULT_FILTER, groupId: state.settings.defaultGroupId });
  const [refreshing, setRefreshing] = useState(false);
  const [perChannel, setPerChannel] = useState(25);
  const [visibleBySection, setVisibleBySection] = useState<Record<string, number>>({});
  const [recommendedOnly, setRecommendedOnly] = useState(false);
  const [toast, setToast] = useState<{ id: number; message: string; undo: AppMessage } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const feedRoot = useRef<HTMLDivElement>(null);
  const baseVideos = useMemo(() => selectFeed(state, filter), [state, filter]);
  const recommendations = useMemo(() => recommendVideos(state, baseVideos), [state, baseVideos]);
  const recommendationMap = useMemo(() => new Map(recommendations.map((item) => [item.video.id, item])), [recommendations]);
  const videos = useMemo(() => recommendedOnly ? recommendations.map((item) => item.video) : baseVideos, [recommendedOnly, recommendations, baseVideos]);
  const sections = useMemo(() => groupFeedSections(videos), [videos]);

  useYutupeHotkeys(true, {
    onFocusSearch: () => {
      const searchInput = feedRoot.current?.querySelector<HTMLInputElement>('.search input');
      searchInput?.focus();
    }
  });

  useEffect(() => () => { if (toastTimer.current) window.clearTimeout(toastTimer.current); }, []);
  const showActionToast = (message: string, undo: AppMessage) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), message, undo });
    toastTimer.current = window.setTimeout(() => setToast(null), 5_000);
  };
  const captureViewport = (excludeVideoId?: string) => {
    const scroller = feedRoot.current?.closest<HTMLElement>('.app-main') ?? null;
    if (!scroller) return null;
    const top = scroller.getBoundingClientRect().top;
    const cards = [...scroller.querySelectorAll<HTMLElement>('.video-card[data-video-id]')];
    const anchor = cards.find((card) => card.dataset.videoId !== excludeVideoId && card.getBoundingClientRect().bottom > top + 8);
    return anchor ? { scroller, videoId: anchor.dataset.videoId!, top: anchor.getBoundingClientRect().top } : { scroller, videoId: '', top: scroller.scrollTop };
  };
  const restoreViewport = (anchor: ReturnType<typeof captureViewport>) => {
    if (!anchor) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!anchor.videoId) { anchor.scroller.scrollTop = anchor.top; return; }
      const escaped = CSS.escape(anchor.videoId);
      const current = anchor.scroller.querySelector<HTMLElement>(`.video-card[data-video-id="${escaped}"]`);
      if (current) anchor.scroller.scrollTop += current.getBoundingClientRect().top - anchor.top;
    }));
  };
  const performVideoAction = async (video: Video, message: AppMessage, notify = true) => {
    const anchor = captureViewport(video.id);
    try {
      await act(message);
      restoreViewport(anchor);
      if (!notify) return;
      if (message.type === 'MARK_WATCHED') showActionToast(message.payload.watched ? `Đã đánh dấu “${video.title}” là đã xem.` : `Đã hoàn tác trạng thái xem của “${video.title}”.`, { type: 'MARK_WATCHED', payload: { videoId: video.id, watched: !message.payload.watched } });
      if (message.type === 'HIDE_VIDEO') showActionToast('Đã chuyển video vào danh sách Không xem.', { type: 'HIDE_VIDEO', payload: { videoId: video.id, hidden: !message.payload.hidden } });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Không thể cập nhật video.');
    }
  };
  const changeFilter = (next: FeedFilter) => {
    const changedGroup = next.groupId !== filter.groupId;
    setFilter(next);
    setRecommendedOnly(false);
    setVisibleBySection({});
    if (changedGroup && next.groupId) {
      setRefreshing(true);
      setPerChannel(25);
      void act({ type: 'REFRESH_YOUTUBE_FEED', payload: { groupId: next.groupId, perChannel: 25 } }).catch((error) => alert(error instanceof Error ? error.message : 'Không thể tải feed của group.')).finally(() => setRefreshing(false));
    }
  };
  const refreshCurrent = () => {
    setRefreshing(true);
    void act({ type: 'REFRESH_YOUTUBE_FEED', payload: { groupId: filter.groupId, perChannel } }).catch((error) => alert(error instanceof Error ? error.message : 'Không thể làm mới feed.')).finally(() => setRefreshing(false));
  };
  const loadMore = () => {
    if (refreshing || perChannel >= 500) return;
    const next = Math.min(500, perChannel + 25);
    setPerChannel(next); setRefreshing(true);
    void act({ type: 'REFRESH_YOUTUBE_FEED', payload: { groupId: filter.groupId, perChannel: next } }).catch((error) => alert(error instanceof Error ? error.message : 'Không thể tải thêm video.')).finally(() => setRefreshing(false));
  };
  const showMoreSection = (sectionId: string, total: number) => {
    const current = visibleBySection[sectionId] ?? 30;
    if (current < total) return setVisibleBySection((value) => ({ ...value, [sectionId]: current + 30 }));
    loadMore();
  };
  const playAll = () => {
    if (!videos.length) return;
    const ids = videos.slice(0, 50).map((video) => video.id).join(',');
    window.open(`https://www.youtube.com/watch_videos?video_ids=${ids}`, '_blank', 'noopener,noreferrer');
  };
  return <div className="feed-view" ref={feedRoot}>
    <div className="feed-command"><FeedControls state={state} filter={filter} onChange={changeFilter} recommendedOnly={recommendedOnly} recommendedCount={recommendations.length} onRecommendedChange={(value) => { setFilter((current) => ({ ...current, groupId: null })); setRecommendedOnly(value); setVisibleBySection({}); }} compact={compact} /></div>
    <div className="feed-heading"><span><strong>{videos.length}</strong> video {filter.watched === 'unwatched' ? 'chưa xem' : ''}</span><div className="feed-actions"><button className="secondary small" disabled={refreshing} onClick={refreshCurrent}><RefreshCw className={refreshing ? 'spin' : ''} size={15} />{refreshing ? 'Đang tải' : 'Làm mới'}</button><button className="primary small" disabled={!videos.length} onClick={playAll}><Play size={15} />Phát tất cả</button></div></div>
    {!videos.length ? <EmptyState title={refreshing ? 'Đang tải video của group…' : recommendedOnly ? 'Chưa đủ tín hiệu đề xuất' : 'Chưa có video chưa xem'} detail={recommendedOnly ? 'Hãy xem hoặc đánh dấu Không xem một vài video để AI hiểu sở thích của bạn.' : filter.groupId ? 'Extension sẽ tải video mới từ tất cả channel thuộc group này. Bạn cũng có thể chọn “Đã xem: Tất cả” để xem lại.' : 'Bấm “Làm mới” để tải video từ YouTube API.'} /> : <div className="feed-sections">{recommendedOnly && <div className="recommendation-note"><Sparkles size={18} /><div><strong>AI Recommend Watch</strong><span>Xếp hạng từ lịch sử xem, sở thích, độ hot và tốc độ tăng lượt xem trong 30 ngày gần đây.</span></div></div>}{sections.map((section) => { const visibleCount = visibleBySection[section.id] ?? 30; const displayed = section.videos.slice(0, visibleCount); const cachedRemaining = Math.max(0, section.videos.length - displayed.length); return <section className="feed-section" key={section.id}><header><div><h2>{section.title}</h2><p>{section.detail}</p></div><span>{displayed.length}/{section.videos.length}</span></header><div className={compact ? 'video-grid compact' : 'video-grid'}>{displayed.map((video) => <VideoCard key={video.id} video={video} watched={Boolean(state.videoStates[video.id]?.watchedAt)} recommendation={recommendationMap.get(video.id)} onAction={(message) => performVideoAction(video, message)} />)}</div><div className="section-load-more"><button className="secondary" disabled={refreshing || (!cachedRemaining && perChannel >= 500)} onClick={() => showMoreSection(section.id, section.videos.length)}><RefreshCw className={refreshing && !cachedRemaining ? 'spin' : ''} size={16} />{cachedRemaining ? `Hiển thị thêm ${Math.min(30, cachedRemaining)} video` : refreshing ? 'Đang lấy thêm từ YouTube…' : perChannel >= 500 ? 'Đã tải tối đa trong phạm vi 1 năm' : 'Lấy thêm video từ YouTube'}</button></div></section>; })}</div>}
    {toast && <aside className="action-toast" role="status" aria-live="polite" key={toast.id}><CheckCircle2 size={20} /><span>{toast.message}</span><button onClick={() => { const undo = toast.undo; setToast(null); const videoId = undo.type === 'MARK_WATCHED' || undo.type === 'HIDE_VIDEO' ? undo.payload.videoId : ''; const video = state.videos.find((item) => item.id === videoId); if (video) void performVideoAction(video, undo, false); }}><Undo2 size={15} />Hoàn tác</button><button className="toast-close" aria-label="Đóng thông báo" onClick={() => setToast(null)}><X size={15} /></button></aside>}
  </div>;
}
