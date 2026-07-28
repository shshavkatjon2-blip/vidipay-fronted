const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");

const targetDir = path.resolve(process.argv[2] || __dirname);
const expectedBuild = "frontend-watch-reward-security-20260727";

const expectedFiles = [
  "admin.html",
  "vidipay-admin.css",
  "vidipay-admin.js",
  "app-v3.html",
  "app-v4.html",
  "app-v5.html",
  "app-v6.html",
  "config.js",
  "index.html",
  "vidipay-app.css",
  "vidipay-app.js",
  "_headers",
  "_worker.js"
];

const forbiddenVisiblePatterns = [
  { name: "old_humo", pattern: /\bHUMO\b/i },
  { name: "old_uzcard", pattern: /\bUZCARD\b/i },
  { name: "old_trc20", pattern: /\bTRC20\b/i },
  { name: "old_tron", pattern: /\bTRON\b/i },
  { name: "old_open_ton_wallet_button", pattern: /Open\s+TON\s+Wallet/i },
  { name: "old_bank_card_en", pattern: /bank\s+card/i },
  { name: "old_bank_karta", pattern: /bank\s+karta/i },
  { name: "old_karta_uz", pattern: /karta\s+raqami/i },
  { name: "old_no_kyc", pattern: /no-kyc/i },
  { name: "old_100_anonymous", pattern: /100%\s*anonymous/i },
  { name: "old_backend_connection_notice", pattern: /backend\s+connection/i },
  { name: "old_open_manually_notice", pattern: /open\s+manually/i },
  { name: "old_opening_vidipay_notice", pattern: /opening\s+vidipay/i },
  { name: "old_wallet_not_connected_ru_latin", pattern: /poka\s+ne\s+podklyuch/i },
  { name: "old_wallet_not_connected_ru", pattern: /ne\s+podklyuch/i }
];

