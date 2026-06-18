const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const GAME_URL = process.env.GAME_URL;
const APP_VERSION = 'wallet-ui-clean-v2-20260619';

if (!BOT_TOKEN) {
    throw new Error('BOT_TOKEN .env ichida yoq');
}
if (!GAME_URL) {
    throw new Error('GAME_URL .env ichida yoq');
}

const bot = new Telegraf(BOT_TOKEN);

bot.start((ctx) => {
    const firstname = ctx.from.first_name || 'Foydalanuvchi';
    const payload = ctx.startPayload || '';
    const url = new URL(GAME_URL);

    if (payload) {
        url.searchParams.set('ref', payload);
        url.searchParams.set('startapp', payload);
        url.searchParams.set('tgWebAppStartParam', payload);
    }
    url.searchParams.set('app_v', APP_VERSION);
    url.searchParams.set('open_ts', String(Date.now()));

    ctx.reply(
        `Xush kelibsiz, ${firstname}!\n\nVidi Pay ilovasini ochish uchun pastdagi tugmani bosing:`,
        Markup.inlineKeyboard([
            [Markup.button.webApp("O'yinni boshlash", url.toString())]
        ])
    );
});

bot.launch().then(() => {
    console.log('Bot ishga tushdi. Telegramda /start buyrugini bosing.');
}).catch((err) => {
    console.error('Botni yoqishda xatolik:', err);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
