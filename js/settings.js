/* Settings Module — Native <dialog> for Emergency Contacts (FIX #1), Boat Specs, Notifications, Auto Dark Mode */
(function (win) {
  function openSettingsModal() {
    var dlg = document.getElementById('settings-dialog');
    if (!dlg) return;
    var settings = win.getSettings();
    renderContactsList(settings);

    document.getElementById('set-boat-name').value = settings.boat.name || '';
    document.getElementById('set-boat-size').value = settings.boat.sizeMeters || 9;
    document.getElementById('set-boat-cap').value = settings.boat.capacity || 4;
    document.getElementById('set-boat-speed').value = settings.boat.speedKmh || 10;
    document.getElementById('set-boat-fuel').value = settings.boat.fuelLph || 4.5;
    document.getElementById('set-notif-toggle').checked = Boolean(settings.notificationsEnabled);
    document.getElementById('set-autodark-toggle').checked = Boolean(settings.autoDarkMode);

    if (typeof dlg.showModal === 'function') dlg.showModal();
  }

  function renderContactsList(settings) {
    var list = document.getElementById('settings-contacts-list');
    if (!list) return;
    var contacts = settings.contacts && settings.contacts.length ? settings.contacts : [{ name: 'SAR', phone: '6281234567890' }];
    list.innerHTML = contacts.slice(0, 3).map(function (c, i) {
      var checked = (settings.primaryContactIndex || 0) === i ? 'checked' : '';
      return '<div class="timeline-entry" data-contact-idx="' + i + '" style="align-items:center;flex-wrap:wrap">' +
        '<label style="display:flex;align-items:center;gap:6px"><input type="radio" name="primary-contact" value="' + i + '" ' + checked + '> Utama</label>' +
        '<input type="text" class="contact-name" placeholder="Nama kontak" value="' + String(c.name || '').replace(/"/g, '&quot;') + '" style="flex:1;min-width:110px">' +
        '<input type="tel" class="contact-phone" placeholder="6281234567890" value="' + String(c.phone || '').replace(/"/g, '&quot;') + '" style="flex:1;min-width:130px">' +
        (contacts.length > 1 ? '<button type="button" class="btn small remove-contact" data-idx="' + i + '" aria-label="Hapus kontak">&times;</button>' : '') +
        '</div>';
    }).join('');

    list.querySelectorAll('.remove-contact').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.getAttribute('data-idx'), 10);
        var cur = collectSettingsFromDom();
        cur.contacts.splice(idx, 1);
        if (cur.primaryContactIndex >= cur.contacts.length) cur.primaryContactIndex = 0;
        renderContactsList(cur);
      });
    });
  }

  function collectSettingsFromDom() {
    var current = win.getSettings();
    var rows = document.querySelectorAll('#settings-contacts-list [data-contact-idx]');
    var contacts = [];
    rows.forEach(function (row) {
      var name = row.querySelector('.contact-name').value.trim();
      var phone = row.querySelector('.contact-phone').value.trim().replace(/[^\d]/g, '');
      if (phone) contacts.push({ name: name || 'Kontak Darurat', phone: phone });
    });
    if (!contacts.length) contacts = current.contacts;

    var primaryRadio = document.querySelector('input[name="primary-contact"]:checked');
    var primaryIdx = primaryRadio ? parseInt(primaryRadio.value, 10) : 0;
    if (primaryIdx >= contacts.length) primaryIdx = 0;

    return {
      contacts: contacts.slice(0, 3),
      primaryContactIndex: primaryIdx,
      boat: {
        name: document.getElementById('set-boat-name').value.trim() || 'KM Bahari',
        sizeMeters: parseFloat(document.getElementById('set-boat-size').value) || 9,
        capacity: parseInt(document.getElementById('set-boat-cap').value, 10) || 4,
        speedKmh: parseFloat(document.getElementById('set-boat-speed').value) || 10,
        fuelLph: parseFloat(document.getElementById('set-boat-fuel').value) || 4.5
      },
      notificationsEnabled: document.getElementById('set-notif-toggle').checked,
      autoDarkMode: document.getElementById('set-autodark-toggle').checked
    };
  }

  function bindSettingsModal() {
    var addBtn = document.getElementById('set-add-contact');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        var cur = collectSettingsFromDom();
        if (cur.contacts.length >= 3) {
          win.showToast('Maksimal 3 kontak darurat', 'warning');
          return;
        }
        cur.contacts.push({ name: '', phone: '' });
        renderContactsList(cur);
      });
    }

    var notifToggle = document.getElementById('set-notif-toggle');
    if (notifToggle) {
      notifToggle.addEventListener('change', async function () {
        if (!notifToggle.checked) return;
        if (!('Notification' in win)) {
          win.showToast('Browser tidak mendukung notifikasi', 'warning');
          notifToggle.checked = false;
          return;
        }
        var perm = await Notification.requestPermission();
        if (perm !== 'granted') {
          win.showToast('Izin notifikasi ditolak', 'warning');
          notifToggle.checked = false;
        } else {
          win.showToast('Notifikasi cuaca ekstrem diaktifkan', 'success');
        }
      });
    }

    var saveBtn = document.getElementById('settings-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        var next = collectSettingsFromDom();
        win.saveSettings(next);
        if (typeof win.applyAutoDarkMode === 'function') win.applyAutoDarkMode();
        document.getElementById('settings-dialog').close();
        win.showToast('Pengaturan disimpan', 'success');
        win.celebrate();
      });
    }

    var clearBtn = document.getElementById('set-clear-all-data');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        win.openConfirmModal({
          title: 'Hapus Semua Data Lokal?',
          message: 'Seluruh pengaturan, favorit, catch log, jejak GPS, dan umpan balik akan dihapus permanen.',
          confirmText: 'Lanjutkan',
          danger: true,
          onConfirm: function () {
            win.openConfirmModal({
              title: 'Konfirmasi Terakhir',
              message: 'Tindakan ini tidak dapat dibatalkan. Hapus semua data lokal sekarang?',
              confirmText: 'Ya, Hapus Semua',
              danger: true,
              onConfirm: async function () {
                await win.clearAllLocalData();
                document.getElementById('settings-dialog').close();
                win.showToast('Semua data lokal dihapus', 'info');
              }
            });
          }
        });
      });
    }
  }

  win.openSettingsModal = openSettingsModal;
  win.bindSettingsModal = bindSettingsModal;
})(window);
