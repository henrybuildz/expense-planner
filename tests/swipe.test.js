import { describe, expect, it } from 'vitest';
import { SWIPE_MAX_MS, SWIPE_MIN_PX, startsOnOwnGesture, swipeDirection } from '../src/utils/swipe';

describe('swipeDirection', () => {
  it('left is next, right is previous', () => {
    expect(swipeDirection({ dx: -120, dy: 10, ms: 200 })).toBe('next');
    expect(swipeDirection({ dx: 120, dy: -10, ms: 200 })).toBe('prev');
  });

  it('ignores short moves, slow drags and mostly-vertical scrolls', () => {
    expect(swipeDirection({ dx: -(SWIPE_MIN_PX - 1), dy: 0, ms: 100 })).toBeNull();
    expect(swipeDirection({ dx: -200, dy: 0, ms: SWIPE_MAX_MS + 1 })).toBeNull();
    expect(swipeDirection({ dx: -100, dy: 90, ms: 200 })).toBeNull(); // diagonal: it is a scroll
    expect(swipeDirection({ dx: 70, dy: 300, ms: 200 })).toBeNull();
  });

  it('survives garbage numbers', () => {
    expect(swipeDirection({ dx: NaN, dy: 0, ms: 100 })).toBeNull();
    expect(swipeDirection({ dx: -100, dy: undefined, ms: 100 })).toBeNull();
  });
});

describe('startsOnOwnGesture', () => {
  it('is true inside fields and the tab strip, false on plain content', () => {
    document.body.innerHTML = '<div id="plain"><p id="p">x</p></div><form><input id="i"></form><nav role="tablist"><button id="b">t</button></nav>';
    expect(startsOnOwnGesture(document.getElementById('p'))).toBe(false);
    expect(startsOnOwnGesture(document.getElementById('i'))).toBe(true);
    expect(startsOnOwnGesture(document.getElementById('b'))).toBe(true);
  });
});
