'use strict';
const loginView = document.querySelector('#login-view');
const dashboardView = document.querySelector('#dashboard-view');
const loginForm = document.querySelector('#login-form');
const loginButton = document.querySelector('#login-button');
const loginMessage = document.querySelector('#login-message');
const logoutButton = document.querySelector('#logout-button');
let csrfToken = '';
let currentUser = null;

function showDashboard(user) {
  currentUser = user;
  loginView.classList.add('hidden');
  dashboardView.classList.remove('hidden');
  document.querySelector('#welcome-title').textContent = 'Olá, ' + user.name + '!';
  document.querySelector('#user-role').textContent = 'Perfil de acesso: ' + (user.roleLabel || user.role);
  const canManage = ['admin', 'direction', 'secretariat'].includes(user.role);
  document.querySelector('#class-form').classList.toggle('hidden', !canManage);
  document.querySelector('#student-form').classList.toggle('hidden', !canManage);
  document.querySelector('#trip-form').classList.toggle('hidden', !canManage);
  document.querySelector('#trip-assignment').classList.toggle('hidden', !canManage);
  document.querySelector('#users-tab').classList.toggle('hidden', !canManage);
  document.querySelector('#registration-requests-section').classList.toggle('hidden', user.role !== 'admin');
  document.querySelectorAll('[data-admin-only]').forEach(option => { option.hidden = user.role !== 'admin'; });
  loadClasses();
  loadStudents();
  loadTrips();
  if (user.role === 'admin') loadRegistrationRequests();
}
function showLogin() {
  currentUser = null;
  dashboardView.classList.add('hidden');
  loginView.classList.remove('hidden');
  csrfToken = '';
}
async function api(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
  return data;
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function classLabel(item) {
  const level = item.level === 'fundamental' ? 'Fundamental' : 'Médio';
  const course = item.course === 'adm' ? 'Técnico ADM' : item.course === 'ds' ? 'Técnico DS' : 'Regular';
  return level + ' · ' + item.grade + ' · ' + course + ' · Turma ' + item.section + ' · ' + item.school_year;
}
function showMessage(selector, message, isError = false) {
  const element = document.querySelector(selector);
  element.textContent = message;
  element.classList.toggle('error-text', isError);
}
async function loadClasses() {
  const list = document.querySelector('#classes-list');
  try {
    const data = await api('/api/classes');
    document.querySelector('#classes-count').textContent = String(data.classes.length);
    list.innerHTML = data.classes.length ? data.classes.map(item =>
      '<article class="data-row"><strong>' + escapeHtml(classLabel(item)) + '</strong></article>'
    ).join('') : '<p class="muted">Nenhuma turma cadastrada.</p>';
    const select = document.querySelector('#student-class');
    const previous = select.value;
    select.innerHTML = '<option value="">Selecione uma turma</option>' + data.classes.map(item =>
      '<option value="' + item.id + '">' + escapeHtml(classLabel(item)) + '</option>'
    ).join('');
    if (previous) select.value = previous;
    const tripClassSelect = document.querySelector('#trip-class-select');
    if (tripClassSelect) {
      const selectedClass = tripClassSelect.value;
      tripClassSelect.innerHTML = '<option value="">Selecione uma turma</option>' + data.classes.map(item =>
        '<option value="' + item.id + '">' + escapeHtml(classLabel(item)) + '</option>'
      ).join('');
      if (selectedClass) tripClassSelect.value = selectedClass;
    }
  } catch (error) { list.textContent = error.message; }
}
async function loadStudents() {
  const list = document.querySelector('#students-list');
  try {
    const data = await api('/api/students');
    document.querySelector('#students-count').textContent = String(data.students.length);
    list.innerHTML = data.students.length ? data.students.map(item =>
      '<article class="data-row"><strong>' + escapeHtml(item.full_name) + '</strong><span>' +
      escapeHtml(classLabel(item)) + '</span></article>'
    ).join('') : '<p class="muted">Nenhum estudante cadastrado ou vinculado a este perfil.</p>';
    const tripStudentSelect = document.querySelector('#trip-student-select');
    if (tripStudentSelect) {
      const previous = tripStudentSelect.value;
      tripStudentSelect.innerHTML = '<option value="">Selecione um estudante</option>' + data.students.map(item =>
        '<option value="' + item.id + '">' + escapeHtml(item.full_name + ' · ' + classLabel(item)) + '</option>'
      ).join('');
      if (previous) tripStudentSelect.value = previous;
    }
  } catch (error) { list.textContent = error.message; }
}

function dateLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data não informada' : date.toLocaleString('pt-BR');
}
async function loadTrips() {
  const list = document.querySelector('#trips-list');
  try {
    const data = await api('/api/trips');
    document.querySelector('#trips-count').textContent = String(data.trips.length);
    const canManage = currentUser && ['admin', 'direction', 'secretariat'].includes(currentUser.role);
    list.innerHTML = data.trips.length ? data.trips.map(trip => {
      let action = '';
      if (canManage && trip.status === 'draft') action = '<button type="button" class="small-action" data-trip-action="submit" data-trip-id="' + trip.id + '">Enviar para aprovação</button>';
      if (currentUser && ['admin', 'direction'].includes(currentUser.role) && trip.status === 'pending_approval') action = '<button type="button" class="small-action" data-trip-action="approve" data-trip-id="' + trip.id + '">Aprovar viagem</button>';
      return '<article class="trip-card"><div class="trip-card-main"><div class="trip-title-row"><strong>' + escapeHtml(trip.title) + '</strong><span class="status-pill status-' + escapeHtml(trip.status) + '">' + escapeHtml(trip.statusLabel) + '</span></div><p>' + escapeHtml(trip.destination) + '</p><small>Saída: ' + escapeHtml(dateLabel(trip.departure_at)) + '</small><small>Retorno: ' + escapeHtml(dateLabel(trip.return_at)) + '</small><small>Participantes: ' + trip.participant_count + ' / ' + trip.capacity + '</small></div>' + action + '</article>';
    }).join('') : '<p class="muted">Nenhuma viagem cadastrada.</p>';
    const options = '<option value="">Selecione uma viagem</option>' + data.trips.filter(t => t.status === 'draft').map(t =>
      '<option value="' + t.id + '">' + escapeHtml(t.title + ' · ' + t.destination) + '</option>'
    ).join('');
    document.querySelector('#trip-class-trip').innerHTML = options;
    document.querySelector('#trip-student-trip').innerHTML = options;
  } catch (error) { list.textContent = error.message; }
}
async function loadRegistrationRequests() {
  if (!currentUser || currentUser.role !== 'admin') return;
  const list = document.querySelector('#registration-requests-list');
  const count = document.querySelector('#registration-requests-count');
  try {
    const data = await api('/api/registration-requests');
    count.textContent = String(data.requests.length);
    list.innerHTML = data.requests.length ? data.requests.map(item =>
      '<article class="data-row registration-request-row"><div class="registration-request-details"><strong>' + escapeHtml(item.name) + '</strong><span>' +
      escapeHtml(item.email) + ' · ' + escapeHtml(item.roleLabel) + '</span><small>Recebida em ' + escapeHtml(dateLabel(item.created_at)) + '</small></div>' +
      '<div class="registration-actions"><button type="button" class="small-action" data-registration-action="approve" data-registration-id="' + item.id + '">Aprovar</button>' +
      '<button type="button" class="small-action reject-action" data-registration-action="reject" data-registration-id="' + item.id + '">Rejeitar</button></div></article>'
    ).join('') : '<p class="muted">Não há solicitações aguardando aprovação.</p>';
  } catch (error) {
    list.textContent = error.message;
  }
}
document.querySelector('#registration-requests-list').addEventListener('click', async event => {
  const button = event.target.closest('[data-registration-action]');
  if (!button || !currentUser || currentUser.role !== 'admin') return;
  button.disabled = true;
  try {
    const result = await api('/api/registration-requests/' + Number(button.dataset.registrationId) + '/' + button.dataset.registrationAction, {
      method: 'POST', body: '{}'
    });
    showMessage('#registration-requests-message', result.message);
    await loadRegistrationRequests();
  } catch (error) {
    showMessage('#registration-requests-message', error.message, true);
    button.disabled = false;
  }
});
document.querySelector('#trip-form').addEventListener('submit', async event => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  payload.capacity = Number(payload.capacity);
  payload.departure_at = new Date(payload.departure_at).toISOString();
  payload.return_at = new Date(payload.return_at).toISOString();
  try {
    const result = await api('/api/trips', { method: 'POST', body: JSON.stringify(payload) });
    event.currentTarget.reset();
    showMessage('#trip-message', result.message);
    await loadTrips();
  } catch (error) { showMessage('#trip-message', error.message, true); }
});
document.querySelector('#trip-class-form').addEventListener('submit', async event => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    const result = await api('/api/trips/' + Number(payload.trip_id) + '/classes', {
      method: 'POST', body: JSON.stringify({ class_id: Number(payload.class_id) })
    });
    showMessage('#trip-message', result.message);
  } catch (error) { showMessage('#trip-message', error.message, true); }
});
document.querySelector('#trip-student-form').addEventListener('submit', async event => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    const result = await api('/api/trips/' + Number(payload.trip_id) + '/students', {
      method: 'POST', body: JSON.stringify({ student_id: Number(payload.student_id) })
    });
    showMessage('#trip-message', result.message);
    await loadTrips();
  } catch (error) { showMessage('#trip-message', error.message, true); }
});
document.querySelector('#trips-list').addEventListener('click', async event => {
  const button = event.target.closest('[data-trip-action]');
  if (!button) return;
  button.disabled = true;
  try {
    const result = await api('/api/trips/' + button.dataset.tripId + '/' + button.dataset.tripAction, { method: 'POST', body: '{}' });
    showMessage('#trip-message', result.message);
    await loadTrips();
  } catch (error) {
    showMessage('#trip-message', error.message, true);
    button.disabled = false;
  }
});

