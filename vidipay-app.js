        const tg = window.Telegram?.WebApp || {
            initData: '',
            initDataUnsafe: {},
            expand() {},
            HapticFeedback: null,
            openLink: null,
            openTelegramLink: null
        };
        tg.expand();

        const storageFallback = new Map();
        window.__vidipayScriptErrors = window.__vidipayScriptErrors || [];

        function rememberFrontendError(label, err) {
            try {
                const detail = {
                    label,
                    message: String(err?.message || err || ''),
                    time: new Date().toISOString()
                };
                window.__vidipayScriptErrors.push(detail);
                if (window.__vidipayScriptErrors.length > 25) window.__vidipayScriptErrors.shift();
            } catch (e) {}
        }

        window.addEventListener('error', event => rememberFrontendError('window_error', event.error || event.message));
        window.addEventListener('unhandledrejection', event => rememberFrontendError('unhandled_rejection', event.reason));

        function safeStorageGet(key, fallback = null) {
            try {
                const value = window.localStorage.getItem(key);
                return value === null ? fallback : value;
            } catch (err) {
                rememberFrontendError('storage_get', err);
                return storageFallback.has(key) ? storageFallback.get(key) : fallback;
            }
        }

        function safeStorageSet(key, value) {
            const text = String(value);
            storageFallback.set(key, text);
            try {
                window.localStorage.setItem(key, text);
                return true;
            } catch (err) {
                rememberFrontendError('storage_set', err);
                return false;
            }
        }

        function safeStorageRemove(key) {
            storageFallback.delete(key);
            try {
                window.localStorage.removeItem(key);
                return true;
            } catch (err) {
                rememberFrontendError('storage_remove', err);
                return false;
            }
        }

        const runtimeMessages = {
            en: {
                offline: 'Internet connection is offline.',
                online: 'Internet connection restored.',
                timeout: 'The server is taking too long to answer. Try again.',
                invalid_response: 'The server returned an invalid response.',
                request_failed: 'Request failed. Try again.',
                backend_unavailable: 'Backend is temporarily unavailable.'
            },
            ru: {
                offline: 'Интернет-соединение отключено.',
                online: 'Интернет-соединение восстановлено.',
                timeout: 'Сервер отвечает слишком долго. Повторите попытку.',
                invalid_response: 'Сервер вернул неверный ответ.',
                request_failed: 'Запрос не выполнен. Повторите попытку.',
                backend_unavailable: 'Бэкенд временно недоступен.'
            },
            fr: {
                offline: 'La connexion Internet est hors ligne.',
                online: 'La connexion Internet est retablie.',
                timeout: 'Le serveur met trop de temps a repondre. Reessayez.',
                invalid_response: 'Le serveur a renvoye une reponse invalide.',
                request_failed: 'La requete a echoue. Reessayez.',
                backend_unavailable: 'Le backend est temporairement indisponible.'
            },
            hi: {
                offline: 'Internet connection offline hai.',
                online: 'Internet connection restore ho gaya.',
                timeout: 'Server answer dene me zyada time le raha hai. Dobara try karein.',
                invalid_response: 'Server ne invalid response diya.',
                request_failed: 'Request failed. Dobara try karein.',
                backend_unavailable: 'Backend temporary unavailable hai.'
            },
            es: {
                offline: 'La conexion a Internet esta sin conexion.',
                online: 'La conexion a Internet se restablecio.',
                timeout: 'El servidor tarda demasiado en responder. Intentalo de nuevo.',
                invalid_response: 'El servidor devolvio una respuesta invalida.',
                request_failed: 'La solicitud fallo. Intentalo de nuevo.',
                backend_unavailable: 'El backend no esta disponible temporalmente.'
            },
            zh: {
                offline: '网络连接已离线。',
                online: '网络连接已恢复。',
                timeout: '服务器响应时间过长，请重试。',
                invalid_response: '服务器返回了无效响应。',
                request_failed: '请求失败，请重试。',
                backend_unavailable: '后端暂时不可用。'
            },
            de: {
                offline: 'Die Internetverbindung ist offline.',
                online: 'Die Internetverbindung wurde wiederhergestellt.',
                timeout: 'Der Server antwortet zu langsam. Bitte erneut versuchen.',
                invalid_response: 'Der Server hat eine ungueltige Antwort gesendet.',
                request_failed: 'Anfrage fehlgeschlagen. Bitte erneut versuchen.',
                backend_unavailable: 'Backend ist voruebergehend nicht verfuegbar.'
            }
        };

        function runtimeText(key) {
            const lang = safeStorageGet('vidiPayLang', 'en') || 'en';
            return runtimeMessages[lang]?.[key] || runtimeMessages.en[key] || key;
        }

        function friendlyErrorMessage(err) {
            const raw = String(err?.message || err || '').trim();
            if (!navigator.onLine) return runtimeText('offline');
            if (err?.name === 'AbortError' || /abort|timeout|timed out/i.test(raw)) return runtimeText('timeout');
            if (/failed to fetch|networkerror|load failed|connection/i.test(raw)) return runtimeText('backend_unavailable');
            return raw || runtimeText('request_failed');
        }

        function updateFrontendHealth(partial = {}) {
            Object.assign(frontendNetworkStats, partial, {
                ok: partial.ok !== undefined ? Boolean(partial.ok) : frontendNetworkStats.ok,
                checked_at: new Date().toISOString()
            });
            window.__vidipayFrontendNetwork = frontendNetworkStats;
            window.__vidipayFrontendHealth = {
                api_base: API_BASE_URL,
                online: navigator.onLine,
                network: { ...frontendNetworkStats },
                payment_polling_delay_ms: paymentPollingDelayMs,
                payment_polling_failures: paymentPollingFailures,
                payment_polling_last_scheduled_delay_ms: paymentPollingLastScheduledDelayMs,
                payment_polling_last_jitter_ms: paymentPollingLastJitterMs,
                payment_order_cached: Boolean(getCachedPaymentOrder(false)),
                payment_status_cached: Boolean(getCachedPaymentStatus(false)),
                real_test: window.__vidipayFrontendRealTest || null
            };
            document.documentElement.dataset.vidipayFrontendHealth = 'ok';
            document.documentElement.dataset.vidipayFrontendHealthAt = frontendNetworkStats.checked_at;
            document.documentElement.dataset.vidipayFrontendNetwork = frontendNetworkStats.ok ? 'ok' : 'warn';
            document.documentElement.dataset.vidipayFrontendNetworkAt = frontendNetworkStats.checked_at;
            if (document.getElementById('tonDepositModal')?.classList.contains('is-open')) {
                refreshPaymentRuntimeStrip(
                    frontendNetworkStats.ok ? document.documentElement.dataset.vidipayPaymentUiState : 'retrying',
                    frontendNetworkStats.ok ? '' : frontendNetworkStats.last_error
                );
            }
            if (typeof updatePaymentRealTestReadiness === 'function') updatePaymentRealTestReadiness('frontend_health');
            return window.__vidipayFrontendHealth;
        }

        function recordFrontendRequest(path, ok, startedAt, err = null) {
            const latency = Math.max(0, Date.now() - Number(startedAt || Date.now()));
            const message = String(err?.message || err || '').trim();
            const timeout = err?.name === 'AbortError' || /abort|timeout|timed out/i.test(message);
            updateFrontendHealth({
                ok: Boolean(ok),
                inflight: Math.max(0, frontendNetworkStats.inflight - 1),
                success_count: frontendNetworkStats.success_count + (ok ? 1 : 0),
                failure_count: frontendNetworkStats.failure_count + (ok ? 0 : 1),
                timeout_count: frontendNetworkStats.timeout_count + (timeout ? 1 : 0),
                last_path: String(path || ''),
                last_latency_ms: latency,
                last_error: ok ? '' : friendlyErrorMessage(err)
            });
        }

        function updateViewportMetrics() {
            const viewport = window.visualViewport;
            const height = Math.max(320, Math.floor(viewport?.height || window.innerHeight || document.documentElement.clientHeight || 0));
            document.documentElement.style.setProperty('--app-vh', `${height}px`);
        }

        function installViewportMetrics() {
            updateViewportMetrics();
            window.addEventListener('resize', updateViewportMetrics, { passive: true });
            window.addEventListener('orientationchange', () => setTimeout(updateViewportMetrics, 250), { passive: true });
            if (window.visualViewport) {
                window.visualViewport.addEventListener('resize', updateViewportMetrics, { passive: true });
                window.visualViewport.addEventListener('scroll', updateViewportMetrics, { passive: true });
            }
        }

        installViewportMetrics();

        document.addEventListener('gesturestart', event => event.preventDefault());
        document.addEventListener('gesturechange', event => event.preventDefault());
        document.addEventListener('gestureend', event => event.preventDefault());
        let lastTouchEndAt = 0;
        document.addEventListener('touchend', event => {
            const now = Date.now();
            if (now - lastTouchEndAt <= 350) event.preventDefault();
            lastTouchEndAt = now;
        }, { passive: false });
        document.addEventListener('touchmove', event => {
            if (event.touches && event.touches.length > 1) event.preventDefault();
        }, { passive: false });

        const FRONTEND_ACTION_SELECTOR = [
            '.ton-payment-actions button',
            '.copy-link-btn',
            '.fiat-pay-btn',
            '.fixed-nav-btn',
            '.top-btn',
            '.modal-close',
            '.bonus-btn',
            '.withdraw-floating',
            '.hamster-clicker-btn',
            '.support-link-btn',
            '.support-input-row button'
        ].join(', ');

        function normalizeFrontendActionElement(btn) {
            if (!btn || btn.dataset.frontendActionReady === 'true') return;
            btn.dataset.frontendActionReady = 'true';
            btn.classList.add('frontend-action-ready');
            if (!btn.getAttribute('aria-busy')) btn.setAttribute('aria-busy', 'false');
            if (!btn.getAttribute('aria-disabled')) btn.setAttribute('aria-disabled', btn.disabled ? 'true' : 'false');
        }

        function normalizeFrontendActionElements(root = document) {
            root.querySelectorAll?.(FRONTEND_ACTION_SELECTOR).forEach(normalizeFrontendActionElement);
            document.documentElement.dataset.vidipayFrontendActionNormalizer = 'ready';
        }

        function installFrontendActionNormalizer() {
            if (document.documentElement.dataset.vidipayFrontendActionNormalizerInstalled === 'ready') return;
            normalizeFrontendActionElements();
            const observer = new MutationObserver(mutations => {
                for (const mutation of mutations) {
                    mutation.addedNodes?.forEach(node => {
                        if (node.nodeType !== 1) return;
                        if (node.matches?.(FRONTEND_ACTION_SELECTOR)) normalizeFrontendActionElement(node);
                        normalizeFrontendActionElements(node);
                    });
                }
            });
            observer.observe(document.documentElement, { childList: true, subtree: true });
            window.__vidipayFrontendActionObserver = observer;
            document.documentElement.dataset.vidipayFrontendActionNormalizerInstalled = 'ready';
        }

        installFrontendActionNormalizer();

        function installInstantActionFeedback() {
            if (document.documentElement.dataset.vidipayTapFeedback === 'ready') return;
            const findButton = target => target?.closest?.(FRONTEND_ACTION_SELECTOR) || null;
            const setPressed = (target, pressed) => {
                const btn = findButton(target);
                if (!btn || btn.disabled) return;
                btn.classList.toggle('is-pressed', Boolean(pressed));
            };
            document.addEventListener('pointerdown', event => setPressed(event.target, true), { passive: true });
            ['pointerup', 'pointercancel', 'pointerout'].forEach(type => {
                document.addEventListener(type, event => setPressed(event.target, false), { passive: true });
            });
            document.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') setPressed(event.target, true);
            }, { passive: true });
            document.addEventListener('keyup', event => {
                if (event.key === 'Enter' || event.key === ' ') setPressed(event.target, false);
            }, { passive: true });
            document.documentElement.dataset.vidipayTapFeedback = 'ready';
        }

        installInstantActionFeedback();

        function installGlobalActionGuard() {
            if (document.documentElement.dataset.vidipayActionGuard === 'ready') return;
            const lastClickByButton = new WeakMap();
            document.addEventListener('click', event => {
                const btn = event.target?.closest?.(FRONTEND_ACTION_SELECTOR);
                if (!btn) return;
                normalizeFrontendActionElement(btn);
                const blocked = btn.disabled
                    || btn.getAttribute('aria-disabled') === 'true'
                    || btn.getAttribute('aria-busy') === 'true'
                    || btn.dataset.busyLockActive === 'true';
                const now = Date.now();
                const lastClickAt = Number(lastClickByButton.get(btn) || 0);
                const duplicate = now - lastClickAt < 240;
                if (blocked || duplicate) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    return;
                }
                lastClickByButton.set(btn, now);
            }, true);
            document.documentElement.dataset.vidipayActionGuard = 'ready';
        }

        installGlobalActionGuard();

        function syncModalAccessibilityState(reason = 'sync') {
            let openCount = 0;
            document.querySelectorAll('.modal-overlay').forEach(modal => {
                const isOpen = modal.classList.contains('is-open') && modal.style.display !== 'none';
                if (isOpen) openCount += 1;
                modal.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
                modal.setAttribute('role', 'dialog');
                modal.setAttribute('aria-modal', isOpen ? 'true' : 'false');
            });
            document.body.classList.toggle('modal-open', openCount > 0);
            document.documentElement.dataset.vidipayModalStateGuard = 'ready';
            document.documentElement.dataset.vidipayModalStateGuardReason = String(reason || '').slice(0, 60);
            document.documentElement.dataset.vidipayOpenModalCount = String(openCount);
            return openCount;
        }

        const PAGE_SHOW_PRESERVE_MODAL_IDS = ['tonDepositModal', 'watchModal'];

        function resetModalOverlays(reason = 'reset') {
            document.querySelectorAll('.modal-overlay').forEach(modal => {
                modal.classList.remove('is-open');
                modal.style.display = 'none';
            });
            document.body.classList.remove('modal-open');
            syncModalAccessibilityState(reason);
        }

        function handlePageshowModalState(event) {
            const preservedModal = PAGE_SHOW_PRESERVE_MODAL_IDS
                .map(id => document.getElementById(id))
                .find(modal => modal?.classList.contains('is-open') && modal.style.display !== 'none');
            if (event?.persisted && preservedModal) {
                document.body.classList.add('modal-open');
                syncModalAccessibilityState(`pageshow_preserve:${preservedModal.id}`);
                if (preservedModal.id === 'tonDepositModal') {
                    sanitizePaymentModalDom('pageshow_preserve');
                    updatePaymentActionButtons();
                    if (!paymentStatusPollTimer && navigator.onLine) {
                        schedulePaymentStatusPoll(1800, paymentPollingGeneration);
                    }
                }
                return;
            }
            resetModalOverlays(event?.persisted ? 'pageshow_reset' : 'pageshow_sync');
        }

        resetModalOverlays('initial_reset');
        window.addEventListener('pageshow', handlePageshowModalState);

        const BOT_USERNAME = "magapatron_bot";
        const pageParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));

        function resolveTelegramInitData() {
            return String(
                tg.initData ||
                hashParams.get('tgWebAppData') ||
                pageParams.get('tgWebAppData') ||
                ''
            ).trim();
        }

        const telegramInitData = resolveTelegramInitData();
        document.documentElement.dataset.vidipayTelegramAuth = telegramInitData ? 'present' : 'missing';

        function parseTelegramUserFromWebAppData(rawWebAppData) {
            if (!rawWebAppData) return null;
            try {
                const webAppParams = new URLSearchParams(rawWebAppData);
                const rawUser = webAppParams.get('user');
                if (!rawUser) return null;
                try {
                    return JSON.parse(rawUser);
                } catch (err) {
                    return JSON.parse(decodeURIComponent(rawUser));
                }
            } catch (err) {
                return null;
            }
        }

        function resolveTelegramUser() {
            return tg.initDataUnsafe?.user ||
                parseTelegramUserFromWebAppData(hashParams.get('tgWebAppData')) ||
                parseTelegramUserFromWebAppData(pageParams.get('tgWebAppData')) ||
                null;
        }

        const user = resolveTelegramUser();
        if (user) {
            document.getElementById('user-display-name').innerText = user.first_name + (user.last_name ? " " + user.last_name : "");
            document.getElementById('user-display-id').innerText = user.id;
        } else {
            document.getElementById('user-display-name').innerText = "Guest Cyber CEO";
            document.getElementById('user-display-id').innerText = "Sandbox Mode";
        }

        const referralUserId = user?.id ? String(user.id) : (safeStorageGet('vidiPayGuestId') || ('guest_' + Math.random().toString(36).slice(2, 10)));
        if (!user?.id && !safeStorageGet('vidiPayGuestId')) safeStorageSet('vidiPayGuestId', referralUserId);
        const referralLink = `https://t.me/${BOT_USERNAME}?start=ref_${referralUserId}`;
        const referralToken = pageParams.get('ref_token') || hashParams.get('ref_token') || safeStorageGet('vidiPayPendingReferralToken') || '';
        if (referralToken) safeStorageSet('vidiPayPendingReferralToken', referralToken);
        const refLinkEl = document.getElementById('ref-link');
        if (refLinkEl) refLinkEl.innerText = referralLink;

        let currentLang = safeStorageGet('vidiPayLang') || 'en';
        if (currentLang === 'uz' || !['en','ru','fr','hi','es','zh','de'].includes(currentLang)) {
            currentLang = 'en';
            safeStorageSet('vidiPayLang', 'en');
        }
        const TARGET_URL = "https://www.youtube.com/@MrBeast";
        const PRODUCTION_API_BASE_URL = 'https://vidipay-origin-proxy.shshavkatjon2.workers.dev';
        const FALLBACK_API_BASE_URLS = [PRODUCTION_API_BASE_URL];
        const VIDIPAY_FRONTEND_BUILD = window.VIDIPAY_FRONTEND_BUILD || 'frontend-origin-proxy-20260729';
        document.documentElement.dataset.vidipayFrontendBuild = VIDIPAY_FRONTEND_BUILD;

        function normalizeApiBaseUrl(value) {
            const raw = String(value || '').trim().replace(/\/$/, '');
            if (!raw) return '';
            try {
                const url = new URL(raw);
                if (!['https:', 'http:'].includes(url.protocol)) return '';
                if (url.pathname && /\.html?$/i.test(url.pathname)) return '';
                if (url.hostname.endsWith('github.io') || url.hostname.includes('vidipay-fronted')) return '';
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

        function getApiBaseCandidates() {
            const trustedCandidates = [
                window.VIDIPAY_API_BASE,
                getCurrentOriginApiBase(),
            ].map(normalizeApiBaseUrl).filter(Boolean);
            const trustedOrigins = new Set([
                ...trustedCandidates,
                ...FALLBACK_API_BASE_URLS.map(normalizeApiBaseUrl).filter(Boolean)
            ].map(value => new URL(value).origin));
            const candidates = [
                ...trustedCandidates,
                safeStorageGet('vidiPayApiBase'),
                ...FALLBACK_API_BASE_URLS
            ].map(normalizeApiBaseUrl).filter(value => {
                if (!value) return false;
                return trustedOrigins.has(new URL(value).origin);
            });
            return [...new Set(candidates)];
        }

        function telegramAuthHeadersFor(baseUrl) {
            if (!telegramInitData) return {};
            const trusted = getApiBaseCandidates().some(candidate => {
                return new URL(candidate).origin === new URL(baseUrl).origin;
            });
            return trusted ? { 'X-Telegram-Init-Data': telegramInitData } : {};
        }

        let API_BASE_URL = getApiBaseCandidates()[0] || PRODUCTION_API_BASE_URL;
        safeStorageSet('vidiPayApiBase', API_BASE_URL);
        const MRBEAST_RANDOM_START_MAX = 40;
        const DAY_MS = 24 * 60 * 60 * 1000;
        const BONUS_PER_FRIEND = 9.99;
        const WALLET_UNLOCK_REQUIRED_USD = 20;
        const TON_ACTIVATION_AMOUNT = 6.99;
        const storageKey = `vidiPayState_${referralUserId}`;
        const defaultState = {
            balance: 0,
            totalViews: 0,
            totalSeconds: 0,
            totalMinutes: 0,
            dailyViews: 0,
            dailySeconds: 0,
            dailyMinutes: 0,
            dailyEarned: 0,
            invitedShares: 0,
            joinedFriends: 0,
            lastDailyReset: Date.now(),
            supportMessages: []
        };
        let appState = loadAppState();
        resetDailyStatsIfNeeded();
        let balance = appState.balance;
        let minutesWatched = appState.dailyMinutes;
        let earnedFromWatching = appState.dailyEarned;
        let backendSettings = {};
        let currentPaymentOrder = null;
        let watchTimerInterval = null;
        let pendingWatch = null;
        let mrbeastPlayer = null;
        let youtubeApiReady = false;
        let countedWatchSeconds = 0;
        let watchAccumulatedMs = 0;
        let watchSegmentStartedAt = null;
        let currentWatchCompleted = false;
        let currentMrBeastVideoId = null;
        let watchSessionSubmitted = false;
        let watchSessionGeneration = 0;
        let watchFinalizeInflight = null;
        let watchServerSession = null;
        let watchSessionStartInflight = null;
        let watchHeartbeatInterval = null;
        let watchHeartbeatQueue = Promise.resolve();
        let watchLastPlayerState = null;
        let watchSessionVideoIds = new Set();
        let lastWatchUiSnapshot = '';
        let rewardedMrBeastVideos = new Set();
        let shouldStartMrBeastWhenApiReady = false;
        let watchFallbackTimer = null;
        let usingFallbackPlayer = false;
        let settingsRefreshBusy = false;
        let settingsRefreshTimer = null;
        let paymentStatusRefreshBusy = false;
        let paymentStatusPollTimer = null;
        let paymentPollingDelayMs = 7000;
        let paymentPollingFailures = 0;
        let paymentStatusLastRefreshAt = 0;
        let paymentPollingLastScheduledDelayMs = 0;
        let paymentPollingLastJitterMs = 0;
        let paymentRuntimeLastSnapshot = '';
        let tonDepositOpenBusy = false;
        let backendSettingsInflight = null;
        let backendSettingsFetchedAt = 0;
        let userSyncInflight = null;
        let userSyncFetchedAt = 0;
        let statsInflight = null;
        let statsFetchedAt = 0;
        let tierStatusInflight = null;
        let tierStatusFetchedAt = 0;
        let notificationsInflight = null;
        let notificationsFetchedAt = 0;
        let historyInflight = null;
        let historyFetchedAt = 0;
        let frontendRuntimeGuardTimer = null;
        let frontendRuntimeGuardLastAt = 0;
        let frontendRuntimeGuardSweepCount = 0;
        let referralCopyBusy = false;
        let supportReplyTimer = null;
        let runtimeStatusToastTimer = null;
        let notificationRenderSnapshot = '';
        let supportRenderSnapshot = '';
        let fullHistoryRenderSnapshot = '';
        let paymentStatusInflight = null;
        let createPaymentOrderInflight = null;
        let paymentManualCheckInflight = null;
        let paymentStatusAbortController = null;
        let paymentOrderAbortController = null;
        let paymentPollingGeneration = 0;
        let paymentStatusRequestSeq = 0;
        let paymentOrderRequestSeq = 0;
        let paymentOrderResolveInflight = null;
        let paymentRealTestReadinessLastSnapshot = '';
        let paymentAddressVisibleSinceAt = 0;
        let paymentModalWatchdogTimer = null;
        let paymentModalWatchdogLastSnapshot = '';
        const paymentOrderCacheKey = `vidiPayPaymentOrder_${referralUserId}`;
        const paymentStatusCacheKey = `vidiPayPaymentStatus_${referralUserId}`;
        const paymentRealTestReadinessKey = `vidiPayRealTestReady_${referralUserId}`;
        const frontendPollJitterSeed = String(referralUserId || user?.id || 'guest');
        const frontendNetworkStats = {
            ok: true,
            inflight: 0,
            success_count: 0,
            failure_count: 0,
            timeout_count: 0,
            last_path: '',
            last_latency_ms: 0,
            last_error: '',
            checked_at: ''
        };
        window.__vidipayFrontendNetwork = frontendNetworkStats;
        const MRBEAST_UPLOADS_PLAYLIST = 'UUX6OQ3DkcsbYNE6H8uQQuVA';
        let latestPaymentStatus = {};
        let currentTierStatus = {
            tier: 3,
            reward_per_second: 0.01,
            country_code: null,
            country_name: 'Unknown'
        };
        const ACTIVE_LOCAL_CARD_METHODS = ['ton'];
        const DEFAULT_LOCAL_CARD_METHOD = 'ton';
        let selectedLocalCardMethod = DEFAULT_LOCAL_CARD_METHOD;
        let growthLockStatus = null;

        window.onYouTubeIframeAPIReady = function() {
            youtubeApiReady = true;
            if (shouldStartMrBeastWhenApiReady) {
                shouldStartMrBeastWhenApiReady = false;
                if (usingFallbackPlayer) clearWatchFallbackPlayer();
                startMrBeastPlayer();
            }
        };

        function createIdempotencyKey() {
            if (globalThis.crypto?.randomUUID) {
                return `web-${globalThis.crypto.randomUUID()}`;
            }
            return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
        }

        async function apiRequest(path, options = {}) {
            const requestStartedAt = Date.now();
            const requestMethod = String(options.method || 'GET').toUpperCase();
            const requestIdempotencyKey = ['POST', 'DELETE'].includes(requestMethod)
                ? String(options.idempotencyKey || createIdempotencyKey())
                : '';
            updateFrontendHealth({
                ok: navigator.onLine,
                inflight: frontendNetworkStats.inflight + 1,
                last_path: String(path || ''),
                last_error: ''
            });
            if (!navigator.onLine) {
                const offlineError = new Error(runtimeText('offline'));
                recordFrontendRequest(path, false, requestStartedAt, offlineError);
                throw offlineError;
            }

            const bases = [API_BASE_URL, ...getApiBaseCandidates()].map(normalizeApiBaseUrl).filter(Boolean);
            const uniqueBases = [...new Set(bases)];
            let lastError = null;

            for (const baseUrl of uniqueBases) {
                const timeoutMs = Number(options.timeoutMs || 15000);
                const {
                    timeoutMs: _timeoutMs,
                    idempotencyKey: _idempotencyKey,
                    ...fetchOptions
                } = options;
                const externalSignal = fetchOptions.signal;
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), timeoutMs);
                let externalAbortHandler = null;
                if (externalSignal) {
                    if (externalSignal.aborted) {
                        controller.abort();
                    } else {
                        externalAbortHandler = () => controller.abort();
                        externalSignal.addEventListener('abort', externalAbortHandler, { once: true });
                    }
                }
                try {
                    const response = await fetch(`${baseUrl}${path}`, {
                        ...fetchOptions,
                        headers: {
                            'Content-Type': 'application/json',
                            ...telegramAuthHeadersFor(baseUrl),
                            ...(requestIdempotencyKey ? { 'Idempotency-Key': requestIdempotencyKey } : {}),
                            ...(fetchOptions.headers || {})
                        },
                        signal: controller.signal
                    });

                    const text = await response.text();
                    let data = null;
                    if (text) {
                        try {
                            data = JSON.parse(text);
                        } catch (parseErr) {
                            lastError = new Error(runtimeText('invalid_response'));
                            continue;
                        }
                    }

                    if (!response.ok) {
                        const err = new Error(data?.error || data?.message || runtimeText('request_failed'));
                        err.data = data;
                        throw err;
                    }

                    API_BASE_URL = baseUrl;
                    safeStorageSet('vidiPayApiBase', baseUrl);
                    recordFrontendRequest(path, true, requestStartedAt);
                    return data;
                } catch (err) {
                    lastError = err;
                    if (err.data) {
                        recordFrontendRequest(path, false, requestStartedAt, err);
                        throw err;
                    }
                } finally {
                    if (timer) clearTimeout(timer);
                    if (externalSignal && externalAbortHandler) {
                        externalSignal.removeEventListener('abort', externalAbortHandler);
                    }
                }
            }

            const finalError = new Error(friendlyErrorMessage(lastError || runtimeText('backend_unavailable')));
            recordFrontendRequest(path, false, requestStartedAt, finalError);
            throw finalError;
        }

        function applyBackendUser(serverUser) {
            if (!serverUser) return;

            appState.balance = Number(serverUser.balance || 0);
            appState.totalViews = Number(serverUser.total_views || 0);
            appState.totalSeconds = Number(serverUser.total_watch_seconds || 0);
            appState.totalMinutes = Math.floor(appState.totalSeconds / 60);
            appState.dailyViews = Number(serverUser.daily_views || 0);
            appState.dailySeconds = Number(serverUser.daily_watch_seconds || 0);
            appState.dailyMinutes = Math.floor(appState.dailySeconds / 60);
            appState.dailyEarned = Number(serverUser.daily_income || 0);
            saveAppState();
        }

        function fallbackGrowthLockStatus() {
            const balanceValue = Number(appState.balance || 0);
            const deposited = Number(growthLockStatus?.deposited_referrals || 0);
            const requiredForWatch = balanceValue >= 1499 ? 3 : (balanceValue >= 499 ? 2 : 0);
            return {
                balance: balanceValue,
                deposited_referrals: deposited,
                required_for_watch: requiredForWatch,
                watch_locked: requiredForWatch > 0 && deposited < requiredForWatch,
                bonus_locked: requiredForWatch > 0 && deposited < requiredForWatch,
                checkpoint_499: {
                    threshold: 499,
                    required_referrals: 2,
                    active: balanceValue >= 499,
                    unlocked: deposited >= 2,
                    remaining: Math.max(0, 2 - deposited)
                },
                checkpoint_1499: {
                    threshold: 1499,
                    required_referrals: 3,
                    active: balanceValue >= 1499,
                    unlocked: deposited >= 3,
                    remaining: Math.max(0, 3 - deposited)
                },
                main_withdraw: {
                    required_referrals: 4,
                    unlocked: deposited >= 4,
                    remaining: Math.max(0, 4 - deposited)
                }
            };
        }

        function setGrowthLockStatus(status) {
            growthLockStatus = status || fallbackGrowthLockStatus();
            updateGrowthLockUi();
        }

        function currentGrowthLockStatus() {
            return growthLockStatus || fallbackGrowthLockStatus();
        }

        function isGrowthWatchLocked() {
            return Boolean(currentGrowthLockStatus().watch_locked);
        }

        function isActivationDepositLocked() {
            return getWalletEarningAmount() >= getWalletUnlockRequiredAmount()
                && !Boolean(latestPaymentStatus?.withdraw_unlocked);
        }

        function updateCheckpointRow(id, checkpoint, baseRequired = 0) {
            const row = document.getElementById(`${id}-row`);
            const progress = document.getElementById(`${id}-progress`);
            const icon = row?.querySelector('.growth-checkpoint-icon i');
            if (!row || !checkpoint) return;

            const deposited = Number(currentGrowthLockStatus().deposited_referrals || 0);
            const required = Number(checkpoint.required_referrals || 0);
            const localDone = Math.max(0, Math.min(required - baseRequired, deposited - baseRequired));
            const localRequired = Math.max(1, required - baseRequired);
            const active = Boolean(checkpoint.active);
            const unlocked = Boolean(checkpoint.unlocked);

            row.classList.toggle('active', active && !unlocked);
            row.classList.toggle('unlocked', unlocked);
            if (progress) progress.innerText = `${Math.max(0, localDone)}/${localRequired}`;
            if (icon) icon.className = unlocked ? 'fas fa-check' : (active ? 'fas fa-lock-open' : 'fas fa-lock');
        }

        function updateGrowthLockUi() {
            const status = currentGrowthLockStatus();
            const logoBtn = document.querySelector('.hamster-clicker-btn');
            const bonusButtons = document.querySelectorAll('.bonus-nav, .bonus-corner-btn');
            const alertBox = document.getElementById('growth-lock-alert');
            const activationLocked = isActivationDepositLocked();
            const watchLocked = Boolean(status.watch_locked || activationLocked);

            if (logoBtn) {
                logoBtn.classList.toggle('growth-locked', watchLocked);
                logoBtn.setAttribute('aria-disabled', watchLocked ? 'true' : 'false');
            }
            bonusButtons.forEach(btn => btn.classList.toggle('locked-action', status.bonus_locked));

            updateCheckpointRow('checkpoint-499', status.checkpoint_499, 0);
            updateCheckpointRow('checkpoint-1499', status.checkpoint_1499, 2);

            if (alertBox) {
                if (watchLocked) {
                    const active1499 = status.checkpoint_1499?.active && !status.checkpoint_1499?.unlocked;
                    alertBox.style.display = 'block';
                    alertBox.innerText = activationLocked
                        ? t('activation_deposit_required')
                        : active1499
                        ? t('growth_1499_locked_message')
                        : t('growth_499_locked_message');
                } else {
                    alertBox.style.display = 'none';
                    alertBox.innerText = '';
                }
            }
        }

        async function syncBackendUser() {
            const now = Date.now();
            if (userSyncInflight) return userSyncInflight;
            if (userSyncFetchedAt && now - userSyncFetchedAt < 20000) return appState;

            const payload = {
                telegram_id: String(referralUserId),
                username: user?.username || null,
                first_name: user?.first_name || null,
                last_name: user?.last_name || null,
                referral_token: referralToken || null
            };

            userSyncInflight = apiRequest('/user/sync', {
                    method: 'POST',
                    body: JSON.stringify(payload),
                    timeoutMs: 12000
                })
                .then((result) => {
                    userSyncFetchedAt = Date.now();
                    applyBackendUser(result.user);
                    if (result.referral?.applied) {
                        safeStorageRemove('vidiPayPendingReferralToken');
                        addNotification(t('bonus_title'), t('referral_bonus_added'));
                    }
                    updateWatchDisplays();
                    return result;
                })
                .finally(() => {
                    userSyncInflight = null;
                });
            return userSyncInflight;
        }

        async function loadBackendSettings(options = {}) {
            const now = Date.now();
            const hasSettings = backendSettings && Object.keys(backendSettings).length > 0;
            if (!options.force && hasSettings && now - backendSettingsFetchedAt < 30000) return backendSettings;
            if (backendSettingsInflight) return backendSettingsInflight;

            backendSettingsInflight = apiRequest('/settings', { timeoutMs: 8000 })
                .then((settings) => {
                    backendSettings = settings || {};
                    backendSettingsFetchedAt = Date.now();
                    return backendSettings;
                })
                .finally(() => {
                    backendSettingsInflight = null;
                });
            return backendSettingsInflight;
        }

        async function loadTierStatus(options = {}) {
            const now = Date.now();
            if (!options.force && tierStatusFetchedAt && now - tierStatusFetchedAt < 300000) {
                updateTierCards();
                return currentTierStatus;
            }
            if (tierStatusInflight) return tierStatusInflight;

            tierStatusInflight = apiRequest('/tier/status', { timeoutMs: 8000 })
            .then((tierStatus) => {
                currentTierStatus = tierStatus || currentTierStatus;
                tierStatusFetchedAt = Date.now();
                updateTierCards();
                return currentTierStatus;
            }).catch((err) => {
                updateTierCards();
                return currentTierStatus;
            }).finally(() => {
                tierStatusInflight = null;
            });
            return tierStatusInflight;
        }

        function refreshTierStatusFromLiveNetwork() {
            const now = Date.now();
            if (tierStatusFetchedAt && now - tierStatusFetchedAt < 30000) {
                updateTierCards();
                return Promise.resolve(currentTierStatus);
            }
            return loadTierStatus({ force: true });
        }

        function scheduleLiveTierRefresh() {
            [800, 5000, 15000].forEach((delay) => {
                setTimeout(() => {
                    if (document.hidden) return;
                    refreshTierStatusFromLiveNetwork().catch(() => null);
                }, delay);
            });
        }

        window.addEventListener('pageshow', () => {
            refreshTierStatusFromLiveNetwork().catch(() => null);
        });

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                refreshTierStatusFromLiveNetwork().catch(() => null);
            }
        });

        function updateTierCards() {
            const activeTier = Number(currentTierStatus.tier || 3);
            [1, 2, 3].forEach((tier) => {
                const card = document.getElementById(`tier-card-${tier}`);
                if (!card) return;
                const unlocked = tier === activeTier;
                card.classList.toggle('locked-tier', !unlocked);
                card.classList.toggle('unlocked-tier', unlocked);
            });

            const statusEl = document.getElementById('tier-status-text');
            if (statusEl) {
                const country = currentTierStatus.country_code
                    ? `${currentTierStatus.country_name || t('unknown_country')} (${currentTierStatus.country_code})`
                    : t('unknown_network');
                const source = currentTierStatus.country_source ? ` ${t('source_label')}: ${currentTierStatus.country_source}.` : '';
                statusEl.innerText = `${t('active_tier_label')}: Tier ${activeTier}. ${t('network_label')}: ${country}.${source} ${t('reward_label')}: $${Number(currentTierStatus.reward_per_second || 0).toFixed(2)} ${t('per_second_label')}.`;
            }
        }

        let withdrawUiSnapshot = '';

        function setDomText(el, value) {
            const text = String(value ?? '');
            if (el && el.innerText !== text) el.innerText = text;
        }

        function setDomHtml(el, value) {
            const html = String(value ?? '');
            if (el && el.innerHTML !== html) el.innerHTML = html;
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

        function setDomStyle(el, prop, value) {
            if (el && el.style[prop] !== value) el.style[prop] = value;
        }

        function setDomDisplay(el, value) {
            if (el && el.style.display !== value) el.style.display = value;
        }

        function deferUiWork(key, fn) {
            const queue = deferUiWork.queue || (deferUiWork.queue = new Map());
            queue.set(key, fn);
            if (deferUiWork.raf) return;
            deferUiWork.raf = requestAnimationFrame(() => {
                const jobs = Array.from(queue.values());
                queue.clear();
                deferUiWork.raf = null;
                jobs.forEach(job => {
                    try { job(); } catch (err) { rememberFrontendError('deferred_ui_work', err); }
                });
            });
        }

        function showRuntimeStatusToast(message, type = 'info') {
            const text = String(message || '').trim();
            if (!text) return;
            let toast = document.getElementById('runtime-status-toast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'runtime-status-toast';
                toast.className = 'runtime-status-toast';
                toast.setAttribute('role', 'status');
                toast.setAttribute('aria-live', 'polite');
                document.body.appendChild(toast);
            }
            toast.classList.toggle('is-error', type === 'error');
            toast.classList.toggle('is-warn', type === 'warn');
            setDomText(toast, text);
            toast.classList.add('is-visible');
            clearTimeout(runtimeStatusToastTimer);
            runtimeStatusToastTimer = setTimeout(() => {
                toast.classList.remove('is-visible');
            }, type === 'error' ? 2600 : 1800);
        }

        function formatNiceDate(value) {
            if (!value) return t('not_scheduled');
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) return t('not_scheduled');
            const localeByLang = {
                en: 'en-US',
                ru: 'ru-RU',
                fr: 'fr-FR',
                hi: 'hi-IN',
                es: 'es-ES',
                zh: 'zh-CN',
                de: 'de-DE'
            };
            return date.toLocaleString(localeByLang[currentLang] || 'en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        async function refreshStatsFromBackend(options = {}) {
            const now = Date.now();
            if (statsInflight) return statsInflight;
            if (!options.force && statsFetchedAt && now - statsFetchedAt < 8000) {
                updateWatchDisplays();
                return appState;
            }

            statsInflight = apiRequest(`/stats/${encodeURIComponent(referralUserId)}`, { timeoutMs: 8000 })
                .then((stats) => {
                    appState.balance = Number(stats.balance || 0);
                    appState.totalViews = Number(stats.total_views || 0);
                    appState.totalSeconds = Number(stats.total_watch_seconds || 0);
                    appState.totalMinutes = Math.floor(appState.totalSeconds / 60);
                    appState.dailyViews = Number(stats.daily_views || 0);
                    appState.dailySeconds = Number(stats.daily_watch_seconds || 0);
                    appState.dailyMinutes = Math.floor(appState.dailySeconds / 60);
                    appState.dailyEarned = Number(stats.daily_income || 0);
                    appState.joinedFriends = Number(stats.referrals || appState.joinedFriends || 0);
                    if (stats.growth_lock) setGrowthLockStatus(stats.growth_lock);
                    statsFetchedAt = Date.now();
                    saveAppState();
                    updateWatchDisplays();
                    return stats;
                })
                .finally(() => {
                    statsInflight = null;
                });
            return statsInflight;
        }

        function normalizePaymentAddress(address) {
            return String(address || '').trim();
        }

        function isLikelyTonWalletAddress(address) {
            const value = normalizePaymentAddress(address);
            return /^(EQ|UQ)[A-Za-z0-9_-]{46}$/.test(value) || /^0:[a-fA-F0-9]{64}$/.test(value);
        }

        function sanitizeTonWalletInputValue(value) {
            return String(value || '').replace(/\s+/g, '').trim();
        }

        function withdrawInvalidTonAddressText() {
            const messages = {
                en: 'Enter a valid TON wallet address starting with EQ or UQ.',
                ru: 'Введите правильный TON адрес, начинающийся с EQ или UQ.',
                fr: 'Saisissez une adresse TON valide commencant par EQ ou UQ.',
                hi: 'EQ ya UQ se shuru hone wala valid TON wallet address enter karein.',
                es: 'Ingresa una direccion TON valida que empiece con EQ o UQ.',
                zh: '请输入以 EQ 或 UQ 开头的有效 TON 钱包地址。',
                de: 'Gib eine gueltige TON Wallet-Adresse ein, die mit EQ oder UQ beginnt.'
            };
            return messages[currentLang] || messages.en;
        }

        function setWithdrawFormStatus(message = '', tone = '') {
            const statusEl = document.getElementById('withdraw-form-status');
            if (!statusEl) return;
            setDomText(statusEl, message);
            statusEl.dataset.tone = tone || '';
        }

        function validateWithdrawWalletInput(options = {}) {
            const input = document.getElementById('withdraw-address-input');
            if (!input) return false;
            const sanitized = sanitizeTonWalletInputValue(input.value);
            if (input.value !== sanitized) input.value = sanitized;
            const hasValue = Boolean(sanitized);
            const valid = !hasValue || isLikelyTonWalletAddress(sanitized);
            input.classList.toggle('is-invalid', !valid);
            input.dataset.walletValid = valid ? 'true' : 'false';
            if (!options.silent && !valid) setWithdrawFormStatus(withdrawInvalidTonAddressText(), 'error');
            return valid;
        }

        function handleWithdrawAddressInput() {
            const input = document.getElementById('withdraw-address-input');
            if (!input || input.readOnly || input.disabled) return;
            const valid = validateWithdrawWalletInput({ silent: true });
            if (valid) setWithdrawFormStatus('', '');
        }

        function installWithdrawWalletInputGuard() {
            const input = document.getElementById('withdraw-address-input');
            if (!input) return;
            input.setAttribute('autocomplete', 'off');
            input.setAttribute('autocapitalize', 'none');
            input.setAttribute('autocorrect', 'off');
            input.setAttribute('spellcheck', 'false');
            input.setAttribute('enterkeyhint', 'done');
            input.addEventListener('paste', () => {
                setTimeout(() => validateWithdrawWalletInput({ silent: true }), 0);
            }, { passive: true });
            document.documentElement.dataset.vidipayWithdrawWalletInputGuard = 'ready';
        }

        function getPaymentWalletAddress(order = currentPaymentOrder) {
            const candidates = [
                order?.ton_wallet_address,
                order?.wallet_address,
                order?.to_wallet,
                order?.admin_wallet
            ].map(normalizePaymentAddress).filter(Boolean);
            return candidates.find(isLikelyTonWalletAddress) || '';
        }

        function getWalletUnlockRequiredAmount() {
            const configured = Number(backendSettings.wallet_unlock_required_amount);
            return Number.isFinite(configured) && configured > 0 ? configured : WALLET_UNLOCK_REQUIRED_USD;
        }

        function getWalletEarningAmount() {
            return Number(appState.balance || 0);
        }

        function isWalletEarningUnlocked() {
            return getWalletEarningAmount() >= getWalletUnlockRequiredAmount();
        }

        function getTonActivationAmount() {
            const configured = Number(backendSettings.activation_deposit_amount);
            return Number.isFinite(configured) && configured > 0 ? configured : TON_ACTIVATION_AMOUNT;
        }

        function tonAmountToNano(amount) {
            const [whole, fraction = ''] = Number(amount || 0).toFixed(9).split('.');
            return `${whole}${fraction}`.replace(/^0+(?=\d)/, '');
        }

        function buildTonPaymentQrData(address) {
            if (!address) return '';
            return `ton://transfer/${address}?amount=${tonAmountToNano(getTonActivationAmount())}`;
        }

        function renderTonPaymentQr() {}

        function findPaymentOrderWithWallet(orders = []) {
            return (Array.isArray(orders) ? orders : [])
                .find(order => getPaymentWalletAddress(order));
        }

        function findPaymentWalletAddressInPayload(payload = {}) {
            const orderWithWallet = findPaymentOrderWithWallet(payload?.orders);
            const candidates = [
                getPaymentWalletAddress(orderWithWallet),
                payload?.payment?.wallet_address,
                payload?.payment?.to_wallet,
                payload?.payment?.admin_wallet,
                payload?.order?.wallet_address,
                payload?.order?.to_wallet,
                payload?.order?.admin_wallet,
                payload?.wallet_address,
                payload?.to_wallet,
                payload?.admin_wallet
            ].map(normalizePaymentAddress).filter(Boolean);
            return candidates.find(isLikelyTonWalletAddress) || '';
        }

        function attachWalletAddressToOrder(order, walletAddress) {
            const address = normalizePaymentAddress(walletAddress);
            if (!address || !isLikelyTonWalletAddress(address)) return order || null;
            return {
                ...(order || {}),
                wallet_address: address,
                to_wallet: order?.to_wallet || address,
                admin_wallet: order?.admin_wallet || address
            };
        }

        function selectPaymentOrderForDisplay(order, statusData = {}) {
            const orderWithWallet = getPaymentWalletAddress(order)
                ? order
                : findPaymentOrderWithWallet(statusData?.orders);
            const baseOrder = orderWithWallet || order || statusData?.order || currentPaymentOrder || null;
            const walletAddress = getPaymentWalletAddress(baseOrder) || findPaymentWalletAddressInPayload(statusData);
            return attachWalletAddressToOrder(baseOrder, walletAddress) || baseOrder;
        }

        function rememberPaymentOrder(order, statusData = {}) {
            const selectedOrder = selectPaymentOrderForDisplay(order, statusData);
            const walletAddress = getPaymentWalletAddress(selectedOrder);
            if (!selectedOrder || !walletAddress) return selectedOrder;
            const payload = {
                saved_at: Date.now(),
                wallet_address: walletAddress,
                order: selectedOrder
            };
            safeStorageSet(paymentOrderCacheKey, JSON.stringify(payload));
            return selectedOrder;
        }

        function getCachedPaymentOrder(reportErrors = true) {
            const raw = safeStorageGet(paymentOrderCacheKey, '');
            if (!raw) return null;
            try {
                const parsed = JSON.parse(raw);
                const order = attachWalletAddressToOrder(parsed?.order, parsed?.wallet_address);
                return getPaymentWalletAddress(order) ? order : null;
            } catch (err) {
                if (reportErrors) rememberFrontendError('payment_order_cache_parse', err);
                safeStorageRemove(paymentOrderCacheKey);
                return null;
            }
        }

        function normalizePaymentStatusForCache(statusData = {}) {
            if (!statusData || typeof statusData !== 'object') return null;
            const orders = Array.isArray(statusData.orders) ? statusData.orders.slice(0, 6) : [];
            const selectedOrder = selectPaymentOrderForDisplay(statusData.order || orders[0] || null, statusData);
            const walletAddress = getPaymentWalletAddress(selectedOrder) || findPaymentWalletAddressInPayload(statusData);
            return {
                cached_at: Date.now(),
                order: attachWalletAddressToOrder(selectedOrder || statusData.order || null, walletAddress),
                orders: orders.map(order => attachWalletAddressToOrder(order, getPaymentWalletAddress(order) || walletAddress)).filter(Boolean),
                payment: statusData.payment || null,
                withdraw_unlocked: Boolean(statusData.withdraw_unlocked),
                main_withdraw_unlocked: Boolean(statusData.main_withdraw_unlocked || statusData.withdraw_unlocked),
                activation_deposit_verified: Boolean(statusData.activation_deposit_verified),
                deposit_refund_available: Boolean(statusData.deposit_refund_available || statusData.activation_deposit_verified),
                deposit_refund: statusData.deposit_refund || null,
                growth_lock: statusData.growth_lock || null,
                wallet_address: walletAddress || ''
            };
        }

        function rememberPaymentStatus(statusData = {}) {
            const payload = normalizePaymentStatusForCache(statusData);
            if (!payload) return statusData;
            safeStorageSet(paymentStatusCacheKey, JSON.stringify(payload));
            return statusData;
        }

        function getCachedPaymentStatus(reportErrors = true) {
            const raw = safeStorageGet(paymentStatusCacheKey, '');
            if (!raw) return null;
            try {
                const parsed = JSON.parse(raw);
                const cachedAt = Number(parsed?.cached_at || 0);
                if (!cachedAt || Date.now() - cachedAt > 6 * 60 * 60 * 1000) {
                    safeStorageRemove(paymentStatusCacheKey);
                    return null;
                }
                const walletAddress = normalizePaymentAddress(parsed.wallet_address || findPaymentWalletAddressInPayload(parsed));
                const order = attachWalletAddressToOrder(parsed.order || null, walletAddress);
                const orders = Array.isArray(parsed.orders)
                    ? parsed.orders.map(item => attachWalletAddressToOrder(item, getPaymentWalletAddress(item) || walletAddress)).filter(Boolean)
                    : [];
                return {
                    ...parsed,
                    order,
                    orders,
                    wallet_address: walletAddress
                };
            } catch (err) {
                if (reportErrors) rememberFrontendError('payment_status_cache_parse', err);
                safeStorageRemove(paymentStatusCacheKey);
                return null;
            }
        }

        function seedPaymentStatusFromCache() {
            const cachedStatus = getCachedPaymentStatus();
            if (!cachedStatus) return false;
            latestPaymentStatus = {
                ...latestPaymentStatus,
                ...cachedStatus
            };
            if (cachedStatus.growth_lock) setGrowthLockStatus(cachedStatus.growth_lock);
            const cachedOrder = findPaymentOrderWithWallet(cachedStatus.orders)
                || cachedStatus.order
                || getCachedPaymentOrder(false);
            renderPaymentOrder(cachedOrder, cachedStatus);
            updateWithdrawUi(cachedStatus);
            updatePaymentActionButtons();
            return true;
        }

        function seedPaymentOrderFromCache() {
            const cachedOrder = getCachedPaymentOrder();
            if (!cachedOrder) return false;
            currentPaymentOrder = selectPaymentOrderForDisplay(cachedOrder, latestPaymentStatus);
            renderPaymentOrder(currentPaymentOrder, latestPaymentStatus);
            updatePaymentActionButtons();
            return true;
        }

        function getCurrentPaymentWalletAddress() {
            return getPaymentWalletAddress(currentPaymentOrder)
                || findPaymentWalletAddressInPayload(latestPaymentStatus)
                || getPaymentWalletAddress(getCachedPaymentOrder(false))
                || '';
        }

        function setPaymentAddressVisibility(walletAddress = '') {
            const address = normalizePaymentAddress(walletAddress);
            const visible = Boolean(address && isLikelyTonWalletAddress(address));
            const addressBox = document.getElementById('payment-address-box');
            const addressEl = document.getElementById('payment-address-text');
            const modal = document.getElementById('tonDepositModal');
            if (visible && !paymentAddressVisibleSinceAt) paymentAddressVisibleSinceAt = Date.now();
            if (!visible) paymentAddressVisibleSinceAt = 0;
            document.documentElement.dataset.vidipayPaymentAddressVisible = visible ? 'yes' : 'no';
            document.documentElement.dataset.vidipayPaymentAddressVisibleAt = visible ? new Date(paymentAddressVisibleSinceAt).toISOString() : '';
            document.documentElement.dataset.vidipayPaymentAddressReady = visible ? 'ready' : 'waiting';
            if (modal) modal.dataset.paymentAddressReady = visible ? 'ready' : 'waiting';
            if (addressBox) {
                addressBox.dataset.paymentAddressReady = visible ? 'ready' : 'waiting';
                addressBox.setAttribute('aria-busy', visible ? 'false' : 'true');
            }
            if (addressEl) {
                addressEl.dataset.paymentAddressReady = visible ? 'ready' : 'waiting';
                addressEl.setAttribute('aria-live', 'polite');
            }
            return visible;
        }

        function updatePaymentRealTestReadiness(reason = 'sync', extra = {}) {
            const walletAddress = getCurrentPaymentWalletAddress();
            setPaymentAddressVisibility(walletAddress);
            const modalOpen = isTonDepositModalOpen();
            const copyBtn = document.getElementById('ton-copy-address-btn');
            const checkBtn = document.getElementById('ton-check-payment-btn');
            const statusEl = document.getElementById('ton-deposit-status-text');
            const ready = Boolean(
                isWalletEarningUnlocked()
                && walletAddress
                && isLikelyTonWalletAddress(walletAddress)
                && API_BASE_URL === PRODUCTION_API_BASE_URL
                && copyBtn
                && checkBtn
                && navigator.onLine
            );
            const snapshot = {
                checked_at: new Date().toISOString(),
                reason: String(reason || 'sync').slice(0, 80),
                ready,
                modal_open: modalOpen,
                earning_unlocked: isWalletEarningUnlocked(),
                backend_url_ok: API_BASE_URL === PRODUCTION_API_BASE_URL,
                online: navigator.onLine,
                has_wallet_address: Boolean(walletAddress),
                has_copy_button: Boolean(copyBtn),
                has_check_button: Boolean(checkBtn),
                payment_ui_state: document.documentElement.dataset.vidipayPaymentUiState || 'idle',
                polling_active: Boolean(paymentStatusPollTimer),
                status_inflight: Boolean(paymentStatusInflight || paymentStatusRefreshBusy || paymentManualCheckInflight),
                order_inflight: Boolean(createPaymentOrderInflight || paymentOrderResolveInflight || paymentManualCheckInflight),
                address_visible_since_at: paymentAddressVisibleSinceAt ? new Date(paymentAddressVisibleSinceAt).toISOString() : '',
                ...extra
            };
            const serialized = JSON.stringify(snapshot);
            if (serialized !== paymentRealTestReadinessLastSnapshot) {
                paymentRealTestReadinessLastSnapshot = serialized;
                safeStorageSet(paymentRealTestReadinessKey, serialized);
            }
            window.__vidipayFrontendRealTest = snapshot;
            document.documentElement.dataset.vidipayFrontendRealTest = ready ? 'ready' : 'waiting';
            document.documentElement.dataset.vidipayFrontendRealTestAt = snapshot.checked_at;
            document.documentElement.dataset.vidipayFrontendRealTestReason = snapshot.reason;
            document.documentElement.dataset.vidipayFrontendRealTestWallet = walletAddress ? 'present' : 'missing';
            if (statusEl) statusEl.dataset.realTestReady = ready ? 'ready' : 'waiting';
            return snapshot;
        }

        async function resolvePaymentOrderForModal(reason = 'modal_open') {
            if (paymentOrderResolveInflight) return paymentOrderResolveInflight;
            paymentOrderResolveInflight = (async () => {
                updatePaymentRealTestReadiness(`resolve_start:${reason}`);
                const cacheSeeded = seedPaymentStatusFromCache() || seedPaymentOrderFromCache();
                if (getCurrentPaymentWalletAddress()) {
                    setPaymentUiState(cacheSeeded ? 'cached' : 'ready');
                    updatePaymentRealTestReadiness(`resolve_cache:${reason}`);
                    return currentPaymentOrder;
                }

                await loadBackendSettings();

                try {
                    await refreshPaymentStatus({ poll: true, force: true, reason: `resolve_status:${reason}` });
                } catch (err) {
                    rememberFrontendError('payment_resolve_status_probe', err);
                }
                if (getCurrentPaymentWalletAddress()) {
                    setPaymentUiState('ready');
                    updatePaymentRealTestReadiness(`resolve_status_ready:${reason}`);
                    return currentPaymentOrder;
                }

                const order = await createPaymentOrder();
                if (getPaymentWalletAddress(order) || getCurrentPaymentWalletAddress()) {
                    setPaymentUiState('ready');
                    updatePaymentRealTestReadiness(`resolve_create_ready:${reason}`);
                    return order || currentPaymentOrder;
                }

                try {
                    await refreshPaymentStatus({ poll: true, force: true, reason: `resolve_after_create:${reason}` });
                } catch (err) {
                    rememberFrontendError('payment_resolve_after_create', err);
                }
                updatePaymentRealTestReadiness(`resolve_done:${reason}`);
                return currentPaymentOrder || order || getCachedPaymentOrder(false);
            })();
            try {
                return await paymentOrderResolveInflight;
            } finally {
                paymentOrderResolveInflight = null;
                updatePaymentActionButtons();
                updatePaymentRealTestReadiness(`resolve_final:${reason}`);
            }
        }

        function paymentRuntimeToneForState(state) {
            const value = String(state || '').toLowerCase();
            if (value === 'ready' || value === 'verified' || value === 'cached') return 'ok';
            if (value === 'error' || value === 'offline') return 'error';
            if (value === 'retrying' || value === 'checking' || value === 'creating' || value === 'opening' || value === 'loading') return 'warn';
            return frontendNetworkStats.ok ? 'ok' : 'warn';
        }

        function paymentRuntimeMessageForState(state, detail = '') {
            const value = String(state || 'idle').toLowerCase();
            if (detail) return String(detail);
            if (value === 'ready') return t('wallet_payment_ready');
            if (value === 'verified') return t('payment_verified_wallet') || t('wallet_payment_ready');
            if (value === 'checking' || value === 'cached') return t('payment_check_status');
            if (value === 'creating' || value === 'opening' || value === 'loading') return t('card_order_loading');
            if (value === 'offline') return runtimeText('offline');
            if (value === 'retrying') return runtimeText('backend_unavailable');
            if (!frontendNetworkStats.ok && frontendNetworkStats.last_error) return frontendNetworkStats.last_error;
            return '';
        }

        function refreshPaymentRuntimeStrip(state = '', detail = '', options = {}) {
            const strip = document.getElementById('payment-runtime-strip');
            if (!strip) return;
            const currentState = String(state || document.documentElement.dataset.vidipayPaymentUiState || 'idle').toLowerCase();
            const message = paymentRuntimeMessageForState(currentState, detail);
            const seconds = Number(options.nextDelayMs || 0) > 0
                ? Math.max(1, Math.ceil(Number(options.nextDelayMs) / 1000))
                : 0;
            const nextCheckLabels = {
                en: 'Next check in {seconds}s.',
                ru: 'Следующая проверка через {seconds}с.',
                fr: 'Prochaine verification dans {seconds}s.',
                hi: 'Next check {seconds}s me.',
                es: 'Proxima verificacion en {seconds}s.',
                zh: '{seconds}秒后再次检查。',
                de: 'Naechste Pruefung in {seconds}s.'
            };
            const nextTemplate = nextCheckLabels[currentLang] || nextCheckLabels.en;
            const nextText = seconds && isTonDepositModalOpen() && navigator.onLine && !document.hidden
                ? ` ${nextTemplate.replace('{seconds}', String(seconds))}`
                : '';
            const displayText = `${message || ''}${nextText}`.trim();
            const visible = Boolean(displayText) && isTonDepositModalOpen();
            const tone = paymentRuntimeToneForState(currentState);
            const snapshot = JSON.stringify({ visible, tone, displayText, currentState });
            if (snapshot === paymentRuntimeLastSnapshot) return;
            paymentRuntimeLastSnapshot = snapshot;
            strip.classList.toggle('is-visible', visible);
            strip.dataset.tone = tone;
            strip.dataset.state = currentState;
            strip.innerHTML = visible
                ? `<i class="fas ${tone === 'error' ? 'fa-triangle-exclamation' : tone === 'warn' ? 'fa-circle-notch' : 'fa-circle-check'}"></i><span>${escapeHtml(displayText)}</span>`
                : '';
            document.documentElement.dataset.vidipayPaymentRuntimeStrip = visible ? 'visible' : 'hidden';
            document.documentElement.dataset.vidipayPaymentRuntimeTone = tone;
        }

        function setPaymentUiState(state, detail = '') {
            const value = String(state || 'idle').replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'idle';
            const modal = document.getElementById('tonDepositModal');
            const addressBox = document.getElementById('payment-address-box');
            document.documentElement.dataset.vidipayPaymentUiState = value;
            document.documentElement.dataset.vidipayPaymentUiStateAt = new Date().toISOString();
            if (modal) modal.dataset.paymentState = value;
            if (addressBox) addressBox.dataset.paymentState = value;
            if (detail) document.documentElement.dataset.vidipayPaymentUiDetail = String(detail).slice(0, 80);
            refreshPaymentRuntimeStrip(value, detail);
            updatePaymentRealTestReadiness(`ui_state:${value}`);
        }

        function updatePaymentActionButtons() {
            const copyBtn = document.getElementById('ton-copy-address-btn');
            const checkBtn = document.getElementById('ton-check-payment-btn');
            const walletAddress = getCurrentPaymentWalletAddress();
            const hasAddress = Boolean(walletAddress && isLikelyTonWalletAddress(walletAddress));
            const copyLabel = t('copy_ton_address') || 'COPY ADDRESS';
            const checkLabel = t('pay_with_fiat') || 'CHECK PAYMENT';
            if (copyBtn && !copyBtn.dataset.busyLockActive) {
                copyBtn.disabled = !hasAddress;
                copyBtn.setAttribute('aria-disabled', hasAddress ? 'false' : 'true');
                copyBtn.setAttribute('aria-label', copyLabel);
                copyBtn.setAttribute('title', copyLabel);
                copyBtn.dataset.paymentAddressReady = hasAddress ? 'ready' : 'waiting';
                copyBtn.classList.toggle('is-ready', hasAddress);
            }
            if (checkBtn && !checkBtn.dataset.busyLockActive) {
                checkBtn.disabled = false;
                checkBtn.setAttribute('aria-disabled', 'false');
                checkBtn.setAttribute('aria-label', checkLabel);
                checkBtn.setAttribute('title', checkLabel);
                checkBtn.dataset.paymentPollingActive = paymentStatusPollTimer ? 'yes' : 'no';
                checkBtn.classList.toggle('is-ready', Boolean(getCurrentPaymentWalletAddress()));
            }
            updatePaymentRealTestReadiness('action_buttons');
        }

        function getPaymentQrElements() {
            return Array.from(document.querySelectorAll('#payment-qr-box, .payment-qr-box, .qr-code, .qrcode, canvas[data-payment-qr], img[data-payment-qr], [data-payment-qr], [data-qr-code]'));
        }

        function suppressPaymentQrElements(reason = 'sync') {
            const qrElements = getPaymentQrElements();
            qrElements.forEach(el => {
                if (!el) return;
                const ownedByPaymentModal = Boolean(el.closest?.('#tonDepositModal')) || el.id === 'payment-qr-box' || el.classList?.contains('payment-qr-box');
                if (ownedByPaymentModal) {
                    el.remove();
                    return;
                }
                el.setAttribute('aria-hidden', 'true');
                el.dataset.paymentQrSuppressed = 'true';
                el.style.display = 'none';
            });
            const remaining = getPaymentQrElements().length;
            document.documentElement.dataset.vidipayPaymentQrSuppressed = remaining === 0 ? 'ready' : 'hidden';
            document.documentElement.dataset.vidipayPaymentQrSuppressedReason = String(reason || '').slice(0, 60);
            document.documentElement.dataset.vidipayPaymentQrRemaining = String(remaining);
            return remaining;
        }

        function ensurePaymentActionHandlers(reason = 'sync') {
            const copyBtn = document.getElementById('ton-copy-address-btn');
            const checkBtn = document.getElementById('ton-check-payment-btn');
            const copyLabel = t('copy_ton_address') || 'COPY ADDRESS';
            const checkLabel = t('pay_with_fiat') || 'CHECK PAYMENT';
            if (copyBtn) {
                copyBtn.type = 'button';
                copyBtn.dataset.vpClick = 'copyTonPaymentAddress';
                copyBtn.setAttribute('aria-label', copyLabel);
                copyBtn.setAttribute('title', copyLabel);
                copyBtn.dataset.paymentAction = 'copy-address';
                copyBtn.dataset.paymentHandlerReady = typeof copyTonPaymentAddress === 'function' ? 'ready' : 'missing';
                const copyText = copyBtn.querySelector('#lbl-copy-ton-address');
                if (copyText) setDomText(copyText, copyLabel);
            }
            if (checkBtn) {
                checkBtn.type = 'button';
                checkBtn.dataset.vpClick = 'checkTonPaymentNow';
                checkBtn.setAttribute('aria-label', checkLabel);
                checkBtn.setAttribute('title', checkLabel);
                checkBtn.dataset.paymentAction = 'check-payment';
                checkBtn.dataset.paymentManualCheckReady = typeof checkTonPaymentNow === 'function' ? 'ready' : 'missing';
                const checkText = checkBtn.querySelector('#lbl-check-ton-payment');
                if (checkText) setDomText(checkText, checkLabel);
            }
            document.documentElement.dataset.vidipayPaymentActionHandlers = copyBtn && checkBtn ? 'ready' : 'waiting';
            document.documentElement.dataset.vidipayPaymentActionHandlersReason = String(reason || '').slice(0, 60);
        }

        function sanitizePaymentModalDom(reason = 'sync') {
            const modal = document.getElementById('tonDepositModal');
            const walletAddress = getCurrentPaymentWalletAddress();
            const qrRemaining = suppressPaymentQrElements(reason);
            setPaymentAddressVisibility(walletAddress);
            ensurePaymentActionHandlers(reason);
            updatePaymentActionButtons();
            if (modal) {
                modal.dataset.paymentModalWatchdog = 'ready';
                modal.dataset.paymentQrRemaining = String(qrRemaining);
                normalizeFrontendActionElements(modal);
            }
            syncModalAccessibilityState(`payment_watchdog:${reason}`);
            const snapshot = {
                checked_at: new Date().toISOString(),
                reason: String(reason || 'sync').slice(0, 80),
                modal_open: isTonDepositModalOpen(),
                has_wallet_address: Boolean(walletAddress && isLikelyTonWalletAddress(walletAddress)),
                qr_remaining: qrRemaining,
                copy_handler: document.getElementById('ton-copy-address-btn')?.getAttribute('onclick') || '',
                check_handler: document.getElementById('ton-check-payment-btn')?.getAttribute('onclick') || '',
                copy_ready: document.getElementById('ton-copy-address-btn')?.dataset.paymentHandlerReady || 'missing',
                check_ready: document.getElementById('ton-check-payment-btn')?.dataset.paymentManualCheckReady || 'missing'
            };
            const serialized = JSON.stringify(snapshot);
            if (serialized !== paymentModalWatchdogLastSnapshot) {
                paymentModalWatchdogLastSnapshot = serialized;
                window.__vidipayPaymentModalWatchdog = snapshot;
            }
            document.documentElement.dataset.vidipayPaymentModalWatchdog = 'ready';
            document.documentElement.dataset.vidipayPaymentModalWatchdogAt = snapshot.checked_at;
            document.documentElement.dataset.vidipayPaymentModalWatchdogReason = snapshot.reason;
            return snapshot;
        }

        function installPaymentModalWatchdog() {
            if (document.documentElement.dataset.vidipayPaymentModalWatchdogInstalled === 'ready') return;
            const sweep = reason => {
                try {
                    if (isTonDepositModalOpen() || reason !== 'interval') sanitizePaymentModalDom(reason);
                } catch (err) {
                    rememberFrontendError('payment_modal_watchdog', err);
                }
            };
            document.documentElement.dataset.vidipayPaymentModalWatchdogInstalled = 'ready';
            sweep('install');
            paymentModalWatchdogTimer = setInterval(() => sweep('interval'), 2800);
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) sweep('visible');
            }, { passive: true });
            window.addEventListener('focus', () => sweep('focus'), { passive: true });
            window.addEventListener('online', () => sweep('online'), { passive: true });
            window.addEventListener('pageshow', () => sweep('pageshow'), { passive: true });
        }

        function isActiveLocalCardMethod() {
            return ACTIVE_LOCAL_CARD_METHODS.includes(selectedLocalCardMethod);
        }

        function updateLocalCardMethodUi() {
            const select = document.getElementById('local-card-method');
            const maintenance = document.getElementById('local-card-maintenance');
            const payBtn = document.getElementById('fiat-pay-btn');
            if (select && !Array.from(select.options).some(option => option.value === selectedLocalCardMethod)) {
                selectedLocalCardMethod = DEFAULT_LOCAL_CARD_METHOD;
            }
            if (select && select.value !== selectedLocalCardMethod) {
                select.value = selectedLocalCardMethod;
            }
            const isActive = isActiveLocalCardMethod();
            if (maintenance) {
                maintenance.innerText = isActive ? '' : t('card_maintenance');
                maintenance.style.display = isActive ? 'none' : 'block';
            }
            if (payBtn) {
                payBtn.classList.toggle('card-maintenance', !isActive);
            }
        }

        function handleLocalCardMethodChange() {
            const select = document.getElementById('local-card-method');
            selectedLocalCardMethod = select?.value || DEFAULT_LOCAL_CARD_METHOD;
            safeStorageSet('vidiPayLocalCardMethodV2', selectedLocalCardMethod);
            updateLocalCardMethodUi();
        }

        function renderPaymentOrder(order, statusData) {
            currentPaymentOrder = selectPaymentOrderForDisplay(order, statusData);
            if (getPaymentWalletAddress(currentPaymentOrder)) {
                currentPaymentOrder = rememberPaymentOrder(currentPaymentOrder, statusData);
            }

            const box = document.getElementById('payment-unlock-box');
            const statusEl = document.getElementById('payment-status-text');
            const depositStatusEl = document.getElementById('ton-deposit-status-text');
            const addressBox = document.getElementById('payment-address-box');
            const amountEl = document.getElementById('payment-amount-text');
            const addressEl = document.getElementById('payment-address-text');
            const expiryEl = document.getElementById('payment-expiry-text');

            if (!box) return;

            updateWalletLockUi();
            updatePaymentActionButtons();

            const walletAddress = getPaymentWalletAddress(currentPaymentOrder);
            setPaymentAddressVisibility(walletAddress);
            const amount = Number(currentPaymentOrder?.required_amount || currentPaymentOrder?.amount || backendSettings.activation_deposit_amount || TON_ACTIVATION_AMOUNT || 6.99);

            if (statusData?.activation_deposit_verified || statusData?.deposit_refund_available || statusData?.withdraw_unlocked) {
                setPaymentUiState(walletAddress ? 'verified' : 'loading');
                box.style.display = 'block';
                if (addressBox) addressBox.style.display = 'block';
                if (amountEl) amountEl.innerText = amount ? `${amount.toFixed(2)} TONCOIN` : `${getTonActivationAmount().toFixed(2)} TONCOIN`;
                if (addressEl) addressEl.innerText = walletAddress || t('card_order_loading');
                if (expiryEl) {
                    expiryEl.innerText = '';
                    expiryEl.classList.remove('is-expired');
                    expiryEl.removeAttribute('aria-label');
                }
                renderTonPaymentQr('');
                if (statusEl) statusEl.innerText = walletAddress ? t('payment_verified_wallet') : t('card_order_loading');
                if (depositStatusEl) depositStatusEl.innerText = walletAddress ? t('payment_verified_wallet') : t('card_order_loading');
                setPaymentAddressVisibility(walletAddress);
                updateLocalCardMethodUi();
                updatePaymentActionButtons();
                updatePaymentRealTestReadiness('render_verified');
                return;
            }

            if (!currentPaymentOrder) {
                setPaymentUiState(isWalletEarningUnlocked() ? 'loading' : 'locked');
                box.style.display = isWalletEarningUnlocked() ? 'block' : 'none';
                if (addressBox) addressBox.style.display = isWalletEarningUnlocked() ? 'block' : 'none';
                if (amountEl) amountEl.innerText = `${getTonActivationAmount().toFixed(2)} TONCOIN`;
                if (addressEl) addressEl.innerText = t('card_order_loading');
                if (expiryEl) {
                    expiryEl.innerText = '';
                    expiryEl.classList.remove('is-expired');
                    expiryEl.removeAttribute('aria-label');
                }
                renderTonPaymentQr('');
                if (statusEl) statusEl.innerText = isWalletEarningUnlocked() ? t('wallet_payment_ready') : t('wallet_locked_until_20');
                if (depositStatusEl) depositStatusEl.innerText = t('card_order_loading');
                setPaymentAddressVisibility('');
                updatePaymentActionButtons();
                updatePaymentRealTestReadiness('render_empty_order');
                return;
            }

            setPaymentUiState(walletAddress ? 'ready' : 'loading');
            box.style.display = 'block';
            if (addressBox) addressBox.style.display = 'block';
            if (amountEl) amountEl.innerText = amount ? `${amount.toFixed(2)} TONCOIN` : `${getTonActivationAmount().toFixed(2)} TONCOIN`;
            if (addressEl) addressEl.innerText = walletAddress || t('card_order_loading');
            renderPaymentExpiryText(currentPaymentOrder);
            renderTonPaymentQr('');
            if (statusEl) {
                const depositAmount = Number(backendSettings.activation_deposit_amount || amount || TON_ACTIVATION_AMOUNT);
                statusEl.innerText = walletAddress
                    ? (t('ton_deposit_send_status') || languages.en.ton_deposit_send_status).replace('{amount}', depositAmount.toFixed(2))
                    : t('payment_address_unavailable');
            }
            if (depositStatusEl) {
                const depositAmount = Number(backendSettings.activation_deposit_amount || amount || TON_ACTIVATION_AMOUNT);
                depositStatusEl.innerText = walletAddress
                    ? (t('ton_deposit_waiting_status') || languages.en.ton_deposit_waiting_status).replace('{amount}', depositAmount.toFixed(2))
                    : t('payment_address_unavailable');
            }
            updateLocalCardMethodUi();
            updatePaymentActionButtons();
            updatePaymentRealTestReadiness(walletAddress ? 'render_ready' : 'render_waiting');
        }

        async function refreshPaymentStatus(options = {}) {
            const now = Date.now();
            if (options.manual && isActionThrottled('payment-manual-check', 900)) {
                return paymentStatusInflight || latestPaymentStatus;
            }
            if (!options.force && !options.manual && paymentStatusLastRefreshAt && now - paymentStatusLastRefreshAt < 1500) {
                return latestPaymentStatus;
            }
            if (paymentStatusRefreshBusy) return paymentStatusInflight || latestPaymentStatus;
            paymentStatusRefreshBusy = true;
            const showBusy = Boolean(options.manual);
            if (showBusy) setActionBusy('ton-check-payment-btn', true);
            if (showBusy) setPaymentUiState('checking');
            const requestSeq = ++paymentStatusRequestSeq;
            const depositStatusEl = document.getElementById('ton-deposit-status-text');
            if (depositStatusEl && options.manual) setDomText(depositStatusEl, t('payment_check_status'));
            if (!paymentStatusAbortController || paymentStatusAbortController.signal.aborted) {
                paymentStatusAbortController = new AbortController();
            }
            const paymentStatusSignal = paymentStatusAbortController.signal;
            paymentStatusInflight = (async () => {
                try {
                    await loadBackendSettings();

                    if (currentPaymentOrder && currentPaymentOrder.status === 'pending') {
                        const checkResult = await apiRequest('/payment/check', {
                            method: 'POST',
                            timeoutMs: 8000,
                            signal: paymentStatusSignal,
                            body: JSON.stringify({
                                telegram_id: String(referralUserId),
                                order_id: currentPaymentOrder.id
                            })
                        }).catch(() => null);
                        if (checkResult?.user) applyBackendUser(checkResult.user);
                        if (checkResult?.growth_lock) setGrowthLockStatus(checkResult.growth_lock);
                    }

                    const status = await apiRequest(`/payment/status/${encodeURIComponent(referralUserId)}`, {
                        timeoutMs: 8000,
                        signal: paymentStatusSignal
                    });
                    if (requestSeq !== paymentStatusRequestSeq || paymentStatusSignal.aborted) {
                        return latestPaymentStatus;
                    }
                    latestPaymentStatus = status || {};
                    if (status.user) applyBackendUser(status.user);
                    if (status.growth_lock) setGrowthLockStatus(status.growth_lock);
                    const latestOrder = findPaymentOrderWithWallet(status.orders) || (status.orders && status.orders.length ? status.orders[0] : null) || getCachedPaymentOrder(false);
                    rememberPaymentStatus(status);
                    renderPaymentOrder(latestOrder, status);
                    updateWithdrawUi(status);
                    paymentStatusLastRefreshAt = Date.now();
                    setPaymentPollingHealthy(true);
                    updateFrontendHealth({ ok: true });
                    refreshPaymentRuntimeStrip(getPaymentWalletAddress(latestOrder) ? 'ready' : 'loading');
                    updatePaymentRealTestReadiness(options.reason || (options.manual ? 'manual_status_success' : 'poll_status_success'));
                    return status;
                } catch (err) {
                    if (paymentStatusSignal.aborted) return latestPaymentStatus;
                    if (err.data?.growth_lock) setGrowthLockStatus(err.data.growth_lock);
                    const message = friendlyErrorMessage(err);
                    const statusEl = document.getElementById('payment-status-text');
                    if (statusEl) statusEl.innerText = message;
                    if (depositStatusEl) depositStatusEl.innerText = message;
                    setPaymentUiState(navigator.onLine ? 'retrying' : 'offline', message);
                    setPaymentPollingHealthy(false);
                    updateFrontendHealth({ ok: false, last_error: message });
                    updatePaymentRealTestReadiness(options.reason || 'status_retrying', { last_error: message });
                    return latestPaymentStatus;
                } finally {
                    paymentStatusRefreshBusy = false;
                    paymentStatusInflight = null;
                    if (showBusy) setActionBusy('ton-check-payment-btn', false);
                    updatePaymentActionButtons();
                    updatePaymentRealTestReadiness(options.reason || 'status_final');
                }
            })();
            return paymentStatusInflight;
        }

        async function createPaymentOrder() {
            if (createPaymentOrderInflight) return createPaymentOrderInflight;
            if (!paymentOrderAbortController || paymentOrderAbortController.signal.aborted) {
                paymentOrderAbortController = new AbortController();
            }
            const paymentOrderSignal = paymentOrderAbortController.signal;
            const requestSeq = ++paymentOrderRequestSeq;
            setPaymentUiState('creating');
            createPaymentOrderInflight = (async () => {
                const result = await apiRequest('/payment/create', {
                    method: 'POST',
                    timeoutMs: 10000,
                    signal: paymentOrderSignal,
                    body: JSON.stringify({ telegram_id: String(referralUserId) })
                });

                if (requestSeq !== paymentOrderRequestSeq || paymentOrderSignal.aborted) {
                    return currentPaymentOrder;
                }
                if (result.user) applyBackendUser(result.user);
                if (result.growth_lock) setGrowthLockStatus(result.growth_lock);
                latestPaymentStatus = result || latestPaymentStatus || {};
                const selectedOrder = rememberPaymentOrder(result.order, result);
                rememberPaymentStatus(result);
                renderPaymentOrder(selectedOrder, result);
                return selectedOrder;
            })();
            try {
                return await createPaymentOrderInflight;
            } finally {
                createPaymentOrderInflight = null;
                updatePaymentActionButtons();
                updatePaymentRealTestReadiness('create_order_final');
            }
        }

        function normalizeDepositRefundStatus(status) {
            const value = String(status || '').toLowerCase();
            if (['approved', 'completed', 'complete', 'paid', 'auto_paid', 'success', 'sent', 'verified'].includes(value)) return 'completed';
            if (['rejected', 'failed', 'error', 'cancelled', 'canceled'].includes(value)) return 'rejected';
            if (['pending', 'processing', 'queued', 'requested', 'created', 'submitted'].includes(value)) return 'processing';
            return value || 'not_requested';
        }

        function depositRefundStatusText(state, kind = 'status') {
            const normalized = normalizeDepositRefundStatus(state);
            if (normalized === 'completed') {
                return kind === 'message' ? t('deposit_refund_paid_message') : t('deposit_refund_paid_status');
            }
            if (normalized === 'rejected') {
                return kind === 'message' ? t('deposit_refund_rejected_message') : t('deposit_refund_rejected_status');
            }
            return kind === 'message' ? t('deposit_refund_locked_message') : t('deposit_refund_pending_status');
        }

        function updateWithdrawUi(paymentStatus = {}) {
            latestPaymentStatus = paymentStatus || latestPaymentStatus || {};
            const title = document.getElementById('lbl-mdl-withdraw-title');
            const text = document.getElementById('lbl-withdraw-status-text');
            const request = document.getElementById('withdraw-locked-row');
            const extra = document.getElementById('withdraw-extra-row');
            const formBox = document.getElementById('withdraw-form-box');
            const formStatus = document.getElementById('withdraw-form-status');
            const timerEl = document.getElementById('lock-timer');
            const statusCard = document.getElementById('withdraw-status-card');
            const dateLabel = document.getElementById('withdraw-date-label');
            const dateValue = document.getElementById('withdraw-date-value');
            const amountInput = document.getElementById('withdraw-amount-input');
            const addressInput = document.getElementById('withdraw-address-input');
            const submitBtn = document.getElementById('withdraw-submit-btn');
            const windowState = getWithdrawWindowState();
            const growth = currentGrowthLockStatus();
            if (title) title.classList.remove('withdraw-red-title');

            const depositRefund = paymentStatus.deposit_refund || {};
            const hasDepositRefundRecord = Boolean(
                depositRefund.requested
                || depositRefund.status
                || depositRefund.wallet_address
                || depositRefund.id
                || depositRefund.tx_hash
                || depositRefund.auto_payout_submitted
                || depositRefund.remote_confirmed
            );
            const refundRequested = hasDepositRefundRecord;
            const depositRefundAvailable = Boolean(
                paymentStatus.activation_deposit_verified
                || paymentStatus.deposit_refund_available
                || paymentStatus.withdraw_unlocked
                || refundRequested
            );
            const refundStatus = String(depositRefund.status || '').toLowerCase();
            const refundState = normalizeDepositRefundStatus(refundStatus);
            const refundLocked = refundRequested && refundState !== 'rejected';
            const savedRefundWallet = String(depositRefund.wallet_address || safeStorageGet('vidiPayDepositRefundWalletAddress') || '').trim();
            const refundAmount = Number(backendSettings.activation_refund_amount || getTonActivationAmount() || TON_ACTIVATION_AMOUNT);
            const minWithdraw = refundAmount;

            if (timerEl) {
                setDomStyle(timerEl, 'color', windowState.color);
                setDomStyle(timerEl, 'textShadow', `0 0 12px ${windowState.glow}`);
                setDomText(timerEl, windowState.timerText);
            }

            if (statusCard) statusCard.classList.toggle('withdraw-open-card', windowState.status === 'open');
            setDomText(dateLabel, windowState.dateLabel);
            setDomText(dateValue, windowState.dateText);

            const stableSnapshot = JSON.stringify({
                depositRefundAvailable,
                mainWithdrawUnlocked: Boolean(paymentStatus.withdraw_unlocked),
                status: windowState.status,
                min: minWithdraw,
                refund: refundAmount,
                refundRequested,
                refundStatus,
                refundState,
                refundWallet: savedRefundWallet,
                growthMainWithdrawUnlocked: Boolean(growth.main_withdraw?.unlocked),
                mainWithdrawRemaining: Number(growth.main_withdraw?.remaining || 0),
                lang: currentLang
            });

            if (stableSnapshot === withdrawUiSnapshot) return;
            withdrawUiSnapshot = stableSnapshot;

            updateWalletLockUi(windowState);

            if (depositRefundAvailable) {
                setDomText(title, t('deposit_refund_title'));
                setDomStyle(title, 'color', '#22c55e');
                setDomDisplay(formBox, 'block');
                if (formBox) formBox.classList.toggle('is-disabled', refundLocked);
                if (amountInput) {
                    amountInput.value = refundAmount ? refundAmount.toFixed(2) : '';
                    amountInput.min = String(minWithdraw || 0);
                    amountInput.max = String(refundAmount || 0);
                    amountInput.readOnly = true;
                    amountInput.setAttribute('inputmode', 'decimal');
                }
                if (addressInput) {
                    if (savedRefundWallet && addressInput.value !== savedRefundWallet) addressInput.value = savedRefundWallet;
                    addressInput.readOnly = refundLocked;
                    addressInput.disabled = refundLocked;
                    validateWithdrawWalletInput({ silent: true });
                }
                if (submitBtn) {
                    submitBtn.disabled = refundLocked;
                    submitBtn.classList.toggle('locked-action', refundLocked);
                }

                if (refundRequested) {
                    const isPaid = refundState === 'completed';
                    const isRejected = refundState === 'rejected';
                    setDomText(text, depositRefundStatusText(refundState, 'message'));
                    setDomText(request, isPaid ? t('deposit_refund_returned') : isRejected ? t('deposit_refund_rejected') : t('deposit_refund_saved'));
                    setDomText(extra, t('main_balance_locked_extra'));
                    setWithdrawFormStatus(depositRefundStatusText(refundState, 'status'), isPaid ? 'ok' : isRejected ? 'error' : 'warn');
                    return;
                }

                setDomText(text, t('deposit_refund_message'));
                setDomText(request, t('deposit_refund_request'));
                if (windowState.status === 'open') {
                    setDomText(extra, growth.main_withdraw?.unlocked ? t('main_balance_ready_extra') : t('main_withdraw_referral_required'));
                } else {
                    setDomText(extra, t('main_balance_locked_extra'));
                }
                setWithdrawFormStatus(`${t('activation_refund_available')}: ${refundAmount.toFixed(2)} TONCOIN`, 'ok');
                return;
            }

            if (title) {
                setDomText(title, t('activate_wallet_first'));
                setDomStyle(title, 'color', windowState.color);
            }
            setDomText(text, t('activation_deposit_required'));
            setDomText(request, t('payment_required_withdraw'));
            setDomText(extra, t('payment_check_status'));
            if (formBox) formBox.classList.remove('is-disabled');
            if (addressInput) {
                addressInput.disabled = false;
                addressInput.readOnly = false;
            }
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.classList.remove('locked-action');
            }
            setDomDisplay(formBox, 'none');
        }

        function updateWalletLockUi(windowState = getWithdrawWindowState()) {
            const walletBtn = document.querySelector('.wallet-nav');
            const lockRow = document.getElementById('wallet-lock-row');
            const lockExtra = document.getElementById('wallet-lock-extra');
            const paymentBox = document.getElementById('payment-unlock-box');
            const required = getWalletUnlockRequiredAmount();
            const earned = getWalletEarningAmount();
            const unlockedByEarning = earned >= required;

            if (walletBtn) {
                walletBtn.classList.toggle('wallet-locked', !unlockedByEarning);
                walletBtn.setAttribute('aria-disabled', unlockedByEarning ? 'false' : 'true');
            }

            if (!unlockedByEarning) {
                setDomText(lockRow, t('wallet_locked_until_20'));
                setDomText(lockExtra, `${t('wallet_unlock_progress')}: $${earned.toFixed(2)} / $${required.toFixed(2)}`);
                setDomDisplay(paymentBox, 'none');
                return;
            }

            setDomText(lockRow, t('wallet_ready_for_activation'));
            setDomText(lockExtra, t('payment_address_available'));
            setDomDisplay(paymentBox, 'block');
            updateLocalCardMethodUi();
        }

        function getWithdrawWindowState() {
            const windowInfo = backendSettings.withdraw_window || {};
            const opensAt = windowInfo.opens_at ? new Date(windowInfo.opens_at) : null;
            const closesAt = windowInfo.closes_at ? new Date(windowInfo.closes_at) : null;
            const now = new Date();

            if (!opensAt || Number.isNaN(opensAt.getTime())) {
                return {
                    status: 'not_scheduled',
                    title: t('withdraw_closed_title'),
                    message: t('withdraw_not_scheduled_message'),
                    timerText: '--:--:--',
                    dateLabel: t('opening_date'),
                    dateText: t('not_scheduled'),
                    color: '#ef4444',
                    glow: 'rgba(239,68,68,.35)'
                };
            }

            if (now < opensAt) {
                return {
                    status: 'locked',
                    title: t('withdraw_waiting_title'),
                    message: t('withdraw_waiting_message'),
                    timerText: formatCountdown(opensAt.getTime()),
                    dateLabel: t('opening_date'),
                    dateText: formatNiceDate(opensAt),
                    color: '#ef4444',
                    glow: 'rgba(239,68,68,.35)'
                };
            }

            if (closesAt && now <= closesAt) {
                return {
                    status: 'open',
                    title: t('withdraw_open_title'),
                    message: t('withdraw_open_message'),
                    timerText: formatCountdown(closesAt.getTime()),
                    dateLabel: t('closing_date'),
                    dateText: formatNiceDate(closesAt),
                    color: '#22c55e',
                    glow: 'rgba(34,197,94,.35)'
                };
            }

            return {
                status: 'closed',
                title: t('withdraw_expired_title'),
                message: t('withdraw_expired_message'),
                timerText: '00:00:00',
                dateLabel: t('expired_date'),
                dateText: closesAt ? formatNiceDate(closesAt) : t('not_scheduled'),
                color: '#f59e0b',
                glow: 'rgba(245,158,11,.35)'
            };
        }

        async function submitWithdrawRequest() {
            const amountInput = document.getElementById('withdraw-amount-input');
            const addressInput = document.getElementById('withdraw-address-input');
            const methodInput = document.getElementById('withdraw-method-input');
            const statusEl = document.getElementById('withdraw-form-status');
            const submitBtn = document.getElementById('withdraw-submit-btn');
            if (submitBtn?.disabled) return;

            const walletAddress = sanitizeTonWalletInputValue(addressInput?.value || '');
            const walletType = methodInput?.value || 'TON';
            const refundAmount = Number(backendSettings.activation_refund_amount || getTonActivationAmount() || TON_ACTIVATION_AMOUNT);
            if (addressInput && addressInput.value !== walletAddress) addressInput.value = walletAddress;

            if (!refundAmount || refundAmount <= 0) {
                setWithdrawFormStatus(t('withdraw_amount_required'), 'error');
                return;
            }

            if (!walletAddress) {
                setWithdrawFormStatus(t('withdraw_address_required'), 'error');
                validateWithdrawWalletInput({ silent: true });
                return;
            }

            if (!isLikelyTonWalletAddress(walletAddress)) {
                setWithdrawFormStatus(withdrawInvalidTonAddressText(), 'error');
                validateWithdrawWalletInput({ silent: true });
                return;
            }

            try {
                setActionBusy(submitBtn, true);
                setWithdrawFormStatus(t('withdraw_sending'), 'warn');

                const result = await apiRequest('/withdraw/request', {
                    method: 'POST',
                    timeoutMs: 12000,
                    body: JSON.stringify({
                        telegram_id: String(referralUserId),
                        amount: refundAmount,
                        wallet_type: walletType,
                        wallet_address: walletAddress,
                        withdraw_scope: 'deposit_refund'
                    })
                });

                applyBackendUser(result.user);
                if (result.growth_lock) setGrowthLockStatus(result.growth_lock);
                const savedRefundWallet = result.deposit_refund?.wallet_address || walletAddress;
                const depositRefundPayload = {
                    ...(result.deposit_refund || {}),
                    requested: true,
                    status: result.deposit_refund?.status || result.withdraw?.status || 'pending',
                    wallet_address: savedRefundWallet,
                    amount: result.deposit_refund?.amount || result.amount || refundAmount
                };
                if (savedRefundWallet) safeStorageSet('vidiPayDepositRefundWalletAddress', savedRefundWallet);
                latestPaymentStatus = {
                    ...latestPaymentStatus,
                    withdraw_unlocked: Boolean(result.user?.withdraw_unlocked || latestPaymentStatus.withdraw_unlocked),
                    activation_deposit_verified: true,
                    deposit_refund_available: true,
                    deposit_refund: depositRefundPayload
                };
                updateWatchDisplays();
                const createdRefundStatus = depositRefundPayload.status || 'pending';
                addWithdrawHistory(result.amount || refundAmount, createdRefundStatus, {
                    type: 'deposit_refund',
                    method: 'TON_DEPOSIT_REFUND',
                    currency: 'TONCOIN',
                    wallet: savedRefundWallet || walletAddress,
                    tx_hash: result.deposit_refund?.tx_hash || result.withdraw?.tx_hash || ''
                });

                historyFetchedAt = 0;
                window.vidiPayCachedFullHistory = null;
                if (amountInput) amountInput.value = refundAmount.toFixed(2);
                if (addressInput) addressInput.value = savedRefundWallet || walletAddress;
                withdrawUiSnapshot = '';
                updateWithdrawUi(latestPaymentStatus);
                if (statusEl) {
                    const refundStatus = normalizeDepositRefundStatus(latestPaymentStatus.deposit_refund?.status);
                    setWithdrawFormStatus(depositRefundStatusText(refundStatus, 'status'), refundStatus === 'completed' ? 'ok' : refundStatus === 'rejected' ? 'error' : 'warn');
                }
                await renderWithdrawHistory();
            } catch (err) {
                setWithdrawFormStatus(friendlyErrorMessage(err), 'error');
            } finally {
                setActionBusy(submitBtn, false);
                withdrawUiSnapshot = '';
                updateWithdrawUi(latestPaymentStatus);
            }
        }

        async function claimDailyBonus() {
            const statusEl = document.getElementById('bonus-claim-status');
            const claimBtn = document.getElementById('claim-bonus-btn');
            if (claimBtn?.disabled) return;
            const growth = currentGrowthLockStatus();
            if (growth.bonus_locked) {
                const message = growth.checkpoint_1499?.active ? t('growth_1499_locked_message') : t('growth_499_locked_message');
                setDomText(statusEl, message);
                updateBonusLockUi();
                openModal('refModal');
                return;
            }
            if (!isWithdrawWindowOpen()) {
                setDomText(statusEl, t('bonus_locked_text'));
                updateBonusLockUi();
                return;
            }

            try {
                setActionBusy(claimBtn, true);
                setDomText(statusEl, '...');
                const result = await apiRequest('/bonus/claim', {
                    method: 'POST',
                    timeoutMs: 12000,
                    body: JSON.stringify({ telegram_id: String(referralUserId) })
                });
                applyBackendUser(result.user);
                updateWatchDisplays();
                const bonusText = Number(result.bonus || 0).toFixed(2);
                setDomText(statusEl, `${t('bonus_claimed')} $${bonusText}`);
                addNotification(t('bonus_title'), `${t('bonus_claimed')} ${bonusText}`);
            } catch (err) {
                if (err.data?.growth_lock) setGrowthLockStatus(err.data.growth_lock);
                const message = friendlyErrorMessage(err);
                setDomText(statusEl, message);
                addNotification(t('bonus_title'), message);
            } finally {
                setActionBusy(claimBtn, false);
                updateBonusLockUi();
            }
        }

        // DICTIONARY REPOSITORY FOR LANG TRANSITIONS
        const languages = {
            en: {
                total_balance: "TOTAL BALANCE",
                time_spent: "Daily watch time",
                earned_money: "Daily income",
                total_watch_time: "Total watch time",
                hours: "hours",
                minutes: "minutes",
                withdraw: "Withdraw",
                invite: "Add Friend",
                mdl_profile: "Account Profile",
                mdl_noti: "Notifications",
                noti_alert: "System Alert:",
                noti_msg: "Welcome to Vidi Pay! Start earning by clicking on the gold YouTube play coin asset. Daily caps reset at midnight GMT.",
                mdl_withdraw_title: "Withdrawal Locked",
                withdraw_status: "Your funds are secure. The withdrawal window opens exactly when the global pool unlocks. Please wait for the timer:",
                mdl_settings: "Settings",
                lang_title: "Language",
                support_title: "CUSTOMER SUPPORT",
                support_btn: "Contact Support",
                mdl_about: "About Application",
                mdl_about_desc: "Vidi Pay Mini-App.\nSecure Cyber-Hamster P2P ecosystem fully localized within Telegram WebApp container.",
                prof_network: "Network:",
                profile_username: "Nickname:",
                profile_balance: "Balance:",
                profile_total_time: "Total time:",
                profile_daily_income: "Daily income:",
                profile_referrals: "Friends:",
                profile_ref_link: "Referral link",
                copy_link: "COPY LINK",
                copied: "Copied!",
                clipboard_copy_failed: "Copy did not start. The address is selected; copy it manually.",
                leave_app: "LOG OUT",
                delete_account: "DELETE MY ACCOUNT",
                bonus: "BONUS",
                bonus_title: "Referral Bonus",
                bonus_status_title: "Bonus status:",
                bonus_locked_text: "Bonus stays locked until withdrawal time.",
                bonus_open_text: "Bonus is unlocked. You can add it to your main balance now.",
                bonus_timer_text: "Bonus timer follows the withdrawal timer.",
                claim_bonus_locked: "CLAIM BONUS LOCKED",
                claim_bonus_open: "CLAIM BONUS",
                bonus_claimed: "Bonus added to your main balance:",
                bonus_per_friend: "Bonus per joined friend:",
                total_bonus: "Total Bonus",
                friends_joined: "Friends Joined",
                referral_link_title: "Your Referral Link",
                wallet: "WALLET",
                history: "HISTORY",
                wallet_title: "Wallet",
                withdraw_history: "Withdrawal History",
                watch_title: "MrBeast Watch",
                watched_time: "Watched time:",
                pending_reward: "Pending reward:",
                watch_wait: "Start a MrBeast video. Reward is added only after server-verified completion.",
                watch_loading: "YouTube player is loading. MrBeast video will open automatically.",
                watch_playing: "MrBeast video is playing. This video must finish to qualify.",
                watch_counting: "Watching... server verification is active.",
                watch_finished: "Video finished. Verifying and saving reward.",
                watch_result_title: "Video result",
                watched_result: "Watched time:",
                earned_result: "Earned:",
                not_enough_time: "Watched time is not enough. No money was added.",
                watch_added: "Video completion verified. The reward was added to your balance.",
                wallet_locked: "Wallet locked until withdrawal time",
                wallet_locked_extra: "Wallet address will appear when the withdrawal window opens.",
                account_deleted: "Account deletion request completed. This account is now blocked.",
                confirm_delete: "Delete your account? You will not be able to earn or withdraw from this account.",
                not_scheduled: "Not scheduled",
                opening_date: "Opening date",
                closing_date: "Closing date",
                expired_date: "Expired date",
                withdraw_open_title: "Withdrawal is open",
                withdraw_open_message: "Your withdrawal is active. Submit your TON payout request.",
                withdraw_closed_title: "Withdrawal is closed",
                withdraw_not_scheduled_message: "Withdrawal time has not been scheduled yet.",
                withdraw_waiting_title: "Waiting for withdrawal time",
                withdraw_waiting_message: "Wallet and withdrawals will open automatically at the scheduled date.",
                withdraw_expired_title: "Withdrawal time expired",
                withdraw_expired_message: "The last withdrawal window has ended. Wallet stays locked until the next schedule.",
                withdraw_request_available: "Withdrawal request is available",
                withdraw_enter_details: "Enter your TON wallet carefully. Activation refund payout is 6.99 TONCOIN.",
                payment_verified_withdraw: "Payment verified. Withdrawal is available.",
                payment_required_withdraw: "Deposit 6.99 TONCOIN on TON to activate withdrawal.",
                activation_deposit_required: "Deposit 6.99 TONCOIN on TON to activate withdrawal. Blockchain service commission may be charged.",
                activation_refund_available: "Available refund payout",
                payout_request_now: "You can submit your payout request now.",
                payment_check_status: "Complete the required payment and check the status.",
                send_payment_check_status: "Complete the required payment and check the status.",
                payment_address_available: "Activation payment address is available below.",
                withdraw_not_started: "Withdrawal time has not started yet.",
                wallet_locked_until_time: "Wallet and payment address stay locked until the scheduled time.",
                admin_message: "Admin message",
                account_id: "Account ID:",
                mark_all_read: "MARK ALL READ",
                active_tier_label: "Active tier",
                network_label: "Network",
                source_label: "Source",
                reward_label: "Reward",
                per_second_label: "per second",
                unknown_network: "Unknown network",
                unknown_country: "Unknown",
                no_history: "No payment or withdrawal history yet.",
                receipt_date_time: "Date and time",
                receipt_network: "Network",
                receipt_verified_at: "Verified at",
                receipt_note: "Note",
                tier1_title: "TIER 1 COUNTRIES",
                tier2_title: "TIER 2 COUNTRIES",
                tier3_title: "TIER 3 COUNTRIES",
                tier1_countries: "United States, Australia, Canada, Norway, Switzerland, Germany, United Kingdom, Netherlands, Sweden, Denmark",
                tier2_countries: "France, Belgium, Austria, Finland, Ireland, New Zealand, Italy, Spain, Japan, South Korea",
                tier3_countries: "All remaining countries worldwide",

                /* YAGNI QO'SHILDI: FIAT TARJIMALARI */
                pay_with_fiat: "CHECK PAYMENT",
                fastest_method: "FASTEST METHOD",
                fiat_desc: "Deposit 6.99 TONCOIN on TON to activate withdrawal. Blockchain service commission may be charged.",
                or_crypto: "TON NETWORK PAYMENT",
                account_unlock_title: "Account unlock activation"
            },
            ru: {
                total_balance: "ОБЩИЙ БАЛАНС",
                time_spent: "Daily watch time",
                earned_money: "Доход за день",
                total_watch_time: "Total watch time",
                hours: "часов",
                minutes: "минут",
                withdraw: "Вывести",
                invite: "Пригласить друга",
                mdl_profile: "Профиль аккаунта",
                mdl_noti: "Уведомления",
                noti_alert: "Системное оповещение:",
                noti_msg: "Добро пожаловать в Vidi Pay! Начните зарабатывать, нажимая на золотую монету YouTube. Лимиты обновляются в полночь по Гринвичу.",
                mdl_withdraw_title: "Вывод заблокирован",
                withdraw_status: "Ваши средства в безопасности. Окно вывода откроется точно при разблокировке глобального пула. Пожалуйста, подождите:",
                mdl_settings: "Настройки",
                lang_title: "Language",
                support_title: "ТЕХПОДДЕРЖКА",
                support_btn: "Связаться с поддержкой",
                mdl_about: "О приложении",
                mdl_about_desc: "Vidi Pay Mini-App.\nБезопасная P2P-экосистема Cyber-Hamster, локализованная внутри Telegram WebApp.",
                prof_network: "Сеть:",

                pay_with_fiat: "ПРОВЕРИТЬ ОПЛАТУ",
                fastest_method: "БЫСТРЫЙ СПОСОБ",
                fiat_desc: "Внесите 6.99 TONCOIN в сети TON для активации вывода. Может взиматься комиссия блокчейн-сервиса.",
                or_crypto: "ОПЛАТА В СЕТИ TON",
                account_unlock_title: "Активация вывода средств"
            }
        };


        Object.assign(languages, {
            fr: {
                total_balance: "SOLDE TOTAL",
                time_spent: "Daily watch time",
                earned_money: "Revenu quotidien",
                total_watch_time: "Total watch time",
                hours: "heures",
                minutes: "minutes",
                withdraw: "Retirer",
                invite: "Ajouter un ami",
                mdl_profile: "Profil du compte",
                mdl_noti: "Notifications",
                noti_alert: "Alerte système :",
                noti_msg: "Bienvenue sur Vidi Pay ! Commencez à gagner en regardant des vidéos.",
                mdl_withdraw_title: "Retrait verrouillé",
                withdraw_status: "Vos fonds sont sécurisés. La fenêtre de retrait s’ouvre lorsque le pool global est déverrouillé. Veuillez attendre le minuteur :",
                mdl_settings: "Paramètres",
                lang_title: "Langue",
                support_title: "SUPPORT CLIENT",
                support_btn: "Contacter le support",
                mdl_about: "À propos de l’application",
                mdl_about_desc: "Vidi Pay Mini-App.\nÉcosystème P2P sécurisé dans Telegram WebApp.",
                prof_network: "Réseau:"
            },
            hi: {
                total_balance: "कुल बैलेंस",
                time_spent: "Daily watch time",
                earned_money: "दैनिक आय",
                total_watch_time: "Total watch time",
                hours: "घंटे",
                minutes: "मिनट",
                withdraw: "निकासी",
                invite: "दोस्त जोड़ें",
                mdl_profile: "अकाउंट प्रोफाइल",
                mdl_noti: "सूचनाएं",
                noti_alert: "सिस्टम अलर्ट:",
                noti_msg: "Vidi Pay में आपका स्वागत है! वीडियो देखकर कमाई शुरू करें.",
                mdl_withdraw_title: "निकासी लॉक है",
                withdraw_status: "आपकी राशि सुरक्षित है. वैश्विक पूल अनलॉक होने पर निकासी खुलेगी. कृपया टाइमर की प्रतीक्षा करें:",
                mdl_settings: "सेटिंग्स",
                lang_title: "भाषा",
                support_title: "ग्राहक सहायता",
                support_btn: "सपोर्ट से संपर्क करें",
                mdl_about: "ऐप के बारे में",
                mdl_about_desc: "Vidi Pay Mini-App.\nTelegram WebApp के अंदर सुरक्षित P2P सिस्टम.",
                prof_network: "नेटवर्क:"
            },
            es: {
                total_balance: "BALANCE TOTAL",
                time_spent: "Daily watch time",
                earned_money: "Ingreso diario",
                total_watch_time: "Total watch time",
                hours: "horas",
                minutes: "minutos",
                withdraw: "Retirar",
                invite: "Añadir amigo",
                mdl_profile: "Perfil de cuenta",
                mdl_noti: "Notificaciones",
                noti_alert: "Alerta del sistema:",
                noti_msg: "¡Bienvenido a Vidi Pay! Empieza a ganar viendo videos.",
                mdl_withdraw_title: "Retiro bloqueado",
                withdraw_status: "Tus fondos están seguros. La ventana de retiro se abre cuando el pool global se desbloquea. Espera el temporizador:",
                mdl_settings: "Ajustes",
                lang_title: "Idioma",
                support_title: "SOPORTE AL CLIENTE",
                support_btn: "Contactar soporte",
                mdl_about: "Acerca de la aplicación",
                mdl_about_desc: "Vidi Pay Mini-App.\nEcosistema P2P seguro dentro de Telegram WebApp.",
                prof_network: "Red:"
            },
            zh: {
                total_balance: "总余额",
                time_spent: "Daily watch time",
                earned_money: "每日收入",
                total_watch_time: "Total watch time",
                hours: "小时",
                minutes: "分钟",
                withdraw: "提现",
                invite: "添加好友",
                mdl_profile: "账户资料",
                mdl_noti: "通知",
                noti_alert: "系统提醒：",
                noti_msg: "欢迎使用 Vidi Pay！观看视频即可开始赚取收益。",
                mdl_withdraw_title: "提现已锁定",
                withdraw_status: "您的资金是安全的。全球资金池解锁后提现窗口将开启。请等待计时器：",
                mdl_settings: "设置",
                lang_title: "语言",
                support_title: "客户支持",
                support_btn: "联系支持",
                mdl_about: "关于应用",
                mdl_about_desc: "Vidi Pay Mini-App.\nTelegram WebApp 内的安全 P2P 生态系统。",
                prof_network: "网络:"
            },
            de: {
                total_balance: "GESAMTGUTHABEN",
                time_spent: "Daily watch time",
                earned_money: "Tägliches Einkommen",
                total_watch_time: "Total watch time",
                hours: "Stunden",
                minutes: "Minuten",
                withdraw: "Auszahlen",
                invite: "Freund hinzufügen",
                mdl_profile: "Kontoprofil",
                mdl_noti: "Benachrichtigungen",
                noti_alert: "Systemmeldung:",
                noti_msg: "Willkommen bei Vidi Pay! Verdiene Geld durch das Ansehen von Videos.",
                mdl_withdraw_title: "Auszahlung gesperrt",
                withdraw_status: "Dein Guthaben ist sicher. Das Auszahlungsfenster öffnet sich, wenn der globale Pool freigeschaltet wird. Bitte warte auf den Timer:",
                mdl_settings: "Einstellungen",
                lang_title: "Sprache",
                support_title: "KUNDENSUPPORT",
                support_btn: "Support kontaktieren",
                mdl_about: "Über die Anwendung",
                mdl_about_desc: "Vidi Pay Mini-App.\nSicheres P2P-Ökosystem innerhalb von Telegram WebApp.",
                prof_network: "Netzwerk:"
            }
        });

        Object.assign(languages.ru, {
            copied: "Скопировано!",
            leave_app: "Выйти",
            bonus_title: "Реферальный бонус",
            bonus_status_title: "Статус бонуса:",
            bonus_locked_text: "Бонус заблокирован до времени вывода.",
            bonus_open_text: "Бонус открыт. Можно добавить его к основному балансу.",
            bonus_timer_text: "Таймер бонуса работает вместе с таймером вывода.",
            claim_bonus_locked: "БОНУС ЗАБЛОКИРОВАН",
            claim_bonus_open: "ЗАБРАТЬ БОНУС",
            bonus_claimed: "Бонус добавлен к основному балансу:",
            bonus_per_friend: "Бонус за друга:",
            total_bonus: "Всего бонусов",
            friends_joined: "Друзей",
            referral_link_title: "Ваша реферальная ссылка",
            wallet: "КОШЕЛЕК",
            history: "ИСТОРИЯ",
            tier1_title: "СТРАНЫ TIER 1",
            tier2_title: "СТРАНЫ TIER 2",
            tier3_title: "СТРАНЫ TIER 3",
            tier1_countries: "США, Австралия, Канада, Норвегия, Швейцария, Германия, Великобритания, Нидерланды, Швеция, Дания",
            tier2_countries: "Франция, Бельгия, Австрия, Финляндия, Ирландия, Новая Зеландия, Италия, Испания, Япония, Южная Корея",
            tier3_countries: "Все остальные страны мира"
        });

        Object.assign(languages.ru, {
            account_id: "ID аккаунта:",
            profile_username: "Никнейм:",
            profile_balance: "Баланс:",
            profile_total_time: "Общее время:",
            profile_daily_income: "Доход за день:",
            profile_referrals: "Друзья:",
            profile_ref_link: "Реферальная ссылка",
            copy_link: "КОПИРОВАТЬ ССЫЛКУ",
            delete_account: "УДАЛИТЬ АККАУНТ",
            mark_all_read: "ОТМЕТИТЬ ВСЕ",
            active_tier_label: "Активный тир",
            network_label: "Сеть",
            source_label: "Источник",
            reward_label: "Награда",
            per_second_label: "в секунду",
            unknown_network: "Неизвестная сеть",
            unknown_country: "Неизвестно",
            payment_check_status: "Завершите нужный платеж и проверьте статус.",
            payment_address_available: "Адрес для активационного платежа доступен ниже."
        });

        Object.assign(languages.fr, {
            copied: "Copie !",
            leave_app: "Quitter",
            bonus_title: "Bonus de parrainage",
            bonus_status_title: "Statut du bonus :",
            bonus_locked_text: "Le bonus reste verrouille jusqu'a l'heure de retrait.",
            bonus_open_text: "Le bonus est ouvert. Vous pouvez l'ajouter au solde principal.",
            bonus_timer_text: "Le minuteur du bonus suit le minuteur de retrait.",
            claim_bonus_locked: "BONUS VERROUILLE",
            claim_bonus_open: "RECLAMER LE BONUS",
            bonus_claimed: "Bonus ajoute au solde principal :",
            bonus_per_friend: "Bonus par ami :",
            total_bonus: "Bonus total",
            friends_joined: "Amis inscrits",
            referral_link_title: "Votre lien de parrainage",
            wallet: "PORTEFEUILLE",
            history: "HISTORIQUE",
            tier1_title: "PAYS TIER 1",
            tier2_title: "PAYS TIER 2",
            tier3_title: "PAYS TIER 3",
            tier1_countries: "Etats-Unis, Australie, Canada, Norvege, Suisse, Allemagne, Royaume-Uni, Pays-Bas, Suede, Danemark",
            tier2_countries: "France, Belgique, Autriche, Finlande, Irlande, Nouvelle-Zelande, Italie, Espagne, Japon, Coree du Sud",
            tier3_countries: "Tous les autres pays",
            account_id: "ID du compte :",
            profile_username: "Pseudo :",
            profile_balance: "Solde :",
            profile_total_time: "Temps total :",
            profile_daily_income: "Revenu quotidien :",
            profile_referrals: "Amis :",
            mark_all_read: "TOUT LU",
            active_tier_label: "Tier actif",
            network_label: "Reseau",
            source_label: "Source",
            reward_label: "Recompense",
            per_second_label: "par seconde",
            unknown_network: "Reseau inconnu",
            unknown_country: "Inconnu",
            payment_check_status: "Terminez le paiement requis et verifiez le statut.",
            payment_address_available: "L'adresse de paiement d'activation est disponible ci-dessous."
        });

        Object.assign(languages.hi, {
            copied: "Copied!",
            leave_app: "Log out",
            bonus_title: "Referral bonus",
            bonus_status_title: "Bonus status:",
            bonus_locked_text: "Bonus withdrawal time tak locked rahega.",
            bonus_open_text: "Bonus open hai. Ab main balance me add kar sakte hain.",
            bonus_timer_text: "Bonus timer withdrawal timer ke saath chalega.",
            claim_bonus_locked: "BONUS LOCKED",
            claim_bonus_open: "CLAIM BONUS",
            bonus_claimed: "Bonus main balance me add hua:",
            bonus_per_friend: "Friend bonus:",
            total_bonus: "Total bonus",
            friends_joined: "Friends joined",
            referral_link_title: "Referral link",
            wallet: "WALLET",
            history: "HISTORY",
            tier1_title: "TIER 1 COUNTRIES",
            tier2_title: "TIER 2 COUNTRIES",
            tier3_title: "TIER 3 COUNTRIES",
            tier1_countries: "United States, Australia, Canada, Norway, Switzerland, Germany, United Kingdom, Netherlands, Sweden, Denmark",
            tier2_countries: "France, Belgium, Austria, Finland, Ireland, New Zealand, Italy, Spain, Japan, South Korea",
            tier3_countries: "All remaining countries worldwide",
            account_id: "Account ID:",
            profile_username: "Nickname:",
            profile_balance: "Balance:",
            profile_total_time: "Total time:",
            profile_daily_income: "Daily income:",
            profile_referrals: "Friends:",
            mark_all_read: "MARK ALL READ",
            active_tier_label: "Active tier",
            network_label: "Network",
            source_label: "Source",
            reward_label: "Reward",
            per_second_label: "per second",
            unknown_network: "Unknown network",
            unknown_country: "Unknown",
            payment_check_status: "Required payment complete karke status check karein.",
            payment_address_available: "Activation payment address neeche available hai."
        });

        Object.assign(languages.es, {
            copied: "Copiado!",
            leave_app: "Salir",
            bonus_title: "Bono de referido",
            bonus_status_title: "Estado del bono:",
            bonus_locked_text: "El bono queda bloqueado hasta la hora de retiro.",
            bonus_open_text: "El bono esta abierto. Puedes sumarlo al balance principal.",
            bonus_timer_text: "El temporizador del bono sigue el temporizador de retiro.",
            claim_bonus_locked: "BONO BLOQUEADO",
            claim_bonus_open: "RECLAMER BONO",
            bonus_claimed: "Bono agregado al balance principal:",
            bonus_per_friend: "Bono por amigo:",
            total_bonus: "Bono total",
            friends_joined: "Amigos unidos",
            referral_link_title: "Tu enlace de referido",
            wallet: "BILLETERA",
            history: "HISTORIAL",
            tier1_title: "PAISES TIER 1",
            tier2_title: "PAISES TIER 2",
            tier3_title: "PAISES TIER 3",
            tier1_countries: "Estados Unidos, Australia, Canada, Noruega, Suiza, Alemania, Reino Unido, Paises Bajos, Suecia, Dinamarca",
            tier2_countries: "Francia, Belgica, Austria, Finlandia, Irlanda, Nueva Zelanda, Italia, Espana, Japon, Corea del Sur",
            tier3_countries: "Todos los demás países",
            account_id: "ID de cuenta:",
            profile_username: "Usuario:",
            profile_balance: "Balance:",
            profile_total_time: "Tiempo total:",
            profile_daily_income: "Ingreso diario:",
            profile_referrals: "Amigos:",
            mark_all_read: "TODO LEIDO",
            active_tier_label: "Tier activo",
            network_label: "Red",
            source_label: "Fuente",
            reward_label: "Recompensa",
            per_second_label: "por segundo",
            unknown_network: "Red desconocida",
            unknown_country: "Desconocido",
            payment_check_status: "Completa el pago requerido y revisa el estado.",
            payment_address_available: "La direccion de pago de activacion esta abajo."
        });

        Object.assign(languages.zh, {
            copied: "已复制",
            leave_app: "退出",
            bonus_title: "邀请奖励",
            bonus_status_title: "奖励状态：",
            bonus_locked_text: "奖励会锁定到提现时间。",
            bonus_open_text: "奖励已开放，可加入主余额。",
            bonus_timer_text: "奖励计时器跟随提现计时器。",
            claim_bonus_locked: "奖励已锁定",
            claim_bonus_open: "领取奖励",
            bonus_claimed: "奖励已加入主余额：",
            bonus_per_friend: "每位好友奖励：",
            total_bonus: "总奖励",
            friends_joined: "好友数量",
            referral_link_title: "您的邀请链接",
            wallet: "钱包",
            history: "历史",
            tier1_title: "TIER 1 国家",
            tier2_title: "TIER 2 国家",
            tier3_title: "TIER 3 国家",
            tier1_countries: "美国, 澳大利亚, 加拿大, 挪威, 瑞士, 德国, 英国, 荷兰, 瑞典, 丹麦",
            tier2_countries: "法国, 比利时, 奥地利, 芬兰, 爱尔兰, 新西兰, 意大利, 西班牙, 日本, 韩国",
            tier3_countries: "所有其他国家",
            account_id: "账户 ID：",
            profile_username: "昵称：",
            profile_balance: "余额：",
            profile_total_time: "总时间：",
            profile_daily_income: "每日收入：",
            profile_referrals: "好友：",
            mark_all_read: "全部已读",
            active_tier_label: "当前等级",
            network_label: "网络",
            source_label: "来源",
            reward_label: "奖励",
            per_second_label: "每秒",
            unknown_network: "未知网络",
            unknown_country: "未知",
            payment_check_status: "完成所需付款并检查状态。",
            payment_address_available: "激活付款地址如下。"
        });

        Object.assign(languages.de, {
            copied: "Kopiert!",
            leave_app: "Abmelden",
            bonus_title: "Empfehlungsbonus",
            bonus_status_title: "Bonusstatus:",
            bonus_locked_text: "Der Bonus bleibt bis zur Auszahlungszeit gesperrt.",
            bonus_open_text: "Der Bonus ist offen. Du kannst ihn zum Hauptguthaben addieren.",
            bonus_timer_text: "Der Bonus-Timer folgt dem Auszahlungs-Timer.",
            claim_bonus_locked: "BONUS GESPERRT",
            claim_bonus_open: "BONUS HOLEN",
            bonus_claimed: "Bonus zum Hauptguthaben hinzugefuegt:",
            bonus_per_friend: "Bonus pro Freund:",
            total_bonus: "Bonus gesamt",
            friends_joined: "Freunde",
            referral_link_title: "Dein Empfehlungslink",
            wallet: "WALLET",
            history: "VERLAUF",
            tier1_title: "TIER 1 LAENDER",
            tier2_title: "TIER 2 LAENDER",
            tier3_title: "TIER 3 LAENDER",
            tier1_countries: "USA, Australien, Kanada, Norwegen, Schweiz, Deutschland, Vereinigtes Koenigreich, Niederlande, Schweden, Daenemark",
            tier2_countries: "Frankreich, Belgien, Oesterreich, Finnland, Irland, Neuseeland, Italien, Spanien, Japan, Suedkorea",
            tier3_countries: "Alle anderen Laender weltweit",
            account_id: "Konto-ID:",
            profile_username: "Nickname:",
            profile_balance: "Guthaben:",
            profile_total_time: "Gesamtzeit:",
            profile_daily_income: "Taegliches Einkommen:",
            profile_referrals: "Freunde:",
            mark_all_read: "ALLE GELESEN",
            active_tier_label: "Aktiver Tier",
            network_label: "Netzwerk",
            source_label: "Quelle",
            reward_label: "Belohnung",
            per_second_label: "pro Sekunde",
            unknown_network: "Unbekanntes Netzwerk",
            unknown_country: "Unbekannt",
            payment_check_status: "Schliesse die erforderliche Zahlung ab und pruefe den Status.",
            payment_address_available: "Aktivierungs-Zahlungsadresse ist unten verfuegbar."
        });


        Object.assign(languages.en, {
            bonus: "BONUS",
            wallet_current_balance: "Current Balance:",
            withdrawal_method_label: "Activation network:",
            ton_wallet_label: "TONCOIN",
            wallet_open_time: "Wallet activation is available",
            wallet_locked_extra: "Earn $20.00 in total to unlock wallet activation.",
            wallet_locked_until_20: "Wallet is locked until your total income reaches $20.00.",
            wallet_unlock_progress: "Wallet unlock progress",
            wallet_ready_for_activation: "Wallet is ready for activation",
            payment_address_available: "Confirm you are not a bot and connect your personal TON wallet.",
            pay_with_fiat: "CHECK PAYMENT",
            top_up_toncoin: "TOP UP 6.99 TONCOIN",
            copy_ton_address: "COPY ADDRESS",
            fiat_desc: "Confirm that you are not a bot and connect your personal TON wallet to VidiPay. Top up exactly 6.99 TONCOIN to activate it. Blockchain network commission may apply.",
            card_selector_title: "TONCOIN wallet",
            card_maintenance: "Maintenance. This payment route is temporarily unavailable.",
            card_order_loading: "Payment order is loading. Please wait.",
            card_payment_opened: "Payment window opened. Complete the payment and return to this page.",
            wallet_payment_ready: "TONCOIN activation is ready.",
            payment_address_unavailable: "TON wallet address is not connected yet.",
            payment_verified_wallet: "Withdrawal is unlocked. You can request a withdrawal now.",
            activation_deposit_required: "Top up exactly 6.99 TONCOIN to activate the wallet. Other amounts are not confirmed automatically.",
            activation_refund_available: "Available refund payout",
            account_unlock_title: "Wallet activation",
            fastest_method: "Security confirmation",
            ton_deposit_title: "6.99 TONCOIN payment",
            ton_deposit_warning: "Send exactly 6.99 TONCOIN to this address. Less or more than 6.99 TONCOIN will not be confirmed automatically.",
            ton_deposit_send_status: "Send exactly {amount} TONCOIN. Other amounts are not confirmed automatically.",
            ton_deposit_waiting_status: "Waiting for exactly {amount} TONCOIN on TON network.",
            payment_address_label: "Unique TON deposit address",
            wallet_method_value: "TONCOIN"
        });

        Object.assign(languages.ru, {
            bonus: "БОНУС",
            time_spent: "Время за день",
            total_watch_time: "Общее время просмотра",
            wallet_current_balance: "Текущий баланс:",
            withdrawal_method_label: "Метод вывода:",
            ton_wallet_label: "TON Wallet",
            wallet_open_time: "Кошелек открыт во время вывода средств",
            wallet_locked_extra: "Способы оплаты появятся, когда откроется окно вывода.",
            payment_address_available: "TONCOIN адрес для активационного платежа показан ниже.",
            pay_with_fiat: "ПРОВЕРИТЬ ОПЛАТУ",
            fiat_desc: "Внесите 6.99 TONCOIN в сети TON для активации вывода. Может взиматься комиссия блокчейн-сервиса.",
            card_selector_title: "TON wallet",
            card_maintenance: "Профилактика. Этот платежный маршрут временно недоступен.",
            card_order_loading: "Платежный заказ загружается. Пожалуйста, подождите.",
            card_payment_opened: "Окно оплаты открыто. Завершите оплату и вернитесь на эту страницу.",
            wallet_payment_ready: "TON activation deposit готов.",
            payment_address_unavailable: "TON адрес кошелька пока не подключен.",
            payment_verified_wallet: "Вывод разблокирован. Теперь можно создать заявку.",
            payment_required_withdraw: "Внесите 6.99 TONCOIN в сети TON, чтобы активировать вывод.",
            activation_deposit_required: "Внесите 6.99 TONCOIN в сети TON для активации вывода. Может взиматься комиссия блокчейн-сервиса.",
            activation_refund_available: "Доступный возврат"
        });

        Object.assign(languages.fr, {
            bonus: "BONUS",
            wallet_current_balance: "Solde actuel :",
            withdrawal_method_label: "Methode de retrait :",
            ton_wallet_label: "TON Wallet",
            wallet_open_time: "Le portefeuille est ouvert pendant la periode de retrait",
            wallet_locked_extra: "Les options de paiement apparaitront quand la periode de retrait ouvrira.",
            payment_address_available: "L'adresse TONCOIN du paiement d'activation est affichee ci-dessous.",
            pay_with_fiat: "VERIFIER LE PAIEMENT",
            fiat_desc: "Deposez 6.99 TONCOIN sur TON pour activer le retrait. Une commission blockchain peut etre facturee.",
            card_selector_title: "TON wallet",
            card_maintenance: "Maintenance. Cette route de paiement est temporairement indisponible.",
            card_order_loading: "La commande de paiement se charge. Veuillez patienter.",
            card_payment_opened: "La fenetre de paiement est ouverte. Terminez le paiement puis revenez ici.",
            wallet_payment_ready: "Le paiement TON wallet est pret.",
            payment_address_unavailable: "L'adresse wallet TON n'est pas encore connectee.",
            payment_verified_wallet: "Le retrait est debloque. Vous pouvez envoyer une demande.",
            payment_required_withdraw: "Deposez 6.99 TONCOIN sur TON pour activer le retrait.",
            activation_deposit_required: "Deposez 6.99 TONCOIN sur TON pour activer le retrait. Une commission blockchain peut etre facturee.",
            activation_refund_available: "Remboursement disponible"
        });

        Object.assign(languages.hi, {
            bonus: "BONUS",
            wallet_current_balance: "Current Balance:",
            withdrawal_method_label: "Withdrawal Method:",
            ton_wallet_label: "TON Wallet",
            wallet_open_time: "Wallet withdrawal time par open hai",
            wallet_locked_extra: "Withdrawal window open hone par payment options dikhengi.",
            payment_address_available: "Activation payment TONCOIN address neeche hai.",
            pay_with_fiat: "CHECK PAYMENT",
            fiat_desc: "Withdrawal activate karne ke liye TON par 6.99 TONCOIN deposit karein. Blockchain service commission lag sakti hai.",
            card_selector_title: "TON wallet",
            card_maintenance: "Maintenance. Yeh payment route temporary unavailable hai.",
            card_order_loading: "Payment order loading hai. Please wait.",
            card_payment_opened: "Payment window open ho gayi. Payment complete karke is page par wapas aayein.",
            wallet_payment_ready: "TON wallet payment ready hai.",
            payment_address_unavailable: "TON wallet address abhi connected nahi hai.",
            payment_verified_wallet: "Withdrawal unlock ho gaya. Ab request bhej sakte hain.",
            payment_required_withdraw: "Withdrawal activate karne ke liye TON par 6.99 TONCOIN deposit karein.",
            activation_deposit_required: "Withdrawal activate karne ke liye TON par 6.99 TONCOIN deposit karein. Blockchain service commission lag sakti hai.",
            activation_refund_available: "Available refund payout"
        });

        Object.assign(languages.es, {
            bonus: "BONO",
            wallet_current_balance: "Balance actual:",
            withdrawal_method_label: "Metodo de retiro:",
            ton_wallet_label: "TON Wallet",
            wallet_open_time: "La billetera esta abierta durante el horario de retiro",
            wallet_locked_extra: "Las opciones de pago apareceran cuando se abra el horario de retiro.",
            payment_address_available: "La direccion TONCOIN para el pago de activacion esta abajo.",
            pay_with_fiat: "VERIFICAR PAGO",
            fiat_desc: "Deposita 6.99 TONCOIN en TON para activar el retiro. Puede cobrarse comision del servicio blockchain.",
            card_selector_title: "TON wallet",
            card_maintenance: "Mantenimiento. Esta ruta de pago no esta disponible temporalmente.",
            card_order_loading: "La orden de pago se esta cargando. Espera un momento.",
            card_payment_opened: "La ventana de pago se abrio. Completa el pago y vuelve a esta pagina.",
            wallet_payment_ready: "El pago con TON wallet esta listo.",
            payment_address_unavailable: "La direccion wallet TON aun no esta conectada.",
            payment_verified_wallet: "El retiro esta desbloqueado. Ya puedes enviar una solicitud.",
            payment_required_withdraw: "Deposita 6.99 TONCOIN en TON para activar el retiro.",
            activation_deposit_required: "Deposita 6.99 TONCOIN en TON para activar el retiro. Puede cobrarse comision del servicio blockchain.",
            activation_refund_available: "Reembolso disponible"
        });

        Object.assign(languages.zh, {
            bonus: "奖励",
            wallet_current_balance: "当前余额：",
            withdrawal_method_label: "提现方式：",
            ton_wallet_label: "TON Wallet",
            wallet_open_time: "钱包在提现时间内开放",
            wallet_locked_extra: "提现窗口打开后会显示支付选项。",
            payment_address_available: "激活付款 TONCOIN 地址如下。",
            pay_with_fiat: "检查付款",
            fiat_desc: "请在 TON 网络充值 6.99 TONCOIN 以激活提现。可能会收取区块链服务手续费。",
            card_selector_title: "TON wallet",
            card_maintenance: "维护中。该支付线路暂时不可用。",
            card_order_loading: "支付订单正在加载，请稍候。",
            card_payment_opened: "支付窗口已打开。请完成付款后返回此页面。",
            wallet_payment_ready: "TON 钱包付款已准备好。",
            payment_address_unavailable: "TON 钱包地址尚未连接。",
            payment_verified_wallet: "提现已解锁。现在可以提交申请。",
            payment_required_withdraw: "请在 TON 网络充值 6.99 TONCOIN 以激活提现。",
            activation_deposit_required: "请在 TON 网络充值 6.99 TONCOIN 以激活提现。可能会收取区块链服务手续费。",
            activation_refund_available: "可提现返还"
        });

        Object.assign(languages.de, {
            bonus: "BONUS",
            wallet_current_balance: "Aktuelles Guthaben:",
            withdrawal_method_label: "Auszahlungsmethode:",
            ton_wallet_label: "TON Wallet",
            wallet_open_time: "Wallet ist waehrend der Auszahlungszeit geoeffnet",
            wallet_locked_extra: "Zahlungsoptionen erscheinen, wenn das Auszahlungsfenster geoeffnet ist.",
            payment_address_available: "Die TONCOIN Adresse fuer die Aktivierungszahlung steht unten.",
            pay_with_fiat: "ZAHLUNG PRUEFEN",
            fiat_desc: "Zahle 6.99 TONCOIN auf TON ein, um die Auszahlung zu aktivieren. Eine Blockchain-Servicegebuehr kann anfallen.",
            card_selector_title: "TON wallet",
            card_maintenance: "Wartung. Diese Zahlungsroute ist voruebergehend nicht verfuegbar.",
            card_order_loading: "Zahlungsauftrag wird geladen. Bitte warten.",
            card_payment_opened: "Zahlungsfenster geoeffnet. Schliesse die Zahlung ab und kehre hierher zurueck.",
            wallet_payment_ready: "TON Wallet-Zahlung ist bereit.",
            payment_address_unavailable: "TON Wallet-Adresse ist noch nicht verbunden.",
            payment_verified_wallet: "Auszahlung ist freigeschaltet. Du kannst jetzt eine Anfrage senden.",
            payment_required_withdraw: "Zahle 6.99 TONCOIN auf TON ein, um die Auszahlung zu aktivieren.",
            activation_deposit_required: "Zahle 6.99 TONCOIN auf TON ein, um die Auszahlung zu aktivieren. Eine Blockchain-Servicegebuehr kann anfallen.",
            activation_refund_available: "Verfuegbare Rueckzahlung"
        });


        Object.assign(languages.en, {
            withdraw_form_title: "Activation deposit refund",
            withdraw_amount_placeholder: "Fixed refund amount: 6.99 TONCOIN",
            withdraw_card_placeholder: "Your TON wallet address",
            request_withdrawal: "REQUEST DEPOSIT REFUND",
            withdraw_amount_required: "Enter withdrawal amount.",
            withdraw_address_required: "Enter TON wallet address.",
            withdraw_sending: "Sending withdrawal request...",
            withdraw_request_created: "Request created.",
            minimum_withdrawal: "Minimum withdrawal",
            deposit_refund_title: "Activation deposit refund",
            deposit_refund_message: "Only your activation deposit can be withdrawn here. Main balance stays locked until the withdrawal time and referral condition are complete.",
            deposit_refund_request: "Withdraw your activation deposit only",
            deposit_refund_saved: "Refund wallet saved",
            deposit_refund_returned: "Deposit returned",
            deposit_refund_locked_message: "Your payout wallet is saved. This one-time deposit refund window is locked until main balance withdrawal opens.",
            deposit_refund_paid_message: "Your activation deposit has been returned. This one-time window is now locked until main balance withdrawal opens.",
            deposit_refund_pending_status: "Refund request saved. Payout is being processed.",
            deposit_refund_paid_status: "Deposit returned to your saved wallet.",
            deposit_refund_rejected: "Refund rejected",
            deposit_refund_rejected_message: "Refund was rejected. Check your wallet address and try again.",
            deposit_refund_rejected_status: "Refund rejected. Check your wallet address and try again.",
            payment_checking: "CHECKING...",
            main_balance_locked_extra: "Main balance withdrawal is locked until the scheduled withdrawal time.",
            main_balance_ready_extra: "Main balance withdrawal condition is complete. It opens only during withdrawal time.",
            main_withdraw_referral_required: "Main balance withdrawal needs 1 more deposited friend through your referral link.",
            activate_wallet_first: "Activate wallet first",
            growth_499_title: "$499 income boost",
            growth_499_sub: "Invite 2 friends to deposit 6.99 TONCOIN to keep earning after $499.",
            growth_1499_title: "$1499 income boost",
            growth_1499_sub: "Invite 1 more friend to deposit 6.99 TONCOIN to keep earning after $1499.",
            growth_499_locked_message: "Income is paused after $499. Invite 2 friends through your link and both must deposit 6.99 TONCOIN.",
            growth_1499_locked_message: "Income is paused after $1499. Invite 1 more friend through your link and that friend must deposit 6.99 TONCOIN.",
            growth_referral_required: "Referral activation required. These friends are used only for unlocking earning, not for bonus.",
            copy_ton_address: "COPY ADDRESS",
            ton_address_copied: "TON address copied",
            daily_info_title: "Daily Info",
            daily_info_msg: "Daily watch time and daily income reset every 24 hours. Total time stays saved.",
            watch_previous: "Previous",
            watch_random: "Random",
            watch_next: "Next",
            watch_fullscreen: "Fullscreen",
            pending_reward: "Pending reward:",
            watch_reward_wait: "Reward is added only after the current MrBeast video finishes.",
            support_chat_title: "Support Chat",
            support_chat_greeting: "Hello! Write your question here. Support will reply in this chat.",
            support_placeholder: "Write your question...",
            support_received: "Your message has been received. Support will answer as soon as possible.",
            no_withdraw_history: "No withdrawal history yet.",
            status_label: "Status",
            history_wallet_payment: "Wallet payment",
            history_withdraw: "Withdraw",
            receipt_wallet_label: "Wallet",
            fullscreen_unavailable: "Fullscreen mode is not available on this device.",
            watch_reward_save_failed: "Reward could not be saved.",
            watch_reward_saving: "Saving reward...",
            watch_verifying: "Starting secure watch verification...",
            watch_verified: "Secure watch verification is active.",
            watch_verified_player_required: "This player cannot verify completion. No reward will be added here.",
            watch_verified_session_required: "No verified watch session was found. No reward was added.",
            watch_incomplete_no_reward: "The video was closed before verified completion. No reward was added.",
            watch_paused: "Video is paused. Press play to continue secure verification.",
            watch_session_invalid: "The secure watch session response was invalid.",
            watch_video_missing: "Video id was not detected. Please start the MrBeast video again.",
            watch_video_duplicate: "This video was already rewarded. Choose another MrBeast video.",
            watch_too_short_detail: "Video ended, but watched time is too short: {time}.",
            watch_reward_added_detail: "Reward added after {time}: ${amount}",
            watch_reward_backend_failed: "Reward was not saved to the backend.",
            view_reward_title: "View reward",
            view_reward_added: "Reward added after {seconds}s: ${amount}",
            referral_bonus_added: "Your friend joined successfully. Referral bonus was added."

        });

        Object.assign(languages.ru, {
            withdraw_form_title: "Возврат активационного депозита",
            withdraw_amount_placeholder: "Фиксированная сумма возврата: 6.99 TONCOIN",
            withdraw_card_placeholder: "Ваш TON адрес кошелька",
            request_withdrawal: "ЗАПРОСИТЬ ВОЗВРАТ ДЕПОЗИТА",
            withdraw_amount_required: "Введите сумму вывода.",
            withdraw_address_required: "Введите TON адрес кошелька.",
            withdraw_sending: "Заявка на вывод отправляется...",
            withdraw_request_created: "Заявка создана.",
            minimum_withdrawal: "Минимальный вывод",
            deposit_refund_title: "Возврат активационного депозита",
            deposit_refund_message: "Здесь можно вывести только ваш активационный депозит. Основной баланс остается заблокирован до времени вывода и выполнения условия по друзьям.",
            deposit_refund_request: "Вывод только активационного депозита",
            deposit_refund_saved: "Кошелек для возврата сохранен",
            deposit_refund_returned: "Депозит возвращен",
            deposit_refund_locked_message: "Ваш кошелек для выплаты сохранен. Это окно разового возврата депозита заблокировано до открытия вывода основного баланса.",
            deposit_refund_paid_message: "Ваш активационный депозит возвращен. Это разовое окно теперь заблокировано до открытия вывода основного баланса.",
            deposit_refund_pending_status: "Запрос возврата сохранен. Выплата обрабатывается.",
            deposit_refund_paid_status: "Депозит возвращен на сохраненный кошелек.",
            main_balance_locked_extra: "Вывод основного баланса закрыт до назначенного времени вывода.",
            main_balance_ready_extra: "Условие для основного баланса выполнено. Вывод откроется только во время вывода.",
            main_withdraw_referral_required: "Для вывода основного баланса нужен еще 1 друг, который зайдет по вашей ссылке и внесет депозит.",
            activate_wallet_first: "Сначала активируйте кошелек",
            growth_499_title: "Рост дохода после $499",
            growth_499_sub: "Пригласите 2 друзей, которые внесут 6.99 TONCOIN, чтобы продолжить заработок после $499.",
            growth_1499_title: "Рост дохода после $1499",
            growth_1499_sub: "Пригласите еще 1 друга с депозитом 6.99 TONCOIN, чтобы продолжить заработок после $1499.",
            growth_499_locked_message: "Доход приостановлен после $499. Пригласите 2 друзей по ссылке, и оба должны внести 6.99 TONCOIN.",
            growth_1499_locked_message: "Доход приостановлен после $1499. Пригласите еще 1 друга по ссылке, и он должен внести 6.99 TONCOIN.",
            growth_referral_required: "Нужно активировать через приглашенных друзей. Эти друзья открывают заработок и не считаются бонусом.",
            copy_ton_address: "КОПИРОВАТЬ АДРЕС",
            ton_address_copied: "TON адрес скопирован",
            daily_info_title: "Ежедневная информация",
            daily_info_msg: "Время за день и доход за день обновляются каждые 24 часа. Общее время сохраняется.",
            watch_previous: "Назад",
            watch_random: "Случайно",
            watch_next: "Далее",
            watch_fullscreen: "На весь экран",
            pending_reward: "Ожидаемая награда:",
            watch_reward_wait: "Награда добавится только после завершения текущего видео MrBeast.",
            support_chat_title: "Чат поддержки",
            support_chat_greeting: "Здесь можно написать ваш вопрос. Поддержка ответит в этом чате.",
            support_placeholder: "Напишите вопрос...",
            support_received: "Ваше сообщение получено. Поддержка ответит как можно скорее.",
            no_withdraw_history: "Истории вывода пока нет.",
            status_label: "Статус",
            history_wallet_payment: "Оплата кошелька",
            history_withdraw: "Вывод",
            receipt_wallet_label: "Кошелек",
            fullscreen_unavailable: "Полноэкранный режим недоступен на этом устройстве.",
            watch_reward_save_failed: "Награду не удалось сохранить.",
            watch_reward_saving: "Награда сохраняется...",
            watch_video_missing: "ID видео не определен. Запустите видео MrBeast снова.",
            watch_video_duplicate: "Это видео уже засчитано в этой сессии. Выберите другое видео MrBeast.",
            watch_too_short_detail: "Видео завершено, но время просмотра слишком короткое: {time}.",
            watch_reward_added_detail: "Награда добавлена после {time}: ${amount}",
            watch_reward_backend_failed: "Награда не сохранена на сервере.",
            view_reward_title: "Награда за просмотр",
            view_reward_added: "Награда добавлена после {seconds}с: ${amount}",
            referral_bonus_added: "Ваш друг успешно присоединился. Реферальный бонус добавлен."

        });

        Object.assign(languages.fr, {
            withdraw_form_title: "Remboursement du depot d'activation",
            withdraw_amount_placeholder: "Montant fixe du remboursement : 6.99 TONCOIN",
            withdraw_card_placeholder: "Votre adresse wallet TON",
            request_withdrawal: "DEMANDER LE REMBOURSEMENT",
            withdraw_amount_required: "Saisissez le montant du retrait.",
            withdraw_address_required: "Saisissez l'adresse wallet TON.",
            withdraw_sending: "Envoi de la demande de retrait...",
            withdraw_request_created: "Demande creee.",
            minimum_withdrawal: "Retrait minimum",
            deposit_refund_title: "Remboursement du depot d'activation",
            deposit_refund_message: "Ici, vous pouvez retirer uniquement votre depot d'activation. Le solde principal reste verrouille jusqu'a l'heure de retrait et la condition de parrainage.",
            deposit_refund_request: "Retirer uniquement le depot d'activation",
            deposit_refund_saved: "Wallet de remboursement enregistre",
            deposit_refund_returned: "Depot rembourse",
            deposit_refund_locked_message: "Votre wallet de paiement est enregistre. Cette fenetre de remboursement unique reste verrouillee jusqu'a l'ouverture du retrait du solde principal.",
            deposit_refund_paid_message: "Votre depot d'activation a ete rembourse. Cette fenetre unique est maintenant verrouillee jusqu'a l'ouverture du retrait du solde principal.",
            deposit_refund_pending_status: "Demande de remboursement enregistree. Le paiement est en cours.",
            deposit_refund_paid_status: "Depot rembourse vers votre wallet enregistre.",
            main_balance_locked_extra: "Le retrait du solde principal est verrouille jusqu'a l'heure programmee.",
            main_balance_ready_extra: "La condition du solde principal est complete. Le retrait s'ouvre seulement pendant la periode de retrait.",
            main_withdraw_referral_required: "Le retrait du solde principal demande encore 1 ami depose par votre lien.",
            activate_wallet_first: "Activez d'abord le wallet",
            growth_499_title: "Croissance apres $499",
            growth_499_sub: "Invitez 2 amis a deposer 6.99 TONCOIN pour continuer apres $499.",
            growth_1499_title: "Croissance apres $1499",
            growth_1499_sub: "Invitez 1 ami de plus a deposer 6.99 TONCOIN pour continuer apres $1499.",
            growth_499_locked_message: "Le revenu est en pause apres $499. Invitez 2 amis par votre lien; chacun doit deposer 6.99 TONCOIN.",
            growth_1499_locked_message: "Le revenu est en pause apres $1499. Invitez 1 ami de plus par votre lien; il doit deposer 6.99 TONCOIN.",
            growth_referral_required: "Activation par parrainage requise. Ces amis debloquent les gains et ne comptent pas comme bonus.",
            copy_ton_address: "COPIER L'ADRESSE",
            ton_address_copied: "Adresse TON copiee",
            daily_info_title: "Info quotidienne",
            daily_info_msg: "Le temps quotidien et le revenu quotidien se remettent a zero toutes les 24 heures. Le temps total reste enregistre.",
            watch_previous: "Precedent",
            watch_random: "Aleatoire",
            watch_next: "Suivant",
            watch_fullscreen: "Plein ecran",
            pending_reward: "Recompense en attente:",
            watch_reward_wait: "La recompense est ajoutee seulement apres la fin de la video MrBeast actuelle.",
            support_chat_title: "Chat support",
            support_chat_greeting: "Ecrivez votre question ici. Le support repondra dans ce chat.",
            support_placeholder: "Ecrivez votre question...",
            support_received: "Votre message a ete recu. Le support repondra des que possible.",
            no_withdraw_history: "Aucun historique de retrait.",
            status_label: "Statut",
            history_wallet_payment: "Paiement wallet",
            history_withdraw: "Retrait",
            receipt_wallet_label: "Wallet",
            fullscreen_unavailable: "Le mode plein ecran n'est pas disponible sur cet appareil.",
            watch_reward_save_failed: "La recompense n'a pas pu etre enregistree.",
            watch_reward_saving: "Enregistrement de la recompense...",
            watch_video_missing: "ID video non detecte. Relancez la video MrBeast.",
            watch_video_duplicate: "Cette video a deja ete comptee dans cette session. Choisissez une autre video MrBeast.",
            watch_too_short_detail: "La video est terminee, mais le temps regarde est trop court : {time}.",
            watch_reward_added_detail: "Recompense ajoutee apres {time} : ${amount}",
            watch_reward_backend_failed: "La recompense n'a pas ete enregistree sur le serveur.",
            view_reward_title: "Recompense de visionnage",
            view_reward_added: "Recompense ajoutee apres {seconds}s : ${amount}",
            referral_bonus_added: "Votre ami a rejoint avec succes. Le bonus de parrainage a ete ajoute."

        });

        Object.assign(languages.hi, {
            withdraw_form_title: "Activation deposit refund",
            withdraw_amount_placeholder: "Fixed refund amount: 6.99 TONCOIN",
            withdraw_card_placeholder: "Apna TON wallet address",
            request_withdrawal: "REQUEST DEPOSIT REFUND",
            withdraw_amount_required: "Withdrawal amount enter karein.",
            withdraw_address_required: "TON wallet address enter karein.",
            withdraw_sending: "Withdrawal request bheji ja rahi hai...",
            withdraw_request_created: "Request create ho gayi.",
            minimum_withdrawal: "Minimum withdrawal",
            deposit_refund_title: "Activation deposit refund",
            deposit_refund_message: "Yahan sirf activation deposit withdraw hota hai. Main balance withdrawal time aur referral condition tak locked rahega.",
            deposit_refund_request: "Sirf activation deposit withdraw karein",
            deposit_refund_saved: "Refund wallet saved",
            deposit_refund_returned: "Deposit returned",
            deposit_refund_locked_message: "Payout wallet saved hai. Ye one-time deposit refund window main balance withdrawal open hone tak locked hai.",
            deposit_refund_paid_message: "Activation deposit return ho gaya. Ye one-time window main balance withdrawal open hone tak locked hai.",
            deposit_refund_pending_status: "Refund request saved. Payout process ho raha hai.",
            deposit_refund_paid_status: "Deposit saved wallet par return ho gaya.",
            main_balance_locked_extra: "Main balance scheduled withdrawal time tak locked hai.",
            main_balance_ready_extra: "Main balance condition complete hai. Withdrawal sirf withdrawal time me open hoga.",
            main_withdraw_referral_required: "Main balance withdraw ke liye referral link se deposit karne wala 1 aur friend chahiye.",
            activate_wallet_first: "Pehle wallet activate karein",
            growth_499_title: "$499 income boost",
            growth_499_sub: "$499 ke baad earning continue karne ke liye 2 friends 6.99 TONCOIN deposit karein.",
            growth_1499_title: "$1499 income boost",
            growth_1499_sub: "$1499 ke baad earning continue karne ke liye 1 aur friend 6.99 TONCOIN deposit kare.",
            growth_499_locked_message: "$499 ke baad income pause hai. Link se 2 friends invite karein aur dono 6.99 TONCOIN deposit karein.",
            growth_1499_locked_message: "$1499 ke baad income pause hai. Link se 1 aur friend invite karein aur wo 6.99 TONCOIN deposit kare.",
            growth_referral_required: "Referral activation required. Ye friends earning unlock ke liye hain, bonus ke liye nahi.",
            copy_ton_address: "COPY ADDRESS",
            ton_address_copied: "TON address copied",
            daily_info_title: "Daily Info",
            daily_info_msg: "Daily watch time aur daily income har 24 ghante reset hota hai. Total time save rehta hai.",
            watch_previous: "Previous",
            watch_random: "Random",
            watch_next: "Next",
            watch_fullscreen: "Fullscreen",
            pending_reward: "Pending reward:",
            watch_reward_wait: "Reward current MrBeast video finish hone ke baad add hoga.",
            support_chat_title: "Support Chat",
            support_chat_greeting: "Apna sawal yahan likhein. Support isi chat me reply karega.",
            support_placeholder: "Apna sawal likhein...",
            support_received: "Aapka message receive ho gaya. Support jald reply karega.",
            no_withdraw_history: "Abhi withdrawal history nahi hai.",
            status_label: "Status",
            history_wallet_payment: "Wallet payment",
            history_withdraw: "Withdraw",
            receipt_wallet_label: "Wallet",
            fullscreen_unavailable: "Is device par fullscreen mode available nahi hai.",
            watch_reward_save_failed: "Reward save nahi ho saka.",
            watch_reward_saving: "Reward save ho raha hai...",
            watch_video_missing: "Video id detect nahi hua. MrBeast video dobara start karein.",
            watch_video_duplicate: "Ye video is session me pehle hi count ho chuka hai. Dusra MrBeast video choose karein.",
            watch_too_short_detail: "Video end ho gaya, lekin watched time bahut kam hai: {time}.",
            watch_reward_added_detail: "{time} ke baad reward add hua: ${amount}",
            watch_reward_backend_failed: "Reward backend par save nahi hua.",
            view_reward_title: "View reward",
            view_reward_added: "{seconds}s ke baad reward add hua: ${amount}",
            referral_bonus_added: "Aapka friend successfully join hua. Referral bonus add ho gaya."

        });

        Object.assign(languages.es, {
            withdraw_form_title: "Reembolso del deposito de activacion",
            withdraw_amount_placeholder: "Monto fijo de reembolso: 6.99 TONCOIN",
            withdraw_card_placeholder: "Tu direccion wallet TON",
            request_withdrawal: "SOLICITAR REEMBOLSO",
            withdraw_amount_required: "Ingresa el monto de retiro.",
            withdraw_address_required: "Ingresa tu direccion wallet TON.",
            withdraw_sending: "Enviando solicitud de retiro...",
            withdraw_request_created: "Solicitud creada.",
            minimum_withdrawal: "Retiro minimo",
            deposit_refund_title: "Reembolso del deposito de activacion",
            deposit_refund_message: "Aqui solo puedes retirar tu deposito de activacion. El balance principal queda bloqueado hasta la hora de retiro y la condicion de referidos.",
            deposit_refund_request: "Retirar solo el deposito de activacion",
            deposit_refund_saved: "Wallet de reembolso guardada",
            deposit_refund_returned: "Deposito devuelto",
            deposit_refund_locked_message: "Tu wallet de pago esta guardada. Esta ventana de reembolso unico queda bloqueada hasta que se abra el retiro del balance principal.",
            deposit_refund_paid_message: "Tu deposito de activacion fue devuelto. Esta ventana unica queda bloqueada hasta que se abra el retiro del balance principal.",
            deposit_refund_pending_status: "Solicitud de reembolso guardada. El pago se esta procesando.",
            deposit_refund_paid_status: "Deposito devuelto a tu wallet guardada.",
            main_balance_locked_extra: "El retiro del balance principal esta bloqueado hasta la hora programada.",
            main_balance_ready_extra: "La condicion del balance principal esta completa. El retiro abre solo durante la hora de retiro.",
            main_withdraw_referral_required: "Para retirar el balance principal falta 1 amigo que deposite por tu enlace.",
            activate_wallet_first: "Activa la billetera primero",
            growth_499_title: "Aumento de ingresos $499",
            growth_499_sub: "Invita 2 amigos que depositen 6.99 TONCOIN para seguir ganando despues de $499.",
            growth_1499_title: "Aumento de ingresos $1499",
            growth_1499_sub: "Invita 1 amigo mas que deposite 6.99 TONCOIN para seguir ganando despues de $1499.",
            growth_499_locked_message: "El ingreso esta pausado despues de $499. Invita 2 amigos por tu enlace y ambos deben depositar 6.99 TONCOIN.",
            growth_1499_locked_message: "El ingreso esta pausado despues de $1499. Invita 1 amigo mas por tu enlace y debe depositar 6.99 TONCOIN.",
            growth_referral_required: "Se requiere activacion por referidos. Estos amigos desbloquean ingresos y no cuentan como bono.",
            copy_ton_address: "COPIAR DIRECCION",
            ton_address_copied: "Direccion TON copiada",
            daily_info_title: "Info diaria",
            daily_info_msg: "El tiempo diario y el ingreso diario se reinician cada 24 horas. El tiempo total queda guardado.",
            watch_previous: "Anterior",
            watch_random: "Aleatorio",
            watch_next: "Siguiente",
            watch_fullscreen: "Pantalla completa",
            pending_reward: "Recompensa pendiente:",
            watch_reward_wait: "La recompensa se agrega solo cuando termina el video actual de MrBeast.",
            support_chat_title: "Chat de soporte",
            support_chat_greeting: "Escribe tu pregunta aqui. Soporte respondera en este chat.",
            support_placeholder: "Escribe tu pregunta...",
            support_received: "Tu mensaje fue recibido. Soporte respondera lo antes posible.",
            no_withdraw_history: "Aun no hay historial de retiros.",
            status_label: "Estado",
            history_wallet_payment: "Pago de wallet",
            history_withdraw: "Retiro",
            receipt_wallet_label: "Wallet",
            fullscreen_unavailable: "El modo pantalla completa no esta disponible en este dispositivo.",
            watch_reward_save_failed: "La recompensa no se pudo guardar.",
            watch_reward_saving: "Guardando recompensa...",
            watch_video_missing: "No se detecto el ID del video. Inicia el video MrBeast otra vez.",
            watch_video_duplicate: "Este video ya fue contado en esta sesion. Elige otro video MrBeast.",
            watch_too_short_detail: "El video termino, pero el tiempo visto es muy corto: {time}.",
            watch_reward_added_detail: "Recompensa agregada despues de {time}: ${amount}",
            watch_reward_backend_failed: "La recompensa no se guardo en el servidor.",
            view_reward_title: "Recompensa de vista",
            view_reward_added: "Recompensa agregada despues de {seconds}s: ${amount}",
            referral_bonus_added: "Tu amigo se unio correctamente. El bono de referido fue agregado."

        });

        Object.assign(languages.zh, {
            withdraw_form_title: "激活保证金退回",
            withdraw_amount_placeholder: "固定退回金额：6.99 TONCOIN",
            withdraw_card_placeholder: "您的 TON 钱包地址",
            request_withdrawal: "申请退回保证金",
            withdraw_amount_required: "请输入提现金额。",
            withdraw_address_required: "请输入 TON 钱包地址。",
            withdraw_sending: "正在发送提现申请...",
            withdraw_request_created: "申请已创建。",
            minimum_withdrawal: "最低提现",
            deposit_refund_title: "激活保证金退回",
            deposit_refund_message: "这里仅可提取您的激活保证金。主余额会锁定到提现时间并完成邀请条件后。",
            deposit_refund_request: "仅提取激活保证金",
            deposit_refund_saved: "退回钱包已保存",
            deposit_refund_returned: "保证金已退回",
            deposit_refund_locked_message: "您的收款钱包已保存。此一次性保证金退回窗口会锁定到主余额提现开放。",
            deposit_refund_paid_message: "您的激活保证金已退回。此一次性窗口现在会锁定到主余额提现开放。",
            deposit_refund_pending_status: "退回申请已保存，付款处理中。",
            deposit_refund_paid_status: "保证金已退回到您保存的钱包。",
            main_balance_locked_extra: "主余额提现会锁定到预定提现时间。",
            main_balance_ready_extra: "主余额条件已完成。提现只会在提现时间开放。",
            main_withdraw_referral_required: "主余额提现还需要 1 位通过您的链接进入并完成存款的好友。",
            activate_wallet_first: "请先激活钱包",
            growth_499_title: "$499 收入提升",
            growth_499_sub: "邀请 2 位好友存入 6.99 TONCOIN，才能在 $499 后继续收益。",
            growth_1499_title: "$1499 收入提升",
            growth_1499_sub: "再邀请 1 位好友存入 6.99 TONCOIN，才能在 $1499 后继续收益。",
            growth_499_locked_message: "$499 后收益已暂停。请通过您的链接邀请 2 位好友，且两人都需存入 6.99 TONCOIN。",
            growth_1499_locked_message: "$1499 后收益已暂停。请再邀请 1 位好友，且该好友需存入 6.99 TONCOIN。",
            growth_referral_required: "需要邀请激活。这些好友仅用于解锁收益，不计入奖励。",
            copy_ton_address: "复制地址",
            ton_address_copied: "TON 地址已复制",
            daily_info_title: "每日信息",
            daily_info_msg: "每日观看时间和每日收入每 24 小时重置。总时间会保留。",
            watch_previous: "上一个",
            watch_random: "随机",
            watch_next: "下一个",
            watch_fullscreen: "全屏",
            pending_reward: "待发奖励：",
            watch_reward_wait: "奖励只会在当前 MrBeast 视频结束后添加。",
            support_chat_title: "支持聊天",
            support_chat_greeting: "请在此写下您的问题。支持会在此聊天中回复。",
            support_placeholder: "写下您的问题...",
            support_received: "您的消息已收到。支持会尽快回复。",
            no_withdraw_history: "暂无提现历史。",
            status_label: "状态",
            history_wallet_payment: "钱包付款",
            history_withdraw: "提现",
            receipt_wallet_label: "钱包",
            fullscreen_unavailable: "此设备不支持全屏模式。",
            watch_reward_save_failed: "奖励无法保存。",
            watch_reward_saving: "正在保存奖励...",
            watch_video_missing: "未检测到视频 ID。请重新启动 MrBeast 视频。",
            watch_video_duplicate: "此视频已在本次会话中计数。请选择另一个 MrBeast 视频。",
            watch_too_short_detail: "视频已结束，但观看时间太短：{time}。",
            watch_reward_added_detail: "观看 {time} 后已添加奖励：${amount}",
            watch_reward_backend_failed: "奖励未保存到服务器。",
            view_reward_title: "观看奖励",
            view_reward_added: "观看 {seconds}s 后已添加奖励：${amount}",
            referral_bonus_added: "您的好友已成功加入。邀请奖励已添加。"

        });

        Object.assign(languages.de, {
            withdraw_form_title: "Aktivierungsdepot zurueckzahlen",
            withdraw_amount_placeholder: "Fester Rueckzahlungsbetrag: 6.99 TONCOIN",
            withdraw_card_placeholder: "Deine TON Wallet-Adresse",
            request_withdrawal: "DEPOT-RUECKZAHLUNG ANFRAGEN",
            withdraw_amount_required: "Auszahlungsbetrag eingeben.",
            withdraw_address_required: "TON Wallet-Adresse eingeben.",
            withdraw_sending: "Auszahlungsanfrage wird gesendet...",
            withdraw_request_created: "Anfrage erstellt.",
            minimum_withdrawal: "Mindestauszahlung",
            deposit_refund_title: "Aktivierungsdepot zurueckzahlen",
            deposit_refund_message: "Hier kannst du nur dein Aktivierungsdepot auszahlen. Das Hauptguthaben bleibt bis zur Auszahlungszeit und Referral-Bedingung gesperrt.",
            deposit_refund_request: "Nur Aktivierungsdepot auszahlen",
            deposit_refund_saved: "Rueckzahlungs-Wallet gespeichert",
            deposit_refund_returned: "Depot zurueckgezahlt",
            deposit_refund_locked_message: "Deine Auszahlungs-Wallet ist gespeichert. Dieses einmalige Rueckzahlungsfenster bleibt bis zur Hauptauszahlung gesperrt.",
            deposit_refund_paid_message: "Dein Aktivierungsdepot wurde zurueckgezahlt. Dieses einmalige Fenster ist bis zur Hauptauszahlung gesperrt.",
            deposit_refund_pending_status: "Rueckzahlungsanfrage gespeichert. Auszahlung wird verarbeitet.",
            deposit_refund_paid_status: "Depot wurde an deine gespeicherte Wallet zurueckgezahlt.",
            main_balance_locked_extra: "Die Auszahlung des Hauptguthabens ist bis zur geplanten Auszahlungszeit gesperrt.",
            main_balance_ready_extra: "Die Bedingung fuer das Hauptguthaben ist abgeschlossen. Auszahlung oeffnet nur zur Auszahlungszeit.",
            main_withdraw_referral_required: "Fuer das Hauptguthaben fehlt noch 1 Freund, der ueber deinen Link einzahlt.",
            activate_wallet_first: "Wallet zuerst aktivieren",
            growth_499_title: "$499 Einkommens-Boost",
            growth_499_sub: "Lade 2 Freunde ein, die 6.99 TONCOIN einzahlen, um nach $499 weiter zu verdienen.",
            growth_1499_title: "$1499 Einkommens-Boost",
            growth_1499_sub: "Lade 1 weiteren Freund ein, der 6.99 TONCOIN einzahlt, um nach $1499 weiter zu verdienen.",
            growth_499_locked_message: "Einkommen ist nach $499 pausiert. Lade 2 Freunde ueber deinen Link ein; beide muessen 6.99 TONCOIN einzahlen.",
            growth_1499_locked_message: "Einkommen ist nach $1499 pausiert. Lade 1 weiteren Freund ein; er muss 6.99 TONCOIN einzahlen.",
            growth_referral_required: "Referral-Aktivierung erforderlich. Diese Freunde entsperren Einkommen und zaehlen nicht als Bonus.",
            copy_ton_address: "ADRESSE KOPIEREN",
            ton_address_copied: "TON Adresse kopiert",
            daily_info_title: "Tagesinfo",
            daily_info_msg: "Taegliche Watch-Zeit und taegliches Einkommen werden alle 24 Stunden zurueckgesetzt. Gesamtzeit bleibt gespeichert.",
            watch_previous: "Zurueck",
            watch_random: "Zufaellig",
            watch_next: "Weiter",
            watch_fullscreen: "Vollbild",
            pending_reward: "Ausstehende Belohnung:",
            watch_reward_wait: "Die Belohnung wird erst nach Ende des aktuellen MrBeast-Videos hinzugefuegt.",
            support_chat_title: "Support-Chat",
            support_chat_greeting: "Schreibe deine Frage hier. Der Support antwortet in diesem Chat.",
            support_placeholder: "Schreibe deine Frage...",
            support_received: "Deine Nachricht wurde empfangen. Der Support antwortet so schnell wie moeglich.",
            no_withdraw_history: "Noch kein Auszahlungsverlauf.",
            status_label: "Status",
            history_wallet_payment: "Wallet-Zahlung",
            history_withdraw: "Auszahlung",
            receipt_wallet_label: "Wallet",
            fullscreen_unavailable: "Vollbildmodus ist auf diesem Geraet nicht verfuegbar.",
            watch_reward_save_failed: "Belohnung konnte nicht gespeichert werden.",
            watch_reward_saving: "Belohnung wird gespeichert...",
            watch_video_missing: "Video-ID wurde nicht erkannt. Starte das MrBeast-Video erneut.",
            watch_video_duplicate: "Dieses Video wurde in dieser Sitzung bereits gezaehlt. Waehle ein anderes MrBeast-Video.",
            watch_too_short_detail: "Video beendet, aber die Watch-Zeit ist zu kurz: {time}.",
            watch_reward_added_detail: "Belohnung nach {time} hinzugefuegt: ${amount}",
            watch_reward_backend_failed: "Belohnung wurde nicht auf dem Server gespeichert.",
            view_reward_title: "View-Belohnung",
            view_reward_added: "Belohnung nach {seconds}s hinzugefuegt: ${amount}",
            referral_bonus_added: "Dein Freund ist erfolgreich beigetreten. Referral-Bonus wurde hinzugefuegt."

        });


        Object.assign(languages.en, {
            copy_link: "COPY LINK",
            withdraw_history: "Withdrawal History",
            watch_title: "MrBeast Watch",
            watched_result: "Watched time:",
            watch_result_title: "Video result"
        });

        Object.assign(languages.ru, {
            copy_link: "КОПИРОВАТЬ ССЫЛКУ",
            withdraw_history: "История вывода",
            watch_title: "Просмотр MrBeast",
            watched_result: "Время просмотра:",
            watch_result_title: "Результат видео"
        });

        Object.assign(languages.fr, {
            copy_link: "COPIER LE LIEN",
            withdraw_history: "Historique des retraits",
            watch_title: "Regarder MrBeast",
            watched_result: "Temps regarde :",
            watch_result_title: "Resultat video"
        });

        Object.assign(languages.hi, {
            copy_link: "COPY LINK",
            withdraw_history: "Withdrawal History",
            watch_title: "MrBeast Watch",
            watched_result: "Watched time:",
            watch_result_title: "Video result"
        });

        Object.assign(languages.es, {
            copy_link: "COPIAR ENLACE",
            withdraw_history: "Historial de retiros",
            watch_title: "Ver MrBeast",
            watched_result: "Tiempo visto:",
            watch_result_title: "Resultado del video"
        });

        Object.assign(languages.zh, {
            copy_link: "复制链接",
            withdraw_history: "提现历史",
            watch_title: "观看 MrBeast",
            watched_result: "观看时间：",
            watch_result_title: "视频结果"
        });

        Object.assign(languages.de, {
            copy_link: "LINK KOPIEREN",
            withdraw_history: "Auszahlungsverlauf",
            watch_title: "MrBeast ansehen",
            watched_result: "Angesehene Zeit:",
            watch_result_title: "Videoergebnis"
        });

        Object.assign(languages.ru, {
            account_deleted: "Запрос на удаление аккаунта выполнен. Этот аккаунт теперь заблокирован.",
            admin_message: "Сообщение администратора",
            closing_date: "Дата закрытия",
            confirm_delete: "Удалить аккаунт? Вы больше не сможете зарабатывать или выводить средства с этого аккаунта.",
            earned_result: "Заработано:",
            expired_date: "Дата истечения",
            no_history: "Истории платежей или выводов пока нет.",
            not_enough_time: "Время просмотра недостаточно. Деньги не добавлены.",
            not_scheduled: "Не запланировано",
            opening_date: "Дата открытия",
            payment_required_withdraw: "Внесите 6.99 TONCOIN в сети TON, чтобы активировать вывод.",
            payment_verified_withdraw: "Оплата подтверждена. Вывод доступен.",
            payout_request_now: "Теперь можно отправить заявку на выплату.",
            receipt_date_time: "Дата и время",
            receipt_network: "Сеть",
            receipt_note: "Примечание",
            receipt_verified_at: "Подтверждено",
            wallet_locked: "Кошелек заблокирован до времени вывода",
            wallet_locked_until_time: "Для активации вывода нужен депозит 6.99 TONCOIN в сети TON.",
            wallet_title: "Кошелек",
            watch_added: "Вы вышли с экрана просмотра. Время и заработок добавлены на главную страницу.",
            watch_counting: "Просмотр идет... награда добавится, когда вы выйдете с этого экрана.",
            watch_finished: "Видео завершено. Следующее видео MrBeast может продолжить эту же сессию.",
            watch_loading: "YouTube-плеер загружается. Видео MrBeast откроется автоматически.",
            watch_playing: "Видео MrBeast воспроизводится. Время продолжает считаться между видео.",
            watch_wait: "Видео MrBeast засчитываются. Награда добавится, когда вы выйдете с этого экрана.",
            withdraw_closed_title: "Вывод закрыт",
            withdraw_enter_details: "Введите TON адрес кошелька внимательно. Доступный возврат: 6.99 TONCOIN.",
            withdraw_expired_message: "Последнее окно вывода завершилось. Кошелек остается заблокированным до следующего расписания.",
            withdraw_expired_title: "Время вывода истекло",
            withdraw_not_scheduled_message: "Время вывода еще не запланировано.",
            withdraw_not_started: "Время вывода еще не началось.",
            withdraw_open_message: "Вывод активирован. Отправьте заявку на выплату TON.",
            withdraw_open_title: "Вывод открыт",
            withdraw_request_available: "Заявка на вывод доступна",
            withdraw_waiting_message: "Кошелек и выводы автоматически откроются в запланированную дату.",
            withdraw_waiting_title: "Ожидание времени вывода"
        });

        Object.assign(languages.ru, {
            lang_title: "Язык",
            withdrawal_method_label: "Сеть активации:",
            ton_wallet_label: "TONCOIN",
            wallet_method_value: "TONCOIN",
            wallet_locked_extra: "Заработайте $20.00 всего, чтобы открыть активацию кошелька.",
            wallet_locked_until_20: "Кошелек заблокирован, пока общий доход не достигнет $20.00.",
            wallet_unlock_progress: "Прогресс открытия кошелька",
            wallet_ready_for_activation: "Кошелек готов к активации",
            payment_address_available: "Подтвердите, что вы не бот, и подключите личный TON кошелек.",
            top_up_toncoin: "ПОПОЛНИТЬ 6.99 TONCOIN",
            fiat_desc: "Подтвердите, что вы не бот, и подключите личный TON кошелек к VidiPay. Пополните ровно 6.99 TONCOIN для активации. Может взиматься комиссия блокчейн-сети.",
            wallet_payment_ready: "Активация TONCOIN готова.",
            account_unlock_title: "Активация кошелька",
            fastest_method: "Проверка безопасности",
            ton_deposit_title: "Платеж 6.99 TONCOIN",
            ton_deposit_address_title: "TON адрес депозита",
            ton_deposit_warning: "Отправьте ровно 6.99 TONCOIN на этот адрес. Меньше или больше 6.99 TONCOIN автоматически не подтверждается.",
            ton_deposit_send_status: "Отправьте ровно {amount} TONCOIN на этот адрес. Меньше или больше {amount} TONCOIN автоматически не подтверждается.",
            ton_deposit_waiting_status: "Отправьте ровно {amount} TONCOIN на этот адрес. Меньше или больше {amount} TONCOIN автоматически не подтверждается.",
            payment_address_label: "Уникальный TON адрес депозита"
        });

        Object.assign(languages.fr, {
            lang_title: "Langue",
            withdrawal_method_label: "Reseau d'activation :",
            ton_wallet_label: "TONCOIN",
            wallet_method_value: "TONCOIN",
            wallet_locked_extra: "Gagnez $20.00 au total pour debloquer l'activation du wallet.",
            wallet_locked_until_20: "Le wallet est verrouille jusqu'a ce que le revenu total atteigne $20.00.",
            wallet_unlock_progress: "Progression du deblocage du wallet",
            wallet_ready_for_activation: "Le wallet est pret pour l'activation",
            payment_address_available: "Confirmez que vous n'etes pas un bot et connectez votre wallet TON personnel.",
            top_up_toncoin: "RECHARGER 6.99 TONCOIN",
            fiat_desc: "Confirmez que vous n'etes pas un bot et connectez votre wallet TON personnel a VidiPay. Rechargez exactement 6.99 TONCOIN pour l'activer. Une commission blockchain peut s'appliquer.",
            wallet_payment_ready: "Activation TONCOIN prete.",
            account_unlock_title: "Activation du wallet",
            fastest_method: "Confirmation de securite",
            ton_deposit_title: "Paiement 6.99 TONCOIN",
            ton_deposit_address_title: "Adresse de depot TON",
            ton_deposit_warning: "Envoyez exactement 6.99 TONCOIN a cette adresse. Moins ou plus que 6.99 TONCOIN ne sera pas confirme automatiquement.",
            ton_deposit_send_status: "Envoyez exactement {amount} TONCOIN. Les autres montants ne sont pas confirmes automatiquement.",
            ton_deposit_waiting_status: "En attente de exactement {amount} TONCOIN sur le reseau TON.",
            payment_address_label: "Adresse unique de depot TON"
        });

        Object.assign(languages.hi, {
            lang_title: "Bhasha",
            withdrawal_method_label: "Activation network:",
            ton_wallet_label: "TONCOIN",
            wallet_method_value: "TONCOIN",
            wallet_locked_extra: "$20.00 total income tak wallet activation locked hai.",
            wallet_locked_until_20: "Total income $20.00 hone tak wallet locked hai.",
            wallet_unlock_progress: "Wallet unlock progress",
            wallet_ready_for_activation: "Wallet activation ke liye ready hai",
            payment_address_available: "Bot nahi hain ye confirm karein aur apna personal TON wallet connect karein.",
            top_up_toncoin: "6.99 TONCOIN TOP UP",
            fiat_desc: "Bot nahi hain ye confirm karein aur apna personal TON wallet VidiPay se connect karein. Activation ke liye exactly 6.99 TONCOIN top up karein. Blockchain network commission lag sakti hai.",
            wallet_payment_ready: "TONCOIN activation ready hai.",
            account_unlock_title: "Wallet activation",
            fastest_method: "Security confirmation",
            ton_deposit_title: "6.99 TONCOIN payment",
            ton_deposit_address_title: "TON deposit address",
            ton_deposit_warning: "Is address par exactly 6.99 TONCOIN bhejein. 6.99 TONCOIN se kam ya zyada automatic confirm nahi hoga.",
            ton_deposit_send_status: "Exactly {amount} TONCOIN bhejein. Dusri amount automatic confirm nahi hogi.",
            ton_deposit_waiting_status: "TON network par exactly {amount} TONCOIN ka wait ho raha hai.",
            payment_address_label: "Unique TON deposit address"
        });

        Object.assign(languages.es, {
            lang_title: "Idioma",
            withdrawal_method_label: "Red de activacion:",
            ton_wallet_label: "TONCOIN",
            wallet_method_value: "TONCOIN",
            wallet_locked_extra: "Gana $20.00 en total para desbloquear la activacion de la billetera.",
            wallet_locked_until_20: "La billetera esta bloqueada hasta que el ingreso total llegue a $20.00.",
            wallet_unlock_progress: "Progreso de desbloqueo de billetera",
            wallet_ready_for_activation: "La billetera esta lista para activarse",
            payment_address_available: "Confirma que no eres un bot y conecta tu billetera TON personal.",
            top_up_toncoin: "RECARGAR 6.99 TONCOIN",
            fiat_desc: "Confirma que no eres un bot y conecta tu billetera TON personal a VidiPay. Recarga exactamente 6.99 TONCOIN para activarla. Puede aplicarse comision de blockchain.",
            wallet_payment_ready: "Activacion TONCOIN lista.",
            account_unlock_title: "Activacion de billetera",
            fastest_method: "Confirmacion de seguridad",
            ton_deposit_title: "Pago de 6.99 TONCOIN",
            ton_deposit_address_title: "Direccion de deposito TON",
            ton_deposit_warning: "Envia exactamente 6.99 TONCOIN a esta direccion. Menos o mas de 6.99 TONCOIN no se confirma automaticamente.",
            ton_deposit_send_status: "Envia exactamente {amount} TONCOIN. Otros montos no se confirman automaticamente.",
            ton_deposit_waiting_status: "Esperando exactamente {amount} TONCOIN en la red TON.",
            payment_address_label: "Direccion unica de deposito TON"
        });

        Object.assign(languages.zh, {
            lang_title: "语言",
            withdrawal_method_label: "激活网络：",
            ton_wallet_label: "TONCOIN",
            wallet_method_value: "TONCOIN",
            wallet_locked_extra: "总收入达到 $20.00 后才能解锁钱包激活。",
            wallet_locked_until_20: "钱包已锁定，直到总收入达到 $20.00。",
            wallet_unlock_progress: "钱包解锁进度",
            wallet_ready_for_activation: "钱包已准备好激活",
            payment_address_available: "请确认您不是机器人，并连接您的个人 TON 钱包。",
            top_up_toncoin: "充值 6.99 TONCOIN",
            fiat_desc: "请确认您不是机器人，并将个人 TON 钱包连接到 VidiPay。请准确充值 6.99 TONCOIN 以激活。可能会收取区块链网络手续费。",
            wallet_payment_ready: "TONCOIN 激活已准备好。",
            account_unlock_title: "钱包激活",
            fastest_method: "安全确认",
            ton_deposit_title: "6.99 TONCOIN 付款",
            ton_deposit_address_title: "TON 存款地址",
            ton_deposit_warning: "请向此地址准确发送 6.99 TONCOIN。少于或多于 6.99 TONCOIN 将不会自动确认。",
            ton_deposit_send_status: "请向此地址准确发送 {amount} TONCOIN。少于或多于 {amount} TONCOIN 将不会自动确认。",
            ton_deposit_waiting_status: "请向此地址准确发送 {amount} TONCOIN。少于或多于 {amount} TONCOIN 将不会自动确认。",
            payment_address_label: "唯一 TON 存款地址"
        });

        Object.assign(languages.de, {
            lang_title: "Sprache",
            withdrawal_method_label: "Aktivierungsnetzwerk:",
            ton_wallet_label: "TONCOIN",
            wallet_method_value: "TONCOIN",
            wallet_locked_extra: "Verdiene insgesamt $20.00, um die Wallet-Aktivierung freizuschalten.",
            wallet_locked_until_20: "Die Wallet ist gesperrt, bis dein Gesamteinkommen $20.00 erreicht.",
            wallet_unlock_progress: "Wallet-Freischaltfortschritt",
            wallet_ready_for_activation: "Wallet ist bereit zur Aktivierung",
            payment_address_available: "Bestaetige, dass du kein Bot bist, und verbinde deine persoenliche TON Wallet.",
            top_up_toncoin: "6.99 TONCOIN AUFLADEN",
            fiat_desc: "Bestaetige, dass du kein Bot bist, und verbinde deine persoenliche TON Wallet mit VidiPay. Lade exakt 6.99 TONCOIN zur Aktivierung auf. Eine Blockchain-Netzwerkgebuehr kann anfallen.",
            wallet_payment_ready: "TONCOIN-Aktivierung ist bereit.",
            account_unlock_title: "Wallet-Aktivierung",
            fastest_method: "Sicherheitsbestaetigung",
            ton_deposit_title: "6.99 TONCOIN Zahlung",
            ton_deposit_address_title: "TON Einzahlungsadresse",
            ton_deposit_warning: "Sende exakt 6.99 TONCOIN an diese Adresse. Weniger oder mehr als 6.99 TONCOIN wird nicht automatisch bestaetigt.",
            ton_deposit_send_status: "Sende exakt {amount} TONCOIN. Andere Betraege werden nicht automatisch bestaetigt.",
            ton_deposit_waiting_status: "Warte auf exakt {amount} TONCOIN im TON-Netzwerk.",
            payment_address_label: "Einmalige TON Einzahlungsadresse"
        });


        // frontend_language_completion_overrides_v20260703
        const frontendLanguageCompletionOverrides = {
            ru: {
                time_spent: "\u0412\u0440\u0435\u043c\u044f \u0437\u0430 \u0434\u0435\u043d\u044c",
                total_watch_time: "\u041e\u0431\u0449\u0435\u0435 \u0432\u0440\u0435\u043c\u044f \u043f\u0440\u043e\u0441\u043c\u043e\u0442\u0440\u0430",
                wallet_current_balance: "\u0422\u0435\u043a\u0443\u0449\u0438\u0439 \u0431\u0430\u043b\u0430\u043d\u0441:",
                withdrawal_method_label: "\u0421\u0435\u0442\u044c \u0430\u043a\u0442\u0438\u0432\u0430\u0446\u0438\u0438:",
                pay_with_fiat: "\u041f\u0420\u041e\u0412\u0415\u0420\u0418\u0422\u042c \u041e\u041f\u041b\u0410\u0422\u0423",
                copy_ton_address: "\u041a\u041e\u041f\u0418\u0420\u041e\u0412\u0410\u0422\u042c \u0410\u0414\u0420\u0415\u0421",
                copy_link: "\u041a\u041e\u041f\u0418\u0420\u041e\u0412\u0410\u0422\u042c \u0421\u0421\u042b\u041b\u041a\u0423",
                withdraw_history: "\u0418\u0441\u0442\u043e\u0440\u0438\u044f \u0432\u044b\u0432\u043e\u0434\u0430",
                watch_title: "\u041f\u0440\u043e\u0441\u043c\u043e\u0442\u0440 MrBeast",
                watched_result: "\u0412\u0440\u0435\u043c\u044f \u043f\u0440\u043e\u0441\u043c\u043e\u0442\u0440\u0430:",
                watch_result_title: "\u0420\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442 \u0432\u0438\u0434\u0435\u043e",
                daily_info_title: "\u0415\u0436\u0435\u0434\u043d\u0435\u0432\u043d\u0430\u044f \u0438\u043d\u0444\u043e\u0440\u043c\u0430\u0446\u0438\u044f",
                daily_info_msg: "\u0412\u0440\u0435\u043c\u044f \u0438 \u0434\u043e\u0445\u043e\u0434 \u0437\u0430 \u0434\u0435\u043d\u044c \u0441\u0431\u0440\u0430\u0441\u044b\u0432\u0430\u044e\u0442\u0441\u044f \u043a\u0430\u0436\u0434\u044b\u0435 24 \u0447\u0430\u0441\u0430. \u041e\u0431\u0449\u0435\u0435 \u0432\u0440\u0435\u043c\u044f \u0441\u043e\u0445\u0440\u0430\u043d\u044f\u0435\u0442\u0441\u044f.",
                watch_previous: "\u041d\u0430\u0437\u0430\u0434",
                watch_random: "\u0421\u043b\u0443\u0447\u0430\u0439\u043d\u043e",
                watch_next: "\u0414\u0430\u043b\u0435\u0435",
                watch_fullscreen: "\u041d\u0430 \u0432\u0435\u0441\u044c \u044d\u043a\u0440\u0430\u043d",
                pending_reward: "\u041e\u0436\u0438\u0434\u0430\u0435\u043c\u0430\u044f \u043d\u0430\u0433\u0440\u0430\u0434\u0430:",
                watch_reward_wait: "\u041d\u0430\u0433\u0440\u0430\u0434\u0430 \u0434\u043e\u0431\u0430\u0432\u0438\u0442\u0441\u044f \u043f\u043e\u0441\u043b\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0438\u044f \u0442\u0435\u043a\u0443\u0449\u0435\u0433\u043e \u0432\u0438\u0434\u0435\u043e MrBeast.",
                support_chat_title: "\u0427\u0430\u0442 \u043f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u0438",
                support_chat_greeting: "\u041d\u0430\u043f\u0438\u0448\u0438\u0442\u0435 \u0441\u0432\u043e\u0439 \u0432\u043e\u043f\u0440\u043e\u0441 \u0437\u0434\u0435\u0441\u044c. \u041f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u0430 \u043e\u0442\u0432\u0435\u0442\u0438\u0442 \u0432 \u044d\u0442\u043e\u043c \u0447\u0430\u0442\u0435.",
                support_placeholder: "\u041d\u0430\u043f\u0438\u0448\u0438\u0442\u0435 \u0441\u0432\u043e\u0439 \u0432\u043e\u043f\u0440\u043e\u0441...",
                fullscreen_unavailable: "\u041f\u043e\u043b\u043d\u043e\u044d\u043a\u0440\u0430\u043d\u043d\u044b\u0439 \u0440\u0435\u0436\u0438\u043c \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d \u043d\u0430 \u044d\u0442\u043e\u043c \u0443\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432\u0435."
            },
            fr: {
                time_spent: "Temps quotidien",
                total_watch_time: "Temps total de visionnage",
                wallet_current_balance: "Solde actuel :",
                withdrawal_method_label: "Reseau d'activation :",
                pay_with_fiat: "VERIFIER LE PAIEMENT",
                copy_ton_address: "COPIER L'ADRESSE",
                copy_link: "COPIER LE LIEN",
                withdraw_history: "Historique des retraits",
                watch_title: "Regarder MrBeast",
                watched_result: "Temps regarde :",
                watch_result_title: "Resultat video",
                daily_info_title: "Info quotidienne",
                daily_info_msg: "Le temps quotidien et le revenu quotidien se remettent a zero toutes les 24 heures. Le temps total reste enregistre.",
                watch_previous: "Precedent",
                watch_random: "Aleatoire",
                watch_next: "Suivant",
                watch_fullscreen: "Plein ecran",
                pending_reward: "Recompense en attente :",
                watch_reward_wait: "La recompense est ajoutee seulement apres la fin de la video MrBeast actuelle.",
                support_chat_title: "Chat support",
                support_chat_greeting: "Ecrivez votre question ici. Le support repondra dans ce chat.",
                support_placeholder: "Ecrivez votre question...",
                fullscreen_unavailable: "Le mode plein ecran n'est pas disponible sur cet appareil.",
                withdraw_form_title: "Remboursement du depot d'activation",
                withdraw_amount_placeholder: "Montant fixe du remboursement : 6.99 TONCOIN",
                withdraw_card_placeholder: "Votre adresse wallet TON",
                request_withdrawal: "DEMANDER LE REMBOURSEMENT",
                deposit_refund_title: "Remboursement du depot d'activation",
                deposit_refund_request: "Retirer uniquement le depot d'activation",
                deposit_refund_saved: "Wallet de remboursement enregistre",
                deposit_refund_returned: "Depot rembourse"
            },
            hi: {
                time_spent: "Aaj ka watch time",
                total_watch_time: "Kul watch time",
                wallet_current_balance: "Maujooda balance:",
                withdrawal_method_label: "Sakriya network:",
                pay_with_fiat: "PAYMENT CHECK KAREIN",
                copy_link: "LINK COPY KAREIN",
                withdraw_history: "Withdraw itihaas",
                watch_title: "MrBeast dekhein",
                watched_result: "Dekha gaya samay:",
                watch_result_title: "Video natija",
                daily_info_title: "Roz ki jankari",
                daily_info_msg: "Aaj ka watch time aur daily income har 24 ghante reset hota hai. Kul time save rehta hai.",
                watch_previous: "Pichhla",
                watch_random: "Achaanak",
                watch_next: "Agla",
                watch_fullscreen: "Pura screen",
                pending_reward: "Pending reward:",
                watch_reward_wait: "Reward current MrBeast video khatam hone ke baad add hoga.",
                support_chat_title: "Madad chat",
                support_chat_greeting: "Apna sawal yahan likhein. Support isi chat me reply karega.",
                support_placeholder: "Apna sawal likhein...",
                fullscreen_unavailable: "Is device par pura screen mode available nahi hai.",
                withdraw_form_title: "Activation deposit wapas",
                withdraw_amount_placeholder: "Fixed refund amount: 6.99 TONCOIN",
                withdraw_card_placeholder: "Apna TON wallet address",
                request_withdrawal: "DEPOSIT REFUND MANGEIN",
                deposit_refund_title: "Activation deposit wapas",
                deposit_refund_request: "Sirf activation deposit withdraw karein",
                deposit_refund_saved: "Refund wallet save ho gaya",
                deposit_refund_returned: "Deposit wapas ho gaya",
                copy_ton_address: "ADDRESS COPY KAREIN",
                ton_address_copied: "TON address copy ho gaya",
                wallet_ready_for_activation: "Wallet activation ke liye ready hai",
                ton_deposit_warning: "Is address par exactly 6.99 TONCOIN bhejein. Kam ya zyada amount automatic confirm nahi hoga.",
                ton_deposit_send_status: "Exactly {amount} TONCOIN bhejein. Dusri amount automatic confirm nahi hogi.",
                ton_deposit_waiting_status: "TON network par exactly {amount} TONCOIN ka wait ho raha hai.",
                payment_address_label: "Unique TON deposit address"
            },
            es: {
                time_spent: "Tiempo diario",
                total_watch_time: "Tiempo total de visualizacion",
                wallet_current_balance: "Saldo actual:",
                withdrawal_method_label: "Red de activacion:",
                pay_with_fiat: "VERIFICAR PAGO",
                copy_ton_address: "COPIAR DIRECCION",
                copy_link: "COPIAR ENLACE",
                withdraw_history: "Historial de retiros",
                watch_title: "Ver MrBeast",
                watched_result: "Tiempo visto:",
                watch_result_title: "Resultado del video",
                daily_info_title: "Info diaria",
                daily_info_msg: "El tiempo diario y el ingreso diario se reinician cada 24 horas. El tiempo total queda guardado.",
                watch_previous: "Anterior",
                watch_random: "Aleatorio",
                watch_next: "Siguiente",
                watch_fullscreen: "Pantalla completa",
                pending_reward: "Recompensa pendiente:",
                watch_reward_wait: "La recompensa se agrega solo despues de terminar el video MrBeast actual.",
                support_chat_title: "Chat de soporte",
                support_chat_greeting: "Escribe tu pregunta aqui. Soporte respondera en este chat.",
                support_placeholder: "Escribe tu pregunta...",
                fullscreen_unavailable: "El modo pantalla completa no esta disponible en este dispositivo."
            },
            zh: {
                time_spent: "\u6bcf\u65e5\u89c2\u770b\u65f6\u95f4",
                total_watch_time: "\u603b\u89c2\u770b\u65f6\u95f4",
                wallet_current_balance: "\u5f53\u524d\u4f59\u989d:",
                withdrawal_method_label: "\u6fc0\u6d3b\u7f51\u7edc:",
                pay_with_fiat: "\u68c0\u67e5\u4ed8\u6b3e",
                copy_ton_address: "\u590d\u5236\u5730\u5740",
                copy_link: "\u590d\u5236\u94fe\u63a5",
                withdraw_history: "\u63d0\u73b0\u5386\u53f2",
                watch_title: "\u89c2\u770b MrBeast",
                watched_result: "\u89c2\u770b\u65f6\u95f4:",
                watch_result_title: "\u89c6\u9891\u7ed3\u679c",
                daily_info_title: "\u6bcf\u65e5\u4fe1\u606f",
                daily_info_msg: "\u6bcf\u65e5\u89c2\u770b\u65f6\u95f4\u548c\u6536\u5165\u6bcf24\u5c0f\u65f6\u91cd\u7f6e\uff0c\u603b\u65f6\u95f4\u4fdd\u7559\u3002",
                watch_previous: "\u4e0a\u4e00\u4e2a",
                watch_random: "\u968f\u673a",
                watch_next: "\u4e0b\u4e00\u4e2a",
                watch_fullscreen: "\u5168\u5c4f",
                pending_reward: "\u5f85\u53d1\u5956\u52b1:",
                watch_reward_wait: "\u5956\u52b1\u4f1a\u5728\u5f53\u524d MrBeast \u89c6\u9891\u7ed3\u675f\u540e\u6dfb\u52a0\u3002",
                support_chat_title: "\u5ba2\u670d\u804a\u5929",
                support_chat_greeting: "\u8bf7\u5728\u8fd9\u91cc\u5199\u4e0b\u60a8\u7684\u95ee\u9898\u3002\u5ba2\u670d\u4f1a\u5728\u6b64\u804a\u5929\u4e2d\u56de\u590d\u3002",
                support_placeholder: "\u8bf7\u5199\u4e0b\u60a8\u7684\u95ee\u9898...",
                fullscreen_unavailable: "\u6b64\u8bbe\u5907\u4e0d\u652f\u6301\u5168\u5c4f\u6a21\u5f0f\u3002"
            },
            de: {
                time_spent: "Taegliche Wiedergabezeit",
                total_watch_time: "Gesamte Wiedergabezeit",
                wallet_current_balance: "Aktueller Kontostand:",
                withdrawal_method_label: "Aktivierungsnetzwerk:",
                pay_with_fiat: "ZAHLUNG PRUEFEN",
                copy_ton_address: "ADRESSE KOPIEREN",
                copy_link: "LINK KOPIEREN",
                withdraw_history: "Auszahlungsverlauf",
                watch_title: "MrBeast ansehen",
                watched_result: "Angesehene Zeit:",
                watch_result_title: "Videoergebnis",
                daily_info_title: "Tagesinfo",
                daily_info_msg: "Taegliche Wiedergabezeit und Tagesverdienst werden alle 24 Stunden zurueckgesetzt. Die Gesamtzeit bleibt gespeichert.",
                watch_previous: "Zurueck",
                watch_random: "Zufaellig",
                watch_next: "Weiter",
                watch_fullscreen: "Vollbild",
                pending_reward: "Ausstehende Belohnung:",
                watch_reward_wait: "Die Belohnung wird erst nach dem Ende des aktuellen MrBeast-Videos hinzugefuegt.",
                support_chat_title: "Support-Chat",
                support_chat_greeting: "Schreibe deine Frage hier. Der Support antwortet in diesem Chat.",
                support_placeholder: "Schreibe deine Frage...",
                fullscreen_unavailable: "Der Vollbildmodus ist auf diesem Geraet nicht verfuegbar."
            }
        };
        Object.keys(frontendLanguageCompletionOverrides).forEach(lang => {
            if (!languages[lang]) languages[lang] = {};
            Object.assign(languages[lang], frontendLanguageCompletionOverrides[lang]);
        });



        // frontend_hindi_visible_labels_completion_v20260703
        Object.assign(languages.hi, {
            total_balance: "Kul balance",
            earned_money: "Aaj ki income",
            withdraw: "Nikaasi",
            invite: "Dost jodein",
            mdl_profile: "Account profile",
            mdl_noti: "Notifications",
            mdl_settings: "Vinyas",
            lang_title: "Bhasha",
            support_title: "Madad markaz",
            support_btn: "Madad se baat karein",
            profile_username: "Nickname:",
            profile_balance: "Balance:",
            profile_total_time: "Kul time:",
            profile_daily_income: "Aaj ki income:",
            profile_referrals: "Dost:",
            profile_ref_link: "Referral link",
            leave_app: "Log out",
            delete_account: "Account delete karein",
            bonus: "Inaam",
            bonus_title: "Referral inaam",
            bonus_status_title: "Inaam status:",
            bonus_locked_text: "Inaam withdrawal time tak locked rahega.",
            bonus_open_text: "Inaam unlock ho gaya. Ab ise main balance me add kar sakte hain.",
            bonus_timer_text: "Inaam timer withdrawal timer ke saath chalega.",
            claim_bonus_locked: "INAAM LOCKED",
            claim_bonus_open: "INAAM CLAIM KAREIN",
            bonus_claimed: "Inaam main balance me add hua:",
            bonus_per_friend: "Har joined dost ka inaam:",
            total_bonus: "Kul inaam",
            friends_joined: "Joined dost",
            referral_link_title: "Aapka referral link",
            wallet: "Batuwa",
            history: "Itihaas",
            wallet_title: "Batuwa",
            withdraw_history: "Nikaasi itihaas",
            watch_title: "MrBeast dekhein",
            watched_time: "Dekha gaya samay:",
            watch_wait: "MrBeast videos count ho rahe hain. Reward is screen se nikalne par add hoga.",
            watch_loading: "YouTube player load ho raha hai. MrBeast video automatic khulega.",
            watch_playing: "MrBeast video chal raha hai. Time videos ke beech bhi count hota rahega.",
            watch_counting: "Video dekha ja raha hai... reward is screen se nikalne par add hoga.",
            watch_finished: "Video khatam ho gaya. Agla MrBeast video isi session ko continue kar sakta hai.",
            watched_result: "Dekha gaya samay:",
            earned_result: "Kamai:",
            not_enough_time: "Watch time kam hai. Balance add nahi hua.",
            watch_added: "Aap logo screen se nikle. Watch time aur kamai main page me add ho gayi.",
            wallet_locked: "Batuwa locked hai",
            account_deleted: "Account delete request complete ho gayi. Ye account ab blocked hai.",
            confirm_delete: "Account delete karein? Is account se earn ya withdraw nahi kar paayenge.",
            not_scheduled: "Schedule nahi hua",
            opening_date: "Opening date",
            closing_date: "Closing date",
            expired_date: "Expired date",
            withdraw_open_title: "Nikaasi open hai",
            withdraw_open_message: "Nikaasi active hai. TON payout request submit karein.",
            withdraw_closed_title: "Nikaasi closed hai",
            withdraw_not_scheduled_message: "Withdrawal time abhi schedule nahi hua.",
            withdraw_waiting_title: "Withdrawal time ka wait",
            withdraw_waiting_message: "Batuwa aur withdrawal scheduled date par automatic open honge.",
            withdraw_expired_title: "Withdrawal time expire ho gaya",
            withdraw_expired_message: "Last withdrawal window khatam ho gaya. Agle schedule tak batuwa locked rahega.",
            withdraw_request_available: "Withdrawal request available hai",
            withdraw_enter_details: "Apna TON wallet dhyan se enter karein. Activation refund payout 6.99 TONCOIN hai.",
            payment_verified_withdraw: "Payment verify ho gaya. Withdrawal available hai.",
            payment_required_withdraw: "Withdrawal activate karne ke liye TON par 6.99 TONCOIN deposit karein.",
            activation_deposit_required: "Wallet activate karne ke liye exactly 6.99 TONCOIN deposit karein. Blockchain service commission lag sakti hai.",
            activation_refund_available: "Available refund payout",
            payout_request_now: "Ab payout request submit kar sakte hain.",
            payment_check_status: "Required payment complete karke status check karein.",
            send_payment_check_status: "Required payment complete karke status check karein.",
            payment_address_available: "Activation payment address neeche available hai.",
            withdraw_not_started: "Withdrawal time abhi start nahi hua.",
            wallet_locked_until_time: "Scheduled time tak batuwa aur payment address locked rahenge.",
            admin_message: "Admin message",
            mark_all_read: "SAB READ KAREIN",
            active_tier_label: "Sakriya tier",
            network_label: "Jaal",
            source_label: "Srot",
            reward_label: "Inaam",
            per_second_label: "prati second",
            unknown_network: "Anjaan jaal",
            unknown_country: "Anjaan",
            no_history: "Abhi payment ya withdrawal history nahi hai.",
            receipt_date_time: "Date aur time",
            receipt_network: "Jaal",
            receipt_verified_at: "Verified at",
            receipt_note: "Note",
            tier1_title: "Tier 1 desh",
            tier2_title: "Tier 2 desh",
            tier3_title: "Tier 3 desh",
            tier1_countries: "United States, Australia, Canada, Norway, Switzerland, Germany, United Kingdom, Netherlands, Sweden, Denmark",
            tier2_countries: "France, Belgium, Austria, Finland, Ireland, New Zealand, Italy, Spain, Japan, South Korea",
            tier3_countries: "Baaki sab desh worldwide",
            pay_with_fiat: "PAYMENT CHECK KAREIN",
            fastest_method: "Security confirmation",
            or_crypto: "TON NETWORK PAYMENT",
            account_unlock_title: "Wallet activation",
            card_selector_title: "TON wallet"
        });


        Object.keys(languages).forEach(lang => {
            if (lang === 'en') return;
            Object.keys(languages.en).forEach(key => {
                if (languages[lang][key] === undefined) languages[lang][key] = languages.en[key];
            });
        });

        function changeLang(lang) {
            if (isActionThrottled(`lang-${lang}`, 250)) return;
            if (!languages[lang] || lang === 'uz') lang = 'en';
            currentLang = lang;
            safeStorageSet('vidiPayLang', lang);

            document.querySelectorAll('.lang-opt-btn').forEach(btn => btn.classList.remove('active'));
            const activeBtn = document.getElementById(`btn-lang-${lang}`);
            if (activeBtn) activeBtn.classList.add('active');

            const dict = languages[lang] || languages.en;
            const setText = (id, value) => {
                const el = document.getElementById(id);
                if (el && value !== undefined) el.innerText = value;
            };
            const textFor = (key) => dict[key] || languages.en[key] || key;

            document.querySelectorAll('[data-i18n]').forEach(el => {
                const key = el.getAttribute('data-i18n');
                if (key) el.innerText = textFor(key);
            });
            document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
                const key = el.getAttribute('data-i18n-placeholder');
                if (key) el.setAttribute('placeholder', textFor(key));
            });
            document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
                const key = el.getAttribute('data-i18n-aria-label');
                if (key) el.setAttribute('aria-label', textFor(key));
            });

            setText('lbl-total-balance', dict.total_balance);
            setText('lbl-time-spent', dict.time_spent);
            setText('lbl-total-watch-time', dict.total_watch_time);
            setText('lbl-earned-money', dict.earned_money);
            setText('lbl-mdl-profile', dict.mdl_profile);
            setText('lbl-mdl-noti', dict.mdl_noti);
            setText('lbl-noti-alert', dict.noti_alert);
            setText('lbl-noti-msg', dict.noti_msg);
            setText('lbl-mdl-withdraw-title', dict.mdl_withdraw_title);
            setText('lbl-withdraw-status-text', dict.withdraw_status);
            setText('lbl-mdl-settings', dict.mdl_settings);
            setText('lbl-lang-title', dict.lang_title);
            setText('lbl-support-title', dict.support_title);
            setText('lbl-mdl-about', dict.mdl_about);
            setText('lbl-mdl-about-desc', dict.mdl_about_desc);
            setText('lbl-prof-account-id', dict.account_id);
            setText('lbl-prof-network', dict.prof_network);
            setText('lbl-prof-username', dict.profile_username);
            setText('lbl-prof-balance', dict.profile_balance);
            setText('lbl-prof-total-time', dict.profile_total_time);
            setText('lbl-prof-daily-income', dict.profile_daily_income);
            setText('lbl-prof-referrals', dict.profile_referrals);
            setText('lbl-prof-ref-link', dict.profile_ref_link);
            setText('lbl-prof-copy', dict.copy_link);
            setText('lbl-leave-app', dict.leave_app);
            setText('lbl-delete-account', dict.delete_account);
            setText('lbl-ref-title', dict.profile_ref_link);
            setText('copy-link-btn', dict.copy_link);
            setText('bonus-status-title', dict.bonus_status_title);
            setText('bonus-status-text', dict.bonus_locked_text);
            setText('bonus-lock-row', dict.bonus_timer_text);
            setText('claim-bonus-label', dict.claim_bonus_locked);
            setText('withdraw-date-label', dict.opening_date);
            setText('withdraw-date-value', dict.not_scheduled);
            setText('lbl-watch-result-time', dict.watched_result);
            setText('lbl-watch-result-reward', dict.earned_result);
            setText('lbl-mark-all-read', dict.mark_all_read);

            // Extra visible labels used by the wallet and deposit screens.
            setText('lbl-unlock-title', dict.account_unlock_title || languages.en.account_unlock_title);
            setText('lbl-fastest-method', dict.fastest_method || 'Security confirmation');
            setText('lbl-fiat-desc', dict.fiat_desc || languages.en.fiat_desc);
            setText('lbl-pay-fiat', dict.top_up_toncoin || 'TOP UP 6.99 TONCOIN');
            setText('ton-deposit-title', dict.ton_deposit_title || languages.en.ton_deposit_title);
            setText('ton-deposit-address-title', dict.ton_deposit_address_title || languages.en.ton_deposit_address_title);
            setText('ton-deposit-warning', dict.ton_deposit_warning || languages.en.ton_deposit_warning);
            setText('payment-address-label', dict.payment_address_label || languages.en.payment_address_label);
            setText('lbl-check-ton-payment', dict.pay_with_fiat || 'CHECK PAYMENT');
            setText('wallet-current-balance-label', dict.wallet_current_balance || languages.en.wallet_current_balance);
            setText('wallet-method-label', dict.withdrawal_method_label || languages.en.withdrawal_method_label);
            setText('wallet-method-value', dict.wallet_method_value || 'TONCOIN');
            setText('lbl-card-method-title', dict.card_selector_title || 'TON wallet');
            setText('lbl-or-crypto', dict.or_crypto || 'TON NETWORK PAYMENT');
            setText('lbl-copy-ton-address', dict.copy_ton_address || 'COPY ADDRESS');
            setText('checkpoint-499-title', dict.growth_499_title || languages.en.growth_499_title);
            setText('checkpoint-499-sub', dict.growth_499_sub || languages.en.growth_499_sub);
            setText('checkpoint-1499-title', dict.growth_1499_title || languages.en.growth_1499_title);
            setText('checkpoint-1499-sub', dict.growth_1499_sub || languages.en.growth_1499_sub);

            document.querySelectorAll('.bonus-nav span, .bonus-corner-btn span').forEach(el => el.innerText = dict.bonus || 'BONUS');
            document.querySelectorAll('.withdraw-nav span, .withdraw-floating span').forEach(el => el.innerText = dict.withdraw || 'Withdraw');
            document.querySelectorAll('.wallet-nav span').forEach(el => el.innerText = dict.wallet || 'WALLET');
            document.querySelectorAll('.history-nav span').forEach(el => el.innerText = dict.history || 'HISTORY');
            const walletTitle = document.querySelector('#walletModal .modal-title');
            if (walletTitle) walletTitle.innerText = dict.wallet_title || languages.en.wallet_title || languages.en.account_unlock_title;
            const historyTitle = document.querySelector('#withdrawHistoryModal .modal-title');
            if (historyTitle) historyTitle.innerText = dict.withdraw_history || 'Withdrawal History';
            const watchTitle = document.querySelector('#watchModal .modal-title');
            if (watchTitle) watchTitle.innerText = dict.watch_title || 'MrBeast Watch';
            const resultTitle = document.querySelector('#watchResultModal .modal-title');
            if (resultTitle) resultTitle.innerText = dict.watch_result_title || 'Video result';
            const bonusTitle = document.querySelector('#bonusModal .modal-title');
            if (bonusTitle) bonusTitle.innerText = dict.bonus_title || 'Referral Bonus';
            const bonusRateBox = document.querySelector('.bonus-rate-box');
            if (bonusRateBox) bonusRateBox.innerHTML = `${dict.bonus_per_friend || 'Bonus per joined friend:'} <span id="bonus-rate">${BONUS_PER_FRIEND.toFixed(2)} $</span>`;
            const bonusLabels = document.querySelectorAll('.bonus-stat-card .lbl');
            if (bonusLabels[0]) bonusLabels[0].innerText = dict.total_bonus || 'Total Bonus';
            if (bonusLabels[1]) bonusLabels[1].innerText = dict.friends_joined || 'Friends Joined';
            const bonusReferralTitle = document.getElementById('bonus-ref-title');
            if (bonusReferralTitle) bonusReferralTitle.innerText = dict.referral_link_title || 'Your Referral Link';
            const tierTitles = document.querySelectorAll('.tier-title');
            if (tierTitles[0]) tierTitles[0].innerText = dict.tier1_title || languages.en.tier1_title;
            if (tierTitles[1]) tierTitles[1].innerText = dict.tier2_title || languages.en.tier2_title;
            if (tierTitles[2]) tierTitles[2].innerText = dict.tier3_title || languages.en.tier3_title;
            const tierLists = document.querySelectorAll('.tier-list');
            if (tierLists[0]) tierLists[0].innerText = dict.tier1_countries || languages.en.tier1_countries;
            if (tierLists[1]) tierLists[1].innerText = dict.tier2_countries || languages.en.tier2_countries;
            if (tierLists[2]) tierLists[2].innerText = dict.tier3_countries || languages.en.tier3_countries;

            const supportBtn = document.getElementById('lbl-support-btn');
            if (supportBtn && dict.support_btn) {
                supportBtn.innerHTML = `<i class="fas fa-headset" style="margin-right: 6px; color: var(--accent-color);"></i> ${dict.support_btn}`;
            }

            updateWatchDisplays();
            updateProfileModal();
            withdrawUiSnapshot = '';
            notificationRenderSnapshot = '';
            supportRenderSnapshot = '';
            fullHistoryRenderSnapshot = '';
            updateWithdrawUi(latestPaymentStatus);
            updateLocalCardMethodUi();
            updateWalletLockUi();
            updateBonusLockUi();
            updateGrowthLockUi();
            updateTierCards();
            renderNotifications();
            if (document.getElementById('withdrawHistoryModal')?.style.display === 'flex') {
                renderFullHistory();
            }
        }

        function t(key) {
            return (languages[currentLang] && languages[currentLang][key]) || languages.en[key] || key;
        }

        const adminNotificationExactTranslations = {
            "hamyoningiz aktivlashtirildi": {
                en: "Your wallet has been activated",
                ru: "Ваш кошелек активирован",
                fr: "Votre portefeuille a ete active",
                hi: "Aapka wallet activate ho gaya",
                es: "Tu billetera ha sido activada",
                zh: "您的钱包已激活",
                de: "Ihre Wallet wurde aktiviert"
            },
            "depozit tasdiqlandi": {
                en: "Deposit confirmed",
                ru: "Депозит подтвержден",
                fr: "Depot confirme",
                hi: "Deposit confirm ho gaya",
                es: "Deposito confirmado",
                zh: "存款已确认",
                de: "Einzahlung bestatigt"
            },
            "to'lov tasdiqlandi": {
                en: "Payment confirmed",
                ru: "Платеж подтвержден",
                fr: "Paiement confirme",
                hi: "Payment confirm ho gaya",
                es: "Pago confirmado",
                zh: "付款已确认",
                de: "Zahlung bestatigt"
            },
            "pul yechish ochildi": {
                en: "Withdrawal is open",
                ru: "Вывод средств открыт",
                fr: "Le retrait est ouvert",
                hi: "Withdrawal open ho gaya",
                es: "El retiro esta abierto",
                zh: "提现已开启",
                de: "Auszahlung ist geoffnet"
            },
            "depozit qaytarildi": {
                en: "Deposit returned",
                ru: "Депозит возвращен",
                fr: "Depot retourne",
                hi: "Deposit return ho gaya",
                es: "Deposito devuelto",
                zh: "存款已退回",
                de: "Einzahlung zuruckgezahlt"
            },
            "muhim xabar": {
                en: "Important message",
                ru: "Важное сообщение",
                fr: "Message important",
                hi: "Important message",
                es: "Mensaje importante",
                zh: "重要消息",
                de: "Wichtige Nachricht"
            },
            "yangi yangilik": {
                en: "New update",
                ru: "Новое обновление",
                fr: "Nouvelle mise a jour",
                hi: "New update",
                es: "Nueva actualizacion",
                zh: "新更新",
                de: "Neues Update"
            },
            "hamyoningizni aktivlashtirish uchun 6.99 toncoin depozit qiling": {
                en: "Deposit 6.99 TONCOIN to activate your wallet",
                ru: "Внесите 6.99 TONCOIN, чтобы активировать кошелек",
                fr: "Deposez 6.99 TONCOIN pour activer votre portefeuille",
                hi: "Wallet activate karne ke liye 6.99 TONCOIN deposit karein",
                es: "Deposita 6.99 TONCOIN para activar tu billetera",
                zh: "存入 6.99 TONCOIN 以激活您的钱包",
                de: "Zahlen Sie 6.99 TONCOIN ein, um Ihre Wallet zu aktivieren"
            }
        };

        const adminNotificationReplacements = {
            en: [
                [/hamyoningiz/gi, 'your wallet'],
                [/hamyon/gi, 'wallet'],
                [/depozit/gi, 'deposit'],
                [/to['\u2018\u2019\u0060\u00b4\u02bc]?lov/gi, 'payment'],
                [/tasdiqlandi/gi, 'confirmed'],
                [/aktivlashtirildi|faollashtirildi/gi, 'activated'],
                [/pul yechish/gi, 'withdrawal'],
                [/qaytarildi/gi, 'returned'],
                [/ochildi/gi, 'opened'],
                [/yopildi/gi, 'closed'],
                [/muhim/gi, 'important'],
                [/yangilik/gi, 'news'],
                [/xabar/gi, 'message'],
                [/bildirishnoma/gi, 'notification'],
                [/iltimos/gi, 'please'],
                [/tekshiring/gi, 'check'],
                [/do['\u2018\u2019\u0060\u00b4\u02bc]?st/gi, 'friend'],
                [/qo['\u2018\u2019\u0060\u00b4\u02bc]?shing/gi, 'add'],
                [/balans/gi, 'balance'],
                [/qulf/gi, 'lock']
            ],
            ru: [
                [/hamyoningiz/gi, 'ваш кошелек'],
                [/hamyon/gi, 'кошелек'],
                [/depozit/gi, 'депозит'],
                [/to['\u2018\u2019\u0060\u00b4\u02bc]?lov/gi, 'платеж'],
                [/tasdiqlandi/gi, 'подтвержден'],
                [/aktivlashtirildi|faollashtirildi/gi, 'активирован'],
                [/pul yechish/gi, 'вывод средств'],
                [/qaytarildi/gi, 'возвращен'],
                [/ochildi/gi, 'открыт'],
                [/yopildi/gi, 'закрыт'],
                [/muhim/gi, 'важно'],
                [/yangilik/gi, 'новость'],
                [/xabar/gi, 'сообщение'],
                [/bildirishnoma/gi, 'уведомление'],
                [/iltimos/gi, 'пожалуйста'],
                [/tekshiring/gi, 'проверьте'],
                [/do['\u2018\u2019\u0060\u00b4\u02bc]?st/gi, 'друг'],
                [/qo['\u2018\u2019\u0060\u00b4\u02bc]?shing/gi, 'добавьте'],
                [/balans/gi, 'баланс'],
                [/qulf/gi, 'блокировка']
            ],
            fr: [
                [/hamyoningiz/gi, 'votre portefeuille'],
                [/hamyon/gi, 'portefeuille'],
                [/depozit/gi, 'depot'],
                [/to['\u2018\u2019\u0060\u00b4\u02bc]?lov/gi, 'paiement'],
                [/tasdiqlandi/gi, 'confirme'],
                [/aktivlashtirildi|faollashtirildi/gi, 'active'],
                [/pul yechish/gi, 'retrait'],
                [/qaytarildi/gi, 'retourne'],
                [/ochildi/gi, 'ouvert'],
                [/yopildi/gi, 'ferme'],
                [/muhim/gi, 'important'],
                [/yangilik/gi, 'nouvelle'],
                [/xabar/gi, 'message'],
                [/bildirishnoma/gi, 'notification'],
                [/iltimos/gi, 's’il vous plait'],
                [/tekshiring/gi, 'verifiez'],
                [/do['\u2018\u2019\u0060\u00b4\u02bc]?st/gi, 'ami'],
                [/qo['\u2018\u2019\u0060\u00b4\u02bc]?shing/gi, 'ajoutez'],
                [/balans/gi, 'solde'],
                [/qulf/gi, 'verrou']
            ],
            hi: [
                [/hamyoningiz/gi, 'aapka wallet'],
                [/hamyon/gi, 'wallet'],
                [/depozit/gi, 'deposit'],
                [/to['\u2018\u2019\u0060\u00b4\u02bc]?lov/gi, 'payment'],
                [/tasdiqlandi/gi, 'confirm ho gaya'],
                [/aktivlashtirildi|faollashtirildi/gi, 'activate ho gaya'],
                [/pul yechish/gi, 'withdrawal'],
                [/qaytarildi/gi, 'return ho gaya'],
                [/ochildi/gi, 'open ho gaya'],
                [/yopildi/gi, 'closed'],
                [/muhim/gi, 'important'],
                [/yangilik/gi, 'news'],
                [/xabar/gi, 'message'],
                [/bildirishnoma/gi, 'notification'],
                [/iltimos/gi, 'please'],
                [/tekshiring/gi, 'check karein'],
                [/do['\u2018\u2019\u0060\u00b4\u02bc]?st/gi, 'friend'],
                [/qo['\u2018\u2019\u0060\u00b4\u02bc]?shing/gi, 'add karein'],
                [/balans/gi, 'balance'],
                [/qulf/gi, 'lock']
            ],
            es: [
                [/hamyoningiz/gi, 'tu billetera'],
                [/hamyon/gi, 'billetera'],
                [/depozit/gi, 'deposito'],
                [/to['\u2018\u2019\u0060\u00b4\u02bc]?lov/gi, 'pago'],
                [/tasdiqlandi/gi, 'confirmado'],
                [/aktivlashtirildi|faollashtirildi/gi, 'activado'],
                [/pul yechish/gi, 'retiro'],
                [/qaytarildi/gi, 'devuelto'],
                [/ochildi/gi, 'abierto'],
                [/yopildi/gi, 'cerrado'],
                [/muhim/gi, 'importante'],
                [/yangilik/gi, 'noticia'],
                [/xabar/gi, 'mensaje'],
                [/bildirishnoma/gi, 'notificacion'],
                [/iltimos/gi, 'por favor'],
                [/tekshiring/gi, 'revise'],
                [/do['\u2018\u2019\u0060\u00b4\u02bc]?st/gi, 'amigo'],
                [/qo['\u2018\u2019\u0060\u00b4\u02bc]?shing/gi, 'agregue'],
                [/balans/gi, 'balance'],
                [/qulf/gi, 'bloqueo']
            ],
            zh: [
                [/hamyoningiz/gi, '您的钱包'],
                [/hamyon/gi, '钱包'],
                [/depozit/gi, '存款'],
                [/to['\u2018\u2019\u0060\u00b4\u02bc]?lov/gi, '付款'],
                [/tasdiqlandi/gi, '已确认'],
                [/aktivlashtirildi|faollashtirildi/gi, '已激活'],
                [/pul yechish/gi, '提现'],
                [/qaytarildi/gi, '已退回'],
                [/ochildi/gi, '已开启'],
                [/yopildi/gi, '已关闭'],
                [/muhim/gi, '重要'],
                [/yangilik/gi, '新闻'],
                [/xabar/gi, '消息'],
                [/bildirishnoma/gi, '通知'],
                [/iltimos/gi, '请'],
                [/tekshiring/gi, '检查'],
                [/do['\u2018\u2019\u0060\u00b4\u02bc]?st/gi, '朋友'],
                [/qo['\u2018\u2019\u0060\u00b4\u02bc]?shing/gi, '添加'],
                [/balans/gi, '余额'],
                [/qulf/gi, '锁定']
            ],
            de: [
                [/hamyoningiz/gi, 'Ihre Wallet'],
                [/hamyon/gi, 'Wallet'],
                [/depozit/gi, 'Einzahlung'],
                [/to['\u2018\u2019\u0060\u00b4\u02bc]?lov/gi, 'Zahlung'],
                [/tasdiqlandi/gi, 'bestatigt'],
                [/aktivlashtirildi|faollashtirildi/gi, 'aktiviert'],
                [/pul yechish/gi, 'Auszahlung'],
                [/qaytarildi/gi, 'zuruckgezahlt'],
                [/ochildi/gi, 'geoffnet'],
                [/yopildi/gi, 'geschlossen'],
                [/muhim/gi, 'wichtig'],
                [/yangilik/gi, 'Neuigkeit'],
                [/xabar/gi, 'Nachricht'],
                [/bildirishnoma/gi, 'Benachrichtigung'],
                [/iltimos/gi, 'bitte'],
                [/tekshiring/gi, 'prufen'],
                [/do['\u2018\u2019\u0060\u00b4\u02bc]?st/gi, 'Freund'],
                [/qo['\u2018\u2019\u0060\u00b4\u02bc]?shing/gi, 'hinzufugen'],
                [/balans/gi, 'Guthaben'],
                [/qulf/gi, 'Sperre']
            ]
        };

        function normalizeAdminNotificationText(text) {
            return String(text || '')
                .trim()
                .toLowerCase()
                .replace(/[\u2018\u2019\u0060\u00b4\u02bc]/g, "'")
                .replace(/\s+/g, ' ')
                .replace(/[.!?]+$/g, '');
        }

        function translateAdminNotificationText(text) {
            const raw = String(text || '').trim();
            if (!raw) return '';
            const exactKey = normalizeAdminNotificationText(raw);
            const exact = adminNotificationExactTranslations[exactKey];
            if (exact && exact[currentLang]) return exact[currentLang];
            const replacements = adminNotificationReplacements[currentLang] || adminNotificationReplacements.en;
            return replacements.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), raw);
        }

        function currentReferralBonusRate() {
            const configured = Number(backendSettings.referral_bonus);
            return Number.isFinite(configured) && configured > 0 ? configured : BONUS_PER_FRIEND;
        }

        function isWithdrawWindowOpen() {
            return getWithdrawWindowState().status === 'open';
        }

        function showCopyToast(message = t('copied')) {
            let toast = document.getElementById('copy-toast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'copy-toast';
                toast.style.position = 'fixed';
                toast.style.left = '50%';
                toast.style.bottom = '92px';
                toast.style.transform = 'translateX(-50%)';
                toast.style.zIndex = '5000';
                toast.style.padding = '12px 18px';
                toast.style.borderRadius = '999px';
                toast.style.background = 'rgba(0,255,204,.16)';
                toast.style.border = '1px solid rgba(0,255,204,.45)';
                toast.style.color = '#fff';
                toast.style.fontWeight = '900';
                toast.style.boxShadow = '0 10px 30px rgba(0,0,0,.35)';
                document.body.appendChild(toast);
            }
            toast.innerText = message;
            toast.style.display = 'block';
            clearTimeout(showCopyToast.timer);
            showCopyToast.timer = setTimeout(() => { toast.style.display = 'none'; }, 1500);
        }

        function setActionBusy(buttonOrId, busy) {
            const btn = typeof buttonOrId === 'string' ? document.getElementById(buttonOrId) : buttonOrId;
            if (!btn) return;
            if (busy) {
                if (!btn.dataset.busyLockActive) {
                    btn.dataset.wasDisabledBeforeBusy = btn.disabled ? 'true' : 'false';
                    btn.dataset.wasAriaDisabledBeforeBusy = btn.getAttribute('aria-disabled') || '';
                    btn.dataset.busyLockActive = 'true';
                }
                btn.dataset.busyLockAt = String(Date.now());
                btn.disabled = true;
                btn.classList.add('is-busy');
                btn.setAttribute('aria-busy', 'true');
                btn.setAttribute('aria-disabled', 'true');
                return;
            }
            const wasDisabled = btn.dataset.wasDisabledBeforeBusy === 'true';
            const wasAriaDisabled = btn.dataset.wasAriaDisabledBeforeBusy;
            delete btn.dataset.wasDisabledBeforeBusy;
            delete btn.dataset.wasAriaDisabledBeforeBusy;
            delete btn.dataset.busyLockActive;
            delete btn.dataset.busyLockAt;
            btn.disabled = wasDisabled;
            btn.classList.remove('is-busy');
            btn.setAttribute('aria-busy', 'false');
            if (wasAriaDisabled) btn.setAttribute('aria-disabled', wasAriaDisabled);
            else btn.setAttribute('aria-disabled', wasDisabled ? 'true' : 'false');
        }

        function isActionThrottled(key, cooldownMs = 600) {
            const now = Date.now();
            const store = isActionThrottled.store || (isActionThrottled.store = new Map());
            const until = Number(store.get(key) || 0);
            if (until > now) return true;
            store.set(key, now + cooldownMs);
            return false;
        }

        async function copyTextToClipboard(text) {
            const value = String(text || '');
            if (!value) return false;
            try {
                if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(value);
                    return true;
                }
            } catch (_) {}

            const input = document.createElement('textarea');
            input.value = value;
            input.setAttribute('readonly', '');
            input.style.position = 'fixed';
            input.style.left = '-9999px';
            input.style.top = '0';
            document.body.appendChild(input);
            input.select();
            input.setSelectionRange(0, value.length);
            let copied = false;
            try { copied = document.execCommand('copy'); } catch (_) { copied = false; }
            input.remove();
            return copied;
        }

        function leaveApp() {
            if (tg.close) {
                tg.close();
                return;
            }
            closeModal('profileModal');
        }

        function openWalletIfUnlocked() {
            if (isActionThrottled('open-wallet', 500)) return;
            if (!isWalletEarningUnlocked()) {
                const required = getWalletUnlockRequiredAmount();
                const earned = getWalletEarningAmount();
                showCopyToast(`${t('wallet_locked_until_20')} $${earned.toFixed(2)} / $${required.toFixed(2)}`);
                updateWalletLockUi();
                return;
            }
            openModal('walletModal');
        }

        function loadAppState() {
            try {
                return { ...defaultState, ...(JSON.parse(safeStorageGet(storageKey)) || {}) };
            } catch (e) {
                return { ...defaultState };
            }
        }

        function saveAppState() {
            safeStorageSet(storageKey, JSON.stringify(appState));
        }

        function resetDailyStatsIfNeeded() {
            if (!appState.lastDailyReset || Date.now() - appState.lastDailyReset >= DAY_MS) {
                appState.dailyViews = 0;
                appState.dailyMinutes = 0;
                appState.dailySeconds = 0;
                appState.dailyEarned = 0;
                appState.lastDailyReset = Date.now();
                saveAppState();
            }
        }

        function updateTopAccountInfo() {
            const name = user ? (user.username ? '@' + user.username : (user.first_name + (user.last_name ? ' ' + user.last_name : ''))) : 'Guest Cyber CEO';
            const id = user?.id || 'Sandbox Mode';
            const topName = document.getElementById('top-user-name');
            const topId = document.getElementById('top-user-id');
            if (topName) topName.innerText = name;
            if (topId) topId.innerText = `ID: ${id}`;
            updateProfileModal();
        }

        function updateProfileModal() {
            const displayName = user ? (user.first_name + (user.last_name ? ' ' + user.last_name : '')) : 'Guest';
            const username = user?.username ? `@${user.username}` : '-';
            const id = user?.id || referralUserId || 'Sandbox';

            setDomText(document.getElementById('user-display-name'), displayName);
            setDomText(document.getElementById('user-display-id'), id);
            setDomText(document.getElementById('profile-username'), username);
            setDomText(document.getElementById('profile-balance'), `$${Number(appState.balance || 0).toFixed(2)}`);
            setDomText(document.getElementById('profile-total-time'), formatDuration(appState.totalSeconds || 0));
            setDomText(document.getElementById('profile-daily-income'), `$${Number(appState.dailyEarned || 0).toFixed(2)}`);
            setDomText(document.getElementById('profile-referrals'), String(appState.joinedFriends || 0));
            setDomText(document.getElementById('profile-ref-link'), referralLink);
        }

        async function deleteMyAccount() {
            const statusEl = document.getElementById('profile-action-status');
            if (!confirm(t('confirm_delete'))) return;

            try {
                setDomText(statusEl, '...');
                await apiRequest('/user/delete', {
                    method: 'POST',
                    body: JSON.stringify({ telegram_id: String(referralUserId) }),
                    timeoutMs: 12000
                });
                setDomText(statusEl, t('account_deleted'));
            } catch (err) {
                setDomText(statusEl, friendlyErrorMessage(err));
            }
        }

        function updateBonusLockUi() {
            const windowState = getWithdrawWindowState();
            const growth = currentGrowthLockStatus();
            const growthLocked = Boolean(growth.bonus_locked);
            const isOpen = windowState.status === 'open' && !growthLocked;
            const timerEl = document.getElementById('bonus-timer');
            const claimBtn = document.getElementById('claim-bonus-btn');
            const claimLabel = document.getElementById('claim-bonus-label');
            const statusText = document.getElementById('bonus-status-text');
            const lockRow = document.getElementById('bonus-lock-row');
            const icon = claimBtn?.querySelector('i');
            const growthMessage = growth.checkpoint_1499?.active ? t('growth_1499_locked_message') : t('growth_499_locked_message');

            if (timerEl) {
                timerEl.innerText = windowState.timerText || '--:--:--';
                timerEl.style.color = windowState.color || '#ef4444';
                timerEl.style.textShadow = `0 0 12px ${windowState.glow || 'rgba(239,68,68,.35)'}`;
            }

            if (claimBtn) {
                claimBtn.disabled = !isOpen;
                claimBtn.classList.toggle('locked-action', !isOpen);
            }
            if (icon) icon.className = isOpen ? 'fas fa-gift' : 'fas fa-lock';
            if (claimLabel) claimLabel.innerText = isOpen ? t('claim_bonus_open') : t('claim_bonus_locked');
            if (statusText) statusText.innerText = isOpen ? t('bonus_open_text') : (growthLocked ? growthMessage : t('bonus_locked_text'));
            if (lockRow) lockRow.innerText = growthLocked ? t('growth_referral_required') : t('bonus_timer_text');
            updateGrowthLockUi();
        }

        function updateBonusDisplays() {
            const totalBonusEl = document.getElementById('bonus-total-amount');
            const friendsJoinedEl = document.getElementById('bonus-friends-joined');
            const rateEl = document.getElementById('bonus-rate');
            const bonusRefEl = document.getElementById('bonus-ref-link');
            const bonusRate = currentReferralBonusRate();
            const totalBonus = Number(((appState.joinedFriends || 0) * bonusRate).toFixed(2));

            if (totalBonusEl) totalBonusEl.innerText = `${totalBonus.toFixed(2)} $`;
            if (friendsJoinedEl) friendsJoinedEl.innerText = appState.joinedFriends || 0;
            if (rateEl) rateEl.innerText = `${bonusRate.toFixed(2)} $`;
            if (bonusRefEl) bonusRefEl.innerText = referralLink;
            updateBonusLockUi();
        }

        function formatDuration(seconds) {
            const safeSeconds = Math.max(0, Number(seconds || 0));
            const h = Math.floor(safeSeconds / 3600);
            const m = Math.floor((safeSeconds % 3600) / 60);
            const s = Math.floor(safeSeconds % 60);

            if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
            if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
            return `${s}s`;
        }

        function updateWatchDisplays() {
            resetDailyStatsIfNeeded();
            balance = appState.balance;
            minutesWatched = appState.dailyMinutes;
            earnedFromWatching = appState.dailyEarned;
            const totalText = formatDuration(appState.totalSeconds || appState.totalMinutes * 60);
            const dailyViewsText = formatDuration(appState.dailySeconds || appState.dailyMinutes * 60);
            const earnedText = `$${appState.dailyEarned.toFixed(2)}`;
            const totalHoursEl = document.getElementById('total-watch-hours');
            const videoTimeEl = document.getElementById('video-time');
            const earnedMoneyEl = document.getElementById('earned-money');
            const balanceEl = document.getElementById('main-balance');
            if (totalHoursEl) totalHoursEl.innerText = totalText;
            if (videoTimeEl) videoTimeEl.innerText = dailyViewsText;
            if (earnedMoneyEl) earnedMoneyEl.innerText = earnedText;
            if (balanceEl) balanceEl.innerText = balance.toFixed(2);
            updateBonusDisplays();
            updateProfileModal();
            updateWalletLockUi();
            updateGrowthLockUi();
        }

        function setWatchUiState(state, detail = '') {
            const value = String(state || 'idle').replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'idle';
            const modal = document.getElementById('watchModal');
            document.documentElement.dataset.vidipayWatchUiState = value;
            document.documentElement.dataset.vidipayWatchUiStateAt = new Date().toISOString();
            if (modal) modal.dataset.watchState = value;
            if (detail) document.documentElement.dataset.vidipayWatchUiDetail = String(detail).slice(0, 80);
        }

        async function handleMainClick(e) {
            if (isActionThrottled('main-watch-click', 900)) return;
            if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
            if (isActivationDepositLocked()) {
                updateGrowthLockUi();
                showCopyToast(t('activation_deposit_required'));
                return;
            }
            if (isGrowthWatchLocked()) {
                updateGrowthLockUi();
                showCopyToast(t('growth_referral_required'));
                return;
            }
            if (pendingWatch && !watchSessionSubmitted) {
                setWatchUiState('active');
                openModal('watchModal');
                return;
            }
            openWatchModal();
        }

        function randomMrBeastIndex() {
            return Math.floor(Math.random() * MRBEAST_RANDOM_START_MAX);
        }

        function resetWatchVideoState(message = t('watch_playing')) {
            clearInterval(watchHeartbeatInterval);
            watchHeartbeatInterval = null;
            clearInterval(watchTimerInterval);
            watchTimerInterval = null;
            watchServerSession = null;
            watchSessionSubmitted = false;
            countedWatchSeconds = 0;
            watchAccumulatedMs = 0;
            watchSegmentStartedAt = null;
            currentWatchCompleted = false;
            currentMrBeastVideoId = null;
            watchLastPlayerState = null;
            watchSessionGeneration += 1;
            if (pendingWatch) pendingWatch.generation = watchSessionGeneration;
            lastWatchUiSnapshot = '';
            updateWatchSessionUi(message);
        }

        function playMrBeastAt(index) {
            if (watchFinalizeInflight || watchSessionSubmitted) return;
            if (!mrbeastPlayer || !mrbeastPlayer.playVideoAt) {
                showMrBeastFallbackPlayer(t('watch_verified_player_required'), index);
                return;
            }
            resetWatchVideoState(t('watch_playing'));
            mrbeastPlayer.playVideoAt(Math.max(0, Number(index) || 0));
        }

        function playRandomMrBeastVideo() {
            if (isActionThrottled('watch-random', 700)) return;
            playMrBeastAt(randomMrBeastIndex());
        }

        function playNextMrBeastVideo() {
            if (isActionThrottled('watch-next', 700)) return;
            if (watchFinalizeInflight || watchSessionSubmitted) return;
            if (!mrbeastPlayer || !mrbeastPlayer.nextVideo) {
                showMrBeastFallbackPlayer(t('watch_verified_player_required'));
                return;
            }
            resetWatchVideoState(t('watch_playing'));
            mrbeastPlayer.nextVideo();
        }

        function playPreviousMrBeastVideo() {
            if (isActionThrottled('watch-previous', 700)) return;
            if (watchFinalizeInflight || watchSessionSubmitted) return;
            if (!mrbeastPlayer || !mrbeastPlayer.previousVideo) {
                showMrBeastFallbackPlayer(t('watch_verified_player_required'));
                return;
            }
            resetWatchVideoState(t('watch_playing'));
            mrbeastPlayer.previousVideo();
        }

        function buildMrBeastEmbedUrl(index = randomMrBeastIndex()) {
            const params = new URLSearchParams({
                list: MRBEAST_UPLOADS_PLAYLIST,
                autoplay: '1',
                playsinline: '1',
                rel: '0',
                modestbranding: '1',
                fs: '1',
                iv_load_policy: '3',
                index: String(Math.max(0, Number(index) || 0))
            });
            return `https://www.youtube.com/embed/videoseries?${params.toString()}`;
        }

        function showMrBeastFallbackPlayer(message = t('watch_verified_player_required'), index = randomMrBeastIndex()) {
            const host = document.getElementById('mrbeast-player');
            if (!host || !pendingWatch) return;

            resetWatchVideoState(message);
            mrbeastPlayer = null;
            usingFallbackPlayer = true;
            host.innerHTML = `<iframe src="${buildMrBeastEmbedUrl(index)}" title="MrBeast video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen style="width:100%;height:100%;border:0;display:block;background:#05070a;"></iframe>`;
            updateWatchSessionUi(message);
            setWatchUiState('unverified_player');
        }

        function clearWatchFallbackPlayer() {
            clearTimeout(watchFallbackTimer);
            watchFallbackTimer = null;
            if (usingFallbackPlayer) {
                const host = document.getElementById('mrbeast-player');
                if (host) host.innerHTML = '';
                usingFallbackPlayer = false;
            }
        }

        function readVerifiedWatchPlayerSnapshot() {
            if (usingFallbackPlayer || !mrbeastPlayer) return null;
            try {
                const videoData = mrbeastPlayer.getVideoData ? mrbeastPlayer.getVideoData() : {};
                const videoId = String(videoData?.video_id || '').trim();
                const duration = Number(mrbeastPlayer.getDuration ? mrbeastPlayer.getDuration() : 0);
                const position = Number(mrbeastPlayer.getCurrentTime ? mrbeastPlayer.getCurrentTime() : 0);
                if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
                if (!Number.isFinite(duration) || duration < 5 || duration > 43200) return null;
                if (!Number.isFinite(position) || position < 0 || position > duration + 15) return null;
                return { videoId, duration, position };
            } catch (_) {
                return null;
            }
        }

        function clearWatchHeartbeatSchedule() {
            clearInterval(watchHeartbeatInterval);
            watchHeartbeatInterval = null;
        }

        function startWatchHeartbeatSchedule() {
            clearWatchHeartbeatSchedule();
            if (!watchServerSession) return;
            const intervalMs = Math.max(
                3250,
                Number(watchServerSession.heartbeatIntervalSeconds || 5) * 1000 + 250
            );
            watchHeartbeatInterval = setInterval(() => {
                if (
                    !watchServerSession ||
                    watchSessionSubmitted ||
                    document.hidden ||
                    watchLastPlayerState !== YT.PlayerState.PLAYING
                ) return;
                queueWatchHeartbeat({
                    intervalPlaying: true,
                    intervalVisible: true,
                    ended: false
                }).catch(handleWatchHeartbeatFailure);
            }, intervalMs);
        }

        function queueWatchHeartbeat(options = {}) {
            const targetSession = watchServerSession;
            if (!targetSession) return Promise.resolve(null);

            const operation = watchHeartbeatQueue
                .catch(() => null)
                .then(async () => {
                    if (watchServerSession !== targetSession) return null;
                    const snapshot = readVerifiedWatchPlayerSnapshot();
                    if (!snapshot || snapshot.videoId !== targetSession.videoId) return null;

                    const result = await apiRequest('/view/session/heartbeat', {
                        method: 'POST',
                        body: JSON.stringify({
                            session_id: targetSession.sessionId,
                            session_token: targetSession.sessionToken,
                            sequence: targetSession.nextSequence,
                            player_position_seconds: snapshot.position,
                            video_duration_seconds: snapshot.duration,
                            interval_playing: options.intervalPlaying === true,
                            interval_visible: options.intervalVisible === true,
                            ended: options.ended === true
                        }),
                        timeoutMs: 12000
                    });

                    if (watchServerSession === targetSession) {
                        targetSession.nextSequence = Number(result.next_sequence || targetSession.nextSequence);
                        targetSession.observedWatchSeconds = Number(
                            result.observed_watch_seconds || targetSession.observedWatchSeconds || 0
                        );
                    }
                    return result;
                });

            watchHeartbeatQueue = operation.catch(() => null);
            return operation;
        }

        function handleWatchHeartbeatFailure(err) {
            clearWatchHeartbeatSchedule();
            stopWatchTimerDisplay();
            setWatchUiState('verification_error', err?.data?.code || 'heartbeat_failed');
            updateWatchSessionUi(friendlyErrorMessage(err) || t('watch_reward_backend_failed'));
            try {
                if (mrbeastPlayer?.pauseVideo) mrbeastPlayer.pauseVideo();
            } catch (_) {}
        }

        async function ensureWatchServerSession(snapshot = readVerifiedWatchPlayerSnapshot()) {
            if (!pendingWatch || watchSessionSubmitted || usingFallbackPlayer || !snapshot) return null;
            if (
                watchServerSession &&
                watchServerSession.videoId === snapshot.videoId &&
                watchServerSession.generation === pendingWatch.generation
            ) return watchServerSession;

            if (watchSessionStartInflight) {
                await watchSessionStartInflight.catch(() => null);
                const freshSnapshot = readVerifiedWatchPlayerSnapshot();
                if (
                    pendingWatch &&
                    !watchSessionSubmitted &&
                    watchLastPlayerState === YT.PlayerState.PLAYING &&
                    freshSnapshot
                ) return ensureWatchServerSession(freshSnapshot);
                return null;
            }

            const generation = pendingWatch.generation;
            const requestedVideoId = snapshot.videoId;
            setWatchUiState('verifying');
            updateWatchSessionUi(t('watch_verifying'));

            const request = apiRequest('/view/session/start', {
                method: 'POST',
                body: JSON.stringify({
                    video_source: 'mrbeast_uploads',
                    video_id: requestedVideoId,
                    video_duration_seconds: snapshot.duration,
                    player_position_seconds: snapshot.position
                }),
                timeoutMs: 15000
            });
            watchSessionStartInflight = request;

            try {
                const result = await request;
                if (
                    !pendingWatch ||
                    pendingWatch.generation !== generation ||
                    currentMrBeastVideoId !== requestedVideoId
                ) return null;

                if (result?.already_counted) {
                    rewardedMrBeastVideos.add(requestedVideoId);
                    clearWatchHeartbeatSchedule();
                    stopWatchTimerDisplay();
                    updateWatchSessionUi(t('watch_video_duplicate'));
                    setWatchUiState('duplicate');
                    try {
                        if (mrbeastPlayer?.pauseVideo) mrbeastPlayer.pauseVideo();
                    } catch (_) {}
                    return null;
                }

                if (!result?.session_id || !result?.session_token) {
                    throw new Error(t('watch_session_invalid'));
                }

                watchServerSession = {
                    sessionId: String(result.session_id),
                    sessionToken: String(result.session_token),
                    nextSequence: Number(result.next_sequence || 1),
                    heartbeatIntervalSeconds: Number(result.heartbeat_interval_seconds || 5),
                    observedWatchSeconds: 0,
                    videoId: requestedVideoId,
                    duration: Number(result.video_duration_seconds || snapshot.duration),
                    generation
                };
                setWatchUiState('verified');
                startWatchTimerDisplay();
                startWatchHeartbeatSchedule();
                updateWatchSessionUi(t('watch_verified'));
                return watchServerSession;
            } catch (err) {
                if (pendingWatch?.generation === generation) {
                    watchServerSession = null;
                    clearWatchHeartbeatSchedule();
                    stopWatchTimerDisplay();
                    setWatchUiState('verification_error', err?.data?.code || 'session_start_failed');
                    updateWatchSessionUi(friendlyErrorMessage(err) || t('watch_reward_backend_failed'));
                    try {
                        if (mrbeastPlayer?.pauseVideo) mrbeastPlayer.pauseVideo();
                        if (mrbeastPlayer?.seekTo) mrbeastPlayer.seekTo(0, true);
                    } catch (_) {}
                }
                throw err;
            } finally {
                if (watchSessionStartInflight === request) watchSessionStartInflight = null;
            }
        }

        function startMrBeastPlayer() {
            if (!youtubeApiReady || !window.YT || !window.YT.Player) {
                shouldStartMrBeastWhenApiReady = true;
                updateWatchSessionUi(t('watch_loading'));
                clearTimeout(watchFallbackTimer);
                watchFallbackTimer = setTimeout(() => {
                    if (pendingWatch && !usingFallbackPlayer && !mrbeastPlayer) {
                        showMrBeastFallbackPlayer(t('watch_verified_player_required'));
                    }
                }, 5000);
                return;
            }

            if (usingFallbackPlayer) {
                return;
            }

            if (!mrbeastPlayer) {
                clearTimeout(watchFallbackTimer);
                mrbeastPlayer = new YT.Player('mrbeast-player', {
                    width: '100%',
                    height: '100%',
                    playerVars: {
                        listType: 'playlist',
                        list: MRBEAST_UPLOADS_PLAYLIST,
                        index: randomMrBeastIndex(),
                        rel: 0,
                        modestbranding: 1,
                        playsinline: 1,
                        fs: 1,
                        iv_load_policy: 3,
                        origin: window.location.origin
                    },
                    events: {
                        onReady: event => {
                            const videoData = event.target?.getVideoData ? event.target.getVideoData() : {};
                            currentMrBeastVideoId = videoData?.video_id || currentMrBeastVideoId || null;
                            if (currentMrBeastVideoId) watchSessionVideoIds.add(currentMrBeastVideoId);
                            updateWatchSessionUi(t('watch_verifying'));
                            event.target.playVideo();
                        },
                        onStateChange: onMrBeastPlayerStateChange,
                        onError: () => showMrBeastFallbackPlayer(t('watch_verified_player_required'))
                    }
                });
            } else {
                playRandomMrBeastVideo();
            }
        }

        function openWatchFullscreen() {
            if (isActionThrottled('watch-fullscreen', 900)) return;
            const target = document.getElementById('mrbeast-player') || document.getElementById('watchModal');
            const request = target?.requestFullscreen || target?.webkitRequestFullscreen || target?.msRequestFullscreen;
            if (request) {
                request.call(target);
                return;
            }
            tg.expand?.();
            showCopyToast(t('fullscreen_unavailable'));
        }

        function openWatchModal() {
            if (pendingWatch && !watchSessionSubmitted) {
                setWatchUiState('active');
                openModal('watchModal');
                return;
            }
            countedWatchSeconds = 0;
            watchAccumulatedMs = 0;
            watchSegmentStartedAt = null;
            currentWatchCompleted = false;
            currentMrBeastVideoId = null;
            watchSessionSubmitted = false;
            watchFinalizeInflight = null;
            watchServerSession = null;
            clearWatchHeartbeatSchedule();
            watchLastPlayerState = null;
            watchSessionGeneration += 1;
            watchSessionVideoIds = new Set();
            lastWatchUiSnapshot = '';
            pendingWatch = {
                startedAt: Date.now(),
                generation: watchSessionGeneration,
                requiredSeconds: Number(backendSettings.view_seconds_required || 5)
            };

            setWatchUiState('opening');
            openModal('watchModal');
            updateWatchSessionUi(t('watch_wait'));
            startMrBeastPlayer();
        }

        function closeWatchModal() {
            setWatchUiState('closing');
            if (watchFinalizeInflight) {
                closeModal('watchModal');
                return;
            }

            const watchSeconds = syncCountedWatchSeconds();
            watchSessionSubmitted = true;
            watchSessionGeneration += 1;
            if (mrbeastPlayer && mrbeastPlayer.pauseVideo) {
                mrbeastPlayer.pauseVideo();
            }
            clearWatchFallbackPlayer();
            clearWatchHeartbeatSchedule();
            clearInterval(watchTimerInterval);
            watchServerSession = null;
            pendingWatch = null;
            closeModal('watchModal');
            if (watchSeconds > 0) {
                showWatchResult(watchSeconds, 0, t('watch_incomplete_no_reward'));
            } else {
                setWatchUiState('idle');
            }
        }

        function localeForCurrentLang() {
            const localeByLang = {
                en: 'en-US',
                ru: 'ru-RU',
                fr: 'fr-FR',
                hi: 'hi-IN',
                es: 'es-ES',
                zh: 'zh-CN',
                de: 'de-DE'
            };
            return localeByLang[currentLang] || 'en-US';
        }

        function getPaymentOrderExpiryTime(order = currentPaymentOrder) {
            const candidates = [
                order?.expires_at,
                order?.valid_until,
                order?.expiresAt,
                order?.expiresAtMs
            ];
            for (const candidate of candidates) {
                if (!candidate) continue;
                const timestamp = typeof candidate === 'number' ? candidate : new Date(candidate).getTime();
                if (Number.isFinite(timestamp) && timestamp > 0) return timestamp;
            }
            return 0;
        }

        function formatPaymentCountdown(endTime) {
            const remainingMs = Math.max(0, Number(endTime || 0) - Date.now());
            const totalSeconds = Math.ceil(remainingMs / 1000);
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }

        function paymentValidityLabels() {
            const labels = {
                en: ['Valid until', 'Time left'],
                ru: ['Действительно до', 'Осталось'],
                fr: ["Valable jusqu'a", 'Temps restant'],
                hi: ['Valid until', 'Time left'],
                es: ['Valido hasta', 'Tiempo restante'],
                zh: ['有效期至', '剩余时间'],
                de: ['Gueltig bis', 'Restzeit']
            };
            return labels[currentLang] || labels.en;
        }

        function renderPaymentExpiryText(order = currentPaymentOrder) {
            const expiryEl = document.getElementById('payment-expiry-text');
            if (!expiryEl) return false;
            const expiresAt = getPaymentOrderExpiryTime(order);
            if (!expiresAt) {
                expiryEl.classList.remove('is-expired');
                expiryEl.dataset.paymentExpiresAt = '';
                expiryEl.dataset.paymentRemainingMs = '';
                expiryEl.removeAttribute('aria-label');
                setDomText(expiryEl, '');
                return false;
            }
            const remainingMs = Math.max(0, expiresAt - Date.now());
            const [validUntilLabel, timeLeftLabel] = paymentValidityLabels();
            const untilText = new Date(expiresAt).toLocaleString(localeForCurrentLang());
            const countdown = formatPaymentCountdown(expiresAt);
            expiryEl.dataset.paymentExpiresAt = new Date(expiresAt).toISOString();
            expiryEl.dataset.paymentRemainingMs = String(remainingMs);
            expiryEl.classList.toggle('is-expired', remainingMs <= 0);
            expiryEl.textContent = '';
            const untilLine = document.createElement('span');
            untilLine.className = 'payment-expiry-line payment-expiry-until';
            setDomText(untilLine, `${validUntilLabel}: ${untilText}`);
            const countdownLine = document.createElement('span');
            countdownLine.className = 'payment-expiry-line payment-expiry-countdown';
            setDomText(countdownLine, `${timeLeftLabel}: ${countdown}`);
            expiryEl.append(untilLine, countdownLine);
            expiryEl.setAttribute('aria-label', `${validUntilLabel}: ${untilText}. ${timeLeftLabel}: ${countdown}`);
            return remainingMs > 0;
        }

        function onMrBeastPlayerStateChange(event) {
            const previousState = watchLastPlayerState;
            watchLastPlayerState = event.data;

            if (watchSessionSubmitted && event.data === YT.PlayerState.PLAYING) {
                try {
                    if (mrbeastPlayer?.pauseVideo) mrbeastPlayer.pauseVideo();
                } catch (_) {}
                return;
            }

            if (event.data === YT.PlayerState.PLAYING) {
                const snapshot = readVerifiedWatchPlayerSnapshot();
                if (!snapshot) {
                    stopWatchTimerDisplay();
                    clearWatchHeartbeatSchedule();
                    updateWatchSessionUi(t('watch_verified_player_required'));
                    setWatchUiState('unverified_player');
                    return;
                }

                if (snapshot.videoId !== currentMrBeastVideoId) {
                    resetWatchVideoState(t('watch_verifying'));
                    watchLastPlayerState = YT.PlayerState.PLAYING;
                    currentMrBeastVideoId = snapshot.videoId;
                    watchSessionVideoIds.add(snapshot.videoId);
                }

                ensureWatchServerSession(snapshot).catch(() => null);
                if (watchServerSession?.videoId === snapshot.videoId) {
                    startWatchTimerDisplay();
                    startWatchHeartbeatSchedule();
                }
            }

            if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.BUFFERING) {
                stopWatchTimerDisplay();
                clearWatchHeartbeatSchedule();
                if (
                    previousState === YT.PlayerState.PLAYING &&
                    watchServerSession &&
                    !watchSessionSubmitted
                ) {
                    queueWatchHeartbeat({
                        intervalPlaying: true,
                        intervalVisible: !document.hidden,
                        ended: false
                    }).catch(handleWatchHeartbeatFailure);
                }
            }

            if (
                event.data === YT.PlayerState.ENDED &&
                !currentWatchCompleted &&
                !watchSessionSubmitted
            ) {
                const finalSnapshot = readVerifiedWatchPlayerSnapshot();
                currentWatchCompleted = true;
                stopWatchTimerDisplay();
                clearWatchHeartbeatSchedule();
                updateWatchSessionUi(t('watch_finished'));
                finalizeWatchSession(finalSnapshot).catch(err => {
                    const watchSeconds = Number(err?.data?.observed_watch_seconds || syncCountedWatchSeconds());
                    showWatchResult(
                        watchSeconds,
                        0,
                        friendlyErrorMessage(err) || t('watch_reward_save_failed')
                    );
                });
            }
        }

        function syncCountedWatchSeconds() {
            const activeMs = watchSegmentStartedAt ? (Date.now() - watchSegmentStartedAt) : 0;
            countedWatchSeconds = Math.floor((watchAccumulatedMs + activeMs) / 1000);
            return countedWatchSeconds;
        }

        function stopWatchTimerDisplay(message = '') {
            if (watchSegmentStartedAt) {
                watchAccumulatedMs += Date.now() - watchSegmentStartedAt;
                watchSegmentStartedAt = null;
            }
            syncCountedWatchSeconds();
            if (message) updateWatchSessionUi(message);
            clearInterval(watchTimerInterval);
            watchTimerInterval = null;
        }

        function startWatchTimerDisplay() {
            if (
                !pendingWatch ||
                !watchServerSession ||
                watchSessionSubmitted ||
                watchLastPlayerState !== YT.PlayerState.PLAYING
            ) return;
            if (!watchSegmentStartedAt) watchSegmentStartedAt = Date.now();

            clearInterval(watchTimerInterval);
            setWatchUiState('counting');
            watchTimerInterval = setInterval(() => {
                if (!pendingWatch) {
                    clearInterval(watchTimerInterval);
                    setWatchUiState('idle');
                    return;
                }

                syncCountedWatchSeconds();
                updateWatchSessionUi(t('watch_counting'));
            }, 1000);
        }

        function estimateWatchReward(seconds) {
            const rate = Number(currentTierStatus.reward_per_second || backendSettings.view_reward_per_second || 0.01);
            return Number((Math.max(0, Number(seconds || 0)) * rate).toFixed(2));
        }

        async function finalizeWatchSession(finalSnapshot = readVerifiedWatchPlayerSnapshot()) {
            if (watchFinalizeInflight) return watchFinalizeInflight;
            if (watchSessionSubmitted) return;

            const targetSession = watchServerSession;
            watchSessionSubmitted = true;
            setWatchUiState('finalizing');
            stopWatchTimerDisplay();
            clearWatchHeartbeatSchedule();

            if (
                !targetSession ||
                !finalSnapshot ||
                finalSnapshot.videoId !== targetSession.videoId
            ) {
                const watchSeconds = syncCountedWatchSeconds();
                watchServerSession = null;
                pendingWatch = null;
                closeModal('watchModal');
                showWatchResult(watchSeconds, 0, t('watch_verified_session_required'));
                updateWatchDisplays();
                return;
            }

            updateWatchSessionUi(t('watch_reward_saving'));
            watchFinalizeInflight = watchHeartbeatQueue
                .catch(() => null)
                .then(() => finalizeWatchedVideo(targetSession, finalSnapshot))
                .finally(() => {
                    watchFinalizeInflight = null;
                });
            return watchFinalizeInflight;
        }

        async function finalizeWatchedVideo(targetSession, finalSnapshot) {
            let watchSeconds = syncCountedWatchSeconds();
            try {
                setWatchUiState('saving');
                const completionBody = {
                    session_id: targetSession.sessionId,
                    session_token: targetSession.sessionToken,
                    sequence: targetSession.nextSequence,
                    player_position_seconds: finalSnapshot.position,
                    video_duration_seconds: finalSnapshot.duration,
                    interval_playing: true,
                    interval_visible: !document.hidden,
                    ended: true
                };
                const completionOptions = {
                    method: 'POST',
                    body: JSON.stringify(completionBody),
                    idempotencyKey: `watch-${targetSession.sessionId}-${targetSession.nextSequence}`,
                    timeoutMs: 20000
                };

                let result;
                try {
                    result = await apiRequest('/view/add', completionOptions);
                } catch (err) {
                    if (err?.data) throw err;
                    result = await apiRequest('/view/add', completionOptions);
                }

                watchSeconds = Number(result.watch_seconds || 0);
                rewardedMrBeastVideos.add(targetSession.videoId);
                watchServerSession = null;
                pendingWatch = null;
                watchSessionGeneration += 1;
                applyBackendUser(result.user);
                if (result.growth_lock) setGrowthLockStatus(result.growth_lock);
                await refreshStatsFromBackend().catch(() => null);
                updateWatchDisplays();

                if (result.tier) {
                    currentTierStatus = {
                        ...currentTierStatus,
                        tier: result.tier,
                        reward_per_second: result.reward_per_second,
                        country_code: result.country_code || currentTierStatus.country_code,
                        country_name: result.country_name || currentTierStatus.country_name
                    };
                    updateTierCards();
                }

                if (result.already_counted) {
                    updateWatchSessionUi(t('watch_video_duplicate'));
                    showWatchResult(watchSeconds, 0, t('watch_video_duplicate'));
                    setWatchUiState('duplicate');
                    return;
                }

                createFloatingText(null, result.reward);
                updateWatchSessionUi(
                    t('watch_reward_added_detail')
                        .replace('{time}', formatDuration(watchSeconds))
                        .replace('{amount}', Number(result.reward || 0).toFixed(2))
                );
                showWatchResult(watchSeconds, result.reward, t('watch_added'));
                addNotification(
                    t('view_reward_title'),
                    t('view_reward_added')
                        .replace('{seconds}', watchSeconds)
                        .replace('{amount}', Number(result.reward || 0).toFixed(2))
                );
                setWatchUiState('saved');
            } catch (err) {
                watchSeconds = Number(err?.data?.observed_watch_seconds || watchSeconds || 0);
                watchServerSession = null;
                pendingWatch = null;
                watchSessionGeneration += 1;
                if (err.data?.growth_lock) setGrowthLockStatus(err.data.growth_lock);
                await refreshStatsFromBackend().catch(() => null);
                updateWatchDisplays();
                const message = friendlyErrorMessage(err);
                updateWatchSessionUi(message);
                showWatchResult(watchSeconds, 0, `${message}. ${t('watch_reward_backend_failed')}`);
                addNotification(t('view_reward_title'), message);
                setWatchUiState('error', err?.data?.code || message);
            }
        }

        function showWatchResult(seconds, reward, message) {
            setDomText(document.getElementById('watch-result-time'), formatDuration(seconds));
            setDomText(document.getElementById('watch-result-reward'), `$${Number(reward || 0).toFixed(2)}`);
            setDomText(document.getElementById('watch-result-status'), message);
            closeModal('watchModal');
            openModal('watchResultModal');
        }

        function updateWatchSessionUi(message) {
            const timeEl = document.getElementById('watch-session-time');
            const rewardEl = document.getElementById('watch-session-reward');
            const statusEl = document.getElementById('watch-session-status');
            const rate = Number(currentTierStatus.reward_per_second || backendSettings.view_reward_per_second || 0);
            const timeText = formatDuration(countedWatchSeconds);
            const rewardText = `$${(countedWatchSeconds * rate).toFixed(2)}`;
            const snapshot = `${timeText}|${rewardText}|${message}`;

            if (snapshot === lastWatchUiSnapshot) return;
            lastWatchUiSnapshot = snapshot;

            setDomText(timeEl, timeText);
            setDomText(rewardEl, rewardText);
            setDomText(statusEl, message);
        }

        function createFloatingText(e, reward) {
            const container = document.getElementById('clicker-container');
            const text = document.createElement('div');
            text.className = 'floating-text';
            text.innerText = `+$${Number(reward || backendSettings.view_reward || 0).toFixed(2)}`;
            text.style.left = `calc(50% - 20px)`;
            text.style.top = `20px`;
            container.appendChild(text);
            setTimeout(() => { text.remove(); }, 600);
        }

        function triggerInvite() {
            if (isActionThrottled('trigger-invite', 500)) return;
            openModal('refModal');
        }

        async function copyReferralLink() {
            if (referralCopyBusy) return;
            const link = (document.getElementById('bonus-ref-link')?.innerText || document.getElementById('ref-link').innerText);
            const activeButton = document.activeElement?.tagName === 'BUTTON' ? document.activeElement : document.getElementById('copy-link-btn');
            const status = document.getElementById('copy-status');
            referralCopyBusy = true;
            setActionBusy(activeButton, true);
            appState.invitedShares = (appState.invitedShares || 0) + 1;
            saveAppState();
            updateBonusDisplays();
            const copied = () => {
                showCopyToast(t('copied'));
                if (status) {
                    status.innerText = t('copied');
                    status.style.display = 'block';
                    setTimeout(() => { status.style.display = 'none'; }, 1400);
                }
            };

            try {
                const ok = await copyTextToClipboard(link);
                if (!ok) fallbackCopyReferral(link);
                copied();
            } finally {
                referralCopyBusy = false;
                setActionBusy(activeButton, false);
            }
        }

        function fallbackCopyReferral(text) {
            const area = document.createElement('textarea');
            area.value = text;
            area.style.position = 'fixed';
            area.style.opacity = '0';
            document.body.appendChild(area);
            area.focus();
            area.select();
            try { document.execCommand('copy'); } catch (e) {}
            area.remove();
        }

        function getNotificationStorageKey(baseName) {
            const scope = String(referralUserId || safeStorageGet('vidiPayReferralUserId') || 'guest').trim() || 'guest';
            return `${baseName}_${scope}`;
        }

        function getNotifications() {
            const key = getNotificationStorageKey('vidiPayNotifications');
            let items;
            try { items = JSON.parse(safeStorageGet(key)); } catch(e) { items = null; }
            if (!Array.isArray(items) || !items.length) {
                items = [
                    { titleKey: 'noti_alert', textKey: 'noti_msg', date: new Date().toLocaleString() },
                    { titleKey: 'daily_info_title', textKey: 'daily_info_msg', date: new Date().toLocaleString() }
                ];
                safeStorageSet(key, JSON.stringify(items));
            }
            return items;
        }

        function getUnreadNotificationCount() {
            return Number(safeStorageGet(getNotificationStorageKey('vidiPayUnreadNotifications')) || 0);
        }

        function setUnreadNotificationCount(count) {
            const safeCount = Math.max(0, Number(count || 0));
            safeStorageSet(getNotificationStorageKey('vidiPayUnreadNotifications'), String(safeCount));
            const badge = document.querySelector('.badge');
            if (badge) {
                badge.innerText = String(safeCount);
                badge.style.display = safeCount > 0 ? 'inline-flex' : 'none';
            }
        }

        function markAllNotificationsRead() {
            setUnreadNotificationCount(0);
            renderNotifications();
        }

        async function loadServerNotifications() {
            const now = Date.now();
            if (notificationsFetchedAt && now - notificationsFetchedAt < 30000) return;
            if (notificationsInflight) return notificationsInflight;
            notificationsInflight = (async () => {
            try {
                const serverItems = await apiRequest(`/notifications/${encodeURIComponent(referralUserId)}`, { timeoutMs: 8000 });
                if (!Array.isArray(serverItems)) return;
                const mapped = serverItems.map(item => ({
                    key: `server_${item.id || item.created_at || item.title}_${item.telegram_id || 'all'}`,
                    rawTitle: item.title || t('admin_message'),
                    rawText: item.message || '',
                    date: item.created_at ? new Date(item.created_at).toLocaleString() : new Date().toLocaleString()
                }));
                const localItems = getNotifications();
                const existingKeys = new Set(localItems.map(item => item.key).filter(Boolean));
                const newItems = mapped.filter(item => !existingKeys.has(item.key));
                const merged = [...newItems, ...localItems].slice(0, 50);
                safeStorageSet(getNotificationStorageKey('vidiPayNotifications'), JSON.stringify(merged));
                if (newItems.length) setUnreadNotificationCount(getUnreadNotificationCount() + newItems.length);
                notificationsFetchedAt = Date.now();
            } catch (err) {
                rememberFrontendError('notifications_load', err);
            }
            })().finally(() => {
                notificationsInflight = null;
            });
            return notificationsInflight;
        }

        function renderNotifications() {
            const box = document.getElementById('notification-list');
            if (!box) return;
            const items = getNotifications();
            const html = items.map(item => {
                const title = item.titleKey ? t(item.titleKey) : translateAdminNotificationText(item.rawTitle || item.title || '');
                const text = item.textKey ? t(item.textKey) : translateAdminNotificationText(item.rawText || item.text || '');
                const date = item.date || '';
                return `
                <div class="notification-item">
                    <div class="notification-title">${escapeHtml(title)}</div>
                    <div class="notification-date">${escapeHtml(date)}</div>
                    <div class="notification-body">${escapeHtml(text)}</div>
                </div>
            `;
            }).join('');
            const snapshot = `${currentLang}|${html}`;
            if (notificationRenderSnapshot !== snapshot) {
                notificationRenderSnapshot = snapshot;
                setDomHtml(box, html);
            }
            setUnreadNotificationCount(getUnreadNotificationCount());
        }

        function addNotification(title, text) {
            const key = getNotificationStorageKey('vidiPayNotifications');
            const items = getNotifications();
            items.unshift({ title, text, date: new Date().toLocaleString() });
            safeStorageSet(key, JSON.stringify(items));
            setUnreadNotificationCount(getUnreadNotificationCount() + 1);
            renderNotifications();
        }

        function openSupportChat() {
            renderSupportMessages();
            openModal('supportChatModal');
        }

        function renderSupportMessages() {
            const box = document.getElementById('support-chat-box');
            if (!box) return;
            const messages = appState.supportMessages || [];
            const html = `<div class="chat-msg support" style="align-self:flex-start; background: rgba(255,255,255,.055); color:#cbd5e1; border:1px solid rgba(255,255,255,.08); border-radius: 14px; padding: 10px 12px; font-size: 13px;">${escapeHtml(t('support_chat_greeting'))}</div>` +
                messages.map(m => {
                    const from = m.from === 'user' ? 'user' : 'support';
                    const style = from === 'user'
                        ? 'align-self:flex-end; background: rgba(0,255,204,.14); color:#fff; border:1px solid rgba(0,255,204,.2);'
                        : 'align-self:flex-start; background: rgba(255,255,255,.055); color:#cbd5e1; border:1px solid rgba(255,255,255,.08);';
                    return `<div class="chat-msg ${from}" style="border-radius: 14px; padding: 10px 12px; font-size: 13px; line-height: 1.45; ${style}">${escapeHtml(m.text || '')}</div>`;
                }).join('');
            const snapshot = `${currentLang}|${html}`;
            if (supportRenderSnapshot !== snapshot) {
                supportRenderSnapshot = snapshot;
                setDomHtml(box, html);
                box.scrollTop = box.scrollHeight;
            }
        }

        function sendSupportMessage() {
            const input = document.getElementById('support-message-input');
            const sendBtn = document.getElementById('support-send-btn');
            if (!input || !input.value.trim()) return;
            const text = input.value.trim();
            if (input.disabled) return;
            input.disabled = true;
            setActionBusy(sendBtn, true);
            appState.supportMessages = appState.supportMessages || [];
            appState.supportMessages.push({ from: 'user', text });
            input.value = '';
            renderSupportMessages();
            saveAppState();
            if (supportReplyTimer) clearTimeout(supportReplyTimer);
            supportReplyTimer = setTimeout(() => {
                appState.supportMessages.push({ from: 'support', text: t('support_received') });
                saveAppState();
                renderSupportMessages();
                input.disabled = false;
                input.focus();
                setActionBusy(sendBtn, false);
                supportReplyTimer = null;
            }, 500);
        }

        function resetSupportComposer() {
            if (supportReplyTimer) clearTimeout(supportReplyTimer);
            supportReplyTimer = null;
            const input = document.getElementById('support-message-input');
            if (input) input.disabled = false;
            setActionBusy('support-send-btn', false);
        }

        function openModal(id) {
            updateViewportMetrics();
            const wasTonDepositOpen = document.getElementById('tonDepositModal')?.classList.contains('is-open');
            const wasSupportOpen = document.getElementById('supportChatModal')?.classList.contains('is-open');
            if (wasTonDepositOpen && id !== 'tonDepositModal') stopPaymentStatusPolling({ abort: true, reason: 'modal_switch' });
            if (wasSupportOpen && id !== 'supportChatModal') resetSupportComposer();

            document.querySelectorAll('.modal-overlay').forEach(modal => {
                modal.classList.remove('is-open');
                modal.style.display = 'none';
            });
            const modal = document.getElementById(id);
            if (modal) {
                modal.classList.add('is-open');
                modal.style.display = 'flex';
                document.body.classList.add('modal-open');
                if (id === 'notiModal') {
                    markAllNotificationsRead();
                    renderNotifications();
                }
                if (id === 'withdrawHistoryModal') renderFullHistory();
                if (id === 'profileModal') updateProfileModal();
                if (id === 'bonusModal') updateBonusLockUi();
                if (id === 'refModal') updateGrowthLockUi();
                if (id === 'withdrawModal') {
                    loadBackendSettings()
                        .then(() => updateWithdrawUi(latestPaymentStatus))
                        .catch(() => null);
                }
                if (id === 'walletModal') {
                    updateWalletModal();
                    setDomText(document.getElementById('payment-status-text'), t('card_order_loading'));
                    loadBackendSettings()
                        .then(() => {
                            updateWalletLockUi();
                            return refreshPaymentStatus().catch(() => null);
                        })
                        .catch(() => updateWalletLockUi());
                }
                if (id === 'tonDepositModal') {
                    renderPaymentOrder(currentPaymentOrder, latestPaymentStatus);
                    sanitizePaymentModalDom('open:tonDepositModal');
                    refreshPaymentRuntimeStrip(document.documentElement.dataset.vidipayPaymentUiState || 'loading');
                    updatePaymentRealTestReadiness('modal_open');
                    startPaymentStatusPolling();
                }
                normalizeFrontendActionElements(modal);
                syncModalAccessibilityState(`open:${id}`);
            }
        }

        function closeModal(id) {
            const modal = document.getElementById(id);
            if (modal) {
                modal.classList.remove('is-open');
                modal.style.display = 'none';
                if (id === 'tonDepositModal') {
                    stopPaymentStatusPolling({ abort: true, reason: 'modal_close' });
                    refreshPaymentRuntimeStrip('idle');
                    sanitizePaymentModalDom('close:tonDepositModal');
                    updatePaymentRealTestReadiness('modal_close');
                }
                if (id === 'supportChatModal') resetSupportComposer();
                if (!document.querySelector('.modal-overlay.is-open')) document.body.classList.remove('modal-open');
                syncModalAccessibilityState(`close:${id}`);
            }
        }

        function updateWalletModal() {
            const el = document.getElementById('wallet-balance-view');
            if (el) el.innerText = `$${Number(appState.balance || 0).toFixed(2)}`;
        }

        function getWithdrawHistory() {
            const key = 'vidiPayWithdrawHistory';
            let items;
            try { items = JSON.parse(safeStorageGet(key)); } catch(e) { items = null; }
            if (!Array.isArray(items)) items = [];
            return items;
        }

        function addWithdrawHistory(amount, status, extra = {}) {
            const key = 'vidiPayWithdrawHistory';
            const items = getWithdrawHistory();
            items.unshift({
                amount: Number(amount || 0).toFixed(2),
                status: status || 'Pending',
                method: extra.method || 'TON',
                currency: extra.currency || (extra.method === 'TON_DEPOSIT_REFUND' ? 'TONCOIN' : ''),
                type: extra.type || 'withdraw',
                wallet: extra.wallet || '',
                tx_hash: extra.tx_hash || '',
                date: new Date().toLocaleString()
            });
            safeStorageSet(key, JSON.stringify(items));
        }

        async function renderWithdrawHistory() {
            const box = document.getElementById('withdraw-history-list');
            if (!box) return;

            let items = getWithdrawHistory();
            try {
                const serverItems = await apiRequest(`/withdraw/${encodeURIComponent(referralUserId)}`, { timeoutMs: 8000 });
                items = (serverItems || []).map(item => ({
                    amount: Number(item.amount || 0).toFixed(2),
                    status: item.status || 'pending',
                    method: item.wallet_type || 'TON',
                    currency: item.currency || '',
                    type: item.withdraw_scope || item.type || '',
                    wallet: item.wallet_address || item.wallet || '',
                    tx_hash: item.tx_hash || '',
                    date: item.created_at ? new Date(item.created_at).toLocaleString() : ''
                }));
            } catch (err) {}

            if (!items.length) {
                box.innerHTML = `<div class="history-empty">${t('no_withdraw_history')}</div>`;
                return;
            }
            box.innerHTML = items.map(item => `
                <div class="history-item">
                    <b>${escapeHtml(receiptAmountText(item))} - ${escapeHtml(receiptNetworkText(item))}</b>
                    <div>${escapeHtml(t('status_label'))}: ${escapeHtml(receiptStatusLabel(item.status))}</div>
                    <div>${escapeHtml(item.date)}</div>
                </div>
            `).join('');
        }

        async function renderFullHistory() {
            const box = document.getElementById('withdraw-history-list');
            if (!box) return;
            if (historyInflight) return historyInflight;

            historyInflight = (async () => {
                let items = [];
                const now = Date.now();
                try {
                    if (historyFetchedAt && now - historyFetchedAt < 15000 && window.vidiPayCachedFullHistory) {
                        items = window.vidiPayCachedFullHistory;
                    } else {
                        items = await apiRequest(`/history/${encodeURIComponent(referralUserId)}`, { timeoutMs: 8000 });
                        window.vidiPayCachedFullHistory = Array.isArray(items) ? items : [];
                        historyFetchedAt = Date.now();
                    }
                } catch (err) {
                    rememberFrontendError('withdraw_history_load', err);
                    items = getWithdrawHistory();
                }

                if (!items.length) {
                    const emptyHtml = `<div class="history-empty">${escapeHtml(t('no_history'))}</div>`;
                    if (fullHistoryRenderSnapshot !== emptyHtml) {
                        fullHistoryRenderSnapshot = emptyHtml;
                        setDomHtml(box, emptyHtml);
                    }
                    return;
                }

                const html = items.map(renderReceiptItem).join('');
                if (fullHistoryRenderSnapshot !== html) {
                    fullHistoryRenderSnapshot = html;
                    setDomHtml(box, html);
                }
            })().finally(() => {
                historyInflight = null;
            });
            return historyInflight;
        }

        function isTonDepositRefundReceipt(item = {}) {
            const raw = [
                item.type,
                item.withdraw_scope,
                item.method,
                item.network,
                item.currency,
                item.title
            ].join(' ').toLowerCase();
            return raw.includes('deposit_refund') || (raw.includes('activation') && raw.includes('refund'));
        }

        function isTonReceipt(item = {}) {
            const raw = [
                item.type,
                item.withdraw_scope,
                item.method,
                item.network,
                item.currency,
                item.title
            ].join(' ').toLowerCase();
            return isTonDepositRefundReceipt(item) || raw.includes('ton');
        }

        function receiptStatusLabel(status, item = {}) {
            const normalized = normalizeDepositRefundStatus(status);
            if (isTonDepositRefundReceipt(item)) {
                if (normalized === 'completed') return t('deposit_refund_returned');
                if (normalized === 'rejected') return t('deposit_refund_rejected');
                if (normalized === 'processing') return t('deposit_refund_saved');
            }
            if (normalized === 'completed') return 'completed';
            if (normalized === 'rejected') return 'rejected';
            if (normalized === 'processing') return 'processing';
            return String(status || 'pending');
        }

        function receiptStatusClass(status) {
            const normalized = normalizeDepositRefundStatus(status);
            return normalized.replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'pending';
        }

        function receiptTypeLabel(item = {}) {
            if (item.title) return item.title;
            if (isTonDepositRefundReceipt(item)) return 'Activation deposit refund';
            if (String(item.type || '').toLowerCase() === 'payment') return t('history_wallet_payment');
            return t('history_withdraw');
        }

        function receiptAmountText(item = {}) {
            const amountValue = Number(item.amount || 0).toFixed(2);
            if (isTonReceipt(item)) return `${amountValue} TONCOIN`;
            return `$${amountValue} ${item.currency || item.method || ''}`.trim();
        }

        function receiptWalletText(item = {}) {
            return item.wallet || item.wallet_address || item.to_wallet || item.address || '-';
        }

        function receiptNetworkText(item = {}) {
            if (isTonDepositRefundReceipt(item)) return 'TON_DEPOSIT_REFUND';
            if (isTonReceipt(item)) return 'TON';
            return item.network || item.method || '-';
        }

        function renderReceiptItem(item) {
            const created = item.created_at ? new Date(item.created_at).toLocaleString() : (item.date || '-');
            const processed = item.processed_at ? new Date(item.processed_at).toLocaleString() : '-';
            const typeText = receiptTypeLabel(item);
            const amount = receiptAmountText(item);
            const status = receiptStatusLabel(item.status, item);
            const statusClass = receiptStatusClass(item.status);
            const walletText = receiptWalletText(item);
            const networkText = receiptNetworkText(item);

            return `
                <div class="history-item">
                    <div class="receipt-head">
                        <div>
                            <div class="receipt-type">${escapeHtml(typeText)}</div>
                            <b>${escapeHtml(amount)}</b>
                        </div>
                        <div class="receipt-status ${statusClass}">${escapeHtml(status)}</div>
                    </div>
                    <div class="receipt-row"><span class="receipt-label">${escapeHtml(t('receipt_date_time'))}</span><span class="receipt-value">${escapeHtml(created)}</span></div>
                    <div class="receipt-row"><span class="receipt-label">${escapeHtml(t('receipt_network'))}</span><span class="receipt-value">${escapeHtml(networkText)}</span></div>
                    <div class="receipt-row"><span class="receipt-label">${escapeHtml(t('receipt_wallet_label'))}</span><span class="receipt-value">${escapeHtml(walletText)}</span></div>
                    <div class="receipt-row"><span class="receipt-label">${escapeHtml(t('receipt_verified_at'))}</span><span class="receipt-value">${escapeHtml(processed)}</span></div>
                    ${item.tx_hash ? `<div class="receipt-row"><span class="receipt-label">TX</span><span class="receipt-value">${escapeHtml(item.tx_hash)}</span></div>` : ''}
                    ${item.admin_note ? `<div class="receipt-row"><span class="receipt-label">${escapeHtml(t('receipt_note'))}</span><span class="receipt-value">${escapeHtml(item.admin_note)}</span></div>` : ''}
                </div>
            `;
        }

        const TIMER_36H_MS = 36 * 60 * 60 * 1000;

        function getOrCreateTimerEnd(storageName) {
            let end = Number(safeStorageGet(storageName));
            if (!end || end <= Date.now()) {
                end = Date.now() + TIMER_36H_MS;
                safeStorageSet(storageName, String(end));
            }
            return end;
        }

        function formatCountdown(endTime) {
            let remainingMs = endTime - Date.now();
            if (remainingMs <= 0) return '00:00:00';
            const totalSeconds = Math.floor(remainingMs / 1000);
            const hStr = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
            const mStr = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
            const sStr = String(totalSeconds % 60).padStart(2, '0');
            return `${hStr}:${mStr}:${sStr}`;
        }

        let bonusTimerEnd = getOrCreateTimerEnd('vidiPayBonusEndTimeV8');

        function updateUnifiedTimers() {
            updateWithdrawUi(latestPaymentStatus);
            updateBonusLockUi();
            if (isTonDepositModalOpen()) renderPaymentExpiryText(currentPaymentOrder);

            const bonusTitle = document.querySelector('#bonusModal .modal-title');
            if (bonusTitle) bonusTitle.classList.toggle('bonus-timer-title', !isWithdrawWindowOpen());
        }

        setInterval(updateUnifiedTimers, 1000);
        function scheduleSettingsRefresh() {
            clearTimeout(settingsRefreshTimer);
            const delay = document.hidden ? 90000 : 30000;
            settingsRefreshTimer = setTimeout(refreshSettingsInBackground, delay);
        }

        function refreshSettingsInBackground() {
            if (settingsRefreshBusy) return;
            settingsRefreshBusy = true;
            loadBackendSettings()
                .then(() => updateWithdrawUi(latestPaymentStatus))
                .catch(() => null)
                .finally(() => {
                    settingsRefreshBusy = false;
                    scheduleSettingsRefresh();
                });
        }

        document.addEventListener('visibilitychange', scheduleSettingsRefresh);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && isTonDepositModalOpen()) {
                setPaymentPollingHealthy(true);
                refreshPaymentStatus({ poll: true }).catch(err => rememberFrontendError('payment_visible_refresh', err));
                schedulePaymentStatusPoll(2500);
            }
        });
        scheduleSettingsRefresh();
        updateUnifiedTimers();

        // ==========================================
        // TON WALLET PAYMENT LOGIC
        // ==========================================
        async function openTonDepositModal() {
            if (tonDepositOpenBusy) return;
            if (!isWalletEarningUnlocked()) {
                showCopyToast(t('wallet_locked_until_20'));
                updateWalletLockUi();
                return;
            }

            tonDepositOpenBusy = true;
            setActionBusy('fiat-pay-btn', true);
            openModal('tonDepositModal');
            setPaymentUiState('opening');
            const statusEl = document.getElementById('ton-deposit-status-text');
            const addressBox = document.getElementById('payment-address-box');
            const amountEl = document.getElementById('payment-amount-text');
            const addressEl = document.getElementById('payment-address-text');
            const expiryEl = document.getElementById('payment-expiry-text');
            if (addressBox) addressBox.style.display = 'block';
            if (amountEl) amountEl.innerText = `${getTonActivationAmount().toFixed(2)} TONCOIN`;
            if (addressEl) addressEl.innerText = t('card_order_loading');
            if (expiryEl) {
                expiryEl.innerText = '';
                expiryEl.classList.remove('is-expired');
                expiryEl.removeAttribute('aria-label');
            }
            setDomText(statusEl, t('card_order_loading'));
            updatePaymentActionButtons();
            const seededStatusFromCache = seedPaymentStatusFromCache();
            const seededFromCache = seededStatusFromCache || seedPaymentOrderFromCache();
            if (seededFromCache) {
                setPaymentUiState('cached');
                setDomText(statusEl, t('payment_check_status'));
                startPaymentStatusPolling();
            }

            try {
                const order = await resolvePaymentOrderForModal('open_ton_deposit');
                renderPaymentOrder(order, latestPaymentStatus);
                startPaymentStatusPolling();
            } catch (err) {
                setPaymentUiState('error', friendlyErrorMessage(err));
                setDomText(statusEl, friendlyErrorMessage(err));
                updatePaymentRealTestReadiness('open_modal_error', { last_error: friendlyErrorMessage(err) });
            } finally {
                tonDepositOpenBusy = false;
                setActionBusy('fiat-pay-btn', false);
                updatePaymentRealTestReadiness('open_modal_final');
            }
        }

        async function copyTonPaymentAddress() {
            if (isActionThrottled('copy-ton-address', 500)) return;
            const labelEl = document.getElementById('lbl-copy-ton-address');
            const originalLabel = t('copy_ton_address') || labelEl?.innerText || 'COPY ADDRESS';
            setActionBusy('ton-copy-address-btn', true);
            if (!currentPaymentOrder || !getPaymentWalletAddress(currentPaymentOrder)) {
                const cachedOrder = getCachedPaymentOrder();
                if (cachedOrder) currentPaymentOrder = cachedOrder;
                if (!currentPaymentOrder || !getPaymentWalletAddress(currentPaymentOrder)) {
                    const cachedStatus = getCachedPaymentStatus(false);
                    const cachedStatusOrder = cachedStatus
                        ? (findPaymentOrderWithWallet(cachedStatus.orders) || cachedStatus.order)
                        : null;
                    if (cachedStatusOrder) currentPaymentOrder = cachedStatusOrder;
                }
            }
            const walletAddress = getCurrentPaymentWalletAddress();
            setPaymentAddressVisibility(walletAddress);
            if (!walletAddress) {
                showCopyToast(t('payment_address_unavailable'));
                setActionBusy('ton-copy-address-btn', false);
                updatePaymentActionButtons();
                updatePaymentRealTestReadiness('copy_address_missing');
                return;
            }

            try {
                const copied = await copyTextToClipboard(walletAddress);
                if (copied) {
                    if (labelEl) setDomText(labelEl, t('copied') || 'Copied');
                    showCopyToast(t('ton_address_copied'));
                    updatePaymentRealTestReadiness('copy_address_success');
                } else {
                    const addressEl = document.getElementById('payment-address-text');
                    if (addressEl) {
                        const range = document.createRange();
                        range.selectNodeContents(addressEl);
                        const selection = window.getSelection?.();
                        selection?.removeAllRanges();
                        selection?.addRange(range);
                    }
                    showCopyToast(t('clipboard_copy_failed'));
                    updatePaymentRealTestReadiness('copy_address_fallback_select');
                }
            } finally {
                setActionBusy('ton-copy-address-btn', false);
                updatePaymentActionButtons();
                if (labelEl) setTimeout(() => setDomText(labelEl, originalLabel), 900);
            }
        }

        async function checkTonPaymentNow() {
            if (paymentManualCheckInflight) return paymentManualCheckInflight;
            paymentManualCheckInflight = (async () => {
                const statusEl = document.getElementById('ton-deposit-status-text');
                const labelEl = document.getElementById('lbl-check-ton-payment');
                const originalLabel = t('pay_with_fiat') || labelEl?.innerText || 'CHECK PAYMENT';
                setActionBusy('ton-check-payment-btn', true);
                if (labelEl) setDomText(labelEl, t('payment_checking'));
                setPaymentUiState('checking');
                setDomText(statusEl, t('payment_check_status'));
                updatePaymentRealTestReadiness('manual_check_start');
                try {
                    if (isTonDepositModalOpen() && !getCurrentPaymentWalletAddress()) {
                        await resolvePaymentOrderForModal('manual_check');
                    }
                    return await refreshPaymentStatus({ manual: true, force: true, reason: 'manual_check' });
                } catch (err) {
                    const message = friendlyErrorMessage(err);
                    setPaymentUiState(navigator.onLine ? 'retrying' : 'offline', message);
                    setDomText(statusEl, message);
                    updatePaymentRealTestReadiness('manual_check_error', { last_error: message });
                    return latestPaymentStatus;
                } finally {
                    paymentManualCheckInflight = null;
                    setActionBusy('ton-check-payment-btn', false);
                    updatePaymentActionButtons();
                    if (labelEl) setTimeout(() => setDomText(labelEl, originalLabel), 900);
                    updatePaymentRealTestReadiness('manual_check_final');
                }
            })();
            return paymentManualCheckInflight;
        }
        // ==========================================

        function startPaymentStatusPolling() {
            paymentPollingGeneration += 1;
            stopPaymentStatusPolling({ preserveGeneration: true });
            if (!document.getElementById('tonDepositModal')?.classList.contains('is-open')) return;
            updatePaymentRealTestReadiness('polling_start');
            schedulePaymentStatusPoll(1200, paymentPollingGeneration);
        }

        function abortPaymentNetwork(reason = 'payment_abort') {
            try {
                paymentStatusRequestSeq += 1;
                paymentOrderRequestSeq += 1;
                if (paymentStatusAbortController && !paymentStatusAbortController.signal.aborted) {
                    paymentStatusAbortController.abort();
                }
                if (paymentOrderAbortController && !paymentOrderAbortController.signal.aborted) {
                    paymentOrderAbortController.abort();
                }
                setPaymentUiState('idle', reason);
                updateFrontendHealth({
                    ok: navigator.onLine,
                    last_path: reason,
                    last_error: ''
                });
                updatePaymentRealTestReadiness(`abort:${reason}`);
            } catch (err) {
                rememberFrontendError('payment_abort', err);
            }
        }

        function stopPaymentStatusPolling(options = {}) {
            if (!options.preserveGeneration) paymentPollingGeneration += 1;
            if (paymentStatusPollTimer) clearTimeout(paymentStatusPollTimer);
            paymentStatusPollTimer = null;
            if (options.abort) abortPaymentNetwork(options.reason || 'payment_polling_stopped');
            else updatePaymentRealTestReadiness(options.reason || 'polling_stopped');
        }

        function isTonDepositModalOpen() {
            return document.getElementById('tonDepositModal')?.classList.contains('is-open');
        }

        function isWatchModalOpen() {
            return document.getElementById('watchModal')?.classList.contains('is-open');
        }

        function setPaymentPollingHealthy(ok) {
            if (ok) {
                paymentPollingFailures = 0;
                paymentPollingDelayMs = 7000;
                refreshPaymentRuntimeStrip(document.documentElement.dataset.vidipayPaymentUiState || 'idle');
                return;
            }
            paymentPollingFailures = Math.min(6, paymentPollingFailures + 1);
            paymentPollingDelayMs = Math.min(60000, 7000 * Math.pow(1.75, paymentPollingFailures));
            refreshPaymentRuntimeStrip(navigator.onLine ? 'retrying' : 'offline');
        }

        function stableFrontendJitter(seed, maxMs = 2500) {
            const text = String(seed || 'guest');
            let hash = 0;
            for (let i = 0; i < text.length; i += 1) {
                hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
            }
            const normalized = Math.abs(hash || 1) % Math.max(1, Number(maxMs || 1));
            return normalized;
        }

        function getConnectionAwarePollingBaseDelay() {
            const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
            const effectiveType = String(connection?.effectiveType || '').toLowerCase();
            const saveData = Boolean(connection?.saveData);
            if (saveData || effectiveType.includes('2g')) return Math.max(25000, paymentPollingDelayMs);
            if (effectiveType.includes('3g')) return Math.max(14000, paymentPollingDelayMs);
            return paymentPollingDelayMs;
        }

        function getPaymentPollingDelay() {
            if (!navigator.onLine) return 20000;
            const baseDelay = getConnectionAwarePollingBaseDelay();
            if (document.hidden) return Math.max(30000, baseDelay);
            const jitter = stableFrontendJitter(`${frontendPollJitterSeed}:${paymentPollingFailures}`, paymentPollingFailures ? 8000 : 3500);
            paymentPollingLastJitterMs = jitter;
            return Math.min(90000, Math.max(1200, baseDelay + jitter));
        }

        function schedulePaymentStatusPoll(delayMs = getPaymentPollingDelay(), generation = paymentPollingGeneration) {
            stopPaymentStatusPolling({ preserveGeneration: true });
            if (!isTonDepositModalOpen()) return;
            paymentPollingLastScheduledDelayMs = Math.max(1000, Number(delayMs || 7000));
            refreshPaymentRuntimeStrip(document.documentElement.dataset.vidipayPaymentUiState || 'idle', '', {
                nextDelayMs: paymentPollingLastScheduledDelayMs
            });
            paymentStatusPollTimer = setTimeout(async () => {
                if (generation !== paymentPollingGeneration) return;
                if (!isTonDepositModalOpen()) {
                    stopPaymentStatusPolling();
                    return;
                }
                if (!document.hidden && navigator.onLine) {
                    await refreshPaymentStatus({ poll: true }).catch(err => {
                        rememberFrontendError('payment_poll', err);
                        setPaymentPollingHealthy(false);
                    });
                }
                if (isTonDepositModalOpen() && generation === paymentPollingGeneration) schedulePaymentStatusPoll(undefined, generation);
            }, paymentPollingLastScheduledDelayMs);
            updatePaymentRealTestReadiness('polling_scheduled', { next_delay_ms: paymentPollingLastScheduledDelayMs });
        }

        window.addEventListener('offline', () => {
            showRuntimeStatusToast(runtimeText('offline'), 'error');
            setPaymentUiState('offline', runtimeText('offline'));
            setPaymentPollingHealthy(false);
            const depositStatusEl = document.getElementById('ton-deposit-status-text');
            if (isTonDepositModalOpen()) setDomText(depositStatusEl, runtimeText('offline'));
        });

        window.addEventListener('online', () => {
            showRuntimeStatusToast(runtimeText('online'));
            setPaymentPollingHealthy(true);
            refreshPaymentRuntimeStrip(document.documentElement.dataset.vidipayPaymentUiState || 'idle');
            if (isTonDepositModalOpen()) {
                refreshPaymentStatus({ manual: false }).catch(err => rememberFrontendError('payment_online_refresh', err));
                schedulePaymentStatusPoll(2500);
            }
            refreshSettingsInBackground();
        });

        function pauseFrontendActivity(reason = 'page_pause') {
            window.__vidipayLastLifecycle = { reason, time: new Date().toISOString() };
            stopPaymentStatusPolling({ abort: true, reason });
            clearTimeout(settingsRefreshTimer);
            if (pendingWatch && isWatchModalOpen()) {
                try {
                    if (mrbeastPlayer && mrbeastPlayer.pauseVideo) mrbeastPlayer.pauseVideo();
                } catch (_) {}
                stopWatchTimerDisplay();
                clearWatchHeartbeatSchedule();
                setWatchUiState('paused', reason);
            }
        }

        function resumeFrontendActivity(reason = 'page_resume') {
            updateViewportMetrics();
            scheduleSettingsRefresh();
            if (isTonDepositModalOpen()) {
                setPaymentPollingHealthy(true);
                refreshPaymentStatus({ poll: true }).catch(err => rememberFrontendError(`${reason}_payment`, err));
                schedulePaymentStatusPoll(1800);
            }
            if (pendingWatch && isWatchModalOpen() && !watchSessionSubmitted) {
                setWatchUiState('active', reason);
                updateWatchSessionUi(t('watch_paused'));
            }
            refreshTierStatusFromLiveNetwork().catch(err => rememberFrontendError(`${reason}_tier`, err));
        }

        function resetStaleActionBusyLocks() {
            const now = Date.now();
            const activeBusy = new Map([
                ['ton-check-payment-btn', Boolean(paymentStatusInflight || paymentStatusRefreshBusy || paymentManualCheckInflight)],
                ['fiat-pay-btn', Boolean(tonDepositOpenBusy || createPaymentOrderInflight || paymentOrderResolveInflight)],
                ['ton-copy-address-btn', false]
            ]);
            activeBusy.forEach((isActive, id) => {
                const btn = document.getElementById(id);
                const lockAge = now - Number(btn?.dataset.busyLockAt || now);
                if (btn?.dataset.busyLockActive === 'true' && (!isActive || lockAge > 20000)) {
                    setActionBusy(btn, false);
                }
            });
            document.querySelectorAll('[data-busy-lock-active="true"]').forEach(btn => {
                const lockAge = now - Number(btn.dataset.busyLockAt || now);
                if (lockAge > 45000) setActionBusy(btn, false);
            });
        }

        function runFrontendRuntimeGuard(reason = 'runtime_guard') {
            frontendRuntimeGuardLastAt = Date.now();
            frontendRuntimeGuardSweepCount += 1;
            document.documentElement.dataset.vidipayFrontendRuntimeGuard = 'ready';
            document.documentElement.dataset.vidipayFrontendRuntimeGuardAt = new Date(frontendRuntimeGuardLastAt).toISOString();
            document.documentElement.dataset.vidipayFrontendRuntimeGuardReason = String(reason || '').slice(0, 60);
            updateViewportMetrics();
            resetStaleActionBusyLocks();
            syncModalAccessibilityState(`runtime:${reason}`);

            if (isTonDepositModalOpen()) {
                if (!currentPaymentOrder) seedPaymentOrderFromCache();
                sanitizePaymentModalDom(`runtime:${reason}`);
                updatePaymentActionButtons();
                if (!paymentStatusPollTimer && navigator.onLine) {
                    schedulePaymentStatusPoll(2500, paymentPollingGeneration);
                }
            } else if (paymentStatusPollTimer) {
                stopPaymentStatusPolling({ preserveGeneration: true });
            }

            if (!isWatchModalOpen() && document.documentElement.dataset.vidipayWatchUiState === 'paused') {
                setWatchUiState('idle', 'runtime_guard');
            }

            const snapshot = {
                reason,
                sweep_count: frontendRuntimeGuardSweepCount,
                payment_modal_open: isTonDepositModalOpen(),
                watch_modal_open: isWatchModalOpen(),
                payment_polling_timer: Boolean(paymentStatusPollTimer),
                payment_inflight: Boolean(paymentStatusInflight || createPaymentOrderInflight || paymentOrderResolveInflight || paymentManualCheckInflight)
            };
            updatePaymentRealTestReadiness(`runtime_guard:${reason}`);
            return snapshot;
        }

        function installFrontendRuntimeGuard() {
            if (document.documentElement.dataset.vidipayFrontendRuntimeGuardInstalled === 'ready') return;
            document.documentElement.dataset.vidipayFrontendRuntimeGuardInstalled = 'ready';
            const sweep = reason => {
                try {
                    window.__vidipayFrontendRuntimeGuard = runFrontendRuntimeGuard(reason);
                } catch (err) {
                    rememberFrontendError('frontend_runtime_guard', err);
                }
            };
            sweep('install');
            frontendRuntimeGuardTimer = setInterval(() => sweep('interval'), 7000);
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) sweep('visible');
            }, { passive: true });
            window.addEventListener('focus', () => sweep('focus'), { passive: true });
            window.addEventListener('online', () => sweep('online'), { passive: true });
        }

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                pauseFrontendActivity('visibility_hidden');
            } else {
                resumeFrontendActivity('visibility_visible');
            }
        }, { passive: true });
        window.addEventListener('pagehide', () => pauseFrontendActivity('pagehide'));
        window.addEventListener('pageshow', event => {
            resumeFrontendActivity(event.persisted ? 'pageshow_bfcache' : 'pageshow');
        });
        installFrontendRuntimeGuard();
        installPaymentModalWatchdog();
        installWithdrawWalletInputGuard();

        function runFrontendContractSelfCheck() {
            const requiredIds = [
                'ton-copy-address-btn',
                'ton-check-payment-btn',
                'payment-runtime-strip',
                'payment-address-text',
                'payment-status-text',
                'ton-deposit-status-text',
                'main-balance'
            ];
            const copyBtn = document.getElementById('ton-copy-address-btn');
            const checkBtn = document.getElementById('ton-check-payment-btn');
            const runtimeStrip = document.getElementById('payment-runtime-strip');
            const copyMinHeight = copyBtn ? parseFloat(getComputedStyle(copyBtn).minHeight || '0') : 0;
            const checkMinHeight = checkBtn ? parseFloat(getComputedStyle(checkBtn).minHeight || '0') : 0;
            const duplicateIds = Array.from(document.querySelectorAll('[id]'))
                .map(el => el.id)
                .filter((id, index, all) => id && all.indexOf(id) !== index);
            const checks = {
                backendUrl: API_BASE_URL === PRODUCTION_API_BASE_URL,
                noQrBox: !document.getElementById('payment-qr-box'),
                requiredIds: requiredIds.filter(id => !document.getElementById(id)),
                duplicateIds: [...new Set(duplicateIds)].slice(0, 12),
                appVh: Boolean(getComputedStyle(document.documentElement).getPropertyValue('--app-vh').trim()),
                copyButton: Boolean(copyBtn),
                checkButton: Boolean(checkBtn),
                mobileTapTargets: copyMinHeight >= 44 && checkMinHeight >= 44,
                tapFeedback: document.documentElement.dataset.vidipayTapFeedback === 'ready',
                paymentUiStateReady: typeof setPaymentUiState === 'function',
                pollGenerationReady: Number.isFinite(paymentPollingGeneration),
                watchUiStateReady: typeof setWatchUiState === 'function',
                watchModalGuardReady: typeof isWatchModalOpen === 'function',
                statsDedupeReady: Number.isFinite(statsFetchedAt),
                userSyncDedupeReady: Number.isFinite(userSyncFetchedAt),
                paymentStatusCacheReady: typeof getCachedPaymentStatus === 'function' && typeof rememberPaymentStatus === 'function',
                paymentResolverReady: typeof resolvePaymentOrderForModal === 'function',
                realTestReadinessReady: typeof updatePaymentRealTestReadiness === 'function' && Boolean(window.__vidipayFrontendRealTest),
                addressVisibilityReady: document.documentElement.dataset.vidipayPaymentAddressReady === 'ready' || document.documentElement.dataset.vidipayPaymentAddressReady === 'waiting',
                adaptivePollingReady: typeof stableFrontendJitter === 'function' && typeof getConnectionAwarePollingBaseDelay === 'function',
                paymentRuntimeStripReady: Boolean(runtimeStrip) && typeof refreshPaymentRuntimeStrip === 'function',
                paymentExpiryReady: typeof renderPaymentExpiryText === 'function' && typeof getPaymentOrderExpiryTime === 'function',
                receiptFormatterReady: typeof renderReceiptItem === 'function' && typeof receiptAmountText === 'function',
                actionGuardReady: document.documentElement.dataset.vidipayActionGuard === 'ready',
                actionNormalizerReady: document.documentElement.dataset.vidipayFrontendActionNormalizerInstalled === 'ready',
                modalStateGuardReady: document.documentElement.dataset.vidipayModalStateGuard === 'ready',
                runtimeGuardReady: document.documentElement.dataset.vidipayFrontendRuntimeGuardInstalled === 'ready',
                paymentModalWatchdogReady: document.documentElement.dataset.vidipayPaymentModalWatchdogInstalled === 'ready' && typeof sanitizePaymentModalDom === 'function',
                pageshowModalPreserveReady: typeof handlePageshowModalState === 'function' && Array.isArray(PAGE_SHOW_PRESERVE_MODAL_IDS) && PAGE_SHOW_PRESERVE_MODAL_IDS.includes('tonDepositModal'),
                paymentActionHandlersReady: document.documentElement.dataset.vidipayPaymentActionHandlers === 'ready',
                paymentQrSuppressionReady: document.documentElement.dataset.vidipayPaymentQrSuppressed === 'ready',
                withdrawWalletInputGuardReady: document.documentElement.dataset.vidipayWithdrawWalletInputGuard === 'ready' && typeof validateWithdrawWalletInput === 'function',
                manualCheckHandlerReady: checkBtn?.getAttribute('onclick') === 'checkTonPaymentNow()',
                copyHandlerReady: copyBtn?.getAttribute('onclick') === 'copyTonPaymentAddress()',
                modalLockReady: !document.body.classList.contains('modal-open')
            };
            checks.ok = checks.backendUrl
                && checks.noQrBox
                && !checks.requiredIds.length
                && !checks.duplicateIds.length
                && checks.appVh
                && checks.copyButton
                && checks.checkButton
                && checks.mobileTapTargets
                && checks.tapFeedback
                && checks.paymentUiStateReady
                && checks.pollGenerationReady
                && checks.watchUiStateReady
                && checks.watchModalGuardReady
                && checks.statsDedupeReady
                && checks.userSyncDedupeReady
                && checks.paymentStatusCacheReady
                && checks.paymentResolverReady
                && checks.realTestReadinessReady
                && checks.addressVisibilityReady
                && checks.adaptivePollingReady
                && checks.paymentRuntimeStripReady
                && checks.paymentExpiryReady
                && checks.receiptFormatterReady
                && checks.actionGuardReady
                && checks.actionNormalizerReady
                && checks.modalStateGuardReady
                && checks.runtimeGuardReady
                && checks.paymentModalWatchdogReady
                && checks.pageshowModalPreserveReady
                && checks.paymentActionHandlersReady
                && checks.paymentQrSuppressionReady
                && checks.withdrawWalletInputGuardReady
                && checks.manualCheckHandlerReady
                && checks.copyHandlerReady;
            window.__vidipayFrontendContract = {
                checked_at: new Date().toISOString(),
                ...checks
            };
            document.documentElement.dataset.vidipayFrontendContract = checks.ok ? 'ok' : 'failed';
            document.documentElement.dataset.vidipayFrontendContractAt = window.__vidipayFrontendContract.checked_at;
            if (!checks.ok) {
                rememberFrontendError('frontend_contract', JSON.stringify(checks));
            }
            return checks;
        }

        function runFrontendStressSelfCheck() {
            const copyBtn = document.getElementById('ton-copy-address-btn');
            const checkBtn = document.getElementById('ton-check-payment-btn');
            const runtimeStrip = document.getElementById('payment-runtime-strip');
            const copyMinHeight = copyBtn ? parseFloat(getComputedStyle(copyBtn).minHeight || '0') : 0;
            const checkMinHeight = checkBtn ? parseFloat(getComputedStyle(checkBtn).minHeight || '0') : 0;
            const checks = {
                copyHandler: typeof copyTonPaymentAddress === 'function',
                checkHandler: typeof checkTonPaymentNow === 'function',
                openPaymentHandler: typeof openTonDepositModal === 'function',
                pollingSingleTimer: paymentStatusPollTimer === null || typeof paymentStatusPollTimer === 'number',
                pollingGeneration: Number.isFinite(paymentPollingGeneration),
                networkStats: Boolean(window.__vidipayFrontendNetwork),
                healthMarker: Boolean(document.documentElement.dataset.vidipayFrontendHealth),
                abortCleanup: typeof abortPaymentNetwork === 'function',
                paymentUiState: typeof setPaymentUiState === 'function',
                watchUiState: typeof setWatchUiState === 'function',
                watchModalGuard: typeof isWatchModalOpen === 'function',
                statsDedupe: Number.isFinite(statsFetchedAt) && (statsInflight === null || typeof statsInflight?.then === 'function'),
                userSyncDedupe: Number.isFinite(userSyncFetchedAt) && (userSyncInflight === null || typeof userSyncInflight?.then === 'function'),
                paymentStatusCache: typeof getCachedPaymentStatus === 'function' && typeof rememberPaymentStatus === 'function',
                paymentResolver: typeof resolvePaymentOrderForModal === 'function' && (paymentOrderResolveInflight === null || typeof paymentOrderResolveInflight?.then === 'function'),
                realTestReadiness: typeof updatePaymentRealTestReadiness === 'function' && Boolean(window.__vidipayFrontendRealTest),
                addressVisibility: document.documentElement.dataset.vidipayPaymentAddressReady === 'ready' || document.documentElement.dataset.vidipayPaymentAddressReady === 'waiting',
                adaptivePolling: typeof stableFrontendJitter === 'function' && Number.isFinite(paymentPollingLastScheduledDelayMs) && Number.isFinite(paymentPollingLastJitterMs),
                paymentRuntimeStrip: Boolean(runtimeStrip) && typeof refreshPaymentRuntimeStrip === 'function',
                paymentRuntimeSnapshot: typeof paymentRuntimeLastSnapshot === 'string',
                paymentExpiry: typeof renderPaymentExpiryText === 'function' && typeof formatPaymentCountdown === 'function',
                receiptFormatter: typeof receiptAmountText === 'function' && typeof receiptStatusLabel === 'function',
                actionGuard: document.documentElement.dataset.vidipayActionGuard === 'ready',
                actionNormalizer: document.documentElement.dataset.vidipayFrontendActionNormalizerInstalled === 'ready',
                actionReadyCount: Array.from(document.querySelectorAll(FRONTEND_ACTION_SELECTOR)).filter(el => el.classList.contains('frontend-action-ready')).length,
                modalStateGuard: document.documentElement.dataset.vidipayModalStateGuard === 'ready',
                openModalCountFinite: Number.isFinite(Number(document.documentElement.dataset.vidipayOpenModalCount || 0)),
                watchFinalizeGuard: watchFinalizeInflight === null || typeof watchFinalizeInflight?.then === 'function',
                runtimeGuard: document.documentElement.dataset.vidipayFrontendRuntimeGuard === 'ready',
                runtimeGuardTimer: frontendRuntimeGuardTimer !== null,
                runtimeGuardLastAt: Number.isFinite(frontendRuntimeGuardLastAt),
                paymentModalWatchdog: document.documentElement.dataset.vidipayPaymentModalWatchdogInstalled === 'ready',
                pageshowModalPreserve: typeof handlePageshowModalState === 'function' && Array.isArray(PAGE_SHOW_PRESERVE_MODAL_IDS) && PAGE_SHOW_PRESERVE_MODAL_IDS.includes('tonDepositModal'),
                paymentModalWatchdogTimer: paymentModalWatchdogTimer !== null,
                paymentActionHandlers: document.documentElement.dataset.vidipayPaymentActionHandlers === 'ready',
                paymentQrSuppression: document.documentElement.dataset.vidipayPaymentQrSuppressed === 'ready',
                withdrawWalletInputGuard: document.documentElement.dataset.vidipayWithdrawWalletInputGuard === 'ready' && typeof validateWithdrawWalletInput === 'function',
                manualCheckClickHandler: checkBtn?.getAttribute('onclick') === 'checkTonPaymentNow()',
                copyAddressClickHandler: copyBtn?.getAttribute('onclick') === 'copyTonPaymentAddress()',
                staleBusyCleanup: !Array.from(document.querySelectorAll('[data-busy-lock-active="true"]')).some(btn => {
                    if (btn.id === 'ton-check-payment-btn') return !(paymentStatusInflight || paymentStatusRefreshBusy || paymentManualCheckInflight);
                    if (btn.id === 'fiat-pay-btn') return !(tonDepositOpenBusy || createPaymentOrderInflight || paymentOrderResolveInflight);
                    return false;
                }),
                tapFeedback: document.documentElement.dataset.vidipayTapFeedback === 'ready',
                viewportHeight: Boolean(getComputedStyle(document.documentElement).getPropertyValue('--app-vh').trim()),
                modalCount: document.querySelectorAll('.modal-overlay').length,
                qrElements: document.querySelectorAll('#payment-qr-box, .payment-qr-box, .qr-code, canvas[data-payment-qr]').length,
                runtimeStripLiveRegion: runtimeStrip?.getAttribute('aria-live') === 'polite',
                copyButtonReady: Boolean(copyBtn),
                checkButtonReady: Boolean(checkBtn),
                copyButtonA11y: Boolean(copyBtn?.getAttribute('aria-label')),
                checkButtonA11y: Boolean(checkBtn?.getAttribute('aria-label')),
                mobileTapTargets: copyMinHeight >= 44 && checkMinHeight >= 44,
                statusLiveRegion: document.getElementById('ton-deposit-status-text')?.getAttribute('aria-live') === 'polite'
            };
            checks.ok = checks.copyHandler
                && checks.checkHandler
                && checks.openPaymentHandler
                && checks.pollingSingleTimer
                && checks.pollingGeneration
                && checks.networkStats
                && checks.abortCleanup
                && checks.paymentUiState
                && checks.watchUiState
                && checks.watchModalGuard
                && checks.statsDedupe
                && checks.userSyncDedupe
                && checks.paymentStatusCache
                && checks.paymentResolver
                && checks.realTestReadiness
                && checks.addressVisibility
                && checks.adaptivePolling
                && checks.paymentRuntimeStrip
                && checks.paymentRuntimeSnapshot
                && checks.paymentExpiry
                && checks.receiptFormatter
                && checks.actionGuard
                && checks.actionNormalizer
                && checks.actionReadyCount > 0
                && checks.modalStateGuard
                && checks.openModalCountFinite
                && checks.watchFinalizeGuard
                && checks.runtimeGuard
                && checks.runtimeGuardTimer
                && checks.runtimeGuardLastAt
                && checks.paymentModalWatchdog
                && checks.pageshowModalPreserve
                && checks.paymentModalWatchdogTimer
                && checks.paymentActionHandlers
                && checks.paymentQrSuppression
                && checks.withdrawWalletInputGuard
                && checks.manualCheckClickHandler
                && checks.copyAddressClickHandler
                && checks.staleBusyCleanup
                && checks.tapFeedback
                && checks.viewportHeight
                && checks.qrElements === 0
                && checks.runtimeStripLiveRegion
                && checks.copyButtonReady
                && checks.checkButtonReady
                && checks.copyButtonA11y
                && checks.checkButtonA11y
                && checks.mobileTapTargets
                && checks.statusLiveRegion;
            window.__vidipayFrontendStress = {
                checked_at: new Date().toISOString(),
                ...checks
            };
            document.documentElement.dataset.vidipayFrontendStress = checks.ok ? 'ok' : 'failed';
            document.documentElement.dataset.vidipayFrontendStressAt = window.__vidipayFrontendStress.checked_at;
            if (!checks.ok) rememberFrontendError('frontend_stress_contract', JSON.stringify(checks));
            return checks;
        }

        function scheduleFrontendContractSelfCheck() {
            document.documentElement.dataset.vidipayFrontendContract = 'pending';
            document.documentElement.dataset.vidipayFrontendStress = 'pending';
            setTimeout(() => {
                try { runFrontendContractSelfCheck(); } catch (err) { rememberFrontendError('frontend_contract_exception', err); }
                try { runFrontendStressSelfCheck(); } catch (err) { rememberFrontendError('frontend_stress_exception', err); }
            }, 1200);
            setTimeout(() => {
                try { runFrontendContractSelfCheck(); } catch (err) { rememberFrontendError('frontend_contract_late_exception', err); }
                try { runFrontendStressSelfCheck(); } catch (err) { rememberFrontendError('frontend_stress_late_exception', err); }
            }, 6500);
        }

        async function initBackendApp() {
            try {
                await loadBackendSettings();
                await loadTierStatus();
                await syncBackendUser();
                await refreshStatsFromBackend();
                await refreshPaymentStatus();
                await loadServerNotifications();
                renderNotifications();
                scheduleLiveTierRefresh();
            } catch (err) {
                console.warn('API sync skipped', err);
                rememberFrontendError('init_backend_app', err);
            }
        }

        changeLang(currentLang);
        updateTopAccountInfo();
        updateWatchDisplays();
        renderNotifications();
        updateBonusDisplays();
        updateFrontendHealth({ ok: navigator.onLine });
        scheduleFrontendContractSelfCheck();
        initBackendApp();

        const VIDIPAY_CLICK_ACTIONS = Object.freeze({
            triggerInvite: () => triggerInvite(),
            openWalletIfUnlocked: () => openWalletIfUnlocked(),
            copyReferralLink: () => copyReferralLink(),
            leaveApp: () => leaveApp(),
            deleteMyAccount: () => deleteMyAccount(),
            markAllNotificationsRead: () => markAllNotificationsRead(),
            submitWithdrawRequest: () => submitWithdrawRequest(),
            claimDailyBonus: () => claimDailyBonus(),
            openTonDepositModal: () => openTonDepositModal(),
            copyTonPaymentAddress: () => copyTonPaymentAddress(),
            checkTonPaymentNow: () => checkTonPaymentNow(),
            closeWatchModal: () => closeWatchModal(),
            playPreviousMrBeastVideo: () => playPreviousMrBeastVideo(),
            playRandomMrBeastVideo: () => playRandomMrBeastVideo(),
            playNextMrBeastVideo: () => playNextMrBeastVideo(),
            openWatchFullscreen: () => openWatchFullscreen(),
            openSupportChat: () => openSupportChat(),
            sendSupportMessage: () => sendSupportMessage()
        });

        function runVidipayUiAction(action) {
            try {
                Promise.resolve(action()).catch((error) => console.error('[ui-action]', error));
            } catch (error) {
                console.error('[ui-action]', error);
            }
        }

        document.addEventListener('click', (event) => {
            const element = event.target instanceof Element ? event.target.closest('[data-vp-click]') : null;
            if (!element) return;
            const actionName = element.dataset.vpClick;
            if (actionName === 'openModal') return runVidipayUiAction(() => openModal(element.dataset.vpTarget));
            if (actionName === 'closeModal') return runVidipayUiAction(() => closeModal(element.dataset.vpTarget));
            if (actionName === 'changeLang') return runVidipayUiAction(() => changeLang(element.dataset.vpLang));
            if (actionName === 'handleMainClick') return runVidipayUiAction(() => handleMainClick(event));
            const action = VIDIPAY_CLICK_ACTIONS[actionName];
            if (action) runVidipayUiAction(action);
        });

        document.addEventListener('input', (event) => {
            const element = event.target instanceof Element ? event.target.closest('[data-vp-input]') : null;
            if (element?.dataset.vpInput === 'handleWithdrawAddressInput') {
                runVidipayUiAction(() => handleWithdrawAddressInput());
            }
        });

        document.addEventListener('blur', (event) => {
            const element = event.target instanceof Element ? event.target.closest('[data-vp-blur]') : null;
            if (element?.dataset.vpBlur === 'validateWithdrawWalletInput') {
                runVidipayUiAction(() => validateWithdrawWalletInput());
            }
        }, true);

        document.addEventListener('keydown', (event) => {
            const element = event.target instanceof Element ? event.target.closest('[data-vp-keydown]') : null;
            if (element?.dataset.vpKeydown === 'sendSupportMessageOnEnter' && event.key === 'Enter') {
                runVidipayUiAction(() => sendSupportMessage());
            }
        });
