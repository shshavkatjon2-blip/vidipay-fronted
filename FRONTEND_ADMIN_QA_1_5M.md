# VidiPay Frontend/Admin QA For 1.5M

This repo contains the Telegram Mini App frontend and the admin panel entry file.

Production frontend files that must stay in repo root:

```text
admin.html
app-v3.html
app-v4.html
app-v5.html
app-v6.html
config.js
index.html
```

Static guard:

```powershell
node .\tools\verify-frontend-admin-static-1_5m.js
```

The guard blocks these regressions:

- old HUMO/UZCARD/TRC20/TRON/bank-card payment wording
- old `Open TON Wallet`, `open manually`, backend connection, no-kyc wording
- wrong production backend URL in `config.js`
- missing TON activation, unique deposit address, notification translation, growth lock, or deposit refund markers
- broken inline JavaScript syntax in the HTML files

Backend, scanner, signer, SQL, env, and wallet key files do not belong in this frontend upload batch.
