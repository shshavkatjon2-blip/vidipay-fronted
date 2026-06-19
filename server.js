const express = require("express");
const cors = require("cors");
const helmet = require("helmet"); // <-- [YANGI]: HTTP hujumlardan xavfsizlikni kuchaytirish uchun
const crypto = require("crypto"); // <-- [YANGI QO'SHILDI]: Webhook xavfsizligi (HMAC) uchun
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

// [YAXSHILANISH]: Muhim muhit o'zgaruvchilari (env) ni server ishga tushishidanoq tekshirish
const requiredEnvs = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "ADMIN_TOKEN",
  "FIAT_WEBHOOK_SECRET",
  "TONAPI_KEY",
  "TON_USDT_JETTON_MASTER"
];
const missingEnvs = requiredEnvs.filter(env => !process.env[env] || process.env[env].trim() === "");
if (missingEnvs.length > 0) {
  console.warn(`\n[OGOHLANTIRISH]: Quyidagi muhim .env o'zgaruvchilar Renderda kiritilmagan:\n -> ${missingEnvs.join("\n -> ")}\n\nServer vaqtinchalik xavfsiz rejimda ishga tushmoqda, lekin to'liq ishlashi uchun Render > Environment bo'limiga bu kalitlarni kiriting!\n`);
}

const app = express();

const BACKEND_VERSION = "v1.5.2-telegram-cache-bust";
const WEBAPP_VERSION = "wallet-ui-clean-v3-20260619";
const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || "https://shshavkatjon2-blip.github.io/vidipay-fronted";
const GAME_URL = process.env.GAME_URL || `${PUBLIC_APP_URL}/app-v3.html?v=${WEBAPP_VERSION}`;
const BOT_TOKEN = process.env.BOT_TOKEN || "";
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const TONAPI_KEY = process.env.TONAPI_KEY || "";
const TONAPI_BASE_URL = (process.env.TONAPI_BASE_URL || "https://tonapi.io").replace(/\/$/, "");
const TON_USDT_JETTON_MASTER = normalizeAddress(process.env.TON_USDT_JETTON_MASTER || "");
const PAYMENT_NETWORK = "TON";
const PAYMENT_TOKEN = "USDT";
const PAYMENT_TOKEN_DECIMALS = 6;
const PAYMENT_AMOUNT_USDT = formatUsdtAmount(process.env.ACTIVATION_DEPOSIT_USDT || process.env.USDT_PAYMENT_AMOUNT || process.env.WITHDRAW_UNLOCK_USDT_AMOUNT || "10");
const ACTIVATION_FEE_USDT = formatUsdtAmount(process.env.ACTIVATION_FEE_USDT || "1");
const ACTIVATION_REFUND_USDT = formatUsdtAmount(process.env.ACTIVATION_REFUND_USDT || Math.max(0, Number(PAYMENT_AMOUNT_USDT) - Number(ACTIVATION_FEE_USDT)));
const PAYMENT_ORDER_TTL_MINUTES = Math.max(1, Number(process.env.PAYMENT_ORDER_TTL_MINUTES || 5));
const PAYMENT_LATE_GRACE_MINUTES = Math.max(5, Number(process.env.PAYMENT_LATE_GRACE_MINUTES || 30));
const PAYMENT_WALLET_COOLDOWN_MINUTES = Math.max(PAYMENT_LATE_GRACE_MINUTES, Number(process.env.PAYMENT_WALLET_COOLDOWN_MINUTES || 30));
const PAYMENT_SCAN_INTERVAL_MS = Math.max(5000, Number(process.env.PAYMENT_SCAN_INTERVAL_MS || 15000));
const PAYMENT_SCAN_BATCH_SIZE = Math.max(1, Math.min(250, Number(process.env.PAYMENT_SCAN_BATCH_SIZE || 50)));
const PAYMENT_SCANNER_ENABLED = process.env.PAYMENT_SCANNER_ENABLED !== "false";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || PUBLIC_APP_URL)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const TRUSTED_STATIC_HOST_SUFFIXES = [".github.io", ".pages.dev"];

function isAllowedCorsOrigin(origin) {
  if (!origin) return true;
  if (origin === "null") return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;

  try {
    const { protocol, hostname } = new URL(origin);
    return protocol === "https:" && TRUSTED_STATIC_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
  } catch {
    return false;
  }
}

app.disable("x-powered-by");

app.use(helmet()); // <-- [YANGI]: Serverni tashqi skanerlardan himoyalash
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cache-Control", "no-store");
  next();
});

app.use(cors({
  origin(origin, callback) {
    if (isAllowedCorsOrigin(origin)) return callback(null, true);
    return callback(new Error("CORS origin blocked"));
  }
}));
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder_key"
);

const DEFAULT_BALANCE = 0;

const DEFAULT_SETTINGS = {
  view_seconds_required: 15,
  view_reward: 1,
  view_reward_per_second: 0.01,
  tier1_reward_per_second: 10,
  tier2_reward_per_second: 7,
  tier3_reward_per_second: 0.01,
  tier1_countries: "US,AU,CA,NO,CH,DE,GB,NL,SE,DK",
  tier2_countries: "FR,BE,AT,FI,IE,NZ,IT,ES,JP,KR",
  daily_bonus: 5,
  daily_view_limit: 50,
  withdraw_min_amount: 9,
  withdraw_commission_percent: 0,
  withdraw_requires_payment: true,
  withdraw_opens_at: "",
  withdraw_window_hours: 36,
  referral_bonus: 10
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function requireFields(body, fields) {
  const missing = fields.filter((field) => body[field] === undefined || body[field] === null || body[field] === "");
  return missing.length ? `Kerakli fieldlar: ${missing.join(", ")}` : null;
}

const rateBuckets = new Map();

// [YAXSHILANISH]: Har 1 soatda eskirgan rate limitlarni tozalash (Memory leak'ni oldini olish)
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets.entries()) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
}, 60 * 60 * 1000);

function clientRateKey(req, scope) {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const ip = (raw || req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown")
    .split(",")[0]
    .trim();
  return `${scope}:${ip}`;
}

function rateLimit(scope, limit, windowMs) {
  return (req, res, next) => {
    const now = Date.now();
    const key = clientRateKey(req, scope);
    const bucket = rateBuckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > limit) {
      return res.status(429).json({
        error: "Juda ko'p so'rov yuborildi. Birozdan keyin urinib ko'ring."
      });
    }

    return next();
  };
}

app.use("/admin", rateLimit("admin", 80, 15 * 60 * 1000));
app.use("/telegram", rateLimit("telegram", 300, 15 * 60 * 1000));
app.use(rateLimit("public", 600, 15 * 60 * 1000));

async function findUserByTelegramId(telegramId) {
  return supabase
    .from("users")
    .select("*")
    .eq("telegram_id", String(telegramId))
    .single();
}

async function normalizeDailyUser(user) {
  const day = todayKey();

  if (user.daily_stats_date === day) {
    return user;
  }

  const { data, error } = await supabase
    .from("users")
    .update({
      daily_views: 0,
      daily_income: 0,
      daily_watch_seconds: 0,
      daily_stats_date: day,
      updated_at: new Date().toISOString()
    })
    .eq("telegram_id", String(user.telegram_id))
    .select()
    .single();

  if (error) throw error;

  return data;
}

async function getSettings() {
  const { data, error } = await supabase
    .from("admin_settings")
    .select("key, value");

  if (error) throw error;

  const settings = { ...DEFAULT_SETTINGS };

  for (const item of data || []) {
    settings[item.key] = normalizeSettingValue(item.value);
  }

  return settings;
}

