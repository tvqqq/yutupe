import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, CheckCircle2, FolderPlus, Plus, RefreshCw, Sparkles, X } from 'lucide-react';
import type { AppMessage } from '@/src/domain/messages';
import type { AppState, Channel, Group } from '@/src/domain/types';
import { findMatchingChannel, getAssignedGroupIds } from '@/src/domain/state';
import { GroupIcon } from '@/src/ui/common';

const RANDOM_COLORS = [
  '#22d3ee', '#38bdf8', '#818cf8', '#a78bfa', '#c084fc',
  '#f472b6', '#fb7185', '#f87171', '#fb923c', '#facc15',
  '#4ade80', '#2dd4bf'
];

const RANDOM_ICONS = ['📁', '🚀', '💡', '🔥', '✨', '💻', '🎬', '📚', '🎯', '⚡️', '🎧', '🌟'];

interface QuickGroupModalProps {
  channel: Channel;
  state: AppState;
  act: (message: AppMessage) => Promise<unknown>;
  onClose: () => void;
}

export function QuickGroupModal({ channel, state, act, onClose }: QuickGroupModalProps) {
  const [newGroupName, setNewGroupName] = useState('');
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  const matched = useMemo(() => findMatchingChannel(state, channel), [state, channel]);

  const assignedGroupIds = useMemo(() => {
    return new Set(getAssignedGroupIds(state, channel));
  }, [state, channel]);

  const orderedGroups = useMemo(() => {
    return state.groups.slice().sort((a, b) => a.position - b.position);
  }, [state.groups]);

  useEffect(() => {
    return () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    };
  }, []);

  // Isolate input element from YouTube shortcut handlers
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const stop = (e: KeyboardEvent) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
    };
    el.addEventListener('keydown', stop, true);
    el.addEventListener('keyup', stop, true);
    el.addEventListener('keypress', stop, true);
    return () => {
      el.removeEventListener('keydown', stop, true);
      el.removeEventListener('keyup', stop, true);
      el.removeEventListener('keypress', stop, true);
    };
  }, []);

  const showNotice = (text: string) => {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    setNotice(text);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 3000);
  };

  const ensureChannelSaved = async () => {
    const exists = state.channels.some((c) => c.id === channel.id);
    if (!exists) {
      await act({
        type: 'DISCOVER',
        payload: {
          channels: [channel],
          videos: []
        }
      });
    }
  };

  const toggleGroup = async (group: Group) => {
    setPending(true);
    try {
      await ensureChannelSaved();
      const currentAssigned = getAssignedGroupIds(state, channel);
      const isAssigned = currentAssigned.includes(group.id);
      const nextGroupIds = isAssigned
        ? currentAssigned.filter((id) => id !== group.id)
        : [...currentAssigned, group.id];

      const effectiveId = matched?.id ?? channel.id;

      await act({
        type: 'SET_CHANNEL_GROUPS',
        payload: {
          channelId: effectiveId,
          groupIds: nextGroupIds
        }
      });

      if (channel.id !== effectiveId) {
        await act({
          type: 'SET_CHANNEL_GROUPS',
          payload: {
            channelId: channel.id,
            groupIds: nextGroupIds
          }
        });
      }

      showNotice(!isAssigned ? `Đã thêm vào “${group.name}”` : `Đã xóa khỏi “${group.name}”`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Không thể cập nhật group.');
    } finally {
      setPending(false);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newGroupName.trim();
    if (!name) return;

    setPending(true);
    try {
      await ensureChannelSaved();
      const randomColor = RANDOM_COLORS[Math.floor(Math.random() * RANDOM_COLORS.length)]!;
      const randomIcon = RANDOM_ICONS[Math.floor(Math.random() * RANDOM_ICONS.length)]!;
      const effectiveId = matched?.id ?? channel.id;

      await act({
        type: 'UPSERT_GROUP',
        payload: {
          name,
          icon: randomIcon,
          color: randomColor,
          channelIds: [effectiveId]
        }
      });

      setNewGroupName('');
      showNotice(`Đã tạo group “${name}” và gán kênh.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Không thể tạo group.');
    } finally {
      setPending(false);
    }
  };

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        event.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  const subscriberText = channel.subscriberCount !== undefined
    ? `${Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 }).format(channel.subscriberCount)} subscribers`
    : null;

  const stopEvent = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    if ('nativeEvent' in e && e.nativeEvent) {
      (e.nativeEvent as Event).stopImmediatePropagation?.();
    }
  };

  return (
    <div className="ytc-quick-modal-backdrop" onClick={onClose}>
      <div
        className="ytc-quick-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Add channel to groups"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={stopEvent}
        onKeyUp={stopEvent}
        onKeyPress={stopEvent}
      >
        {/* Header */}
        <header className="ytc-quick-modal-header">
          <div className="ytc-quick-channel-info">
            {channel.thumbnailUrl ? (
              <img className="ytc-quick-channel-avatar" src={channel.thumbnailUrl} alt="" />
            ) : (
              <span className="ytc-quick-channel-avatar fallback">
                {channel.title.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="ytc-quick-channel-meta">
              <strong className="ytc-quick-channel-title" title={channel.title}>
                {channel.title}
              </strong>
              <span className="ytc-quick-channel-sub">
                {subscriberText ? `${subscriberText} · ` : ''}Thêm vào Groups
              </span>
            </div>
          </div>
          <button
            className="ytc-quick-close-btn"
            onClick={onClose}
            aria-label="Đóng"
            title="Đóng (Esc)"
          >
            <X size={18} />
          </button>
        </header>

        {/* Notice Toast */}
        {notice && (
          <div className="ytc-quick-notice" role="status">
            <CheckCircle2 size={15} />
            <span>{notice}</span>
          </div>
        )}

        {/* Group List */}
        <div className="ytc-quick-group-list">
          {!orderedGroups.length ? (
            <div className="ytc-quick-empty-groups">
              <FolderPlus size={32} />
              <p>Chưa có group nào. Hãy tạo group đầu tiên bên dưới!</p>
            </div>
          ) : (
            orderedGroups.map((group) => {
              const isAssigned = assignedGroupIds.has(group.id);
              return (
                <button
                  key={group.id}
                  type="button"
                  className={`ytc-quick-group-item${isAssigned ? ' selected' : ''}`}
                  onClick={() => void toggleGroup(group)}
                  disabled={pending}
                >
                  <div className="ytc-quick-group-item-left">
                    <GroupIcon group={group} size={26} />
                    <div className="ytc-quick-group-item-info">
                      <span className="ytc-quick-group-name">{group.name}</span>
                      <small className="ytc-quick-group-count">
                        {group.channelIds.length} channels
                      </small>
                    </div>
                  </div>
                  <div className={`ytc-quick-checkbox${isAssigned ? ' checked' : ''}`}>
                    {isAssigned && <Check size={14} strokeWidth={3} />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Create Group Inline Form */}
        <form className="ytc-quick-create-form" onSubmit={handleCreateGroup}>
          <input
            ref={inputRef}
            type="text"
            className="ytc-quick-create-input"
            placeholder="+ Tạo group mới… (nhập tên & Enter)"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={stopEvent}
            onKeyUp={stopEvent}
            onKeyPress={stopEvent}
            disabled={pending}
          />
          <button
            type="submit"
            className="ytc-quick-create-submit"
            disabled={pending || !newGroupName.trim()}
            title="Tạo group mới"
          >
            {pending ? <RefreshCw className="spin" size={14} /> : <Plus size={15} />}
            <span>Tạo</span>
          </button>
        </form>
      </div>
    </div>
  );
}

export default QuickGroupModal;
