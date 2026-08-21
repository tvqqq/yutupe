import { describe, expect, it } from 'vitest';
import { getCurrentPageChannel, idFromChannelUrl, parseCompactNumber, parseDuration } from './parser';

describe('YouTube metadata parser', () => {
  it('parses duration labels', () => {
    expect(parseDuration('12:34')).toBe(754);
    expect(parseDuration('1:02:03')).toBe(3723);
    expect(parseDuration('LIVE')).toBeUndefined();
  });

  it('parses localized compact view counts', () => {
    expect(parseCompactNumber('1.2K views')).toBe(1200);
    expect(parseCompactNumber('2,5 triệu lượt xem')).toBe(2_500_000);
  });

  it('computes channel ID from url', () => {
    expect(idFromChannelUrl('https://www.youtube.com/@vutheanh')).toBe('channel:/@vutheanh');
    expect(idFromChannelUrl('https://www.youtube.com/channel/UC123456')).toBe('channel:/channel/UC123456');
  });

  it('extracts channel from mock watch page DOM', () => {
    const mockWatchOwner = {
      querySelector: (selector: string) => {
        if (selector.includes('a.yt-simple-endpoint') || selector.includes('#channel-name a')) {
          return { textContent: 'Vũ Thế Anh - CK Capital', getAttribute: () => '/@vutheanh', href: 'https://www.youtube.com/@vutheanh' };
        }
        if (selector.includes('#avatar img')) {
          return { src: 'https://example.com/avatar.jpg' };
        }
        if (selector.includes('#owner-sub-count')) {
          return { textContent: '5.09K subscribers' };
        }
        return null;
      }
    };
    const mockRoot = {
      querySelector: (selector: string) => {
        if (selector.includes('ytd-watch-metadata') || selector.includes('ytd-video-owner-renderer') || selector.includes('#owner')) {
          return mockWatchOwner;
        }
        return null;
      }
    } as unknown as ParentNode;

    const channel = getCurrentPageChannel(mockRoot);
    expect(channel).not.toBeNull();
    expect(channel?.title).toBe('Vũ Thế Anh - CK Capital');
    expect(channel?.id).toBe('channel:/@vutheanh');
    expect(channel?.url).toBe('https://www.youtube.com/@vutheanh');
    expect(channel?.thumbnailUrl).toBe('https://example.com/avatar.jpg');
    expect(channel?.subscriberCount).toBe(5090);
  });

  it('extracts channel from mock channel page header DOM', () => {
    const mockChannelHeader = {
      querySelector: (selector: string) => {
        if (selector.includes('.page-header-view-model-wiz__page-header-title') || selector.includes('#channel-name')) {
          return { textContent: 'CK Capital Official' };
        }
        if (selector.includes('#avatar img')) {
          return { src: 'https://example.com/avatar2.jpg' };
        }
        if (selector.includes('#subscriber-count')) {
          return { textContent: '100K người đăng ký' };
        }
        return null;
      }
    };
    const mockRoot = {
      querySelector: (selector: string) => {
        if (selector.includes('yt-page-header-renderer') || selector.includes('ytd-c4-tabbed-header-renderer')) {
          return mockChannelHeader;
        }
        return null;
      }
    } as unknown as ParentNode;

    const channel = getCurrentPageChannel(mockRoot);
    expect(channel).not.toBeNull();
    expect(channel?.title).toBe('CK Capital Official');
    expect(channel?.thumbnailUrl).toBe('https://example.com/avatar2.jpg');
    expect(channel?.subscriberCount).toBe(100_000);
  });
});