function normalizeSettingValue(value) {
  if (value === "\"\"" || value === "''") return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (
      (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  }
  return value;
}

function numberSetting(settings, key) {
  const value = Number(settings[key]);
  return Number.isFinite(value) ? value : Number(DEFAULT_SETTINGS[key]);
}

function booleanSetting(settings, key) {
  const value = settings[key];
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return Boolean(DEFAULT_SETTINGS[key]);
}

function listSetting(settings, key) {
  const value = settings[key] || DEFAULT_SETTINGS[key] || "";
  return String(value)
    .split(",")
    .map((item) => normalizeCountryCode(item))
    .filter(Boolean);
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function normalizeAddress(value) {
  return String(value || "").trim();
}

function formatUsdtAmount(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return "0";
  return number.toFixed(PAYMENT_TOKEN_DECIMALS).replace(/\.?0+$/, "");
}

function normalizeBase64Url(value) {
  const clean = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  return clean.padEnd(Math.ceil(clean.length / 4) * 4, "=");
}

function decodeTonAddressToRaw(value) {
  const address = normalizeAddress(value);
  if (/^-?\d+:[a-fA-F0-9]{64}$/.test(address)) return address.toLowerCase();
  if (!/^[A-Za-z0-9_-]{48}$/.test(address)) return "";

  try {
    const bytes = Buffer.from(normalizeBase64Url(address), "base64");
    if (bytes.length !== 36) return "";
    const workchainByte = bytes[1];
    const workchain = workchainByte === 255 ? -1 : workchainByte;
    return `${workchain}:${bytes.subarray(2, 34).toString("hex")}`;
  } catch {
    return "";
  }
}

function isLikelyTonAddress(value) {
  return Boolean(decodeTonAddressToRaw(value));
}

function sameTonAddress(left, right) {
  const a = decodeTonAddressToRaw(left);
  const b = decodeTonAddressToRaw(right);
  return Boolean(a && b && a === b);
}

function decimalToUnits(value, decimals = PAYMENT_TOKEN_DECIMALS) {
  const raw = String(value ?? "0").trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) return 0n;
  const [whole, fraction = ""] = raw.split(".");
  const paddedFraction = (fraction + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole || "0") * (10n ** BigInt(decimals)) + BigInt(paddedFraction || "0");
}

function unitsToDecimalString(value, decimals = PAYMENT_TOKEN_DECIMALS) {
  const units = BigInt(String(value || "0"));
  const base = 10n ** BigInt(decimals);
  const whole = units / base;
  const fraction = String(units % base).padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

function normalizePaymentOrder(order) {
  if (!order) return null;
  const amount = order.required_amount ?? order.amount ?? PAYMENT_AMOUNT_USDT;
  const wallet = order.wallet_address || order.to_wallet || order.admin_wallet || "";
  return {
    ...order,
    amount: Number(amount),
    required_amount: Number(amount),
    network: order.network || PAYMENT_NETWORK,
    token: order.token || PAYMENT_TOKEN,
    to_wallet: wallet,
    admin_wallet: wallet,
    wallet_address: wallet
  };
}

async function expireStalePaymentOrders() {
  const staleBefore = addMinutes(new Date(), -PAYMENT_LATE_GRACE_MINUTES).toISOString();
  const { data: staleOrders, error } = await supabase
    .from("payment_orders")
    .select("id,wallet_address")
    .eq("status", "pending")
    .lt("expires_at", staleBefore)
    .limit(250);

  if (error) {
    if (["42P01", "42703"].includes(error.code)) return;
    throw error;
  }

  if (!staleOrders?.length) return;

  const ids = staleOrders.map((order) => order.id).filter(Boolean);
  const wallets = staleOrders.map((order) => normalizeAddress(order.wallet_address)).filter(Boolean);
  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("payment_orders")
    .update({ status: "expired", updated_at: now })
    .in("id", ids)
    .eq("status", "pending");

  if (updateError) throw updateError;

  if (wallets.length) {
    const { error: walletError } = await supabase
      .from("payment_wallets")
      .update({
        assigned_to_telegram_id: null,
        assigned_order_id: null,
        assigned_until: null,
        cooldown_until: addMinutes(new Date(), PAYMENT_WALLET_COOLDOWN_MINUTES).toISOString(),
        updated_at: now
      })
      .in("address", wallets);

    if (walletError && !["42P01", "42703"].includes(walletError.code)) throw walletError;
  }
}

async function getExistingPaymentOrder(telegramId) {
  const { data, error } = await supabase
    .from("payment_orders")
    .select("*")
    .eq("telegram_id", String(telegramId))
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01") return null;
    throw error;
  }

  return normalizePaymentOrder(data);
}

async function claimPaymentWallet(orderId, telegramId, expiresAt) {
  const rpcResult = await supabase.rpc("claim_payment_wallet", {
    p_order_id: orderId,
    p_telegram_id: String(telegramId),
    p_assigned_until: expiresAt,
    p_network: PAYMENT_NETWORK,
    p_token: PAYMENT_TOKEN
  });

  if (!rpcResult.error) {
    const wallet = Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data;
    return wallet || null;
  }

  if (!["42883", "PGRST202"].includes(rpcResult.error.code)) {
    throw rpcResult.error;
  }

  const now = new Date().toISOString();
  const { data: wallet, error: findError } = await supabase
    .from("payment_wallets")
    .select("*")
    .eq("network", PAYMENT_NETWORK)
    .eq("token", PAYMENT_TOKEN)
    .eq("is_active", true)
    .is("assigned_order_id", null)
    .or(`cooldown_until.is.null,cooldown_until.lte.${now}`)
    .order("last_assigned_at", { ascending: true, nullsFirst: true })
    .limit(1)
    .maybeSingle();

  if (findError) throw findError;
  if (!wallet) return null;

  const { data: claimed, error: updateError } = await supabase
    .from("payment_wallets")
    .update({
      assigned_to_telegram_id: String(telegramId),
      assigned_order_id: orderId,
      assigned_until: expiresAt,
      last_assigned_at: now,
      updated_at: now
    })
    .eq("id", wallet.id)
    .is("assigned_order_id", null)
    .select()
    .maybeSingle();

  if (updateError) throw updateError;
  return claimed || null;
}

async function createUsdtPaymentOrder(telegramId) {
  await expireStalePaymentOrders();

  const existing = await getExistingPaymentOrder(telegramId);
  if (existing) return existing;

  const now = new Date();
  const expiresAt = addMinutes(now, PAYMENT_ORDER_TTL_MINUTES).toISOString();
  const { data: order, error } = await supabase
    .from("payment_orders")
    .insert({
      telegram_id: String(telegramId),
      network: PAYMENT_NETWORK,
      token: PAYMENT_TOKEN,
      required_amount: PAYMENT_AMOUNT_USDT,
      status: "pending",
      assigned_at: now.toISOString(),
      expires_at: expiresAt
    })
    .select()
    .single();

  if (error) throw error;

  const wallet = await claimPaymentWallet(order.id, telegramId, expiresAt);
  if (!wallet) {
    await supabase
      .from("payment_orders")
      .update({ status: "canceled", updated_at: new Date().toISOString() })
      .eq("id", order.id);
    throw new Error("Bo'sh TON USDT hamyon topilmadi. Supabase payment_wallets jadvaliga TON hamyonlar qo'shing.");
  }

  if (!isLikelyTonAddress(wallet.address)) {
    await supabase
      .from("payment_wallets")
      .update({
        is_active: false,
        assigned_to_telegram_id: null,
        assigned_order_id: null,
        assigned_until: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", wallet.id);
    throw new Error("Noto'g'ri TON hamyon formati topildi. payment_wallets jadvaliga faqat EQ..., UQ... yoki 0:... TON address qo'shing.");
  }

  const { data: updatedOrder, error: orderUpdateError } = await supabase
    .from("payment_orders")
    .update({
      wallet_address: wallet.address,
      updated_at: new Date().toISOString()
    })
    .eq("id", order.id)
    .select()
    .single();

  if (orderUpdateError) throw orderUpdateError;
  return normalizePaymentOrder(updatedOrder);
}

function readTonAccountAddress(value) {
  if (!value) return "";
  if (typeof value === "string") return normalizeAddress(value);
  return normalizeAddress(
    value.address ||
    value.account?.address ||
    value.wallet?.address ||
    value.raw_address ||
    value.raw
  );
}

function extractTonJettonTransfers(events) {
  const transfers = [];

  for (const event of events || []) {
    const eventTimestamp = Number(event.timestamp || event.utime || 0);
    const eventHash = normalizeAddress(event.event_id || event.id || event.trace_id || event.hash || event.lt);
    const actions = Array.isArray(event.actions) ? event.actions : [];

    for (const action of actions) {
      const type = String(action.type || action.action_type || "").toLowerCase();
      const transfer =
        action.JettonTransfer ||
        action.jettonTransfer ||
        action.jetton_transfer ||
        action.details ||
        action;

      if (!type.includes("jetton") && !transfer?.jetton && transfer?.amount === undefined) continue;
      if (String(action.status || "ok").toLowerCase() === "failed") continue;

      const jetton = transfer.jetton || transfer.asset || transfer.token || {};
      const tokenAddress = readTonAccountAddress(
        jetton.address ||
        jetton.master ||
        transfer.jetton_address ||
        transfer.jetton_master ||
        transfer.master
      );
      const tokenSymbol = String(jetton.symbol || transfer.symbol || transfer.ticker || "").toUpperCase();

      transfers.push({
        hash: normalizeAddress(
          transfer.transaction_hash ||
          transfer.tx_hash ||
          action.tx_hash ||
          action.base_transactions?.[0] ||
          eventHash
        ),
        from: readTonAccountAddress(transfer.sender || transfer.from || transfer.source),
        to: readTonAccountAddress(transfer.recipient || transfer.to || transfer.destination),
        value: String(transfer.amount ?? transfer.value ?? transfer.quantity ?? "0"),
        decimals: Number(jetton.decimals ?? transfer.decimals ?? PAYMENT_TOKEN_DECIMALS),
        token_address: tokenAddress,
        token_symbol: tokenSymbol,
        timestamp_ms: eventTimestamp ? eventTimestamp * 1000 : Date.now(),
        raw: { event, action }
      });
    }
  }

  return transfers;
}

async function fetchTonUsdtTransactions(address, minTimestamp) {
  const all = [];
  let beforeLt = "";

  for (let page = 0; page < 5; page += 1) {
    const params = new URLSearchParams({
      limit: "100"
    });
    if (beforeLt) params.set("before_lt", beforeLt);

    const headers = { Accept: "application/json" };
    if (TONAPI_KEY) headers.Authorization = `Bearer ${TONAPI_KEY}`;

    const res = await fetch(`${TONAPI_BASE_URL}/v2/accounts/${encodeURIComponent(address)}/events?${params.toString()}`, { headers });

    const text = await res.text();
    const payload = text ? JSON.parse(text) : {};
    if (!res.ok || payload.success === false) {
      throw new Error(payload.error || payload.message || `TON API ${res.status}`);
    }

    const events = Array.isArray(payload.events) ? payload.events : (Array.isArray(payload) ? payload : []);
    all.push(...events);

    const oldest = events[events.length - 1];
    const oldestTime = Number(oldest?.timestamp || oldest?.utime || 0) * 1000;
    beforeLt = normalizeAddress(payload.next_from || oldest?.lt);
    if (!beforeLt || !events.length || (oldestTime && oldestTime < minTimestamp)) break;
  }

  return extractTonJettonTransfers(all);
}

function findMatchingUsdtTransfer(order, transactions) {
  const wallet = normalizeAddress(order.wallet_address);
  const requiredUnits = decimalToUnits(order.required_amount || PAYMENT_AMOUNT_USDT);
  const assignedAt = new Date(order.assigned_at || order.created_at || Date.now()).getTime() - 60 * 1000;
  const lateUntil = addMinutes(new Date(order.expires_at || Date.now()), PAYMENT_LATE_GRACE_MINUTES).getTime();
  const expectedJetton = decodeTonAddressToRaw(TON_USDT_JETTON_MASTER);

  return (transactions || []).find((tx) => {
    const txHash = tx.hash;
    const txTo = normalizeAddress(tx.to);
    const tokenAddress = normalizeAddress(tx.token_address);
    const tokenSymbol = String(tx.token_symbol || "").toUpperCase();
    const decimals = Number(tx.decimals ?? PAYMENT_TOKEN_DECIMALS);
    const timestamp = Number(tx.timestamp_ms || 0);

    if (!txHash || !sameTonAddress(txTo, wallet)) return false;
    if (expectedJetton) {
      if (!sameTonAddress(tokenAddress, TON_USDT_JETTON_MASTER)) return false;
    } else if (tokenSymbol && tokenSymbol !== PAYMENT_TOKEN) {
      return false;
    }
    if (timestamp && (timestamp < assignedAt || timestamp > lateUntil)) return false;

    const amountUnits = BigInt(String(tx.value || "0"));
    const normalizedAmountUnits = decimals === PAYMENT_TOKEN_DECIMALS
      ? amountUnits
      : decimalToUnits(unitsToDecimalString(amountUnits, decimals));

    return normalizedAmountUnits >= requiredUnits;
  });
}

async function isPaymentTxAlreadyProcessed(txHash) {
  const { data: order } = await supabase
    .from("payment_orders")
    .select("id")
    .eq("tx_hash", txHash)
    .maybeSingle();

  if (order) return true;

  const { data: tx } = await supabase
    .from("payment_transactions")
    .select("id")
    .eq("tx_hash", txHash)
    .maybeSingle();

  return Boolean(tx);
}

async function unlockWithdrawAndCreditActivationRefund(telegramId, now = new Date().toISOString()) {
  const { data: currentUser, error: currentUserError } = await supabase
    .from("users")
    .select("balance,withdraw_unlocked")
    .eq("telegram_id", String(telegramId))
    .maybeSingle();

  if (currentUserError) throw currentUserError;

  const refundAmount = Number(ACTIVATION_REFUND_USDT);
  const shouldCreditRefund = !currentUser?.withdraw_unlocked && refundAmount > 0;
  const updateBody = {
    withdraw_unlocked: true,
    withdraw_payment_verified_at: now,
    updated_at: now
  };

  if (shouldCreditRefund) {
    updateBody.balance = Number(currentUser?.balance || 0) + refundAmount;
  }

  const { error: userError } = await supabase
    .from("users")
    .update(updateBody)
    .eq("telegram_id", String(telegramId));

  if (userError) throw userError;

  return {
    credited_refund: shouldCreditRefund,
    refund_amount: shouldCreditRefund ? refundAmount : 0
  };
}

async function confirmUsdtPayment(order, tx) {
  const txHash = tx.hash;
  if (!txHash || await isPaymentTxAlreadyProcessed(txHash)) return false;

  const decimals = Number(tx.decimals ?? PAYMENT_TOKEN_DECIMALS);
  const paidAmount = unitsToDecimalString(tx.value || "0", decimals);
  const paidAt = new Date(Number(tx.timestamp_ms || Date.now())).toISOString();
  const now = new Date().toISOString();

  const { data: confirmedOrder, error: orderError } = await supabase
    .from("payment_orders")
    .update({
      status: "confirmed",
      tx_hash: txHash,
      from_wallet: tx.from || null,
      paid_amount: paidAmount,
      paid_at: paidAt,
      raw_event: tx.raw || tx,
      updated_at: now
    })
    .eq("id", order.id)
    .eq("status", "pending")
    .is("tx_hash", null)
    .select()
    .maybeSingle();

  if (orderError) throw orderError;
  if (!confirmedOrder) return false;

  await unlockWithdrawAndCreditActivationRefund(order.telegram_id, now);

  const { error: txInsertError } = await supabase
    .from("payment_transactions")
    .insert({
      telegram_id: String(order.telegram_id),
      network: PAYMENT_NETWORK,
      token: PAYMENT_TOKEN,
      to_wallet: order.wallet_address,
      amount: Number(paidAmount),
      tx_hash: txHash
    });

  if (txInsertError && txInsertError.code !== "23505") throw txInsertError;

  await supabase
    .from("payment_wallets")
    .update({
      assigned_to_telegram_id: null,
      assigned_order_id: null,
      assigned_until: null,
      cooldown_until: addMinutes(new Date(), PAYMENT_WALLET_COOLDOWN_MINUTES).toISOString(),
      last_scanned_at: now,
      updated_at: now
    })
    .eq("address", order.wallet_address);

  return true;
}

async function scanPaymentOrder(order) {
  if (!order?.wallet_address) return false;
  const minTimestamp = Math.max(0, new Date(order.assigned_at || order.created_at || Date.now()).getTime() - 2 * 60 * 1000);
  const transactions = await fetchTonUsdtTransactions(order.wallet_address, minTimestamp);
  const match = findMatchingUsdtTransfer(order, transactions);
  const now = new Date().toISOString();

  await supabase
    .from("payment_orders")
    .update({ last_checked_at: now, updated_at: now })
    .eq("id", order.id)
    .eq("status", "pending");

  await supabase
    .from("payment_wallets")
    .update({ last_scanned_at: now, updated_at: now })
    .eq("address", order.wallet_address);

  return match ? confirmUsdtPayment(order, match) : false;
}

const paymentScannerState = {
  running: false,
  lastRunAt: null,
  lastError: null,
  checked: 0,
  confirmed: 0
};

async function scanPendingPaymentOrders(limit = PAYMENT_SCAN_BATCH_SIZE) {
  if (paymentScannerState.running) return paymentScannerState;
  paymentScannerState.running = true;
  paymentScannerState.lastRunAt = new Date().toISOString();
  paymentScannerState.lastError = null;

  try {
    await expireStalePaymentOrders();
    const { data: orders, error } = await supabase
      .from("payment_orders")
      .select("*")
      .eq("status", "pending")
      .not("wallet_address", "is", null)
      .order("last_checked_at", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) {
      if (["42P01", "42703"].includes(error.code)) return paymentScannerState;
      throw error;
    }

    for (const order of orders || []) {
      paymentScannerState.checked += 1;
      try {
        const confirmed = await scanPaymentOrder(order);
        if (confirmed) paymentScannerState.confirmed += 1;
      } catch (err) {
        paymentScannerState.lastError = err.message;
      }
    }

    return paymentScannerState;
  } finally {
    paymentScannerState.running = false;
  }
}

function normalizeCountryCode(value) {
  const code = String(value || "").trim().toUpperCase();
  if (!code) return "";
  const aliases = {
    "UNITED KINGDOM": "GB",
    "GREAT BRITAIN": "GB",
    "BRITAIN": "GB",
    "ENGLAND": "GB",
    "UK": "GB",
    "UNITED STATES": "US",
    "UNITED STATES OF AMERICA": "US",
    "USA": "US",
    "GERMANY": "DE",
    "DEUTSCHLAND": "DE",
    "CANADA": "CA",
    "AUSTRALIA": "AU",
    "NORWAY": "NO",
    "SWITZERLAND": "CH",
    "NETHERLANDS": "NL",
    "SWEDEN": "SE",
    "DENMARK": "DK",
    "FRANCE": "FR",
    "BELGIUM": "BE",
    "AUSTRIA": "AT",
    "FINLAND": "FI",
    "IRELAND": "IE",
    "NEW ZEALAND": "NZ",
    "ITALY": "IT",
    "SPAIN": "ES",
    "JAPAN": "JP",
    "SOUTH KOREA": "KR",
    "KOREA": "KR"
  };
  if (aliases[code]) return aliases[code];
  if (code === "UK") return "GB";
  return code.slice(0, 2);
}

async function detectCountryFromRequest(req) {
  const headerCountry = detectCountryFromHeaders(req);
  if (headerCountry) return headerCountry;

  const ip = getClientIp(req);

  if (isPrivateIp(ip)) {
    return {
      ip,
      country_code: null,
      country_name: "Unknown"
    };
  }

  const cached = ipCountryCache.get(ip);
  if (cached && cached.expires_at > Date.now()) return cached.value;

  try {
    const response = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      headers: { "User-Agent": "VidiPay/1.3.0" }
    });
    const body = await response.json();

    if (!response.ok || body.error) {
      throw new Error(body.reason || body.error || "IP country lookup failed");
    }

    const value = {
      ip,
      country_code: normalizeCountryCode(body.country_code || body.country),
      country_name: body.country_name || "Unknown"
    };

    ipCountryCache.set(ip, {
      value,
      expires_at: Date.now() + 6 * 60 * 60 * 1000
    });

    return value;
  } catch (err) {
    try {
      const response = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
        headers: { "User-Agent": "VidiPay/1.3.2" }
      });
      const body = await response.json();
      if (!response.ok || body.success === false) {
        throw new Error(body.message || "IP fallback lookup failed");
      }

      const value = {
        ip,
        country_code: normalizeCountryCode(body.country_code),
        country_name: body.country || "Unknown"
      };

      ipCountryCache.set(ip, {
        value,
        expires_at: Date.now() + 6 * 60 * 60 * 1000
      });

      return value;
    } catch (fallbackErr) {
      return {
        ip,
        country_code: null,
        country_name: "Unknown",
        lookup_error: `${err.message}; ${fallbackErr.message}`
      };
    }
  }
}