document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab === button));
  document.querySelectorAll('.module-panel').forEach(panel => panel.classList.toggle('hidden', panel.id !== button.dataset.tab));
}));
document.querySelector('#class-form').addEventListener('submit', async event => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  payload.school_year = Number(payload.school_year);
  try {
    const result = await api('/api/classes', { method: 'POST', body: JSON.stringify(payload) });
    event.currentTarget.reset();
    event.currentTarget.elements.school_year.value = String(new Date().getFullYear());
    showMessage('#class-message', result.message);
    await loadClasses();
  } catch (error) { showMessage('#class-message', error.message, true); }
});
document.querySelector('#student-form').addEventListener('submit', async event => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  payload.class_id = Number(payload.class_id);
  try {
    const result = await api('/api/students', { method: 'POST', body: JSON.stringify(payload) });
    event.currentTarget.reset();
    showMessage('#student-message', result.message);
    await loadStudents();
  } catch (error) { showMessage('#student-message', error.message, true); }
});
const registrationForm = document.querySelector('#registration-form');
const registrationMessage = document.querySelector('#registration-message');
const loginHelper = document.querySelector('#login-view .helper');
document.querySelector('#show-registration').addEventListener('click', () => {
  loginForm.classList.add('hidden');
  registrationForm.classList.remove('hidden');
  document.querySelector('#show-registration').classList.add('hidden');
  loginHelper.classList.add('hidden');
  registrationMessage.textContent = '';
});
document.querySelector('#hide-registration').addEventListener('click', () => {
  registrationForm.classList.add('hidden');
  loginForm.classList.remove('hidden');
  document.querySelector('#show-registration').classList.remove('hidden');
  loginHelper.classList.remove('hidden');
  registrationMessage.textContent = '';
});
registrationForm.addEventListener('submit', async event => {
  event.preventDefault();
  registrationMessage.textContent = '';
  registrationMessage.classList.remove('error-text');
  const values = Object.fromEntries(new FormData(registrationForm).entries());
  if (values.password !== values.password_confirm) {
    showMessage('#registration-message', 'As senhas não coincidem.', true);
    return;
  }
  const button = document.querySelector('#registration-submit');
  button.disabled = true;
  button.textContent = 'Enviando...';
  try {
    const result = await api('/api/registration-requests', {
      method: 'POST',
      body: JSON.stringify({ name: values.name, email: values.email, role: values.role, password: values.password })
    });
    registrationForm.reset();
    showMessage('#registration-message', result.message);
  } catch (error) {
    showMessage('#registration-message', error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = 'Enviar solicitação';
  }
});
document.querySelector('#user-form').addEventListener('submit', async event => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    const result = await api('/api/users', { method: 'POST', body: JSON.stringify(payload) });
    event.currentTarget.reset();
    showMessage('#user-message', result.message + ' Perfil: ' + result.user.roleLabel);
  } catch (error) { showMessage('#user-message', error.message, true); }
});
function applyTheme(mode) {
  const dark = mode === 'dark';
  document.body.classList.toggle('dark-mode', dark);
  const button = document.querySelector('#theme-toggle');
  button.innerHTML = (dark ? '☀ <span>Tema claro</span>' : '☾ <span>Tema escuro</span>');
  button.setAttribute('aria-label', dark ? 'Mudar para tema claro' : 'Mudar para tema escuro');
  button.setAttribute('aria-pressed', String(dark));
}
let savedTheme = 'light';
try {
  const storedTheme = localStorage.getItem('sgve-theme-mode');
  if (storedTheme === 'light' || storedTheme === 'dark') savedTheme = storedTheme;
} catch (_) {}
applyTheme(savedTheme);
document.querySelector('#theme-toggle').addEventListener('click', () => {
  const next = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem('sgve-theme-mode', next); } catch (_) {}
});
async function restoreSession() {
  try {
    const data = await api('/api/auth/me');
    csrfToken = data.csrfToken;
    showDashboard(data.user);
  } catch { showLogin(); }
}
loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  loginMessage.textContent = '';
  loginButton.disabled = true;
  loginButton.textContent = 'Verificando...';
  const form = new FormData(loginForm);
  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: form.get('email'), password: form.get('password') })
    });
    csrfToken = data.csrfToken;
    loginForm.reset();
    showDashboard(data.user);
  } catch (error) { loginMessage.textContent = error.message; }
  finally { loginButton.disabled = false; loginButton.textContent = 'Entrar no sistema'; }
});
logoutButton.addEventListener('click', async () => {
  logoutButton.disabled = true;
  try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); showLogin(); }
  catch (error) { window.alert(error.message); }
  finally { logoutButton.disabled = false; }
});
restoreSession();
