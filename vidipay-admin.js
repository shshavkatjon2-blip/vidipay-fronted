    const ADMIN_PRODUCTION_API_BASE_URL = 'https://vidipay-origin-proxy.shshavkatjon2.workers.dev';
    const ADMIN_API_FALLBACKS = [ADMIN_PRODUCTION_API_BASE_URL];

    function normalizeApiBaseUrl(value) {
      const raw = String(value || '').trim().replace(/\/$/, '');
      if (!raw) return '';
      try {
        const url = new URL(raw);
        if (!['https:', 'http:'].includes(url.protocol)) return '';
        if (url.hostname.endsWith('github.io')) return '';
        return `${url.origin}${url.pathname}`.replace(/\/$/, '');
      } catch (err) {
        return '';
      }
    }

    function getCurrentOriginApiBase() {
      if (!/^https?:$/i.test(window.location.protocol)) return '';
      if (window.location.hostname.endsWith('github.io')) return '';
      return normalizeApiBaseUrl(window.location.origin);
    }

    function getAdminApiCandidates() {
      return [...new Set([
        window.VIDIPAY_API_BASE,
        getCurrentOriginApiBase(),
        localStorage.getItem('vidiPayAdminApiBase'),
        ...ADMIN_API_FALLBACKS
      ].map(normalizeApiBaseUrl).filter(Boolean))];
    }

    let API_BASE_URL = getAdminApiCandidates()[0] || ADMIN_PRODUCTION_API_BASE_URL;
    const settingKeys = [
      'view_seconds_required',
      'view_reward_per_second',
      'tier1_reward_per_second',
      'tier2_reward_per_second',
      'tier3_reward_per_second',
      'tier1_countries',
      'tier2_countries',
      'daily_bonus',
      'daily_view_limit',
      'withdraw_min_amount',
      'withdraw_commission_percent',
      'referral_bonus',
      'withdraw_requires_payment',
      'withdraw_opens_at',
      'withdraw_window_hours'
    ];

    function token() {
      return localStorage.getItem('vidipay_admin_token') || document.getElementById('admin-token').value.trim();
    }

    let adminCommandBusy = false;
    let settingsFormRendered = false;

    function setText(id, text) {
      const el = document.getElementById(id);
      if (el && el.innerText !== text) el.innerText = text;
    }

    function setStatus(text) {
      setText('status-line', text);
    }

    function setBusy(buttonId, busy, text) {
      const btn = document.getElementById(buttonId);
      if (!btn) return;
      if (!btn.dataset.label) btn.dataset.label = btn.innerText;
      btn.disabled = busy;
      btn.innerText = busy ? text : btn.dataset.label;
    }

    function formatDateTime(value) {
      if (!value) return '-';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);
      return date.toLocaleString();
    }

    function renderWindowStatus(settings) {
      const box = document.getElementById('window-status-box');
      if (!box) return;
      const info = settings.withdraw_window || {};
      const status = info.status || 'unknown';

      let line = 'Withdrawal timer is not scheduled yet.';
      if (status === 'open') {
        line = `OPEN. Closing time: ${formatDateTime(info.closes_at)}.`;
        box.style.borderColor = 'rgba(34,197,94,.4)';
        box.style.background = 'rgba(34,197,94,.08)';
      } else if (status === 'locked') {
        line = `LOCKED. Opening time: ${formatDateTime(info.opens_at)}.`;
        box.style.borderColor = 'rgba(239,68,68,.4)';
        box.style.background = 'rgba(239,68,68,.08)';
      } else if (status === 'closed') {
        line = `CLOSED. Last closing time: ${formatDateTime(info.closes_at)}.`;
        box.style.borderColor = 'rgba(245,158,11,.4)';
        box.style.background = 'rgba(245,158,11,.08)';
      } else {
        box.style.borderColor = 'rgba(0,255,204,.22)';
        box.style.background = 'rgba(0,255,204,.06)';
      }

      const nextText = `${line} Open duration: ${settings.withdraw_window_hours || 36} hours.`;
      if (box.innerText !== nextText) box.innerText = nextText;
    }

    function fillTimerInputs(settings) {
      const dateInput = document.getElementById('withdraw-open-date');
      const timeInput = document.getElementById('withdraw-open-time');
      const hoursInput = document.getElementById('withdraw-window-hours');
      if (hoursInput) hoursInput.value = settings.withdraw_window_hours || 36;

      if (!settings.withdraw_opens_at) return;
      const date = new Date(settings.withdraw_opens_at);
      if (Number.isNaN(date.getTime())) return;

      const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
      const iso = local.toISOString();
      if (dateInput) dateInput.value = iso.slice(0, 10);
      if (timeInput) timeInput.value = iso.slice(11, 16);
    }

    function applySettings(settings) {
      renderWindowStatus(settings);
      fillTimerInputs(settings);
      return settings;
    }

    function saveToken() {
      localStorage.setItem('vidipay_admin_token', document.getElementById('admin-token').value.trim());
      refreshAll();
    }

    function createIdempotencyKey() {
      if (globalThis.crypto?.randomUUID) {
        return `admin-${globalThis.crypto.randomUUID()}`;
      }
      return `admin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    }

    async function fetchApi(path, options = {}) {
      const candidates = [...new Set([API_BASE_URL, ...getAdminApiCandidates()].map(normalizeApiBaseUrl).filter(Boolean))];
      let lastError = null;

      for (const baseUrl of candidates) {
        try {
          const res = await fetch(`${baseUrl}${path}`, options);
          const text = await res.text();
          let data = null;
          if (text) {
            try {
              data = JSON.parse(text);
            } catch (err) {
              lastError = new Error(`Backend returned an invalid response: ${baseUrl}`);
              continue;
            }
          }
          if (!res.ok) {
            const error = new Error(data?.error || data?.message || 'So‘rov bajarilmadi');
            error.data = data;
            throw error;
          }
          API_BASE_URL = baseUrl;
          localStorage.setItem('vidiPayAdminApiBase', baseUrl);
          return data;
        } catch (err) {
          lastError = err;
          if (err.data) throw err;
        }
      }

      throw lastError || new Error('Backendga ulanib bo‘lmadi');
    }

    async function api(path, options = {}) {
      const method = String(options.method || 'GET').toUpperCase();
      const idempotencyKey = ['POST', 'DELETE'].includes(method)
        ? String(options.headers?.['Idempotency-Key'] || createIdempotencyKey())
        : '';
      return fetchApi(path, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': token(),
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
          ...(options.headers || {})
        }
      });
    }

    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[char]));
    }

    function safeDomId(prefix, value) {
      const safeValue = String(value ?? '').replace(/[^a-zA-Z0-9_-]/g, '_') || 'empty';
      return `${prefix}-${safeValue}`;
    }

    function safeJsString(value) {
      return JSON.stringify(String(value ?? ''));
    }

    function formatMoney(value) {
      return `$${Number(value || 0).toFixed(2)}`;
    }

    function formatTon(value) {
      return `${Number(value || 0).toFixed(2)} TONCOIN`;
    }

    function normalizeAdminStatus(value) {
      const status = String(value || 'pending').toLowerCase();
      if (['approved', 'completed', 'complete', 'paid', 'auto_paid', 'success', 'sent', 'verified', 'confirmed'].includes(status)) return 'completed';
      if (['rejected', 'failed', 'error', 'cancelled', 'canceled'].includes(status)) return 'rejected';
      if (['pending', 'processing', 'queued', 'requested', 'created', 'submitted'].includes(status)) return 'processing';
      return status;
    }

    function statusCell(value) {
      const status = normalizeAdminStatus(value);
      return `<span class="status ${escapeHtml(status)}">${escapeHtml(status)}</span>`;
    }

    function adminAddress(value) {
      const address = String(value || '').trim();
      return address ? `<div class="admin-address">${escapeHtml(address)}</div>` : '<span class="admin-muted">-</span>';
    }

    function adminDate(value) {
      return `<span class="admin-muted">${escapeHtml(formatDateTime(value))}</span>`;
    }

    function adminTx(value) {
      const tx = String(value || '').trim();
      return tx ? `<div class="admin-address">${escapeHtml(tx)}</div>` : '<span class="admin-muted">-</span>';
    }

    function renderTable(id, headers, rows) {
      const table = document.getElementById(id);
      table.innerHTML = `<thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>` +
        `<tbody>${rows.join('') || `<tr><td colspan="${headers.length}">No data</td></tr>`}</tbody>`;
    }

    async function loadPublicSettings() {
      return fetchApi('/settings');
    }

    async function loadBackendStatus() {
      return fetchApi('/');
    }

    async function setTelegramMenuButton() {
      try {
        setBusy('btn-set-menu-button', true, 'Yangilanmoqda...');
        const statusBox = document.getElementById('telegram-menu-status');
        if (statusBox) statusBox.innerText = 'Backenddan yangi mini app URL olinmoqda...';

        const backendStatus = await loadBackendStatus();
        const input = document.getElementById('telegram-menu-url');
        const url = (input.value || backendStatus.webapp_url || '').trim();
        if (!url) throw new Error('Mini app URL was not found. Deploy the backend first.');
        if (input) input.value = url;

        const result = await api('/admin/telegram/set-menu-button', {
          method: 'POST',
          body: JSON.stringify({ url, text: 'Open Vidi Pay' })
        });

        if (statusBox) statusBox.innerText = `Telegram menu updated: ${result.url || url}`;
        setStatus('Telegram menu button updated.');
      } catch (err) {
        const statusBox = document.getElementById('telegram-menu-status');
        if (statusBox) statusBox.innerText = `Telegram menu error: ${err.message}`;
        setStatus(`Telegram menu error: ${err.message}`);
      } finally {
        setBusy('btn-set-menu-button', false);
      }
    }

    async function loadSettings(options = {}) {
      const renderForm = options.renderForm !== false;
      const settings = applySettings(await api('/admin/settings'));
      if (!renderForm) return settings;
      if (settingsFormRendered) {
        for (const key of settingKeys) {
          const input = document.getElementById(`setting-${key}`);
          if (input) input.value = settings[key] ?? '';
        }
        return settings;
      }
      const box = document.getElementById('settings-form');
      box.innerHTML = settingKeys.map(key => `
        <div class="setting-field">
          <label>${escapeHtml(key)}</label>
          <input id="setting-${escapeHtml(key)}" value="${escapeHtml(settings[key] ?? '')}">
        </div>
      `).join('');
      settingsFormRendered = true;
      return settings;
    }

    async function saveSettings() {
      try {
        setStatus('Saving settings...');
        const body = {};
        for (const key of settingKeys) {
          const value = document.getElementById(`setting-${key}`).value;
          body[key] = key === 'withdraw_requires_payment' ? value === 'true' : value;
        }
        await api('/admin/settings', { method: 'POST', body: JSON.stringify(body) });
        setStatus('Settings saved.');
        await loadSettings();
      } catch (err) {
        setStatus(`Settings error: ${err.message}`);
      }
    }

    async function scheduleWithdrawWindow() {
      if (adminCommandBusy) return;
      const dateValue = document.getElementById('withdraw-open-date').value;
      const timeValue = document.getElementById('withdraw-open-time').value || '00:00';
      const hours = Number(document.getElementById('withdraw-window-hours').value || 36);

      if (!dateValue) {
        setStatus('Select the opening date first.');
        return;
      }

      if (!Number.isFinite(hours) || hours < 1) {
        setStatus("Duration must be at least 1 hour.");
        return;
      }

      try {
        adminCommandBusy = true;
        setBusy('btn-schedule-withdraw', true, 'Scheduling...');
        setStatus('Scheduling the withdrawal timer...');
        const opensAt = new Date(`${dateValue}T${timeValue}:00`);
        const result = await api('/admin/settings', {
          method: 'POST',
          body: JSON.stringify({
            withdraw_opens_at: opensAt.toISOString(),
            withdraw_window_hours: hours
          })
        });

        const settings = applySettings(result.settings || await loadPublicSettings());
        setStatus(settings.withdraw_window?.status === 'locked' || settings.withdraw_window?.status === 'open'
          ? 'Command completed and confirmed by the backend.'
          : 'Command was sent, but check the status again.');
      } catch (err) {
        setStatus(`Timer error: ${err.message}`);
      } finally {
        adminCommandBusy = false;
        setBusy('btn-schedule-withdraw', false);
      }
    }

    async function openWithdrawNow() {
      if (adminCommandBusy) return;
      const hours = Number(document.getElementById('withdraw-window-hours').value || 36);

      if (!Number.isFinite(hours) || hours < 1) {
        setStatus("Duration must be at least 1 hour.");
        return;
      }

      try {
        adminCommandBusy = true;
        setBusy('btn-open-withdraw-now', true, 'Opening...');
        setStatus(`Withdrawal window ${hours} hours is opening...`);
        const result = await api('/admin/settings', {
          method: 'POST',
          body: JSON.stringify({
            withdraw_opens_at: new Date().toISOString(),
            withdraw_window_hours: hours
          })
        });

        const settings = applySettings(result.settings || await loadPublicSettings());
        setStatus(settings.withdraw_window?.status === 'open'
          ? 'Withdrawal window ochildi. Backend tasdiqladi.'
          : 'Command was sent, but the backend still does not report open.');
      } catch (err) {
        setStatus(`Open error: ${err.message}`);
      } finally {
        adminCommandBusy = false;
        setBusy('btn-open-withdraw-now', false);
      }
    }

    async function closeWithdrawNow() {
      if (adminCommandBusy) return;
      try {
        adminCommandBusy = true;
        setBusy('btn-close-withdraw-now', true, 'Closing...');
        setStatus('Withdrawal window yopilyapti...');
        const result = await api('/admin/settings', {
          method: 'POST',
          body: JSON.stringify({
            withdraw_opens_at: '',
            withdraw_window_hours: Number(document.getElementById('withdraw-window-hours').value || 36)
          })
        });

        const settings = applySettings(result.settings || await loadPublicSettings());
        setStatus(settings.withdraw_window?.is_open
          ? 'Close command was sent, but the backend still reports it as open.'
          : 'Withdrawal window yopildi. Wallet qulfga tusyesdi.');
      } catch (err) {
        setStatus(`Close error: ${err.message}`);
      } finally {
        adminCommandBusy = false;
        setBusy('btn-close-withdraw-now', false);
      }
    }

    async function loadUsers() {
      const payload = await api('/admin/users?limit=10000');
      const users = Array.isArray(payload) ? payload : (payload.users || []);
      const countEl = document.getElementById('users-count');
      if (countEl) countEl.innerText = `${users.length}  users loaded. Real Telegram users and backend-synced guests are shown in this list.`;
      renderTable('users-table', ['Database ID', 'Telegram ID', 'Username', 'Name', 'Balance', 'Total time', 'Daily income', 'Lock', 'Status', 'Action'], users.map(u => `
        <tr id="${safeDomId('user-row', u.telegram_id)}">
          <td>${escapeHtml(u.id)}</td><td>${escapeHtml(u.telegram_id)}</td>
          <td>${escapeHtml(u.username || '-')}</td><td>${escapeHtml([u.first_name, u.last_name].filter(Boolean).join(' ') || '-')}</td>
          <td>${formatMoney(u.balance)}</td><td>${Number(u.total_watch_seconds || 0)}s</td>
          <td>${formatMoney(u.daily_income)}</td><td>${u.withdraw_unlocked ? 'yes' : 'no'}</td>
          ${renderUserControlCells(u)}
        </tr>
      `));
    }

    function renderUserControlCells(user) {
      const blocked = Boolean(user.is_blocked || user.deleted_at);
      const label = user.deleted_at ? 'account deleted' : (blocked ? 'blocked' : 'active');
      const pillClass = blocked ? 'blocked' : 'active';
      const lockClass = blocked ? 'lock-anim' : 'lock-anim unlock-anim';
      const buttonClass = blocked ? 'ok user-action' : 'danger user-action';
      const nextAction = blocked ? false : true;
      const buttonText = blocked ? 'Unblock' : 'Block';
      const statusId = safeDomId('user-status', user.telegram_id);
      const actionId = safeDomId('user-action', user.telegram_id);

      return `
        <td id="${statusId}">
          <span class="user-status-pill ${pillClass}">
            <span class="${lockClass}"></span>
            ${label}
          </span>
        </td>
        <td id="${actionId}">
          <button class="${buttonClass}" data-admin-action="set-user-block" data-admin-telegram-id="${escapeHtml(user.telegram_id)}" data-admin-should-block="${nextAction}">${buttonText}</button>
        </td>
      `;
    }

    function paintUserBlockState(telegramId, blocked, busy = false) {
      const row = document.getElementById(safeDomId('user-row', telegramId));
      const statusCell = document.getElementById(safeDomId('user-status', telegramId));
      const actionCell = document.getElementById(safeDomId('user-action', telegramId));
      if (row) row.classList.toggle('user-changing', busy);

      if (statusCell) {
        statusCell.innerHTML = `
          <span class="user-status-pill ${blocked ? 'blocked' : 'active'}">
            <span class="lock-anim ${blocked ? '' : 'unlock-anim'}"></span>
            ${busy ? 'processing...' : (blocked ? 'blocked' : 'active')}
          </span>
        `;
      }

      if (actionCell) {
        actionCell.innerHTML = blocked
          ? `<button class="ok user-action" ${busy ? 'disabled' : ''} data-admin-action="set-user-block" data-admin-telegram-id="${escapeHtml(telegramId)}" data-admin-should-block="false">Unblock</button>`
          : `<button class="danger user-action" ${busy ? 'disabled' : ''} data-admin-action="set-user-block" data-admin-telegram-id="${escapeHtml(telegramId)}" data-admin-should-block="true">Block</button>`;
      }
    }

    async function setUserBlock(telegramId, shouldBlock) {
      try {
        paintUserBlockState(telegramId, shouldBlock, true);
        setStatus(shouldBlock ? 'Blocking user...' : 'Unblocking user...');
        await api(`/admin/users/${encodeURIComponent(telegramId)}/${shouldBlock ? 'block' : 'unblock'}`, {
          method: 'POST',
          body: '{}'
        });
        paintUserBlockState(telegramId, shouldBlock, false);
        setStatus(shouldBlock ? 'User blocked.' : 'User unblocked.');
        await loadUsers();
      } catch (err) {
        setStatus(`User action error: ${err.message}`);
        await loadUsers();
      }
    }

    async function addManualEarning() {
      const telegramId = document.getElementById('earning-telegram-id').value.trim();
      const amount = Number(document.getElementById('earning-amount').value);
      const minutes = Number(document.getElementById('earning-minutes').value || 0);
      const status = document.getElementById('manual-earning-status');

      if (!telegramId || !Number.isFinite(amount) || amount <= 0) {
        status.innerText = "Enter Telegram ID and a positive amount.";
        return;
      }

      try {
        setBusy('btn-add-earning', true, "Adding...");
        status.innerText = "Balance va vaqt yangilanyapti...";
        const result = await api(`/admin/users/${encodeURIComponent(telegramId)}/add-earning`, {
          method: 'POST',
          body: JSON.stringify({ amount, minutes })
        });
        status.innerText = `$${Number(result.amount).toFixed(2)} added. Time: ${result.seconds}s.`;
        await loadUsers();
      } catch (err) {
        status.innerText = `Error: ${err.message}`;
      } finally {
        setBusy('btn-add-earning', false);
      }
    }

    async function addManualHistory() {
      const telegramId = document.getElementById('history-telegram-id').value.trim();
      const amount = Number(document.getElementById('history-amount').value);
      const dateValue = document.getElementById('history-date').value;
      const timeValue = document.getElementById('history-time').value || '00:00';
      const walletType = document.getElementById('history-wallet-type').value.trim() || 'TON';
      const walletAddress = document.getElementById('history-wallet-address').value.trim() || 'Admin wallet';
      const historyStatus = document.getElementById('history-status').value;
      const note = document.getElementById('history-note').value.trim() || "Admin-added history";
      const status = document.getElementById('manual-history-status');

      if (!telegramId || !Number.isFinite(amount) || amount <= 0 || !dateValue) {
        status.innerText = "Enter Telegram ID, amount, and date correctly.";
        return;
      }

      try {
        setBusy('btn-add-history', true, "Adding...");
        status.innerText = "Adding history entry...";
        const createdAt = new Date(`${dateValue}T${timeValue}:00`);
        const result = await api(`/admin/users/${encodeURIComponent(telegramId)}/history/withdraw`, {
          method: 'POST',
          body: JSON.stringify({
            amount,
            wallet_type: walletType,
            wallet_address: walletAddress,
            status: historyStatus,
            admin_note: note,
            created_at: createdAt.toISOString(),
            processed_at: createdAt.toISOString()
          })
        });
        status.innerText = `History added. ID: ${result.withdraw.id}`;
        await loadWithdraws();
      } catch (err) {
        status.innerText = `Error: ${err.message}`;
      } finally {
        setBusy('btn-add-history', false);
      }
    }

    async function sendNotification() {
      try {
        setBusy('btn-send-notify', true, 'Sending...');
        const title = document.getElementById('notify-title').value.trim();
        const message = document.getElementById('notify-message').value.trim();
        const telegram_id = document.getElementById('notify-telegram-id').value.trim();

        await api('/admin/notification/send', {
          method: 'POST',
          body: JSON.stringify({ title, message, telegram_id: telegram_id || null })
        });

        setStatus('Notification sent.');
        document.getElementById('notify-title').value = '';
        document.getElementById('notify-message').value = '';
      } catch (err) {
        setStatus(`Notification error: ${err.message}`);
      } finally {
        setBusy('btn-send-notify', false);
      }
    }

    async function loadWithdraws() {
      const status = document.getElementById('withdraw-status').value;
      const items = await api(`/admin/withdraws?status=${encodeURIComponent(status)}`);
      renderTable('withdraws-table', ['ID', 'Telegram', 'Amount', 'Wallet', 'Type', 'Status', 'TX', 'Created', 'Actions'], items.map(w => {
        const withdrawStatus = normalizeAdminStatus(w.status);
        const walletType = w.wallet_type || w.method || 'TON';
        const scope = w.withdraw_scope || w.scope || (walletType === 'TON_DEPOSIT_REFUND' ? 'deposit_refund' : 'withdraw');
        const canApprove = withdrawStatus === 'processing' || String(w.status || '').toLowerCase() === 'pending';
        return `
        <tr>
          <td>${escapeHtml(w.id)}</td>
          <td>${escapeHtml(w.telegram_id)}</td>
          <td>${formatTon(w.amount)}</td>
          <td><div class="admin-muted">${escapeHtml(walletType)}</div>${adminAddress(w.wallet_address)}</td>
          <td>${escapeHtml(scope)}</td>
          <td>${statusCell(w.status)}</td>
          <td>${adminTx(w.tx_hash || w.payout_tx_hash)}</td>
          <td>${adminDate(w.created_at)}</td>
          <td>
            ${canApprove ? `<button class="ok" data-admin-action="approve-withdraw" data-admin-id="${escapeHtml(w.id)}">Mark as paid</button>
            <button class="danger" data-admin-action="reject-withdraw" data-admin-id="${escapeHtml(w.id)}">Reject</button>` : '<span class="admin-muted">No action</span>'}
          </td>
        </tr>
      `;
      }));
    }

    async function approveWithdraw(id) {
      await api(`/admin/withdraw/${id}/approve`, { method: 'POST', body: '{}' });
      await loadWithdraws();
    }

    async function rejectWithdraw(id) {
      const reason = prompt('Reject reason') || 'Rejected by admin';
      await api(`/admin/withdraw/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
      await loadWithdraws();
    }

    async function loadPaymentOrders() {
      const status = document.getElementById('payment-status').value;
      const items = await api(`/admin/payment-orders?status=${encodeURIComponent(status)}`);
      renderTable('payments-table', ["ID", "Telegram ID", "Required", "Paid", "Wallet", "Valid until", "Status", "TX", "Actions"], items.map(p => {
        const paymentStatus = normalizeAdminStatus(p.status);
        const wallet = p.wallet_address || p.ton_wallet_address || p.to_wallet || p.admin_wallet || '';
        const paidAmount = p.paid_amount || p.detected_amount || p.amount_paid || '';
        const canManualApprove = paymentStatus === 'processing' || String(p.status || '').toLowerCase() === 'pending';
        return `
        <tr>
          <td>${escapeHtml(p.id)}</td>
          <td>${escapeHtml(p.telegram_id)}</td>
          <td>${formatTon(p.required_amount || p.amount)}</td>
          <td>${paidAmount ? formatTon(paidAmount) : '<span class="admin-muted">waiting</span>'}</td>
          <td>${adminAddress(wallet)}</td>
          <td>${adminDate(p.expires_at || p.valid_until)}</td>
          <td>${statusCell(p.status)}</td>
          <td>${adminTx(p.tx_hash || p.payment_tx_hash)}</td>
          <td>
            ${canManualApprove ? `<button class="warning" data-admin-action="approve-payment-order" data-admin-id="${escapeHtml(p.id)}">Manual backup</button>` : '<span style="color:var(--ok);">Completed</span>'}
          </td>
        </tr>
      `;
      }));
    }

    async function approvePaymentOrder(id) {
      if(!confirm("This is only a backup manual approval. Checking the automatic scanner first is recommended. Approve anyway?")) return;
      try {
        setStatus('Manual backup approval is running...');
        await api(`/admin/payment-orders/${id}/approve`, { method: 'POST', body: '{}' });
        await loadPaymentOrders();
        await loadPaymentWallets();
        setStatus('Manual backup approval completed.');
      } catch(err) {
        setStatus(`Manual backup approval error: ${err.message}`);
      }
    }

    async function loadPaymentWallets() {
      const box = document.getElementById('payment-scanner-status');
      try {
        const data = await api('/admin/payment-wallets');
        const scanner = data.scanner || {};
        const config = data.config || {};
        const lastRun = scanner.lastRunAt ? new Date(scanner.lastRunAt).toLocaleString() : 'not yet';
        if (box) {
          box.innerText = [
            `Wallets: total ${data.total || 0}, active ${data.active || 0}, available ${data.available || 0}, assigned ${data.assigned || 0}`,
            `Pending orders: ${data.pending_orders || 0}`,
            `Scanner: every ${Math.round((config.scan_interval_ms || 15000) / 1000)} seconds automatically, last check: ${lastRun}`,
            `Checked: ${scanner.checked || 0}, confirmed: ${scanner.confirmed || 0}`,
            scanner.lastError ? `Last error: ${scanner.lastError}` : 'Last error: no'
          ].join('\\n');
        }
      } catch (err) {
        if (box) box.innerText = `Scanner status did not load: ${err.message}`;
        throw err;
      }
    }

    async function runPaymentScan() {
      try {
        setBusy('btn-run-payment-scan', true, 'Scanning...');
        const result = await api('/admin/payment-scan/run', {
          method: 'POST',
          body: JSON.stringify({ limit: 100 })
        });
        await loadPaymentOrders();
        await loadPaymentWallets();
        setStatus(`Blockchain checked. Total confirmed: ${result.confirmed || 0}`);
      } catch (err) {
        setStatus(`Scanner error: ${err.message}`);
      } finally {
        setBusy('btn-run-payment-scan', false);
      }
    }

    async function refreshAll() {
      const errors = [];
      try { await loadSettings({ renderForm: !settingsFormRendered }); } catch (err) { errors.push(err.message); }
      try { await loadUsers(); } catch (err) { errors.push(`Users: ${err.message}`); }
      try { await loadWithdraws(); } catch (err) { errors.push(`Withdrawals: ${err.message}`); }
      try { await loadPaymentOrders(); } catch (err) { errors.push(`To‘lovlar: ${err.message}`); }
      try { await loadPaymentWallets(); } catch (err) { errors.push(`Scanner: ${err.message}`); }
      setStatus(errors.length ? errors.join(' | ') : 'Data loaded.');
    }

    document.getElementById('admin-token').value = localStorage.getItem('vidipay_admin_token') || '';
    if (token()) refreshAll();

    const ADMIN_CLICK_ACTIONS = Object.freeze({
      refreshAll: () => refreshAll(),
      saveToken: () => saveToken(),
      setTelegramMenuButton: () => setTelegramMenuButton(),
      scheduleWithdrawWindow: () => scheduleWithdrawWindow(),
      openWithdrawNow: () => openWithdrawNow(),
      closeWithdrawNow: () => closeWithdrawNow(),
      saveSettings: () => saveSettings(),
      addManualEarning: () => addManualEarning(),
      addManualHistory: () => addManualHistory(),
      sendNotification: () => sendNotification(),
      runPaymentScan: () => runPaymentScan(),
      loadPaymentWallets: () => loadPaymentWallets()
    });

    const ADMIN_CHANGE_ACTIONS = Object.freeze({
      loadWithdraws: () => loadWithdraws(),
      loadPaymentOrders: () => loadPaymentOrders()
    });

    function runAdminUiAction(action) {
      try {
        Promise.resolve(action()).catch((error) => setStatus(`Action error: ${error.message}`));
      } catch (error) {
        setStatus(`Action error: ${error.message}`);
      }
    }

    document.addEventListener('click', (event) => {
      const element = event.target instanceof Element ? event.target.closest('[data-admin-action]') : null;
      if (!element) return;
      const actionName = element.dataset.adminAction;
      if (actionName === 'set-user-block') {
        return runAdminUiAction(() => setUserBlock(element.dataset.adminTelegramId, element.dataset.adminShouldBlock === 'true'));
      }
      if (actionName === 'approve-withdraw') {
        return runAdminUiAction(() => approveWithdraw(element.dataset.adminId));
      }
      if (actionName === 'reject-withdraw') {
        return runAdminUiAction(() => rejectWithdraw(element.dataset.adminId));
      }
      if (actionName === 'approve-payment-order') {
        return runAdminUiAction(() => approvePaymentOrder(element.dataset.adminId));
      }
      const action = ADMIN_CLICK_ACTIONS[actionName];
      if (action) runAdminUiAction(action);
    });

    document.addEventListener('change', (event) => {
      const element = event.target instanceof Element ? event.target.closest('[data-admin-change]') : null;
      if (!element) return;
      const action = ADMIN_CHANGE_ACTIONS[element.dataset.adminChange];
      if (action) runAdminUiAction(action);
    });
