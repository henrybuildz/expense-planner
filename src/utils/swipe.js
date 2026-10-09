// Swipe detection, kept free of React so it can be tested on its own.
export const SWIPE_MIN_PX = 60; // far enough to be deliberate
export const SWIPE_MAX_MS = 800; // slower than this is a drag / a hesitant scroll, not a swipe
export const SWIPE_RATIO = 1.5; // must be clearly more sideways than vertical, so scrolling never triggers it

/**
 * dx / dy: how far the finger moved (px, + is right / down); ms: how long it took.
 * Returns 'next' for a swipe to the left (the next page slides in from the right, like most apps),
 * 'prev' for a swipe to the right, and null when it was not a clear sideways swipe.
 */
export function swipeDirection({ dx, dy, ms }) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(ms)) return null;
  if (ms > SWIPE_MAX_MS) return null;
  if (Math.abs(dx) < SWIPE_MIN_PX) return null;
  if (Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return null;
  return dx < 0 ? 'next' : 'prev';
}

// Things a sideways drag already means something to: text selection / sliders in fields, the tab strip, any
// element that scrolls sideways (a swipe there scrolls it instead of changing tab).
const OWN_GESTURE = 'input, textarea, select, [contenteditable="true"], [role="tablist"], header';

export function startsOnOwnGesture(target) {
  for (let el = target; el && el.nodeType === 1; el = el.parentElement) {
    if (el.matches && el.matches(OWN_GESTURE)) return true;
    const style = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
    if (style && /(auto|scroll)/.test(style.overflowX) && el.scrollWidth > el.clientWidth + 1) return true;
  }
  return false;
}
