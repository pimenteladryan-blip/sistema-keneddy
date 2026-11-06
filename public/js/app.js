'use strict';
const loginView = document.querySelector('#login-view');
const dashboardView = document.querySelector('#dashboard-view');
const loginForm = document.querySelector('#login-form');
const loginButton = document.querySelector('#login-button');
const loginMessage = document.querySelector('#login-message');
const logoutButton = document.querySelector('#logout-button');
let csrfToken = '';

function showDashboard(user) {
  loginView.classList.add('hidden');
  dashboardView.classList.remove('hidden');
  document.querySelector('#welcome-title').textContent = 'Olá, ' + user.name + '!';
  document.querySelector('#user-role').textContent = 'Perfil de acesso: ' + user.role;
}
function showLogin() {
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
  } catch (error) {
    loginMessage.textContent = error.message;
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = 'Entrar no sistema';
  }
});
logoutButton.addEventListener('click', async () => {
  logoutButton.disabled = true;
  try {
    await api('/api/auth/logout', { method: 'POST', body: '{}' });
    showLogin();
  } catch (error) {
    window.alert(error.message);
  } finally { logoutButton.disabled = false; }
});
restoreSession();
