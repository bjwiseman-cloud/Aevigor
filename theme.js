// Appearance switch with three settings, cycled by one button:
// Auto (match the phone or computer setting) -> Light -> Dark -> Auto.
// The choice is remembered on this device. Auto clears it.
(function () {
  var root = document.documentElement, KEY = 'aev-theme';
  var mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  var ICON = {
    auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19" rx="2"/><path d="M12 6.5a5.5 5.5 0 0 0 0 11z" fill="currentColor"/></svg>',
    light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>',
    dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>'
  };
  var LABEL = { auto: 'Auto', light: 'Light', dark: 'Dark' };
  var NEXT = { auto: 'light', light: 'dark', dark: 'auto' };
  function mode() { var t = root.getAttribute('data-theme'); return t === 'light' || t === 'dark' ? t : 'auto'; }
  function shown() { var m = mode(); return m !== 'auto' ? m : (mq && mq.matches ? 'dark' : 'light'); }
  var btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'theme-btn';
  function paint() {
    var m = mode();
    btn.innerHTML = ICON[m] + '<span>' + LABEL[m] + '</span>';
    btn.setAttribute('aria-label', 'Appearance: ' + (m === 'auto' ? 'matches your device' : LABEL[m]) + '. Tap to switch to ' + LABEL[NEXT[m]] + '.');
    btn.title = m === 'auto' ? 'Matches your phone or computer setting' : LABEL[m] + ' mode';
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) metas[i].setAttribute('content', shown() === 'dark' ? '#171513' : '#f3eee3');
  }
  btn.addEventListener('click', function () {
    var next = NEXT[mode()];
    if (next === 'auto') { root.removeAttribute('data-theme'); try { localStorage.removeItem(KEY); } catch (e) {} }
    else { root.setAttribute('data-theme', next); try { localStorage.setItem(KEY, next); } catch (e) {} }
    paint();
  });
  document.body.appendChild(btn);
  if (mq && mq.addEventListener) mq.addEventListener('change', paint);
  paint();
})();
