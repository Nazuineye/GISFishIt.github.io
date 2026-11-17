/* GISFishIt v3 — Boot, Logger & Early Toast (FIX #17) */
(function (win) {
  win.DEBUG = false;
  win.logger = {
    warn: function () {
      if (win.DEBUG && typeof console !== 'undefined') console.warn.apply(console, arguments);
    },
    info: function () {
      if (win.DEBUG && typeof console !== 'undefined') console.info.apply(console, arguments);
    }
  };

  // Define showToast early before any module executes
  win.showToast = function (message, type) {
    type = type || 'info';
    var container = document.getElementById('toast-container');
    if (!container) return;
    if (navigator.vibrate) {
      try { navigator.vibrate([10]); } catch (e) { /* ignore */ }
    }
    var toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(function () {
      toast.classList.add('fade-out');
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 280);
    }, 3500);
  };
})(window);
