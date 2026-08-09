import { describe, expect, it } from 'vitest';
import { parseCompactNumber, parseDuration } from './parser';

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
});