const appRequiredPatterns = [
  { name: "app_backend_primary", pattern: /vidipay-backend-1\.onrender\.com/ },
  { name: "telegram_init_data_auth", pattern: /X-Telegram-Init-Data/ },
  { name: "wallet_unlock_gate", pattern: /openWalletIfUnlocked/ },
  { name: "ton_deposit_address", pattern: /ton-deposit-address/ },
  { name: "ton_deposit_warning_i18n", pattern: /ton_deposit_warning/ },
  { name: "wallet_ready_i18n", pattern: /wallet_ready_for_activation/ },
  { name: "deposit_refund_withdrawal", pattern: /submitWithdrawRequest[\s\S]*withdraw_scope:\s*['"]deposit_refund['"]/ },
  { name: "deposit_refund_status_refresh", pattern: /async function refreshPaymentStatus/ },
  { name: "admin_notification_translation", pattern: /translateAdminNotificationText/ },
  { name: "notification_list_layout", pattern: /notification-list/ },
  { name: "growth_lock_status", pattern: /growthLockStatus/ },
  { name: "watch_server_session_start", pattern: /apiRequest\(['"]\/view\/session\/start['"]/ },
  { name: "watch_server_heartbeat", pattern: /apiRequest\(['"]\/view\/session\/heartbeat['"]/ },
  { name: "watch_session_token_completion", pattern: /const completionBody = \{[\s\S]*session_token:[\s\S]*ended:\s*true/ },
  { name: "watch_authoritative_seconds", pattern: /watchSeconds = Number\(result\.watch_seconds \|\| 0\)/ },
  { name: "watch_fallback_fail_closed", pattern: /showMrBeastFallbackPlayer[\s\S]*setWatchUiState\(['"]unverified_player['"]\)/ },
  { name: "watch_close_no_reward", pattern: /function closeWatchModal\(\)[\s\S]*watch_incomplete_no_reward/ },
  { name: "youtube_end_auto_finalize", pattern: /PlayerState\.ENDED[\s\S]*finalizeWatchSession\(finalSnapshot\)/ }
];

const adminRequiredPatterns = [
  { name: "admin_backend_primary", pattern: /vidipay-backend-1\.onrender\.com/ },
  { name: "admin_ton_scanner_panel", pattern: /Automatic TON scanner/ },
  { name: "admin_payment_wallets_endpoint", pattern: /\/admin\/payment-wallets/ },
  { name: "admin_notification_endpoint", pattern: /\/admin\/notification\/send/ },
  { name: "admin_production_backend_candidates", pattern: /getAdminApiCandidates[\s\S]*ADMIN_PRODUCTION_API_BASE_URL/ },
  { name: "admin_token_header", pattern: /['"]x-admin-token['"]:\s*token\(\)/ },
  { name: "admin_manual_backup_text", pattern: /Manual backup/ }
];

function readText(file) {
  return fs.readFileSync(path.join(targetDir, file), "utf8");
}

function fail(message) {
  throw new Error(message);
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function checkFilesExist() {
  for (const file of expectedFiles) {
    if (!fs.existsSync(path.join(targetDir, file))) {
      fail(`Missing required frontend file: ${file}`);
    }
  }
}

function checkConfig() {
  const config = readText("config.js").trim();
  const expectedApi = 'window.VIDIPAY_API_BASE = "https://vidipay-backend-1.onrender.com";';
  const expectedBuildLine = `window.VIDIPAY_FRONTEND_BUILD = "${expectedBuild}";`;
  if (!config.includes(expectedApi)) {
    fail(`config.js must include: ${expectedApi}`);
  }
  if (!config.includes(expectedBuildLine)) {
    fail(`config.js must include: ${expectedBuildLine}`);
  }
}

function checkForbiddenStrings() {
  for (const file of expectedFiles) {
    const text = readText(file);
    for (const rule of forbiddenVisiblePatterns) {
      if (rule.pattern.test(text)) {
        fail(`${file} contains forbidden legacy frontend/admin marker: ${rule.name}`);
      }
    }
  }
}

function checkRequiredPatterns(file, rules, source = readText(file)) {
  for (const rule of rules) {
    if (!rule.pattern.test(source)) {
      fail(`${file} is missing required marker: ${rule.name}`);
    }
  }
}

function readAppBundle(file) {
  return [readText(file), readText("vidipay-app.js"), readText("vidipay-app.css")].join("\n");
}

function readAdminBundle() {
  return [readText("admin.html"), readText("vidipay-admin.js"), readText("vidipay-admin.css")].join("\n");
}

function checkCorsSafeRequestHeaders() {
  const requestFiles = ["admin.html", "app-v3.html", "app-v4.html", "app-v5.html", "app-v6.html", "index.html"];
  const unsafeHeaderPattern = /['"](?:Cache-Control|Pragma)['"]\s*:/i;
  for (const file of requestFiles) {
    if (unsafeHeaderPattern.test(readText(file))) {
      fail(`${file} must not send cache-control request headers that require extra CORS permission`);
    }
  }
}

function checkInlineScripts(file) {
  const html = readText(file);
  const scriptRegex = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  let index = 0;
  while ((match = scriptRegex.exec(html))) {
    index += 1;
    const script = match[1].trim();
    if (!script) continue;
    try {
      new vm.Script(script, { filename: `${file}#inline-script-${index}.js` });
    } catch (error) {
      fail(`${file} inline script ${index} syntax error: ${error.message}`);
    }
  }
}

function checkExternalScriptSyntax() {
  for (const file of ["vidipay-app.js", "vidipay-admin.js"]) {
    try {
      new vm.Script(readText(file), { filename: file });
    } catch (error) {
      fail(`${file} syntax error: ${error.message}`);
    }
  }
}

function checkCspHardening() {
  const appFiles = ["app-v3.html", "app-v4.html", "app-v5.html", "app-v6.html", "index.html"];
  for (const file of appFiles) {
    const html = readText(file);
    if (!html.includes("Content-Security-Policy")) fail(`${file} is missing CSP meta`);
    if (!html.includes("script-src-attr 'none'")) fail(`${file} must block script attributes`);
    if (!html.includes("./vidipay-app.js?v=csp-20260729")) fail(`${file} must load external app JS`);
    if (!html.includes("./vidipay-app.css?v=csp-20260729")) fail(`${file} must load external app CSS`);
    if (/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i.test(html)) fail(`${file} contains inline script`);
    if (/<style\b/i.test(html)) fail(`${file} contains inline style block`);
    if (/\son[a-z]+\s*=/i.test(html)) fail(`${file} contains inline event handler`);
  }

  const adminHtml = readText("admin.html");
  if (!adminHtml.includes("script-src-attr 'none'")) fail("admin.html must block script attributes");
  if (!adminHtml.includes("./vidipay-admin.js?v=csp-20260729")) fail("admin.html must load external admin JS");
  if (!adminHtml.includes("./vidipay-admin.css?v=csp-20260729")) fail("admin.html must load external admin CSS");
  if (/\son[a-z]+\s*=/i.test(adminHtml)) fail("admin.html contains inline event handler");

  const scripts = `${readText("vidipay-app.js")}\n${readText("vidipay-admin.js")}`;
  if (/setAttribute\(\s*['"]onclick/i.test(scripts)) fail("external scripts contain dynamic onclick attributes");
  if (/\son[a-z]+\s*=/i.test(scripts)) fail("external scripts contain inline handler templates");
  for (const origin of ["ipapi.co", "ipwho.is", "api.country.is", "get.geojs.io", "ipinfo.io", "ifconfig.co"]) {
    if (scripts.includes(origin)) fail(`frontend contains third-party IP lookup: ${origin}`);
  }

  const headers = readText("_headers");
  if (!headers.includes("Content-Security-Policy:")) fail("_headers is missing CSP");
  if (!headers.includes("X-Frame-Options: DENY")) fail("admin frame protection is missing");
}
function checkAppEntryParity() {
  const appFiles = ["app-v3.html", "app-v4.html", "app-v5.html", "app-v6.html", "index.html"];
  const expectedHash = sha256(readText(appFiles[0]));
  for (const file of appFiles.slice(1)) {
    if (sha256(readText(file)) !== expectedHash) {
      fail(`${file} must match the canonical frontend entry`);
    }
  }
}

function buildReport() {
  return expectedFiles.map((file) => {
    const text = readText(file);
    return {
      file,
      bytes: Buffer.byteLength(text, "utf8"),
      sha256: sha256(text).slice(0, 16)
    };
  });
}

function main() {
  checkFilesExist();
  checkConfig();
  checkForbiddenStrings();
  checkRequiredPatterns("app-v6.html", appRequiredPatterns, readAppBundle("app-v6.html"));
  checkRequiredPatterns("index.html", appRequiredPatterns, readAppBundle("index.html"));
  checkRequiredPatterns("admin.html", adminRequiredPatterns, readAdminBundle());
  checkCorsSafeRequestHeaders();
  checkAppEntryParity();
  checkExternalScriptSyntax();
  checkCspHardening();
  for (const file of ["app-v3.html", "app-v4.html", "app-v5.html", "app-v6.html", "index.html"]) {
    if (!readText(file).includes(expectedBuild)) {
      fail(`${file} is missing current build marker: ${expectedBuild}`);
    }
  }
  ["admin.html", "app-v3.html", "app-v4.html", "app-v5.html", "app-v6.html", "index.html"].forEach(checkInlineScripts);

  console.log("VidiPay frontend/admin static guard: OK");
  console.log(JSON.stringify({ targetDir, checkedAt: new Date().toISOString(), files: buildReport() }, null, 2));
}

main();
