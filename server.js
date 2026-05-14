require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-this';
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || 'admin@votresalon.fr').toLowerCase();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || 'change-me-now');
const SALON_NAME = process.env.SALON_NAME || 'Medjan Hair';
const STRIPE_PAYMENT_LINK = process.env.STRIPE_PAYMENT_LINK || '';
const WHATSAPP_URL = process.env.WHATSAPP_URL || '';
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const STORE_PATH = path.join(DATA_DIR, 'app.json');
const USER_COOKIE = 'me_user_token';
const ADMIN_COOKIE = 'me_admin_token';

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(STORE_PATH)) {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: [], bookings: [], messages: [] }, null, 2));
}

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 250, standardHeaders: true, legacyHeaders: false }));
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());
app.use(morgan('dev'));
app.use(express.static(PUBLIC_DIR));

function readStore() {
  return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
}

function writeStore(data) {
  const tempPath = `${STORE_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  fs.renameSync(tempPath, STORE_PATH);
}

function sanitize(value = '') {
  return String(value).trim();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseService(serviceRaw) {
  const value = sanitize(serviceRaw);
  const [serviceName, priceRaw, durationRaw] = value.split('|');
  const servicePrice = Number(priceRaw || 0);
  const serviceDuration = Number(durationRaw || 0);
  if (!serviceName || !servicePrice || !serviceDuration) return null;
  return { serviceName, servicePrice, serviceDuration };
}

function generateId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedValue) {
  const [salt, originalHash] = String(storedValue || '').split(':');
  if (!salt || !originalHash) return false;
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(originalHash, 'hex'));
}

function signUserToken(user) {
  return jwt.sign({ sub: user.id, role: 'user', email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

function signAdminToken() {
  return jwt.sign({ sub: 'admin', role: 'admin', email: ADMIN_EMAIL }, JWT_SECRET, { expiresIn: '1d' });
}

function setAuthCookie(res, name, token) {
  res.cookie(name, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 7
  });
}

function clearAuthCookie(res, name) {
  res.clearCookie(name, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
}

function toPublicUser(user) {
  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
}

function getUserFromReq(req) {
  const token = req.cookies[USER_COOKIE];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'user') return null;
    const store = readStore();
    return store.users.find((user) => user.id === payload.sub) || null;
  } catch {
    return null;
  }
}

function requireUser(req, res, next) {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ ok: false, message: 'Connexion requise.' });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  const token = req.cookies[ADMIN_COOKIE];
  if (!token) return res.status(401).json({ ok: false, message: 'Connexion administrateur requise.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'admin') throw new Error('bad role');
    req.admin = payload;
    next();
  } catch {
    return res.status(401).json({ ok: false, message: 'Session administrateur invalide.' });
  }
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, salonName: SALON_NAME, paymentLinkConfigured: Boolean(STRIPE_PAYMENT_LINK), whatsappConfigured: Boolean(WHATSAPP_URL) });
});

app.get('/api/config', (req, res) => {
  res.json({ ok: true, salonName: SALON_NAME, paymentLink: STRIPE_PAYMENT_LINK, whatsappUrl: WHATSAPP_URL });
});

app.post('/api/auth/register', (req, res) => {
  const store = readStore();
  const name = sanitize(req.body.name);
  const email = sanitize(req.body.email).toLowerCase();
  const password = String(req.body.password || '');

  if (!name || !email || !password) return res.status(400).json({ ok: false, message: 'Tous les champs sont obligatoires.' });
  if (!isValidEmail(email)) return res.status(400).json({ ok: false, message: 'Adresse e-mail invalide.' });
  if (password.length < 6) return res.status(400).json({ ok: false, message: 'Le mot de passe doit contenir au moins 6 caractères.' });
  if (store.users.some((user) => user.email === email)) return res.status(409).json({ ok: false, message: 'Un compte existe déjà avec cet e-mail.' });

  const user = {
    id: generateId('user'),
    name,
    email,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString()
  };
  store.users.unshift(user);
  writeStore(store);
  setAuthCookie(res, USER_COOKIE, signUserToken(user));
  res.json({ ok: true, user: toPublicUser(user) });
});

app.post('/api/auth/login', (req, res) => {
  const store = readStore();
  const email = sanitize(req.body.email).toLowerCase();
  const password = String(req.body.password || '');
  const user = store.users.find((item) => item.email === email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ ok: false, message: 'Identifiants invalides.' });
  }
  setAuthCookie(res, USER_COOKIE, signUserToken(user));
  res.json({ ok: true, user: toPublicUser(user) });
});

app.post('/api/auth/logout', (req, res) => {
  clearAuthCookie(res, USER_COOKIE);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ ok: false, message: 'Aucune session active.' });
  res.json({ ok: true, user: toPublicUser(user) });
});

app.post('/api/bookings', (req, res) => {
  const store = readStore();
  const user = getUserFromReq(req);
  const fullName = sanitize(req.body.fullName);
  const phone = sanitize(req.body.phone);
  const email = sanitize(req.body.email).toLowerCase();
  const service = parseService(req.body.service);
  const appointmentDate = sanitize(req.body.date);
  const appointmentTime = sanitize(req.body.time);
  const depositAmount = Number(req.body.deposit || 0);
  const confirmMode = sanitize(req.body.confirmMode);
  const notes = sanitize(req.body.notes);

  if (!fullName || !phone || !email || !service || !appointmentDate || !appointmentTime || !confirmMode) {
    return res.status(400).json({ ok: false, message: 'Veuillez compléter tous les champs requis.' });
  }
  if (!isValidEmail(email)) return res.status(400).json({ ok: false, message: 'Adresse e-mail invalide.' });

  const booking = {
    id: generateId('rdv'),
    userId: user ? user.id : null,
    fullName,
    phone,
    email,
    serviceName: service.serviceName,
    servicePrice: service.servicePrice,
    serviceDuration: service.serviceDuration,
    appointmentDate,
    appointmentTime,
    depositAmount,
    paymentStatus: 'Désactivé',
    bookingStatus: 'En attente',
    confirmMode,
    notes,
    createdAt: new Date().toISOString()
  };

  store.bookings.unshift(booking);
  writeStore(store);
  res.json({ ok: true, booking, paymentLink: STRIPE_PAYMENT_LINK || null });
});

app.get('/api/bookings/me', requireUser, (req, res) => {
  const store = readStore();
  const bookings = store.bookings.filter((booking) => booking.userId === req.user.id || booking.email === req.user.email);
  res.json({ ok: true, bookings });
});

app.post('/api/contact', (req, res) => {
  const store = readStore();
  const name = sanitize(req.body.name);
  const email = sanitize(req.body.email).toLowerCase();
  const subject = sanitize(req.body.subject);
  const message = sanitize(req.body.message);

  if (!name || !email || !subject || !message) return res.status(400).json({ ok: false, message: 'Tous les champs sont requis.' });
  if (!isValidEmail(email)) return res.status(400).json({ ok: false, message: 'Adresse e-mail invalide.' });

  store.messages.unshift({ id: generateId('msg'), name, email, subject, message, createdAt: new Date().toISOString() });
  writeStore(store);
  res.json({ ok: true, message: 'Message envoyé.' });
});

app.post('/api/admin/login', (req, res) => {
  const email = sanitize(req.body.email).toLowerCase();
  const password = String(req.body.password || '');
  if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, message: 'Accès administrateur refusé.' });
  }
  setAuthCookie(res, ADMIN_COOKIE, signAdminToken());
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  clearAuthCookie(res, ADMIN_COOKIE);
  res.json({ ok: true });
});

app.get('/api/admin/dashboard', requireAdmin, (req, res) => {
  const store = readStore();
  res.json({
    ok: true,
    stats: {
      bookings: store.bookings.length,
      messages: store.messages.length,
      users: store.users.length
    },
    bookings: store.bookings,
    messages: store.messages,
    users: store.users.map(toPublicUser)
  });
});

app.patch('/api/admin/bookings/:id', requireAdmin, (req, res) => {
  const store = readStore();
  const bookingStatus = sanitize(req.body.bookingStatus);
  const validStatuses = ['En attente', 'Confirmé', 'Terminé', 'Annulé'];
  if (!validStatuses.includes(bookingStatus)) return res.status(400).json({ ok: false, message: 'Statut invalide.' });
  const booking = store.bookings.find((item) => item.id === req.params.id);
  if (!booking) return res.status(404).json({ ok: false, message: 'Réservation introuvable.' });
  booking.bookingStatus = bookingStatus;
  writeStore(store);
  res.json({ ok: true, booking });
});

app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));
app.get('*', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

app.listen(PORT, () => {
  console.log(`${SALON_NAME} V4 lancé sur http://localhost:${PORT}`);
});