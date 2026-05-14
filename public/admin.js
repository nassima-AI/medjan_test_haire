const adminLoginForm = document.getElementById('adminLoginForm');
const adminLogoutBtn = document.getElementById('adminLogoutBtn');
const adminStats = document.getElementById('adminStats');
const adminBookings = document.getElementById('adminBookings');
const adminMessages = document.getElementById('adminMessages');
const adminUsers = document.getElementById('adminUsers');
const toast = document.getElementById('toast');
const toastTitle = document.getElementById('toastTitle');
const toastMessage = document.getElementById('toastMessage');

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

function renderBookings(bookings) {
  adminBookings.innerHTML = bookings.length ? bookings.map((booking) => `
    <div class="admin-item">
      <strong>${booking.serviceName}</strong>
      <p>${booking.fullName} • ${booking.email}</p>
      <p>${booking.appointmentDate} à ${booking.appointmentTime}</p>
      <p>Acompte : ${booking.depositAmount} € • Paiement : ${booking.paymentStatus}</p>
      <select class="admin-select booking-status" data-booking-id="${booking.id}">
        <option ${booking.bookingStatus === 'En attente' ? 'selected' : ''}>En attente</option>
        <option ${booking.bookingStatus === 'Confirmé' ? 'selected' : ''}>Confirmé</option>
        <option ${booking.bookingStatus === 'Terminé' ? 'selected' : ''}>Terminé</option>
        <option ${booking.bookingStatus === 'Annulé' ? 'selected' : ''}>Annulé</option>
      </select>
    </div>
  `).join('') : '<div class="admin-item"><strong>Aucune réservation</strong><p>Les nouvelles demandes apparaîtront ici.</p></div>';
}

function renderMessages(messages) {
  adminMessages.innerHTML = messages.length ? messages.map((message) => `
    <div class="admin-item">
      <strong>${message.subject}</strong>
      <p>${message.name} • ${message.email}</p>
      <p>${message.message}</p>
    </div>
  `).join('') : '<div class="admin-item"><strong>Aucun message</strong><p>Les messages clients apparaîtront ici.</p></div>';
}

function renderUsers(users) {
  adminUsers.innerHTML = users.length ? users.map((user) => `
    <div class="admin-item">
      <strong>${user.name}</strong>
      <p>${user.email}</p>
      <p>Inscrite le ${new Date(user.createdAt).toLocaleDateString('fr-FR')}</p>
    </div>
  `).join('') : '<div class="admin-item"><strong>Aucune cliente</strong><p>Les inscriptions apparaîtront ici.</p></div>';
}

async function refreshDashboard() {
  try {
    const result = await api('/api/admin/dashboard');
    adminStats.innerHTML = `
      <div class="proof-card"><strong>${result.stats.bookings}</strong><span>réservations</span></div>
      <div class="proof-card"><strong>${result.stats.messages}</strong><span>messages</span></div>
      <div class="proof-card"><strong>${result.stats.users}</strong><span>clientes</span></div>
    `;
    renderBookings(result.bookings);
    renderMessages(result.messages);
    renderUsers(result.users);
  } catch {
    adminBookings.innerHTML = '<div class="admin-item"><strong>Connexion requise</strong><p>Connecte-toi pour afficher les réservations.</p></div>';
    adminMessages.innerHTML = '<div class="admin-item"><strong>Connexion requise</strong><p>Connecte-toi pour afficher les messages.</p></div>';
    adminUsers.innerHTML = '<div class="admin-item"><strong>Connexion requise</strong><p>Connecte-toi pour afficher les clientes.</p></div>';
  }
}

adminLoginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    email: document.getElementById('adminEmail').value,
    password: document.getElementById('adminPassword').value
  };
  try {
    await api('/api/admin/login', { method: 'POST', body: JSON.stringify(payload) });
    showToast('Connexion admin', 'Le tableau de bord est disponible.');
    refreshDashboard();
  } catch (error) {
    showToast('Erreur', error.message);
  }
});

adminLogoutBtn.addEventListener('click', async () => {
  try {
    await api('/api/admin/logout', { method: 'POST' });
    showToast('Déconnexion', 'La session administrateur est fermée.');
    refreshDashboard();
  } catch (error) {
    showToast('Erreur', error.message);
  }
});

adminBookings.addEventListener('change', async (event) => {
  if (!event.target.classList.contains('booking-status')) return;
  const bookingId = event.target.dataset.bookingId;
  const bookingStatus = event.target.value;
  try {
    await api(`/api/admin/bookings/${bookingId}`, { method: 'PATCH', body: JSON.stringify({ bookingStatus }) });
    showToast('Statut mis à jour', 'La réservation a été mise à jour.');
    refreshDashboard();
  } catch (error) {
    showToast('Erreur', error.message);
  }
});

refreshDashboard();
