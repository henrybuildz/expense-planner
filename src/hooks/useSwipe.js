import { useRef } from 'react';
import { startsOnOwnGesture, swipeDirection } from '../utils/swipe';

// Touch handlers for a container: calls onSwipe('next' | 'prev') for a clear sideways swipe that starts anywhere
// inside it (except on things that use sideways drags themselves). Nothing is dragged along with the finger, so
// there is no visual state to glitch; the caller animates after the fact.
export function useSwipe({ enabled, onSwipe }) {
  const start = useRef(null);

  const onTouchStart = (e) => {
    start.current = null;
    if (!enabled || e.touches.length !== 1) return; // two fingers = pinch zoom
    if (window.visualViewport && window.visualViewport.scale > 1.01) return; // zoomed in: sideways means pan
    // Typing in a field: a stray flick must not throw the half-written entry away (switching tab unmounts the form).
    const focused = document.activeElement;
    if (focused && focused.matches && focused.matches('input, textarea, select, [contenteditable="true"]')) return;
    if (startsOnOwnGesture(e.target)) return;
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY, at: Date.now() };
  };

  const onTouchEnd = (e) => {
    const s = start.current;
    start.current = null;
    if (!s || !e.changedTouches || !e.changedTouches[0]) return;
    const t = e.changedTouches[0];
    const dir = swipeDirection({ dx: t.clientX - s.x, dy: t.clientY - s.y, ms: Date.now() - s.at });
    if (dir) onSwipe(dir);
  };

  const onTouchCancel = () => {
    start.current = null;
  };

  return { onTouchStart, onTouchEnd, onTouchCancel };
}
