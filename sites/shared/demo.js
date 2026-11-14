// Shared by both demo sites: the switches that make a page behave like a real, slightly awkward website.
//
// Add these to any address (they are remembered for the tab):
//   ?look=2        the "redesigned" site: new layout, new wording, new ids
//   ?look=1        back to the first design
//   ?tricky=1      the checkout asks for more than it should (for the Over-Ask Alert)
//   ?timeout=90    the session runs out after 90 seconds, with a countdown for the last 45
//   ?reset=1       forget all of the above, the basket and the booking
(function () {
  const params = new URLSearchParams(location.search);
  const store = {
    get(key, fallback) {
      try {
        return sessionStorage.getItem('demo-' + key) ?? fallback;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        sessionStorage.setItem('demo-' + key, value);
      } catch {}
    },
    clear() {
      try {
        sessionStorage.clear();
        localStorage.removeItem('demo-basket');
      } catch {}
    },
  };
  if (params.get('reset')) store.clear();
  for (const key of ['look', 'tricky', 'timeout']) {
    if (params.has(key)) store.set(key, params.get(key));
  }

  const look = store.get('look', '1') === '2' ? 2 : 1;
  const adsHost = location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? `http://${location.hostname}:4174` : '';

  window.Demo = {
    store,
    look,
    tricky: store.get('tricky', '0') === '1',
    timeoutSeconds: Number(store.get('timeout', '900')) || 900,
    /** Adverts come from a second address when there is one, as on real sites. */
    adUrl: (file) => (adsHost ? `${adsHost}/${file}` : `/ads/${file}`),
    money: (n) => `$${n.toFixed(2)}`,
  };
  document.documentElement.classList.add(`look-${look}`);

  // ---- Session timeout: a countdown that is easy to miss, as on real sites ----
  window.Demo.startTimeout = function (onExpire) {
    const total = window.Demo.timeoutSeconds;
    const warnAt = Math.min(60, Math.floor(total / 2));
    let left = total;
    let bar = null;
    const tick = () => {
      left -= 1;
      if (left <= warnAt && !bar) {
        bar = document.createElement('div');
        bar.className = 'session-bar';
        bar.setAttribute('role', 'status');
        bar.innerHTML = 'For your security, this page will reset in <span class="session-left"></span>. <a href="#" class="session-stay">Stay on this page</a>';
        document.body.prepend(bar);
        bar.querySelector('.session-stay').addEventListener('click', (e) => {
          e.preventDefault();
          left = total;
          bar.remove();
          bar = null;
        });
      }
      if (bar) {
        const m = Math.floor(Math.max(left, 0) / 60);
        const s = String(Math.max(left, 0) % 60).padStart(2, '0');
        bar.querySelector('.session-left').textContent = `${m}:${s}`;
      }
      if (left <= 0) {
        clearInterval(timer);
        if (bar) bar.innerHTML = 'Your session ended and the form was cleared. Please start again.';
        onExpire?.();
      }
    };
    const timer = setInterval(tick, 1000);
  };
})();
