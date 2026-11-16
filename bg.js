// Tron floor grid drawn on a canvas, one smooth frame at a time (lighter on phones than a CSS 3D layer).
(function () {
  var c = document.getElementById('grid'), x = c.getContext('2d'), w, h, dpr, t0 = performance.now();
  var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function size() { dpr = Math.min(window.devicePixelRatio || 1, 2); w = c.clientWidth; h = c.clientHeight; c.width = w * dpr; c.height = h * dpr; x.setTransform(dpr, 0, 0, dpr, 0, 0); }
  function frame(now) {
    var hz = h * 0.48, cx = w / 2, depth = h - hz, speed = 0.3, phase = still ? 0 : ((now - t0) / 1000 * speed) % 1;
    x.clearRect(0, 0, w, h);
    x.lineWidth = 1.5;
    // Lines running toward the horizon
    for (var i = -14; i <= 14; i++) {
      var a = Math.abs(i) / 14;
      x.strokeStyle = 'rgba(0,240,255,' + (0.38 - a * 0.18) + ')';
      x.beginPath(); x.moveTo(cx + i * 6, hz); x.lineTo(cx + i * w * 0.16, h); x.stroke();
    }
    // Cross lines: evenly spaced in depth, so they speed up as they come toward you
    for (var k = 0; k < 14; k++) {
      var z = (k + 1 - phase) / 14, y = hz + depth * Math.pow(z, 1.8);
      var alpha = Math.min(1, z * 1.6) * 0.5;
      x.strokeStyle = 'rgba(0,240,255,' + alpha + ')';
      x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.stroke();
    }
    if (!still) requestAnimationFrame(frame);
  }
  size(); window.addEventListener('resize', size); requestAnimationFrame(frame);
})();
