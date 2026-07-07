# TON USDT Wallet Pool Payment Setup

This backend assigns one temporary TON USDT receiving wallet to each pending activation deposit order.
It does not rely on unique payment leftovers or decimal tricks. A payment is accepted only when:

- the order is pending
- the assigned wallet address matches the incoming transfer recipient
- the incoming jetton transfer is USDT on TON
- the amount is equal to or greater than the required amount
- the transaction hash has not been processed before

Default activation flow:

- user deposits 10 USDT on TON
- withdrawal becomes active after confirmation
- 9 USDT is credited to the user's app balance for payout request
- 1 USDT is kept as the activation fee

## 1. Run Supabase SQL

Open Supabase SQL Editor and run:

```sql
-- file: supabase-usdt-wallet-pool.sql
```

Then import your public TON receiving addresses:

```sql
insert into payment_wallets (network, token, address) values
('TON', 'USDT', 'EQXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'),
('TON', 'USDT', 'UQYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY')
on conflict (address) do nothing;
```

Import only public receiving addresses. Do not put private keys or seed phrases in Supabase, GitHub, or Render.

## 2. Render environment

Required for production:

```text
NODE_ENV=production
PORT=10000
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_TOKEN=
BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
PUBLIC_BACKEND_URL=https://vidipay-backend-1.onrender.com
GAME_URL=https://shshavkatjon2-blip.github.io/vidipay-fronted/app-v4.html?v=wallet-ui-force-v4-20260619
PUBLIC_APP_URL=https://shshavkatjon2-blip.github.io/vidipay-fronted
ALLOWED_ORIGINS=https://shshavkatjon2-blip.github.io
TONAPI_KEY=
TONAPI_BASE_URL=https://tonapi.io
TON_USDT_JETTON_MASTER=
ACTIVATION_DEPOSIT_USDT=10
ACTIVATION_FEE_USDT=1
ACTIVATION_REFUND_USDT=9
USDT_PAYMENT_AMOUNT=10
PAYMENT_ORDER_TTL_MINUTES=5
PAYMENT_LATE_GRACE_MINUTES=30
PAYMENT_WALLET_COOLDOWN_MINUTES=30
PAYMENT_SCAN_INTERVAL_MS=15000
PAYMENT_SCAN_BATCH_SIZE=50
PAYMENT_SCANNER_ENABLED=true
```

Keep `TON_USDT_JETTON_MASTER` set. Without it, the scanner can only fall back to a weaker `USDT` symbol check.

## 3. Admin checks

Use these admin endpoints with `x-admin-token`:

```text
GET  /admin/payment-wallets
POST /admin/payment-scan/run
```

## 4. Safety notes

- A wallet must not be assigned to two active users at the same time.
- `claim_payment_wallet` uses `FOR UPDATE SKIP LOCKED` to prevent double assignment.
- A tx hash can unlock only once.
- Wallets go into cooldown after confirm/expire to reduce late-payment ambiguity.
- Private keys should be handled by a separate secure wallet service, not by the public frontend.
