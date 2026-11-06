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
  document.querySelector('#users-tab').classList.toggle('hidden', !canManage);
  document.querySelectorAll('[data-admin-only]').forEach(option => { option.hidden = user.role !== 'admin'; });
  loadClasses();
  loadStudents();
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
  } catch (error) { list.textContent = error.message; }
}
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
document.querySelector('#user-form').addEventListener('submit', async event => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    const result = await api('/api/users', { method: 'POST', body: JSON.stringify(payload) });
    event.currentTarget.reset();
    showMessage('#user-message', result.message + ' Perfil: ' + result.user.roleLabel);
  } catch (error) { showMessage('#user-message', error.message, true); }
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
