const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");

const targetDir = path.resolve(process.argv[2] || __dirname);
const expectedBuild = "frontend-admin-readiness-20260711-v3";

const expectedFiles = [
  "admin.html",
  "app-v3.html",
  "app-v4.html",
  "app-v5.html",
  "app-v6.html",
  "config.js",
  "index.html"
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
  { name: "wallet_unlock_gate", pattern: /openWalletIfUnlocked/ },
  { name: "ton_deposit_address", pattern: /ton-deposit-address/ },
  { name: "ton_deposit_warning_i18n", pattern: /ton_deposit_warning/ },
  { name: "wallet_ready_i18n", pattern: /wallet_ready_for_activation/ },
  { name: "deposit_refund_withdrawal", pattern: /submitWithdrawRequest[\s\S]*withdraw_scope:\s*['"]deposit_refund['"]/ },
  { name: "admin_notification_translation", pattern: /translateAdminNotificationText/ },
  { name: "notification_list_layout", pattern: /notification-list/ },
  { name: "growth_lock_status", pattern: /currentGrowthLockStatus/ }
];

const adminRequiredPatterns = [
  { name: "admin_backend_primary", pattern: /vidipay-backend-1\.onrender\.com/ },
  { name: "admin_ton_scanner_panel", pattern: /Automatic TON scanner/ },
  { name: "admin_payment_wallets_endpoint", pattern: /\/admin\/payment-wallets/ },
  { name: "admin_notification_endpoint", pattern: /\/admin\/notification\/send/ },
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

function checkRequiredPatterns(file, rules) {
  const text = readText(file);
  for (const rule of rules) {
    if (!rule.pattern.test(text)) {
      fail(`${file} is missing required marker: ${rule.name}`);
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
  checkRequiredPatterns("app-v6.html", appRequiredPatterns);
  checkRequiredPatterns("index.html", appRequiredPatterns);
  checkRequiredPatterns("admin.html", adminRequiredPatterns);
  for (const file of expectedFiles) {
    if (file.endsWith(".html") && !readText(file).includes(expectedBuild)) {
      fail(`${file} is missing current build marker: ${expectedBuild}`);
    }
  }
  ["admin.html", "app-v3.html", "app-v4.html", "app-v5.html", "app-v6.html", "index.html"].forEach(checkInlineScripts);

  console.log("VidiPay frontend/admin static guard: OK");
  console.log(JSON.stringify({ targetDir, checkedAt: new Date().toISOString(), files: buildReport() }, null, 2));
}

main();
