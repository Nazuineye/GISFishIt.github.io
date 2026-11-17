/* UI Micro-interactions & CSS-Only Animation Helpers */
(function (win) {
  function startProgress() {
    var bar = document.getElementById('top-progress-bar');
    if (!bar) return;
    bar.classList.add('active');
    bar.style.transform = 'scaleX(0.35)';
    requestAnimationFrame(function () {
      bar.style.transform = 'scaleX(0.75)';
    });
  }

  function finishProgress() {
    var bar = document.getElementById('top-progress-bar');
    if (!bar) return;
    bar.style.transform = 'scaleX(1)';
    setTimeout(function () {
      bar.classList.remove('active');
      bar.style.transform = 'scaleX(0)';
    }, 320);
  }

  function initScrollReveal() {
    var els = document.querySelectorAll('.reveal-on-scroll');
    if (!els.length) return;
    if (!('IntersectionObserver' in win)) {
      els.forEach(function (el) { el.classList.add('revealed'); });
      return;
    }
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    els.forEach(function (el) { obs.observe(el); });
  }

  function animateCountUp(el, target, suffix, decimals) {
    if (!el || target == null || Number.isNaN(Number(target))) return;
    suffix = suffix || '';
    decimals = decimals || 0;
    var numTarget = Number(target);
    if (win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = numTarget.toFixed(decimals) + suffix;
      return;
    }
    var start = performance.now();
    var dur = 800;
    function frame(now) {
      var p = Math.min((now - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      var val = numTarget * eased;
      el.textContent = val.toFixed(decimals) + suffix;
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function initMagneticButtons() {
    if (win.matchMedia && win.matchMedia('(pointer: coarse)').matches) return;
    document.querySelectorAll('.btn-magnetic').forEach(function (btn) {
      btn.addEventListener('mousemove', function (e) {
        var r = btn.getBoundingClientRect();
        var dx = ((e.clientX - r.left) / r.width - 0.5) * 8;
        var dy = ((e.clientY - r.top) / r.height - 0.5) * 8;
        btn.style.transform = 'translate(' + dx.toFixed(1) + 'px, ' + dy.toFixed(1) + 'px)';
      });
      btn.addEventListener('mouseleave', function () {
        btn.style.transform = '';
      });
    });
  }

  function updateNavIndicator() {
    var nav = document.querySelector('nav.top .nav-inner');
    var ind = document.querySelector('.nav-indicator');
    var active = document.querySelector('nav.top .nav-btn.active');
    if (!nav || !ind || !active) return;
    var nr = nav.getBoundingClientRect();
    var ar = active.getBoundingClientRect();
    ind.style.left = (ar.left - nr.left) + 'px';
    ind.style.width = ar.width + 'px';
  }

  function celebrate() {
    var canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;
    if (win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    canvas.width = 200;
    canvas.height = 200;
    var ctx = canvas.getContext('2d');
    var colors = ['#8B6F47', '#E86A5F', '#4A7C59', '#D4A574', '#2C7A8C'];
    var parts = [];
    for (var i = 0; i < 20; i++) {
      parts.push({
        x: 100 + (Math.random() - 0.5) * 40,
        y: 110,
        vx: (Math.random() - 0.5) * 5,
        vy: -3 - Math.random() * 4,
        size: 4 + Math.random() * 4,
        color: colors[i % colors.length]
      });
    }
    var start = performance.now();
    function tick(now) {
      var elapsed = now - start;
      ctx.clearRect(0, 0, 200, 200);
      parts.forEach(function (p) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.22;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, 1 - elapsed / 1200);
        ctx.fillRect(p.x, p.y, p.size, p.size * 0.7);
      });
      if (elapsed < 1200) requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, 200, 200);
    }
    requestAnimationFrame(tick);
  }

  function renderWeatherSVG(kind) {
    if (kind === 'wave') {
      return '<svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><g class="svg-wave-bounce"><path d="M2 10c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/></g></svg>';
    }
    if (kind === 'cloud') {
      return '<svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><g class="svg-cloud-drift"><path d="M6 18h11a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 6.8 8.5 3.5 3.5 0 0 0 6 18Z"/></g></svg>';
    }
    return '<svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><g class="svg-sun-spin"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4l1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4l1.4-1.4"/></g></svg>';
  }

  // 8 Moon Phase SVG variants
  function renderMoonSVG(idx) {
    var shapes = [
      '<circle cx="12" cy="12" r="8" fill="currentColor" opacity="0.18"/>',
      '<path d="M12 4a8 8 0 0 1 0 16 5 8 0 0 0 0-16Z" fill="currentColor"/>',
      '<path d="M12 4a8 8 0 0 1 0 16V4Z" fill="currentColor"/>',
      '<path d="M12 4a8 8 0 0 1 0 16 3 8 0 0 1 0-16Z" fill="currentColor"/>',
      '<circle cx="12" cy="12" r="8" fill="currentColor"/>',
      '<path d="M12 4a8 8 0 0 0 0 16 3 8 0 0 0 0-16Z" fill="currentColor"/>',
      '<path d="M12 4a8 8 0 0 0 0 16V4Z" fill="currentColor"/>',
      '<path d="M12 4a8 8 0 0 0 0 16 5 8 0 0 1 0-16Z" fill="currentColor"/>'
    ];
    return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="8"/>' + (shapes[idx % 8] || '') + '</svg>';
  }

  win.startProgress = startProgress;
  win.finishProgress = finishProgress;
  win.initScrollReveal = initScrollReveal;
  win.animateCountUp = animateCountUp;
  win.initMagneticButtons = initMagneticButtons;
  win.updateNavIndicator = updateNavIndicator;
  win.celebrate = celebrate;
  win.renderWeatherSVG = renderWeatherSVG;
  win.renderMoonSVG = renderMoonSVG;
})(window);
