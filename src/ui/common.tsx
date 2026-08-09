import { Check, Clock3, Eye, EyeOff, Play, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { selectFeed } from '@/src/domain/state';
import type { AppState, ContentType, FeedFilter, Group, Video } from '@/src/domain/types';
import type { AppMessage } from '@/src/domain/messages';

export const DEFAULT_FILTER: FeedFilter = {
  groupId: null,
  query: '',
  contentTypes: [],
  duration: 'any',
  watched: 'all',
  sort: 'newest'
};

export function GroupIcon({ group, size = 28 }: { group: Group; size?: number }) {
  if (group.iconDataUrl) return <img className="group-icon-image" src={group.iconDataUrl} width={size} height={size} alt="" />;
  return <span className="group-icon" style={{ background: `${group.color}22`, color: group.color, width: size, height: size }}>{group.icon}</span>;
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty"><div className="empty-orb">✦</div><strong>{title}</strong><span>{detail}</span></div>;
}

export function FeedControls({ state, filter, onChange, compact = false }: {
  state: AppState;
  filter: FeedFilter;
  onChange: (filter: FeedFilter) => void;
  compact?: boolean;
}) {
  const toggleType = (type: ContentType) => {
    const contentTypes = filter.contentTypes.includes(type) ? filter.contentTypes.filter((item) => item !== type) : [...filter.contentTypes, type];
    onChange({ ...filter, contentTypes });
  };
  return <div className={compact ? 'controls controls-compact' : 'controls'}>
    <div className="group-strip">
      <button className={!filter.groupId ? 'chip active' : 'chip'} onClick={() => onChange({ ...filter, groupId: null })}>Tất cả</button>
      {state.groups.map((group) => <button key={group.id} className={filter.groupId === group.id ? 'chip active' : 'chip'} onClick={() => onChange({ ...filter, groupId: group.id })}><GroupIcon group={group} size={20} />{group.name}</button>)}
    </div>
    <div className="filter-row">
      <label className="search"><Search size={15} /><input value={filter.query} onChange={(event) => onChange({ ...filter, query: event.target.value })} placeholder="Tìm video hoặc channel…" />{filter.query && <button aria-label="Xóa tìm kiếm" onClick={() => onChange({ ...filter, query: '' })}><X size={14} /></button>}</label>
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
      {(['video', 'short', 'live', 'upcoming'] as ContentType[]).map((type) => <button key={type} onClick={() => toggleType(type)} className={filter.contentTypes.includes(type) ? 'type-pill selected' : 'type-pill'}>{type === 'video' ? 'Video' : type === 'short' ? 'Shorts' : type === 'live' ? 'Live' : 'Upcoming'}</button>)}
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

function VideoCard({ video, watched, onAction }: { video: Video; watched: boolean; onAction: (message: AppMessage) => void }) {
  return <article className={watched ? 'video-card watched' : 'video-card'}>
    <a href={video.url} target="_blank" rel="noreferrer" className="thumb" onClick={() => onAction({ type: 'MARK_WATCHED', payload: { videoId: video.id, watched: true } })}>
      {video.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" /> : <span className="thumb-fallback"><Play /></span>}
      {formatDuration(video.durationSeconds) && <span className="duration">{formatDuration(video.durationSeconds)}</span>}
      {video.contentType !== 'video' && <span className={`content-badge ${video.contentType}`}>{video.contentType}</span>}
    </a>
    <div className="video-body">
      <a className="video-title" href={video.url} target="_blank" rel="noreferrer">{video.title}</a>
      <span className="channel-title">{video.channelTitle}</span>
      <span className="video-meta"><Clock3 size={13} />{video.publishedLabel || 'Đã lưu gần đây'}{video.viewCount ? ` · ${Intl.NumberFormat('vi', { notation: 'compact' }).format(video.viewCount)} lượt xem` : ''}</span>
      <div className="card-actions">
        <button onClick={() => onAction({ type: 'MARK_WATCHED', payload: { videoId: video.id, watched: !watched } })}>{watched ? <Eye size={15} /> : <Check size={15} />}{watched ? 'Chưa xem' : 'Đã xem'}</button>
        <button className="icon-action" title="Ẩn video" onClick={() => onAction({ type: 'HIDE_VIDEO', payload: { videoId: video.id, hidden: true } })}><EyeOff size={15} /></button>
      </div>
    </div>
  </article>;
}

export function FeedView({ state, act, compact = false }: { state: AppState; act: (message: AppMessage) => Promise<unknown>; compact?: boolean }) {
  const [filter, setFilter] = useState<FeedFilter>({ ...DEFAULT_FILTER, groupId: state.settings.defaultGroupId });
  const videos = useMemo(() => selectFeed(state, filter), [state, filter]);
  const playAll = () => {
    if (!videos.length) return;
    const ids = videos.slice(0, 50).map((video) => video.id).join(',');
    window.open(`https://www.youtube.com/watch_videos?video_ids=${ids}`, '_blank', 'noopener,noreferrer');
  };
  return <div className="feed-view">
    <FeedControls state={state} filter={filter} onChange={setFilter} compact={compact} />
    <div className="feed-heading"><span><strong>{videos.length}</strong> video</span><button className="primary small" disabled={!videos.length} onClick={playAll}><Play size={15} />Phát tất cả</button></div>
    {!videos.length ? <EmptyState title="Chưa có video phù hợp" detail="Mở trang Home hoặc Subscriptions trên YouTube để extension thu thập video đang hiển thị." /> : <div className={compact ? 'video-grid compact' : 'video-grid'}>{videos.map((video) => <VideoCard key={video.id} video={video} watched={Boolean(state.videoStates[video.id]?.watchedAt)} onAction={(message) => void act(message)} />)}</div>}
  </div>;
}
