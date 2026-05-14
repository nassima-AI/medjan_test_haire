const serviceSelect = document.getElementById('service');
const depositSelect = document.getElementById('deposit');
const sumService = document.getElementById('sumService');
const sumPrice = document.getElementById('sumPrice');
const sumDuration = document.getElementById('sumDuration');
const sumDeposit = document.getElementById('sumDeposit');
const bookingForm = document.getElementById('bookingForm');
const registerForm = document.getElementById('registerForm');
const loginForm = document.getElementById('loginForm');
const logoutBtn = document.getElementById('logoutBtn');
const accountStatus = document.getElementById('accountStatus');
const myBookings = document.getElementById('myBookings');
const contactForm = document.getElementById('contactForm');
const toast = document.getElementById('toast');
const toastTitle = document.getElementById('toastTitle');
const toastMessage = document.getElementById('toastMessage');
const apiStatus = document.getElementById('apiStatus');
const paymentStatus = document.getElementById('paymentStatus');
const whatsappStatus = document.getElementById('whatsappStatus');
const configPanel = document.getElementById('configPanel');
const whatsInfo = document.getElementById('whatsInfo');
const serverState = document.getElementById('serverState');
const mobileToggle = document.getElementById('mobileToggle');
const mainNav = document.getElementById('mainNav');

function showToast(title, message) {
  toastTitle.textContent = title;
  toastMessage.textContent = message;
  toast.classList.add('show');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Erreur serveur');
  return data;
}

function updateSummary() {
  const [serviceName, price, duration] = serviceSelect.value.split('|');
  sumService.textContent = serviceName;
  sumPrice.textContent = `${price} €`;
  sumDuration.textContent = `${duration} min`;
  sumDeposit.textContent = 'Aucun';
}

function renderBookings(bookings) {
  if (!bookings.length) {
    myBookings.innerHTML = '<div class="booking-item"><strong>Aucun rendez-vous</strong><p>Vos prochaines demandes apparaîtront ici.</p></div>';
    return;
  }
  myBookings.innerHTML = bookings.map((booking) => `
    <div class="booking-item">
      <strong>${booking.serviceName}</strong>
      <p>${booking.appointmentDate} à ${booking.appointmentTime}</p>
      <p>Statut : ${booking.bookingStatus} • Paiement en ligne : non</p>
      <p>${booking.email}</p>
    </div>
  `).join('');
}

async function refreshSession() {
  try {
    const result = await api('/api/auth/me');
    accountStatus.textContent = `Connectée : ${result.user.name} (${result.user.email})`;
    const bookings = await api('/api/bookings/me');
    renderBookings(bookings.bookings);
  } catch {
    accountStatus.textContent = 'Aucune session active.';
    myBookings.innerHTML = '';
  }
}

async function loadConfig() {
  try {
    const health = await api('/api/health');
    const config = await api('/api/config');
    serverState.textContent = 'Serveur actif';
    apiStatus.textContent = 'Disponible';
    paymentStatus.textContent = 'Désactivé';
    whatsappStatus.textContent = health.whatsappConfigured ? 'Configuré' : 'À configurer';
    configPanel.textContent = `${config.salonName} est chargé. Le paiement en ligne est désactivé et le contact peut se faire par téléphone, e-mail ou WhatsApp.`;
    whatsInfo.textContent = config.whatsappUrl ? 'Lien WhatsApp configuré' : '06 50 03 97 86';
  } catch {
    serverState.textContent = 'Serveur indisponible';
    apiStatus.textContent = 'Hors ligne';
    paymentStatus.textContent = 'Désactivé';
    whatsappStatus.textContent = 'Inconnu';
    configPanel.textContent = 'Le front est prêt, mais le serveur doit être lancé pour activer les fonctionnalités.';
  }
}

serviceSelect.addEventListener('change', updateSummary);
depositSelect.addEventListener('change', updateSummary);
updateSummary();

document.querySelectorAll('.select-service').forEach((button) => {
  button.addEventListener('click', () => {
    serviceSelect.value = button.dataset.service;
    updateSummary();
    document.getElementById('reservation').scrollIntoView({ behavior: 'smooth' });
    showToast('Prestation sélectionnée', 'La prestation a été ajoutée au formulaire.');
  });
});

bookingForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(bookingForm).entries());
  try {
    await api('/api/bookings', { method: 'POST', body: JSON.stringify(payload) });
    showToast('Rendez-vous enregistré', 'La demande a bien été envoyée.');
    bookingForm.reset();
    updateSummary();
    refreshSession();
  } catch (error) {
    showToast('Erreur', error.message);
  }
});

registerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    name: document.getElementById('registerName').value,
    email: document.getElementById('registerEmail').value,
    password: document.getElementById('registerPassword').value
  };
  try {
    await api('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) });
    registerForm.reset();
    showToast('Compte créé', 'Votre espace cliente est activé.');
    refreshSession();
  } catch (error) {
    showToast('Erreur', error.message);
  }
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    email: document.getElementById('loginEmail').value,
    password: document.getElementById('loginPassword').value
  };
  try {
    await api('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) });
    loginForm.reset();
    showToast('Connexion réussie', 'Bienvenue dans votre espace cliente.');
    refreshSession();
  } catch (error) {
    showToast('Erreur', error.message);
  }
});

logoutBtn.addEventListener('click', async () => {
  try {
    await api('/api/auth/logout', { method: 'POST' });
    showToast('Déconnexion', 'Vous êtes déconnectée.');
    refreshSession();
  } catch (error) {
    showToast('Erreur', error.message);
  }
});

contactForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    name: document.getElementById('contactName').value,
    email: document.getElementById('contactEmail').value,
    subject: document.getElementById('contactSubject').value,
    message: document.getElementById('contactMessage').value
  };
  try {
    await api('/api/contact', { method: 'POST', body: JSON.stringify(payload) });
    contactForm.reset();
    showToast('Message envoyé', 'Votre message a bien été enregistré.');
  } catch (error) {
    showToast('Erreur', error.message);
  }
});

mobileToggle.addEventListener('click', () => {
  mainNav.classList.toggle('open');
});

document.querySelectorAll('.nav a').forEach((link) => {
  link.addEventListener('click', () => mainNav.classList.remove('open'));
});

const dateInput = document.getElementById('date');
const now = new Date();
const yyyy = now.getFullYear();
const mm = String(now.getMonth() + 1).padStart(2, '0');
const dd = String(now.getDate()).padStart(2, '0');
dateInput.min = `${yyyy}-${mm}-${dd}`;

loadConfig();
refreshSession();