function resolveTier(settings, countryCode) {
  const code = normalizeCountryCode(countryCode);
  const tier1Countries = listSetting(settings, "tier1_countries");
  const tier2Countries = listSetting(settings, "tier2_countries");

  if (tier1Countries.includes(code)) {
    return {
      tier: 1,
      reward_per_second: numberSetting(settings, "tier1_reward_per_second")
    };
  }

  if (tier2Countries.includes(code)) {
    return {
      tier: 2,
      reward_per_second: numberSetting(settings, "tier2_reward_per_second")
    };
  }

  return {
    tier: 3,
    reward_per_second: numberSetting(settings, "tier3_reward_per_second") || numberSetting(settings, "view_reward_per_second")
  };
}

async function getTierForRequest(req, settings) {
  const country = await detectCountryFromRequest(req);
  const clientCountryCode = (req.query?.client_country_code || req.body?.client_country_code || req.body?.country_code || "")
    ? normalizeCountryCode(req.query?.client_country_code || req.body?.client_country_code || req.body?.country_code)
    : "";
  const clientCountrySource = String(req.query?.client_country_source || req.body?.client_country_source || "").trim();
  const effectiveCountry = clientCountryCode || country.country_code;
  const tier = resolveTier(settings, effectiveCountry);

  return {
    ...country,
    detected_country_code: country.country_code,
    country_code: effectiveCountry || null,
    country_source: clientCountryCode ? (clientCountrySource || "client_country_code") : (country.country_source || "server_ip_lookup"),
    ...tier
  };
}

