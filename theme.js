// Light / dark switch. The site follows the device setting until the visitor taps the button,
// then remembers their choice on this device.
(function () {
  var root = document.documentElement, KEY = 'aev-theme';
  var mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function current() { return root.getAttribute('data-theme') || (mq && mq.matches ? 'dark' : 'light'); }
  function paint() {
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', current() === 'dark' ? '#171513' : '#f3eee3');
    if (btn) btn.setAttribute('aria-label', current() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  }
  var btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'theme-btn';
  btn.innerHTML =
    '<svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>' +
    '<svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>';
  btn.addEventListener('click', function () {
    var next = current() === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem(KEY, next); } catch (e) {}
    paint();
  });
  document.body.appendChild(btn);
  if (mq && mq.addEventListener) mq.addEventListener('change', paint);
  paint();
})();
