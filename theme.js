// Appearance menu: Auto (match the phone or computer setting), Light or Dark.
// Uses the browser's own drop-down list. The choice is remembered on this device; Auto clears it.
(function () {
  var root = document.documentElement, KEY = 'aev-theme';
  var mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  var ICON = {
    auto: '<rect x="6.5" y="2.5" width="11" height="19" rx="2"/><path d="M12 6.5a5.5 5.5 0 0 0 0 11z" fill="currentColor"/>',
    light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',
    dark: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'
  };
  function mode() { var t = root.getAttribute('data-theme'); return t === 'light' || t === 'dark' ? t : 'auto'; }
  function shown() { var m = mode(); return m !== 'auto' ? m : (mq && mq.matches ? 'dark' : 'light'); }
  var wrap = document.createElement('label');
  wrap.className = 'theme-btn';
  wrap.title = 'Appearance. Auto matches your phone or computer setting.';
  wrap.innerHTML =
    '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"></svg>' +
    '<select aria-label="Appearance"><option value="auto">Auto</option><option value="light">Light</option><option value="dark">Dark</option></select>' +
    '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  var sel = wrap.querySelector('select'), ico = wrap.querySelector('.ico');
  function paint() {
    var m = mode();
    sel.value = m;
    ico.innerHTML = ICON[m];
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) metas[i].setAttribute('content', shown() === 'dark' ? '#171513' : '#f3eee3');
  }
  sel.addEventListener('change', function () {
    var m = sel.value;
    if (m === 'auto') { root.removeAttribute('data-theme'); try { localStorage.removeItem(KEY); } catch (e) {} }
    else { root.setAttribute('data-theme', m); try { localStorage.setItem(KEY, m); } catch (e) {} }
    paint();
  });
  document.body.appendChild(wrap);
  if (mq && mq.addEventListener) mq.addEventListener('change', paint);
  paint();
})();