async function getServerTierForRequest(req, settings) {
  const country = await detectCountryFromRequest(req);
  const tier = resolveTier(settings, country.country_code);

  return {
    ...country,
    ...tier
  };
}

function getWithdrawWindowStatus(settings) {
  const opensAtValue = normalizeSettingValue(settings.withdraw_opens_at);
  const windowHours = numberSetting(settings, "withdraw_window_hours");

  if (!opensAtValue) {
    return {
      status: "not_scheduled",
      is_open: false,
      opens_at: null,
      closes_at: null,
      window_hours: windowHours
    };
  }

  const opensAt = new Date(opensAtValue);
  if (Number.isNaN(opensAt.getTime())) {
    return {
      status: "invalid_schedule",
      is_open: false,
      opens_at: opensAtValue,
      closes_at: null,
      window_hours: windowHours
    };
  }

  const closesAt = new Date(opensAt.getTime() + windowHours * 60 * 60 * 1000);
  const now = new Date();

  if (now < opensAt) {
    return {
      status: "locked",
      is_open: false,
      opens_at: opensAt.toISOString(),
      closes_at: closesAt.toISOString(),
      window_hours: windowHours
    };
  }

  if (now > closesAt) {
    return {
      status: "closed",
      is_open: false,
      opens_at: opensAt.toISOString(),
      closes_at: closesAt.toISOString(),
      window_hours: windowHours
    };
  }

  return {
    status: "open",
    is_open: true,
    opens_at: opensAt.toISOString(),
    closes_at: closesAt.toISOString(),
    window_hours: windowHours
  };
}

async function upsertSetting(key, value) {
  return supabase
    .from("admin_settings")
    .upsert({
      key,
      value,
      updated_at: new Date().toISOString()
    }, { onConflict: "key" })
    .select()
    .single();
}

async function applyReferralBonusIfNeeded(referrerId, referredTelegramId) {
  if (!referrerId || String(referrerId) === String(referredTelegramId)) {
    return { applied: false, reason: "no_referrer" };
  }

  if (!/^\d+$/.test(String(referrerId)) || !/^\d+$/.test(String(referredTelegramId))) {
    return { applied: false, reason: "telegram_id_must_be_numeric" };
  }

  const { data: referrer, error: referrerError } = await findUserByTelegramId(referrerId);
  if (referrerError && referrerError.code !== "PGRST116") throw referrerError;
  if (!referrer) return { applied: false, reason: "referrer_not_found" };
  if (referrer.is_blocked || referrer.deleted_at) return { applied: false, reason: "referrer_blocked" };

  const { data: existingReferral, error: existingReferralError } = await supabase
    .from("referrals")
    .select("id")
    .or(`referred_telegram_id.eq.${String(referredTelegramId)},invited_telegram_id.eq.${String(referredTelegramId)}`)
    .single();

  if (existingReferralError && existingReferralError.code !== "PGRST116") {
    throw existingReferralError;
  }

  if (existingReferral) {
    return { applied: false, reason: "already_exists" };
  }

  const settings = await getSettings();
  const referralBonus = numberSetting(settings, "referral_bonus");

  const { error: referralError } = await supabase.from("referrals").insert({
    referrer_telegram_id: String(referrerId),
    referred_telegram_id: String(referredTelegramId),
    invited_telegram_id: String(referredTelegramId),
    reward_amount: referralBonus,
    status: "pending"
  });

  if (referralError) throw referralError;

  await supabase.from("notifications").insert([
    {
      telegram_id: String(referrerId),
      title: "Referral bonus",
      message: `Your friend joined. Bonus is locked until withdrawal time: ${referralBonus}`
    },
    {
      telegram_id: String(referredTelegramId),
      title: "Referral accepted",
      message: "You joined through a referral link."
    }
  ]);

  return {
    applied: true,
    referrer_id: String(referrerId),
    referred_telegram_id: String(referredTelegramId),
    bonus: referralBonus
  };
}

app.get("/", (req, res) => {
  res.json({
    status: "online",
    project: "VidiPay Backend",
    version: BACKEND_VERSION,
    starting_balance: DEFAULT_BALANCE,
    activation_deposit_amount: Number(PAYMENT_AMOUNT_USDT),
    activation_fee_amount: Number(ACTIVATION_FEE_USDT),
    activation_refund_amount: Number(ACTIVATION_REFUND_USDT),
    activation_network: PAYMENT_NETWORK,
    activation_token: PAYMENT_TOKEN,
    payment_scanner_enabled: PAYMENT_SCANNER_ENABLED,
    webapp_version: WEBAPP_VERSION,
    webapp_url: buildWebAppUrl()
  });
});

function buildWebAppUrl(payload = "") {
  const url = new URL(GAME_URL);
  if (payload) {
    url.searchParams.set("ref", payload);
    url.searchParams.set("startapp", payload);
    url.searchParams.set("tgWebAppStartParam", payload);
  }
  url.searchParams.set("v", WEBAPP_VERSION);
  url.searchParams.set("app_v", WEBAPP_VERSION);
  url.searchParams.set("open_ts", String(Date.now()));
  return url.toString();
}

async function telegramApi(method, payload) {
  if (!BOT_TOKEN) throw new Error("BOT_TOKEN env ichida yo'q");

  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await response.json();

  if (!response.ok || !body.ok) {
    throw new Error(body.description || "Telegram API xatosi");
  }

  return body.result;
}

async function sendTelegramStart(chatId, firstName, payload) {
  return telegramApi("sendMessage", {
    chat_id: chatId,
    text: `Welcome, ${firstName || "user"}!\n\nOpen Vidi Pay with the button below:`,
    reply_markup: {
      inline_keyboard: [[
        {
          text: "Open Vidi Pay",
          web_app: { url: buildWebAppUrl(payload) }
        }
      ]]
    }
  });
}

