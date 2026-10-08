/* Launch splash controller. Kept as an external file (not inline) because the page's
 * Content-Security-Policy only allows scripts from this site. It runs in <head>, before the page paints.
 *
 *  - The splash plays once per launch (per browser tab / installed-app session), not on every refresh.
 *    Add ?splash to the address to force it, e.g. https://.../expense-planner/?splash
 *  - Tap, click or any key skips it.
 *  - It doubles as a loading screen: if the app has not appeared yet when the curtain is due to lift
 *    (slow connection), the curtain waits for it, for at most MAX_WAIT_MS.
 *  - The CSS animation hides the splash by itself and a timer removes it, so a failure here can never
 *    leave the app covered for long.
 */
(function () {
  var root = document.documentElement;
  var KEY = 'pocket-book:splash-seen';
  var MAX_WAIT_MS = 8000; // hard limit: the splash is gone by then no matter what
  var forced = /[?&]splash(=|&|$)/.test(window.location.search);
  try {
    if (!forced && window.sessionStorage.getItem(KEY)) {
      root.classList.add('no-splash');
      return;
    }
    window.sessionStorage.setItem(KEY, '1');
  } catch (e) {
    /* storage blocked: just play it */
  }

  document.addEventListener('DOMContentLoaded', function () {
    var el = document.getElementById('splash');
    if (!el) return;
    var app = document.getElementById('root');
    var done = function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    };
    el.addEventListener('animationend', function (e) {
      if (e.animationName === 'splash-exit' || e.animationName === 'splash-fade') done();
    });

    // --- hold the curtain until the app has mounted
    // subtree: the intro clock lives on a child element; without it only the splash's own animation is returned
    var running = el.getAnimations ? el.getAnimations({ subtree: true }) : [];
    var find = function (name) {
      for (var i = 0; i < running.length; i++) if (running[i].animationName === name) return running[i];
      return null;
    };
    var exit = find('splash-exit'); // absent with reduced motion: that variant is a short fade, nothing to hold
    var intro = find('splash-title'); // its clock = how far into the intro we are
    var mounted = function () {
      return !!app && app.childNodes.length > 0;
    };
    var observer = null;
    var release = function (finishNow) {
      if (observer) observer.disconnect();
      observer = null;
      if (!exit) return;
      // resume the exit in step with the intro (so it lifts right away if the intro is already over)
      if (!finishNow && intro && intro.currentTime != null) exit.currentTime = Number(intro.currentTime);
      exit.play();
      exit = null;
    };
    if (exit && intro && !mounted()) {
      exit.pause();
      if (app && window.MutationObserver) {
        observer = new MutationObserver(function () {
          if (mounted()) release(false);
        });
        observer.observe(app, { childList: true });
      } else {
        release(false); // cannot watch the app: do not hold
      }
    }

    var skip = function () {
      el.classList.add('splash-skip');
      release(true);
    };
    el.addEventListener('pointerdown', skip);
    window.addEventListener('keydown', skip, { once: true });
    window.setTimeout(function () {
      release(true);
      done();
    }, MAX_WAIT_MS);
  });
})();
