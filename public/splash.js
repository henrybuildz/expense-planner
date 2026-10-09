/* Launch splash controller. Kept as an external file (not inline) because the page's
 * Content-Security-Policy only allows scripts from this site. It runs in <head>, before the page paints.
 *
 *  - The splash plays once per launch (per browser tab / installed-app session), not on every refresh.
 *    Add ?splash to the address to force it, e.g. https://.../expense-planner/?splash
 *  - It is also skipped when it already played within the last REPLAY_MS (reopening the app a few minutes later).
 *  - Tap, click or any key skips it.
 *  - It doubles as a loading screen: if the app has not appeared yet when the curtain is due to lift
 *    (slow connection), the curtain waits for it, for at most MAX_WAIT_MS.
 *  - The CSS animation hides the splash by itself and a timer removes it, so a failure here can never
 *    leave the app covered for long.
 *  - Startup watchdog (runs on EVERY load, even when the splash is skipped): if the app has still not
 *    appeared after STARTUP_MS (a script that failed to load or run, or a very slow connection) it shows a
 *    plain "taking longer than expected" message with a Reload button instead of leaving a blank page.
 *    The app, once it does load, simply replaces that message. In-app crashes are handled separately by the
 *    app's own ErrorBoundary; this covers the case where the app never gets to start.
 */
(function () {
  var root = document.documentElement;
  var KEY = 'pocket-book:splash-seen';
  var LAST_KEY = 'pocket-book:splash-last'; // localStorage: when it last played
  var REPLAY_MS = 30 * 60 * 1000;
  var MAX_WAIT_MS = 8000; // hard limit: the splash is gone by then no matter what
  var STARTUP_MS = 10000; // no app by then: say so
  var forced = /[?&]splash(=|&|$)/.test(window.location.search);

  var showStartupProblem = function (app) {
    var box = document.createElement('div');
    box.setAttribute('role', 'alert');
    box.style.cssText =
      'max-width:28rem;margin:20vh auto 0;padding:1.5rem;text-align:center;color:#334155;' +
      'font:16px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
    var title = document.createElement('h1');
    title.textContent = 'Pocket Book is taking longer than expected to start';
    title.style.cssText = 'font-size:1.125rem;margin:0 0 .5rem;color:#1e293b';
    var text = document.createElement('p');
    text.textContent = 'Your data is safe in this browser. Check your connection, then reload.';
    text.style.margin = '0 0 1rem';
    var button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Reload';
    button.style.cssText =
      'padding:.5rem 1rem;border:0;border-radius:.5rem;background:#059669;color:#fff;font:inherit;cursor:pointer';
    button.addEventListener('click', function () {
      window.location.reload();
    });
    box.appendChild(title);
    box.appendChild(text);
    box.appendChild(button);
    app.appendChild(box);
  };

  document.addEventListener('DOMContentLoaded', function () {
    var app = document.getElementById('root');
    if (!app) return;
    window.setTimeout(function () {
      if (app.childNodes.length === 0) showStartupProblem(app);
    }, STARTUP_MS);
  });

  try {
    if (!forced && window.sessionStorage.getItem(KEY)) {
      root.classList.add('no-splash');
      return;
    }
    var last = Number(window.localStorage.getItem(LAST_KEY));
    if (!forced && last && Date.now() - last >= 0 && Date.now() - last < REPLAY_MS) {
      root.classList.add('no-splash');
      return;
    }
    window.sessionStorage.setItem(KEY, '1');
    window.localStorage.setItem(LAST_KEY, String(Date.now()));
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