app.post("/telegram/webhook/:secret", async (req, res) => {
  try {
    if (!TELEGRAM_WEBHOOK_SECRET || req.params.secret !== TELEGRAM_WEBHOOK_SECRET) {
      return res.status(401).json({ error: "Webhook secret noto'g'ri" });
    }

    const message = req.body?.message;
    const text = String(message?.text || "");
    const chatId = message?.chat?.id;

    if (chatId && text.startsWith("/start")) {
      const payload = text.replace("/start", "").trim();
      await sendTelegramStart(chatId, message.from?.first_name, payload);
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/settings", async (req, res) => {
  try {
    const settings = await getSettings();
    const configuredMinWithdrawAmount = numberSetting(settings, "withdraw_min_amount");
    const effectiveMinWithdrawAmount = Math.min(
      configuredMinWithdrawAmount,
      Number(ACTIVATION_REFUND_USDT) || configuredMinWithdrawAmount
    );

    res.json({
      version: BACKEND_VERSION,
      starting_balance: DEFAULT_BALANCE,
      view_seconds_required: settings.view_seconds_required,
      daily_bonus: settings.daily_bonus,
      daily_view_limit: settings.daily_view_limit,
      view_reward_per_second: settings.view_reward_per_second,
      tier1_reward_per_second: settings.tier1_reward_per_second,
      tier2_reward_per_second: settings.tier2_reward_per_second,
      tier3_reward_per_second: settings.tier3_reward_per_second,
      tier1_countries: settings.tier1_countries,
      tier2_countries: settings.tier2_countries,
      withdraw_min_amount: String(effectiveMinWithdrawAmount),
      withdraw_commission_percent: settings.withdraw_commission_percent,
      withdraw_requires_payment: booleanSetting(settings, "withdraw_requires_payment"),
      withdraw_opens_at: settings.withdraw_opens_at,
      withdraw_window_hours: settings.withdraw_window_hours,
      referral_bonus: settings.referral_bonus,
      activation_deposit_amount: Number(PAYMENT_AMOUNT_USDT),
      activation_fee_amount: Number(ACTIVATION_FEE_USDT),
      activation_refund_amount: Number(ACTIVATION_REFUND_USDT),
      activation_network: PAYMENT_NETWORK,
      activation_token: PAYMENT_TOKEN,
      withdraw_window: getWithdrawWindowStatus(settings)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/user/sync", async (req, res) => {
  try {
    const { telegram_id, username, first_name, last_name, referrer_id } = req.body;

    if (!telegram_id) {
      return res.status(400).json({ error: "telegram_id kerak" });
    }

    const { data: existingUser, error: findError } = await findUserByTelegramId(telegram_id);

    if (findError && findError.code !== "PGRST116") {
      return res.status(500).json(findError);
    }

    if (existingUser) {
      if (existingUser.is_blocked || existingUser.deleted_at) {
        return res.status(403).json({
          error: existingUser.deleted_at ? "Account o'chirilgan" : "User bloklangan"
        });
      }

      const { data, error } = await supabase
        .from("users")
        .update({
          username,
          first_name,
          last_name,
          updated_at: new Date().toISOString()
        })
        .eq("telegram_id", String(telegram_id))
        .select()
        .single();

      if (error) return res.status(500).json(error);

      const referral = await applyReferralBonusIfNeeded(referrer_id, telegram_id);

      return res.json({
        status: "updated",
        user: data,
        referral
      });
    }

    const { data: newUser, error: insertError } = await supabase
      .from("users")
      .insert({
        telegram_id: String(telegram_id),
        username,
        first_name,
        last_name,
        balance: DEFAULT_BALANCE,
        total_views: 0,
        total_watch_seconds: 0,
        daily_views: 0,
        daily_income: 0,
        daily_watch_seconds: 0,
        daily_stats_date: todayKey(),
        tier: 3
      })
      .select()
      .single();

    if (insertError) return res.status(500).json(insertError);

    const referral = await applyReferralBonusIfNeeded(referrer_id, telegram_id);

    res.json({
      status: "created",
      user: newUser,
      referral
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/user/:telegram_id", async (req, res) => {
  const { telegram_id } = req.params;
  const { data, error } = await findUserByTelegramId(telegram_id);

  if (error && error.code === "PGRST116") {
    return res.status(404).json({ error: "User topilmadi" });
  }

  if (error) return res.status(500).json(error);

  try {
    res.json(await normalizeDailyUser(data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/tier/status", async (req, res) => {
  try {
    const settings = await getSettings();
    const tierStatus = await getTierForRequest(req, settings);

    res.json({
      status: "ok",
      ...tierStatus,
      tier1_countries: listSetting(settings, "tier1_countries"),
      tier2_countries: listSetting(settings, "tier2_countries")
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/user/delete", async (req, res) => {
  try {
    const missing = requireFields(req.body, ["telegram_id"]);
    if (missing) return res.status(400).json({ error: missing });

    const telegramId = String(req.body.telegram_id);
    const deletedAt = new Date().toISOString();

    const { data, error } = await supabase
      .from("users")
      .update({
        username: null,
        first_name: "Deleted user",
        last_name: null,
        is_blocked: true,
        deleted_at: deletedAt,
        updated_at: deletedAt
      })
      .eq("telegram_id", telegramId)
      .select()
      .single();

    if (error && error.code === "PGRST116") return res.status(404).json({ error: "User topilmadi" });
    if (error) return res.status(500).json(error);

    res.json({
      status: "account_deleted",
      user: data
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/view/add", async (req, res) => {
  try {
    const missing = requireFields(req.body, ["telegram_id", "watch_seconds", "video_source", "completed"]);
    if (missing) return res.status(400).json({ error: missing });

    const telegramId = String(req.body.telegram_id);
    const watchSeconds = Number(req.body.watch_seconds);
    const videoSource = String(req.body.video_source);
    const videoId = req.body.video_id ? String(req.body.video_id) : null;
    const completed = req.body.completed === true;

    const settings = await getSettings();
    const requiredSeconds = numberSetting(settings, "view_seconds_required");
    const tierStatus = await getTierForRequest(req, settings);
    const rewardPerSecond = tierStatus.reward_per_second;
    const dailyViewLimit = numberSetting(settings, "daily_view_limit");

    if (!Number.isFinite(watchSeconds) || watchSeconds < requiredSeconds) {
      return res.status(400).json({
        error: `watch_seconds kamida ${requiredSeconds} bo'lishi kerak`
      });
    }

    if (videoSource !== "mrbeast_uploads" || !completed) {
      return res.status(400).json({
        error: "Faqat app ichidagi MrBeast videosi to'liq ko'rilganda hisoblanadi"
      });
    }

    const { data: foundUser, error: userError } = await findUserByTelegramId(telegramId);
    if (userError && userError.code === "PGRST116") return res.status(404).json({ error: "User topilmadi" });
    if (userError) return res.status(500).json(userError);
    const user = await normalizeDailyUser(foundUser);
    if (user.is_blocked) return res.status(403).json({ error: "User bloklangan" });

    if (dailyViewLimit > 0 && Number(user.daily_views) >= dailyViewLimit) {
      return res.status(429).json({
        error: "Kunlik video ko'rish limiti tugagan",
        daily_view_limit: dailyViewLimit
      });
    }

    const reward = Number((watchSeconds * rewardPerSecond).toFixed(2));

    const { error: logError } = await supabase.from("view_logs").insert({
      telegram_id: telegramId,
      watch_seconds: watchSeconds,
      reward_amount: reward,
      video_source: videoSource,
      video_id: videoId
    });

    if (logError) return res.status(500).json(logError);

    const { data, error } = await supabase
      .from("users")
      .update({
        balance: Number(user.balance) + reward,
        total_views: Number(user.total_views) + 1,
        total_watch_seconds: Number(user.total_watch_seconds) + watchSeconds,
        daily_views: Number(user.daily_views) + 1,
        daily_income: Number(user.daily_income) + reward,
        daily_watch_seconds: Number(user.daily_watch_seconds || 0) + watchSeconds,
        tier: tierStatus.tier,
        daily_stats_date: todayKey(),
        updated_at: new Date().toISOString()
      })
      .eq("telegram_id", telegramId)
      .select()
      .single();

    if (error) return res.status(500).json(error);

    res.json({
      status: "view_added",
      reward,
      reward_per_second: rewardPerSecond,
      watch_seconds: watchSeconds,
      tier: tierStatus.tier,
      country_code: tierStatus.country_code,
      country_name: tierStatus.country_name,
      user: data
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/bonus/claim", async (req, res) => {
  try {
    const missing = requireFields(req.body, ["telegram_id"]);
    if (missing) return res.status(400).json({ error: missing });

    const telegramId = String(req.body.telegram_id);
    const day = todayKey();
    const settings = await getSettings();
    const dailyBonus = numberSetting(settings, "daily_bonus");
    const withdrawWindow = getWithdrawWindowStatus(settings);

    if (!withdrawWindow.is_open) {
      return res.status(403).json({
        status: "bonus_locked",
        error: "Bonus faqat pul yechish vaqti kelganda asosiy balansga qo'shiladi",
        withdraw_window: withdrawWindow
      });
    }

    const { data: foundUser, error: userError } = await findUserByTelegramId(telegramId);
    if (userError && userError.code === "PGRST116") return res.status(404).json({ error: "User topilmadi" });
    if (userError) return res.status(500).json(userError);
    const user = await normalizeDailyUser(foundUser);
    if (user.is_blocked) return res.status(403).json({ error: "User bloklangan" });

    const { data: existingBonus, error: bonusFindError } = await supabase
      .from("bonus_logs")
      .select("*")
      .eq("telegram_id", telegramId)
      .eq("bonus_date", day)
      .single();

    if (bonusFindError && bonusFindError.code !== "PGRST116") {
      return res.status(500).json(bonusFindError);
    }

    const { data: pendingReferrals, error: pendingReferralError } = await supabase
      .from("referrals")
      .select("id,reward_amount")
      .eq("referrer_telegram_id", telegramId)
      .eq("status", "pending");

    if (pendingReferralError) return res.status(500).json(pendingReferralError);

    const referralBonus = (pendingReferrals || []).reduce((sum, item) => {
      return sum + Number(item.reward_amount || 0);
    }, 0);
    const availableDailyBonus = existingBonus ? 0 : dailyBonus;
    const totalBonus = Number((availableDailyBonus + referralBonus).toFixed(2));

    if (totalBonus <= 0) {
      return res.status(409).json({
        status: "already_claimed",
        message: "Bonus mavjud emas yoki bugungi bonus olingan"
      });
    }

    if (!existingBonus && availableDailyBonus > 0) {
      const { error: bonusInsertError } = await supabase.from("bonus_logs").insert({
        telegram_id: telegramId,
        bonus_date: day,
        amount: availableDailyBonus
      });

      if (bonusInsertError) return res.status(500).json(bonusInsertError);
    }

    if ((pendingReferrals || []).length) {
      const { error: referralUpdateError } = await supabase
        .from("referrals")
        .update({ status: "claimed" })
        .in("id", pendingReferrals.map((item) => item.id));

      if (referralUpdateError) return res.status(500).json(referralUpdateError);
    }

    const { data, error } = await supabase
      .from("users")
      .update({
        balance: Number((Number(user.balance) + totalBonus).toFixed(2)),
        daily_income: Number((Number(user.daily_income) + totalBonus).toFixed(2)),
        daily_stats_date: day,
        updated_at: new Date().toISOString()
      })
      .eq("telegram_id", telegramId)
      .select()
      .single();

    if (error) return res.status(500).json(error);

    res.json({
      status: "bonus_claimed",
      bonus: totalBonus,
      daily_bonus: availableDailyBonus,
      referral_bonus: referralBonus,
      user: data
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/withdraw/request", async (req, res) => {
  try {
    const missing = requireFields(req.body, ["telegram_id", "amount", "wallet_type", "wallet_address"]);
    if (missing) return res.status(400).json({ error: missing });

    const telegramId = String(req.body.telegram_id);
    const amount = Number(req.body.amount);
    const { wallet_type, wallet_address } = req.body;
    const settings = await getSettings();
    const configuredMinWithdrawAmount = numberSetting(settings, "withdraw_min_amount");
    const minWithdrawAmount = Math.min(configuredMinWithdrawAmount, Number(ACTIVATION_REFUND_USDT) || configuredMinWithdrawAmount);
    const commissionPercent = 0;

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "amount noto'g'ri" });
    }

    const { data: user, error: userError } = await findUserByTelegramId(telegramId);
    if (userError && userError.code === "PGRST116") return res.status(404).json({ error: "User topilmadi" });
    if (userError) return res.status(500).json(userError);
    if (user.is_blocked) return res.status(403).json({ error: "User bloklangan" });

    if (!user.withdraw_unlocked) {
      return res.status(403).json({
        error: "Pul yechish uchun avval 10 USDT aktivatsiya depozitini amalga oshirish kerak"
      });
    }

    if (amount < minWithdrawAmount) {
      return res.status(400).json({
        error: `Minimal yechish summasi ${minWithdrawAmount}`
      });
    }

    if (!isLikelyTonAddress(wallet_address)) {
      return res.status(400).json({
        error: "TON hamyon address noto'g'ri. EQ..., UQ... yoki 0:... formatini kiriting."
      });
    }

    if (Number(user.balance) < amount) {
      return res.status(400).json({ error: "Balans yetarli emas" });
    }

    const commissionAmount = Number(((amount * commissionPercent) / 100).toFixed(2));
    const payoutAmount = Number((amount - commissionAmount).toFixed(2));

    const { data: withdraw, error: withdrawError } = await supabase
      .from("withdraws")
      .insert({
        telegram_id: telegramId,
        amount,
        wallet_type: "USDT_TON",
        wallet_address: normalizeAddress(wallet_address),
        status: "pending"
      })
      .select()
      .single();

    if (withdrawError) return res.status(500).json(withdrawError);

    const { data: updatedUser, error: updateError } = await supabase
      .from("users")
      .update({
        balance: Number(user.balance) - amount,
        updated_at: new Date().toISOString()
      })
      .eq("telegram_id", telegramId)
      .select()
      .single();

    if (updateError) return res.status(500).json(updateError);

    res.json({
      status: "withdraw_requested",
      amount,
      commission_amount: commissionAmount,
      payout_amount: payoutAmount,
      withdraw,
      user: updatedUser
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/withdraw/:telegram_id", async (req, res) => {
  const { telegram_id } = req.params;

  const { data, error } = await supabase
    .from("withdraws")
    .select("*")
    .eq("telegram_id", String(telegram_id))
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json(error);

  res.json(data);
});

app.get("/stats/:telegram_id", async (req, res) => {
  const { telegram_id } = req.params;

  const { data: foundUser, error } = await findUserByTelegramId(telegram_id);
  if (error && error.code === "PGRST116") return res.status(404).json({ error: "User topilmadi" });
  if (error) return res.status(500).json(error);
  const user = await normalizeDailyUser(foundUser);

  const { count: referralCount } = await supabase
    .from("referrals")
    .select("*", { count: "exact", head: true })
    .eq("referrer_telegram_id", String(telegram_id));

  res.json({
    telegram_id: user.telegram_id,
    balance: user.balance,
    total_views: user.total_views,
    total_watch_seconds: user.total_watch_seconds,
    daily_views: user.daily_views,
    daily_watch_seconds: user.daily_watch_seconds || 0,
    daily_income: user.daily_income,
    tier: user.tier,
    referrals: referralCount || 0
  });
});

app.get("/history/:telegram_id", async (req, res) => {
  try {
    const telegramId = String(req.params.telegram_id);

    // Karta orqali qilingan to'lovlarni `payment_transactions` dan olamiz
    const { data: payments, error: paymentTxError } = await supabase
      .from("payment_transactions")
      .select("*")
      .eq("telegram_id", telegramId)
      .order("created_at", { ascending: false })
      .limit(25);

    if (paymentTxError) return res.status(500).json(paymentTxError);

    const { data: withdraws, error: withdrawError } = await supabase
      .from("withdraws")
      .select("*")
      .eq("telegram_id", telegramId)
      .order("created_at", { ascending: false })
      .limit(25);

    if (withdrawError) return res.status(500).json(withdrawError);

    // Karta to'lovlarini formatlash
    const paymentItems = (payments || []).map((item) => ({
      id: `payment_tx_${item.id}`,
      type: "payment",
      title: "Wallet unlock payment",
      amount: Number(item.amount || 0),
      currency: item.token || "TON",
      network: item.network || "FIAT",
      status: "verified",
      wallet: item.to_wallet,
      tx_hash: item.tx_hash || null,
      created_at: item.created_at,
      processed_at: item.created_at
    }));

    const withdrawItems = (withdraws || []).map((item) => ({
      id: `withdraw_${item.id}`,
      type: "withdraw",
      title: "Withdrawal request",
      amount: Number(item.amount || 0),
      currency: item.wallet_type || "USDT",
      network: item.wallet_type || "USDT",
      status: item.status,
      wallet: item.wallet_address,
      tx_hash: null,
      created_at: item.created_at,
      processed_at: item.processed_at || null,
      admin_note: item.admin_note || null
    }));

    res.json([...paymentItems, ...withdrawItems].sort((a, b) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/notifications/:telegram_id", async (req, res) => {
  try {
    const telegramId = String(req.params.telegram_id);
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .or(`telegram_id.is.null,telegram_id.eq.${telegramId}`)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return res.status(500).json(error);
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function requireAdmin(req, res, next) {
  const token = req.headers["x-admin-token"];

  if (!ADMIN_TOKEN) {
    return res.status(500).json({ error: "ADMIN_TOKEN .env ichida yo'q" });
  }

  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: "Admin token noto'g'ri" });
  }

  next();
}

app.post("/admin/login", (req, res) => {
  const { token } = req.body;

  if (!ADMIN_TOKEN) {
    return res.status(500).json({ error: "ADMIN_TOKEN .env ichida yo'q" });
  }

  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: "Token noto'g'ri" });
  }

  res.json({
    status: "ok",
    message: "Admin login muvaffaqiyatli"
  });
});

app.post("/admin/telegram/set-webhook", requireAdmin, async (req, res) => {
  try {
    if (!BOT_TOKEN) return res.status(500).json({ error: "BOT_TOKEN env ichida yo'q" });
    if (!TELEGRAM_WEBHOOK_SECRET) return res.status(500).json({ error: "TELEGRAM_WEBHOOK_SECRET env ichida yo'q" });

    const publicBackendUrl = String(req.body.public_backend_url || process.env.PUBLIC_BACKEND_URL || "").trim();
    if (!publicBackendUrl) {
      return res.status(400).json({ error: "PUBLIC_BACKEND_URL yoki public_backend_url kerak" });
    }

    const webhookUrl = `${publicBackendUrl.replace(/\/$/, "")}/telegram/webhook/${encodeURIComponent(TELEGRAM_WEBHOOK_SECRET)}`;
    const result = await telegramApi("setWebhook", {
      url: webhookUrl,
      drop_pending_updates: true,
      allowed_updates: ["message"]
    });

    res.json({
      status: "webhook_set",
      result
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/admin/telegram/webhook-info", requireAdmin, async (req, res) => {
  try {
    const result = await telegramApi("getWebhookInfo", {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/admin/telegram/set-menu-button", requireAdmin, async (req, res) => {
  try {
    if (!BOT_TOKEN) return res.status(500).json({ error: "BOT_TOKEN env ichida yo'q" });

    const menuUrl = String(req.body?.url || buildWebAppUrl()).trim();
    const text = String(req.body?.text || "Open Vidi Pay").trim().slice(0, 64);
    if (!/^https:\/\//i.test(menuUrl)) {
      return res.status(400).json({ error: "Menu URL https bilan boshlanishi kerak" });
    }

    const result = await telegramApi("setChatMenuButton", {
      menu_button: {
        type: "web_app",
        text,
        web_app: { url: menuUrl }
      }
    });

    res.json({
      status: "menu_button_set",
      url: menuUrl,
      result
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/admin/settings", requireAdmin, async (req, res) => {
  try {
    const settings = await getSettings();
    res.json({
      ...settings,
      withdraw_requires_payment: booleanSetting(settings, "withdraw_requires_payment"),
      withdraw_window: getWithdrawWindowStatus(settings)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/admin/settings", requireAdmin, async (req, res) => {
  try {
    const allowedKeys = Object.keys(DEFAULT_SETTINGS);
    const updates = Object.entries(req.body).filter(([key]) => allowedKeys.includes(key));

    if (!updates.length) {
      return res.status(400).json({
        error: `Yangilash uchun field yuboring: ${allowedKeys.join(", ")}`
      });
    }

    const saved = [];

    for (const [key, value] of updates) {
      const { data, error } = await upsertSetting(key, value);
      if (error) return res.status(500).json(error);
      saved.push(data);
    }

    const settings = await getSettings();

    res.json({
      status: "settings_updated",
      saved,
      settings: {
        ...settings,
        withdraw_requires_payment: booleanSetting(settings, "withdraw_requires_payment"),
        withdraw_window: getWithdrawWindowStatus(settings)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/admin/users", requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return res.status(500).json(error);

  res.json(data);
});

app.post("/admin/users/:telegram_id/block", requireAdmin, async (req, res) => {
  try {
    const { telegram_id } = req.params;

    const { data, error } = await supabase
      .from("users")
      .update({
        is_blocked: true,
        updated_at: new Date().toISOString()
      })
      .eq("telegram_id", String(telegram_id))
      .select()
      .single();

    if (error && error.code === "PGRST116") return res.status(404).json({ error: "User topilmadi" });
    if (error) return res.status(500).json(error);

    res.json({
      status: "blocked",
      user: data
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/admin/users/:telegram_id/unblock", requireAdmin, async (req, res) => {
  try {
    const { telegram_id } = req.params;

    const { data, error } = await supabase
      .from("users")
      .update({
        is_blocked: false,
        deleted_at: null,
        updated_at: new Date().toISOString()
      })
      .eq("telegram_id", String(telegram_id))
      .select()
      .single();

    if (error && error.code === "PGRST116") return res.status(404).json({ error: "User topilmadi" });
    if (error) return res.status(500).json(error);

    res.json({
      status: "unblocked",
      user: data
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/admin/users/:telegram_id/add-earning", requireAdmin, async (req, res) => {
  try {
    const { telegram_id } = req.params;
    const amount = Number(req.body.amount);
    const minutes = Number(req.body.minutes || 0);
    const seconds = Number(req.body.seconds || minutes * 60);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "Summa musbat raqam bo'lishi kerak" });
    }

    if (!Number.isFinite(seconds) || seconds < 0) {
      return res.status(400).json({ error: "Vaqt noto'g'ri" });
    }

    const { data: foundUser, error: userError } = await findUserByTelegramId(telegram_id);
    if (userError && userError.code === "PGRST116") return res.status(404).json({ error: "User topilmadi" });
    if (userError) return res.status(500).json(userError);

    const user = await normalizeDailyUser(foundUser);
    const day = todayKey();
    const nextBalance = Number((Number(user.balance || 0) + amount).toFixed(2));
    const nextDailyIncome = Number((Number(user.daily_income || 0) + amount).toFixed(2));

    const { data, error } = await supabase
      .from("users")
      .update({
        balance: nextBalance,
        total_watch_seconds: Number(user.total_watch_seconds || 0) + Math.floor(seconds),
        daily_watch_seconds: Number(user.daily_watch_seconds || 0) + Math.floor(seconds),
        total_views: Number(user.total_views || 0) + (seconds > 0 ? 1 : 0),
        daily_views: Number(user.daily_views || 0) + (seconds > 0 ? 1 : 0),
        daily_income: nextDailyIncome,
        daily_stats_date: day,
        updated_at: new Date().toISOString()
      })
      .eq("telegram_id", String(telegram_id))
      .select()
      .single();

    if (error) return res.status(500).json(error);

    await supabase.from("notifications").insert({
      telegram_id: String(telegram_id),
      title: "Admin earning update",
      message: `Admin added $${amount.toFixed(2)} for ${Math.floor(seconds)} seconds.`
    });

    res.json({
      status: "earning_added",
      amount,
      seconds: Math.floor(seconds),
      user: data
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/admin/users/:telegram_id/history/withdraw", requireAdmin, async (req, res) => {
  try {
    const { telegram_id } = req.params;
    const amount = Number(req.body.amount);
    const walletType = String(req.body.wallet_type || "USDT").trim();
    const walletAddress = String(req.body.wallet_address || "Admin wallet").trim();
    const status = String(req.body.status || "approved").trim();
    const adminNote = String(req.body.admin_note || "Admin manual history").trim();
    const createdAtValue = req.body.created_at ? new Date(req.body.created_at) : new Date();
    const processedAtValue = req.body.processed_at ? new Date(req.body.processed_at) : createdAtValue;

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "Summa musbat raqam bo'lishi kerak" });
    }

    if (!["pending", "approved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Status pending, approved yoki rejected bo'lishi kerak" });
    }

    if (Number.isNaN(createdAtValue.getTime()) || Number.isNaN(processedAtValue.getTime())) {
      return res.status(400).json({ error: "Sana yoki vaqt noto'g'ri" });
    }

    const { data: user, error: userError } = await findUserByTelegramId(telegram_id);
    if (userError && userError.code === "PGRST116") return res.status(404).json({ error: "User topilmadi" });
    if (userError) return res.status(500).json(userError);

    const { data, error } = await supabase
      .from("withdraws")
      .insert({
        telegram_id: String(user.telegram_id),
        amount,
        wallet_type: walletType,
        wallet_address: walletAddress,
        status,
        admin_note: adminNote,
        created_at: createdAtValue.toISOString(),
        processed_at: status === "pending" ? null : processedAtValue.toISOString()
      })
      .select()
      .single();

    if (error) return res.status(500).json(error);

    res.json({
      status: "manual_history_added",
      withdraw: data
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/admin/history/withdraw/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("withdraws")
      .delete()
      .eq("id", id)
      .select()
      .single();

    if (error && error.code === "PGRST116") return res.status(404).json({ error: "History yozuvi topilmadi" });
    if (error) return res.status(500).json(error);

    res.json({
      status: "manual_history_deleted",
      withdraw: data
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/admin/withdraws", requireAdmin, async (req, res) => {
  const status = req.query.status || "pending";

  const { data, error } = await supabase
    .from("withdraws")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json(error);

  res.json(data);
});

app.post("/admin/withdraw/:id/approve", requireAdmin, async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from("withdraws")
    .update({
      status: "approved",
      processed_at: new Date().toISOString()
    })
    .eq("id", id)
    .eq("status", "pending")
    .select()
    .single();

  if (error) return res.status(500).json(error);

  res.json({
    status: "approved",
    withdraw: data
  });
});

app.post("/admin/withdraw/:id/reject", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const { data: withdraw, error: findError } = await supabase
    .from("withdraws")
    .select("*")
    .eq("id", id)
    .eq("status", "pending")
    .single();

  if (findError) return res.status(500).json(findError);

  const { data: user, error: userError } = await findUserByTelegramId(withdraw.telegram_id);
  if (userError) return res.status(500).json(userError);

  const { error: userUpdateError } = await supabase
    .from("users")
    .update({
      balance: Number(user.balance) + Number(withdraw.amount),
      updated_at: new Date().toISOString()
    })
    .eq("telegram_id", String(withdraw.telegram_id));

  if (userUpdateError) return res.status(500).json(userUpdateError);

  const { data, error } = await supabase
    .from("withdraws")
    .update({
      status: "rejected",
      admin_note: reason || null,
      processed_at: new Date().toISOString()
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return res.status(500).json(error);

  res.json({
    status: "rejected",
    withdraw: data
  });
});

/* =========================================================
   [YANGI]: ADMIN UCHUN TO'LOVLARNI BOSHQARISH API
========================================================= */

app.get("/admin/payment-orders", requireAdmin, async (req, res) => {
  try {
    const status = req.query.status || "pending";
    let query = supabase
      .from("payment_orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (status !== "all") query = query.eq("status", status);
    const { data, error } = await query;

    if (error) return res.status(500).json(error);
    res.json((data || []).map(normalizePaymentOrder));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/admin/payment-orders/:id/approve", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const now = new Date().toISOString();
    const { data: order, error: orderError } = await supabase
      .from("payment_orders")
      .update({
        status: "confirmed",
        tx_hash: `admin_manual_${id}`,
        paid_amount: PAYMENT_AMOUNT_USDT,
        paid_at: now,
        updated_at: now
      })
      .eq("id", id)
      .eq("status", "pending")
      .select()
      .maybeSingle();

    if (orderError) return res.status(500).json(orderError);
    if (!order) return res.status(404).json({ error: "Pending order topilmadi" });

    await unlockWithdrawAndCreditActivationRefund(order.telegram_id, now);

    await supabase
      .from("payment_wallets")
      .update({
        assigned_to_telegram_id: null,
        assigned_order_id: null,
        assigned_until: null,
        cooldown_until: addMinutes(new Date(), PAYMENT_WALLET_COOLDOWN_MINUTES).toISOString(),
        updated_at: now
      })
      .eq("address", order.wallet_address);

    res.json({ status: "approved", order: normalizePaymentOrder(order) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/admin/notification/send", requireAdmin, async (req, res) => {
  const missing = requireFields(req.body, ["title", "message"]);
  if (missing) return res.status(400).json({ error: missing });

  const { title, message, telegram_id } = req.body;

  const { data, error } = await supabase
    .from("notifications")
    .insert({
      telegram_id: telegram_id ? String(telegram_id) : null,
      title,
      message
    })
    .select()
    .single();

  if (error) return res.status(500).json(error);

  res.json({
    status: "sent",
    notification: data
  });
});

/* =========================================================
   [YANGI QO'SHILDI] VIDI PAY: FIAT-TO-CRYPTO (Uzcard/Humo) WEBHOOK
   XAVFSIZLIK DARAJASI: ULTRA (HMAC SHA-512 SIGNATURE)
========================================================= */

app.post("/webhook/fiat-payment", async (req, res) => {
  try {
    // 1. Provayder yuborgan xavfsizlik imzosini ushlash
    const signature = req.headers["x-signature"] || req.headers["x-mercuryo-signature"];
    const FIAT_WEBHOOK_SECRET = process.env.FIAT_WEBHOOK_SECRET;

    if (!signature || !FIAT_WEBHOOK_SECRET) {
      // Xavfsizlik: Xakerga sababini ochiqlamaslik uchun qisqa xato beramiz
      return res.status(403).json({ error: "Ruxsat etilmagan (Forbidden)" });
    }

    // 2. HMAC Shifrlash orqali imzoni tekshirish (Soxta to'lovning oldini olish)
    const payloadString = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac("sha512", FIAT_WEBHOOK_SECRET)
      .update(payloadString)
      .digest("hex");

    if (signature !== expectedSignature) {
      return res.status(403).json({ error: "Imzo xato (Invalid signature)" });
    }

    // 3. To'lov ma'lumotlarini ajratib olish (Frontenddan 'merchant_transaction_id' sifatida telegram_id jo'natiladi)
    const { status, merchant_transaction_id, crypto_amount, tx_hash } = req.body;
    const telegramId = String(merchant_transaction_id);

    // 4. Inyeksiya (Injection) himoyasi: telegramId faqat raqam bo'lishi shart!
    if (!/^\d+$/.test(telegramId)) {
        return res.status(400).json({ error: "ID formati xato" });
    }

    // 5. To'lov muvaffaqiyatli o'tganligini tekshirish
    if (status === "completed" || status === "successful") {

      // Dublikat to'lovlarni oldini olish uchun tx_hash ni tekshirish
      const actualTxHash = tx_hash || `fiat_${telegramId}_${Date.now()}`;
      if (tx_hash) {
        const { data: existingTx } = await supabase
          .from("payment_transactions")
          .select("id")
          .eq("tx_hash", actualTxHash)
          .single();
          
        if (existingTx) {
          return res.status(200).json({ status: "success", message: "To'lov allaqachon qabul qilingan" });
        }
      }

      // Foydalanuvchi bazada borligiga ishonch hosil qilish
      const { data: user, error: userFindError } = await findUserByTelegramId(telegramId);
      if (userFindError && userFindError.code === "PGRST116") {
        return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
      }
      if (userFindError) throw userFindError;

      // A) Foydalanuvchining pul yechish ruxsatini ochamiz va 9 USDT refund balansini yozamiz.
      await unlockWithdrawAndCreditActivationRefund(telegramId, new Date().toISOString());

      // B) To'lovni bazaga tarix (logs) sifatida yozib qo'yamiz
      const { error: txError } = await supabase.from("payment_transactions").insert({
        telegram_id: telegramId,
        network: "FIAT/TON", // Provayder tarmog'i
        token: "TON",
        to_wallet: "Fiat Provider", // To'lov qabul qilingan manzil
        amount: Number(crypto_amount) || 0,
        tx_hash: actualTxHash
      });
      
      if (txError) throw txError; // [YAXSHILANISH]: Agar bazaga yozishda xato bo'lsa, jarayonni to'xtatish


      // 6. Provayderga tasdiq javobi
      return res.status(200).json({ status: "success", message: "To'lov qabul qilindi" });
    }

    // Kutilayotgan (pending) yoki bekor qilingan (failed) holatlar uchun
    return res.status(200).json({ status: "ignored" });

  } catch (err) {
    return res.status(500).json({ error: "Ichki server xatosi" });
  }
});

/* =========================================================
   [YANGI QO'SHILDI]: TO'LOV YARATISH VA STATUS TEKSHIRISH
   (FIAT/CRYPTO GATEWAY UCHUN XAVFSIZ API'LAR)
========================================================= */

app.post("/payment/create", async (req, res) => {
  try {
    const { telegram_id } = req.body;
    if (!telegram_id) return res.status(400).json({ error: "telegram_id kerak" });

    const { data: user } = await findUserByTelegramId(telegram_id);
    if (user?.withdraw_unlocked) {
      return res.json({ withdraw_unlocked: true, order: null });
    }

    const order = await createUsdtPaymentOrder(telegram_id);
    res.json({
      withdraw_unlocked: false,
      order,
      payment: {
        network: PAYMENT_NETWORK,
        token: PAYMENT_TOKEN,
        contract: TON_USDT_JETTON_MASTER,
        amount: Number(order.required_amount),
        activation_deposit_amount: Number(PAYMENT_AMOUNT_USDT),
        activation_fee_amount: Number(ACTIVATION_FEE_USDT),
        activation_refund_amount: Number(ACTIVATION_REFUND_USDT),
        wallet_address: order.wallet_address,
        expires_at: order.expires_at
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/payment/check", async (req, res) => {
  try {
    const { telegram_id, order_id } = req.body || {};
    if (!telegram_id || !order_id) return res.status(400).json({ error: "telegram_id va order_id kerak" });

    const { data: order, error } = await supabase
      .from("payment_orders")
      .select("*")
      .eq("id", order_id)
      .eq("telegram_id", String(telegram_id))
      .maybeSingle();

    if (error) throw error;
    if (!order) return res.status(404).json({ error: "Order topilmadi" });

    const confirmed = order.status === "pending" ? await scanPaymentOrder(order) : order.status === "confirmed";
    const { data: user } = await findUserByTelegramId(telegram_id);
    const { data: latestOrder } = await supabase
      .from("payment_orders")
      .select("*")
      .eq("id", order_id)
      .maybeSingle();

    res.json({
      checked: true,
      confirmed,
      withdraw_unlocked: Boolean(user?.withdraw_unlocked),
      order: normalizePaymentOrder(latestOrder || order),
      user
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/payment/status/:telegram_id", async (req, res) => {
  try {
    const { telegram_id } = req.params;
    const { data: user } = await findUserByTelegramId(telegram_id);

    const { data: orders, error } = await supabase
      .from("payment_orders")
      .select("*")
      .eq("telegram_id", String(telegram_id))
      .order("created_at", { ascending: false })
      .limit(10);

    if (error && error.code !== "42P01") throw error;

    res.json({
      withdraw_unlocked: user?.withdraw_unlocked || false,
      user,
      orders: (orders || []).map(normalizePaymentOrder),
      scanner: paymentScannerState
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/payment/generate-fiat-url", async (req, res) => {
  try {
    const { telegram_id, order_id } = req.body;
    if (!telegram_id || !order_id) return res.status(400).json({ error: "Ma'lumot to'liq emas" });

    const { data: order, error } = await supabase
      .from("payment_orders")
      .select("*")
      .eq("id", order_id)
      .eq("telegram_id", String(telegram_id))
      .maybeSingle();

    if (error) throw error;
    if (!order) return res.status(404).json({ error: "Order topilmadi" });

    res.json({
      url: "",
      wallet_address: order.wallet_address,
      message: "Copy the TON USDT address and send payment from your wallet.",
      order: normalizePaymentOrder(order)
    });
  } catch (err) {
    res.status(500).json({ error: "URL yaratishda xatolik" });
  }
});

app.get("/admin/payment-wallets", requireAdmin, async (req, res) => {
  try {
    const { count: total } = await supabase
      .from("payment_wallets")
      .select("*", { count: "exact", head: true });
    const { count: active } = await supabase
      .from("payment_wallets")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true);
    const { count: assigned } = await supabase
      .from("payment_wallets")
      .select("*", { count: "exact", head: true })
      .not("assigned_order_id", "is", null);
    const { count: pendingOrders } = await supabase
      .from("payment_orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    res.json({
      total: total || 0,
      active: active || 0,
      assigned: assigned || 0,
      available: Math.max(0, (active || 0) - (assigned || 0)),
      pending_orders: pendingOrders || 0,
      scanner: paymentScannerState,
      config: {
        network: PAYMENT_NETWORK,
        token: PAYMENT_TOKEN,
        amount: PAYMENT_AMOUNT_USDT,
        activation_fee: ACTIVATION_FEE_USDT,
        activation_refund: ACTIVATION_REFUND_USDT,
        order_ttl_minutes: PAYMENT_ORDER_TTL_MINUTES,
        late_grace_minutes: PAYMENT_LATE_GRACE_MINUTES,
        scan_interval_ms: PAYMENT_SCAN_INTERVAL_MS,
        scan_batch_size: PAYMENT_SCAN_BATCH_SIZE
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/admin/payment-scan/run", requireAdmin, async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(250, Number(req.body?.limit || PAYMENT_SCAN_BATCH_SIZE)));
    const result = await scanPendingPaymentOrders(limit);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================
   SERVERNI ISHGA TUSHIRISH
========================================================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  if (PAYMENT_SCANNER_ENABLED) {
    setInterval(() => {
      scanPendingPaymentOrders().catch((err) => {
        paymentScannerState.lastError = err.message;
      });
    }, PAYMENT_SCAN_INTERVAL_MS);
    scanPendingPaymentOrders().catch((err) => {
      paymentScannerState.lastError = err.message;
    });
  }
  // Maxfiylik uchun terminal loglari o'chirildi
});
