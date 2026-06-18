// Telegram Web App ob'ektini tekshirish va ishga tushirish
const tg = window.Telegram.WebApp;
tg.expand(); // O'yin oynasini srazu to'liq ekranda ochish

// HTML elementlarni ulab olish
const coin = document.getElementById('coin');
const balanceEl = document.getElementById('balance');
const energyEl = document.getElementById('energy');
const energyBar = document.getElementById('energy-bar');
const usernameEl = document.getElementById('username');

// O'yin ichki o'zgaruvchilari
let balance = parseInt(localStorage.getItem('vidi_balance')) || 0;
let energy = parseInt(localStorage.getItem('vidi_energy')) || 1000;
const maxEnergy = 1000;

// Boshlang'ich qiymatlarni ekranga chiqarish
balanceEl.textContent = balance;
energyEl.textContent = energy;
updateEnergyBar();

// Telegram foydalanuvchi ismini o'rnatish
if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
    usernameEl.textContent = tg.initDataUnsafe.user.first_name;
} else {
    usernameEl.textContent = "Mehmon";
}

// Tanga bosilgandagi hodisa
coin.addEventListener('click', (e) => {
    if (energy > 0) {
        // Balansni oshirish
        balance += 1;
        energy -= 1;

        // Ekranni yangilash
        balanceEl.textContent = balance;
        energyEl.textContent = energy;
        updateEnergyBar();

        // Ma'lumotlarni saqlash
        localStorage.setItem('vidi_balance', balance);
        localStorage.setItem('vidi_energy', energy);

        // Kichik tebranish effekti (faqat telefonda seziladi)
        if (tg.HapticFeedback) {
            tg.HapticFeedback.impactOccurred('medium');
        }
    }
});

// Energiyani panelini foizda yangilash funksiyasi
function updateEnergyBar() {
    const percentage = (energy / maxEnergy) * 100;
    energyBar.style.width = percentage + '%';
}

// Har 1 soniyada energiyani +1 taga qayta tiklash
setInterval(() => {
    if (energy < maxEnergy) {
        energy += 1;
        energyEl.textContent = energy;
        updateEnergyBar();
        localStorage.setItem('vidi_energy', energy);
    }
}, 1000);