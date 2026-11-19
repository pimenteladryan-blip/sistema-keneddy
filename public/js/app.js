'use strict';
const loginView = document.querySelector('#login-view');
const dashboardView = document.querySelector('#dashboard-view');
const loginForm = document.querySelector('#login-form');
const loginButton = document.querySelector('#login-button');
const loginMessage = document.querySelector('#login-message');
const logoutButton = document.querySelector('#logout-button');
const googleLoginButton = document.querySelector('#google-login-button');
const installButton = document.querySelector('#pwa-install');
let deferredInstallPrompt = null;
let csrfToken = '';
let sessionController = new AbortController();
let currentUser = null;
let lastReport = null;
let dashboardTrips = [];
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

function showDashboard(user) {
  sessionController.abort();
  sessionController = new AbortController();
  currentUser = user;
  loginView.classList.add('hidden');
  dashboardView.classList.remove('hidden');
  document.querySelector('#welcome-title').textContent = 'Olá, ' + user.name + '!';
  document.querySelector('#user-role').textContent = 'Perfil de acesso: ' + (user.roleLabel || user.role);
  updateProfileMenu(user);
  const canManage = ['admin', 'direction', 'secretariat'].includes(user.role);
  if (!canManage) lastReport = null;
  document.querySelector('#class-form').classList.toggle('hidden', !canManage);
  document.querySelector('#student-form').classList.toggle('hidden', !canManage);
  document.querySelector('#student-account-form').classList.toggle('hidden', !canManage);
  document.querySelector('#student-guardian-form').classList.toggle('hidden', !canManage);
  document.querySelector('#trip-staff-form').classList.toggle('hidden', !canManage);
  document.querySelector('#students-tab').classList.toggle('hidden', user.role === 'teacher');
  document.querySelector('#trip-form').classList.toggle('hidden', !canManage);
  document.querySelector('#trip-assignment').classList.toggle('hidden', !canManage);
  document.querySelector('#users-tab').classList.toggle('hidden', !canManage);
  document.querySelector('#teachers-tab').classList.toggle('hidden', !canManage);
  document.querySelector('#guardians-tab').classList.toggle('hidden', !canManage);
  document.querySelector('#vehicles-tab').classList.toggle('hidden', !canManage);
  document.querySelector('#reports-tab').classList.toggle('hidden', !canManage);
  document.querySelector('#registration-requests-section').classList.toggle('hidden', user.role !== 'admin');
  document.querySelectorAll('[data-admin-only]').forEach(option => { option.hidden = user.role !== 'admin'; });
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === 'home-panel'));
  document.querySelectorAll('.module-panel').forEach(panel => panel.classList.toggle('hidden', panel.id !== 'home-panel'));
  renderHome();
  loadClasses();
  if (user.role !== 'teacher') loadStudents();
  loadTrips();
  if (canManage) {
    loadLinkableUsers();
    loadTeachers();
    loadVehicles();
    loadDrivers();
    loadReports();
  }
  if (user.role === 'admin') loadRegistrationRequests();
}
function clearDashboardData() {
  dashboardView.querySelectorAll('form').forEach(form => form.reset());
  dashboardView.querySelectorAll('.data-list, tbody').forEach(element => element.replaceChildren());
  dashboardView.querySelectorAll('.count-pill').forEach(element => { element.textContent = '0'; });
  dashboardView.querySelectorAll('.message').forEach(element => { element.textContent = ''; });
  dashboardView.querySelectorAll('select').forEach(select => {
    if (select.options.length) {
      const firstOption = select.options[0].cloneNode(true);
      select.replaceChildren(firstOption);
    }
  });
  document.querySelector('#welcome-title').textContent = 'Olá!';
  document.querySelector('#user-role').textContent = '';
}
function showLogin() {
  sessionController.abort();
  sessionController = new AbortController();
  clearDashboardData();
  currentUser = null;
  lastReport = null;
  dashboardTrips = [];
  dashboardView.classList.add('hidden');
  loginView.classList.remove('hidden');
  csrfToken = '';
}
async function api(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  let response;
  try {
    response = await fetch(url, {
      credentials: 'same-origin', ...options,
      signal: options.signal || sessionController.signal, headers
    });
  } catch (error) {
    throw error;
  }
  const data = await response.json().catch(error => {
    if (error.name === 'AbortError') throw error;
    return {};
  });
  if (response.status === 401 && currentUser) {
    showLogin();
    loginMessage.textContent = 'Sua sessão expirou. Entre novamente para continuar.';
  }
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
  } catch (error) { if (error.name === 'AbortError') return; list.textContent = error.message; }
}
async function loadStudents() {
  const list = document.querySelector('#students-list');
  try {
    const data = await api('/api/students');
    document.querySelector('#students-count').textContent = String(data.students.length);
    list.innerHTML = data.students.length ? data.students.map(item => {
      const initials = String(item.full_name || 'E').trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0)).join('').toUpperCase();
      return '<article class="data-row student-modern-card"><span class="student-avatar" aria-hidden="true">' + escapeHtml(initials) + '</span><div class="student-card-main"><strong>' + escapeHtml(item.full_name) + '</strong><span class="student-class-meta">' + escapeHtml(classLabel(item)) + '</span></div><span class="student-status-pill">Cadastrado</span></article>';
    }).join('') : '<p class="muted">Nenhum estudante cadastrado ou vinculado a este perfil.</p>';
    const tripStudentSelect = document.querySelector('#trip-student-select');
    if (tripStudentSelect) {
      const previous = tripStudentSelect.value;
      tripStudentSelect.innerHTML = '<option value="">Selecione um estudante</option>' + data.students.map(item =>
        '<option value="' + item.id + '">' + escapeHtml(item.full_name + ' · ' + classLabel(item)) + '</option>'
      ).join('');
      if (previous) tripStudentSelect.value = previous;
    }
    const guardianStudentSelect = document.querySelector('#student-guardian-student');
    if (guardianStudentSelect && currentUser && ['admin', 'direction', 'secretariat'].includes(currentUser.role)) {
      const previousGuardianStudent = guardianStudentSelect.value;
      guardianStudentSelect.innerHTML = '<option value="">Selecione um estudante</option>' + data.students.map(item =>
        '<option value="' + item.id + '">' + escapeHtml(item.full_name + ' · ' + classLabel(item)) + '</option>'
      ).join('');
      if (previousGuardianStudent) guardianStudentSelect.value = previousGuardianStudent;
    }
    const accountStudentSelect = document.querySelector('#student-account-select');
    if (accountStudentSelect && currentUser && ['admin', 'direction', 'secretariat'].includes(currentUser.role)) {
      const previousAccountStudent = accountStudentSelect.value;
      accountStudentSelect.innerHTML = '<option value="">Selecione um estudante</option>' + data.students.map(item =>
        '<option value="' + item.id + '">' + escapeHtml(item.full_name + ' · ' + classLabel(item)) + '</option>'
      ).join('');
      if (previousAccountStudent) accountStudentSelect.value = previousAccountStudent;
    }
  } catch (error) { if (error.name === 'AbortError') return; list.textContent = error.message; }
}


async function loadLinkableUsers() {
  if (!currentUser || !['admin', 'direction', 'secretariat'].includes(currentUser.role)) return;
  try {
    const data = await api('/api/linkable-users');
    const guardians = data.users.filter(user => user.role === 'guardian' && user.active);
    const teachers = data.users.filter(user => user.role === 'teacher' && user.active);
    const guardianList = document.querySelector('#guardians-list');
    const guardianCount = document.querySelector('#guardians-count');
    if (guardianList && guardianCount) {
      guardianCount.textContent = String(guardians.length);
      guardianList.innerHTML = guardians.length ? guardians.map(user =>
        '<article class="data-row guardian-row"><div><strong>' + escapeHtml(user.name) + '</strong><small>' + escapeHtml(user.email) + '</small></div><span>Conta ativa</span></article>'
      ).join('') : '<p class="muted">Nenhum responsável cadastrado ainda.</p>';
    }
    const guardianSelect = document.querySelector('#student-guardian-user');
    const previousGuardian = guardianSelect.value;
    guardianSelect.innerHTML = '<option value="">Selecione um responsável</option>' + guardians.map(user =>
      '<option value="' + escapeHtml(user.email) + '">' + escapeHtml(user.name + ' · ' + user.email) + '</option>'
    ).join('');
    if (previousGuardian) guardianSelect.value = previousGuardian;
    const teacherSelect = document.querySelector('#trip-staff-user');
    const previousTeacher = teacherSelect.value;
    teacherSelect.innerHTML = '<option value="">Selecione um professor</option>' + teachers.map(user =>
      '<option value="' + user.id + '">' + escapeHtml(user.name + ' · ' + user.email) + '</option>'
    ).join('');
    if (previousTeacher) teacherSelect.value = previousTeacher;
  } catch (error) {
    if (error.name === 'AbortError') return;
    showMessage('#student-guardian-message', error.message, true);
    showMessage('#trip-staff-message', error.message, true);
  }
}
async function loadTeachers() {
  const list = document.querySelector('#teachers-list');
  const count = document.querySelector('#teachers-count');
  if (!list || !count) return;
  try {
    const data = await api('/api/teachers');
    count.textContent = String(data.teachers.length);
    list.innerHTML = data.teachers.length ? data.teachers.map(teacher =>
      '<article class="data-row"><div><strong>' + escapeHtml(teacher.name) + '</strong><small>Disciplinas: ' +
      escapeHtml(Array.isArray(teacher.subjects) && teacher.subjects.length ? teacher.subjects.join(', ') : 'Não informadas') +
      '</small></div><span>Professor cadastrado</span></article>'
    ).join('') : '<p class="muted">Nenhum professor cadastrado ainda.</p>';
  } catch (error) {
    if (error.name === 'AbortError') return;
    list.textContent = error.message;
  }
}
async function loadVehicles() {
  if (!currentUser || !['admin', 'direction', 'secretariat'].includes(currentUser.role)) return;
  const list = document.querySelector('#vehicles-list');
  try {
    const data = await api('/api/vehicles');
    document.querySelector('#vehicles-count').textContent = String(data.vehicles.length);
    list.innerHTML = data.vehicles.length ? data.vehicles.map(vehicle =>
      '<article class="data-row"><strong>' + escapeHtml(vehicle.name) + '</strong><span>' +
      escapeHtml(vehicle.type) + ' · ' + Number(vehicle.capacity) + ' lugares</span></article>'
    ).join('') : '<p class="muted">Nenhum veículo cadastrado.</p>';
    const select = document.querySelector('#trip-vehicle-select');
    const previous = select.value;
    select.innerHTML = '<option value="">Selecione um veículo</option>' + data.vehicles.map(vehicle =>
      '<option value="' + Number(vehicle.id) + '">' +
      escapeHtml(vehicle.name + ' · ' + vehicle.type + ' · ' + vehicle.capacity + ' lugares') +
      '</option>'
    ).join('');
    if (previous) select.value = previous;
  } catch (error) { if (error.name === 'AbortError') return;
    list.textContent = error.message;
  }
}


function tripStatusLabel(status) {
  return ({
    draft: 'Rascunho', pending_approval: 'Aguardando aprovação',
    approved: 'Aprovada', open: 'Inscrições abertas',
    completed: 'Concluída', cancelled: 'Cancelada'
  })[status] || status;
}

async function loadDrivers() {
  if (!currentUser || !['admin', 'direction', 'secretariat'].includes(currentUser.role)) return;
  const list = document.querySelector('#drivers-list');
  try {
    const data = await api('/api/drivers');
    list.innerHTML = data.drivers.length ? data.drivers.map(driver =>
      '<article class="data-row"><strong>' + escapeHtml(driver.name) + '</strong><span>Condutor cadastrado</span></article>'
    ).join('') : '<p class="muted">Nenhum condutor cadastrado.</p>';
    const select = document.querySelector('#trip-driver-select');
    const previous = select.value;
    select.innerHTML = '<option value="">Selecione um condutor</option>' + data.drivers.map(driver =>
      '<option value="' + Number(driver.id) + '">' + escapeHtml(driver.name) + '</option>'
    ).join('');
    if (previous) select.value = previous;
  } catch (error) { if (error.name === 'AbortError') return;
    list.textContent = error.message;
  }
}

async function loadReports() {
  if (!currentUser || !['admin', 'direction', 'secretariat'].includes(currentUser.role)) return;
  const body = document.querySelector('#report-trips-body');
  try {
    const data = await api('/api/reports/summary');
    lastReport = data;
    const totals = data.totals || {};
    const fields = [
      ['report-trip-count', 'trips'],
      ['report-student-count', 'students'],
      ['report-vehicle-count', 'vehicles'],
      ['report-participant-count', 'participants'],
      ['report-authorized-count', 'authorized'],
      ['report-pending-count', 'pending']
    ];
    for (const [elementId, field] of fields) {
      document.querySelector('#' + elementId).textContent = String(Number(totals[field]) || 0);
    }
    document.querySelector('#report-note').textContent = data.partial
      ? 'Relatório parcial: o limite de consulta foi atingido. Não use estes totais como fechamento oficial.'
      : 'Dados agregados, sem nomes de estudantes. Atualizado em ' + dateLabel(data.generated_at) + '.';
    body.innerHTML = data.trips.length ? data.trips.map(trip =>
      '<tr><td>' + escapeHtml(trip.title) + '<small> · ' + escapeHtml(trip.destination) + '</small></td>' +
      '<td>' + escapeHtml(dateLabel(trip.departure_at)) + '</td>' +
      '<td>' + escapeHtml(tripStatusLabel(trip.status)) + '</td>' +
      '<td>' + Number(trip.participants) + ' / ' + Number(trip.capacity) + '</td>' +
      '<td>' + Number(trip.authorized) + '</td><td>' + Number(trip.pending) + '</td>' +
      '<td>' + Number(trip.departure_present) + ' presentes · ' + Number(trip.departure_absent) + ' ausentes</td>' +
      '<td>' + Number(trip.return_present) + ' presentes · ' + Number(trip.return_absent) + ' ausentes</td>' +
      '<td>' + escapeHtml(trip.vehicle_name || 'Não atribuído') + '</td></tr>'
    ).join('') : '<tr><td colspan="9">Nenhuma viagem cadastrada.</td></tr>';
    document.querySelector('#export-report-csv').disabled = !data.trips.length;
    showMessage('#report-message', 'Relatório atualizado.');
  } catch (error) { if (error.name === 'AbortError') return;
    lastReport = null;
    body.innerHTML = '<tr><td colspan="9">' + escapeHtml(error.message) + '</td></tr>';
    document.querySelector('#export-report-csv').disabled = true;
    showMessage('#report-message', error.message, true);
  }
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^\s*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

function exportReportCsv() {
  if (!lastReport || !Array.isArray(lastReport.trips) || !lastReport.trips.length) return;
  const columns = [
    ['Viagem', 'title'], ['Destino', 'destination'], ['Saída', 'departure_at'],
    ['Situação', 'status'], ['Participantes', 'participants'], ['Capacidade', 'capacity'],
    ['Autorizadas', 'authorized'], ['Pendentes', 'pending'], ['Não autorizadas', 'declined'],
    ['Registradas em papel', 'paper_recorded'], ['Presentes na saída', 'departure_present'],
    ['Ausentes na saída', 'departure_absent'], ['Presentes no retorno', 'return_present'],
    ['Ausentes no retorno', 'return_absent'], ['Veículo', 'vehicle_name']
  ];
  const lines = [
    columns.map(column => csvCell(column[0])).join(';'),
    ...lastReport.trips.map(trip => columns.map(column => csvCell(
      column[1] === 'status' ? tripStatusLabel(trip.status) : trip[column[1]]
    )).join(';'))
  ];
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'sgve-relatorio-agregado.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function dateLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data não informada' : date.toLocaleString('pt-BR');
}
function authorizationLabel(status) {
  return ({ pending: 'Pendente', authorized: 'Autorizado', declined: 'Não autorizado', paper_recorded: 'Registrado em papel' })[status] || 'Pendente';
}
function presenceLabel(value) {
  return value === true ? 'Presente' : value === false ? 'Ausente' : 'Não registrada';
}
async function loadTripParticipants(tripId, area) {
  area.textContent = 'Carregando participantes...';
  try {
    const data = await api('/api/trips/' + Number(tripId) + '/participants');
    const tripStatus = area.dataset.tripStatus || '';
    const canAuthorize = currentUser?.role === 'guardian' && ['approved', 'open'].includes(tripStatus);
    const canMarkAttendance = currentUser && ['admin', 'direction', 'secretariat', 'teacher'].includes(currentUser.role) &&
      ['approved', 'open'].includes(tripStatus);
    const canRecordPaper = currentUser && ['admin', 'direction', 'secretariat'].includes(currentUser.role) &&
      ['approved', 'open'].includes(tripStatus);
    area.innerHTML = data.participants.length ? data.participants.map(item => {
      let controls = '';
      if (canAuthorize && item.authorization_status !== 'paper_recorded') {
        controls += '<div class="participant-actions">' +
          '<button type="button" class="small-action" data-participant-action="authorization" data-status="authorized" data-trip-id="' + Number(tripId) + '" data-student-id="' + item.student_id + '">Autorizar</button>' +
          '<button type="button" class="small-action reject-action" data-participant-action="authorization" data-status="declined" data-trip-id="' + Number(tripId) + '" data-student-id="' + item.student_id + '">Não autorizar</button></div>';
      }
      if (canRecordPaper && item.authorization_status === 'pending') {
        controls += '<div class="participant-actions"><button type="button" class="small-action" data-participant-action="paper-authorization" data-trip-id="' + Number(tripId) + '" data-student-id="' + item.student_id + '">Registrar autorização em papel</button></div>';
      }
      if (canMarkAttendance) {
        controls += '<div class="participant-actions">' +
          '<button type="button" class="small-action" data-participant-action="attendance" data-checkpoint="departure" data-present="true" data-trip-id="' + Number(tripId) + '" data-student-id="' + item.student_id + '">Presente na saída</button>' +
          '<button type="button" class="small-action reject-action" data-participant-action="attendance" data-checkpoint="departure" data-present="false" data-trip-id="' + Number(tripId) + '" data-student-id="' + item.student_id + '">Ausente na saída</button>' +
          '<button type="button" class="small-action" data-participant-action="attendance" data-checkpoint="return" data-present="true" data-trip-id="' + Number(tripId) + '" data-student-id="' + item.student_id + '">Presente no retorno</button>' +
          '<button type="button" class="small-action reject-action" data-participant-action="attendance" data-checkpoint="return" data-present="false" data-trip-id="' + Number(tripId) + '" data-student-id="' + item.student_id + '">Ausente no retorno</button></div>';
      }
      return '<article class="data-row participant-row"><div class="participant-details"><strong>' + escapeHtml(item.full_name) + '</strong>' +
        '<span>Autorização: ' + escapeHtml(authorizationLabel(item.authorization_status)) + '</span>' +
        '<small>Saída: ' + escapeHtml(presenceLabel(item.departure_present)) + ' · Retorno: ' + escapeHtml(presenceLabel(item.return_present)) + '</small></div>' +
        controls + '</article>';
    }).join('') : '<p class="muted">Nenhum participante vinculado a esta viagem.</p>';
    area.dataset.loaded = 'true';
  } catch (error) { if (error.name === 'AbortError') return;
    area.textContent = error.message;
    area.dataset.loaded = 'false';
  }
}

function localDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-');
}
function notificationStorageKey() {
  return 'sgve-read-notifications:' + String(currentUser?.email || currentUser?.id || 'guest');
}
function getReadNotifications() {
  try { return new Set(JSON.parse(localStorage.getItem(notificationStorageKey()) || '[]')); }
  catch { return new Set(); }
}
function renderNotificationCenter(items) {
  const list = document.querySelector('#notification-popover-list');
  const badge = document.querySelector('#header-notification-count');
  if (!list || !badge) return;
  const read = getReadNotifications();
  const unread = items.filter(item => !read.has(String(item.id) + ':' + item.status));
  badge.textContent = String(unread.length);
  badge.classList.toggle('is-empty', unread.length === 0);
  list.innerHTML = items.length ? items.map(item => {
    const key = String(item.id) + ':' + item.status;
    const label = item.status === 'pending_approval' ? 'Aguardando aprovação' : item.status === 'approved' ? 'Viagem aprovada' : 'Inscrições abertas';
    return '<article class="notification-entry '+(read.has(key) ? 'is-read' : 'is-unread')+'"><span class="notification-entry-dot"></span><div><strong>'+escapeHtml(item.title)+'</strong><p>'+escapeHtml(label)+' · '+escapeHtml(item.destination)+'</p><small>Saída: '+escapeHtml(dateLabel(item.departure_at))+'</small></div></article>';
  }).join('') : '<p class="notification-empty">Nenhuma notificação por enquanto.</p>';
}
function renderHome() {
  const today = document.querySelector('#home-today');
  if (!today) return;
  const now = new Date();
  today.textContent = now.toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'});
  const upcoming = dashboardTrips.filter(t => !['cancelled','completed'].includes(t.status) && new Date(t.departure_at) >= new Date(now.getFullYear(),now.getMonth(),now.getDate())).sort((a,b)=>new Date(a.departure_at)-new Date(b.departure_at));
  const notifications = dashboardTrips.filter(t => ['pending_approval','approved','open'].includes(t.status)).sort((a,b)=>new Date(a.departure_at)-new Date(b.departure_at)).slice(0,12);
  renderNotificationCenter(notifications);
  const notif = document.querySelector('#home-notifications');
  document.querySelector('#home-notification-count').textContent = String(notifications.length);
  notif.innerHTML = notifications.slice(0,4).length ? notifications.slice(0,4).map(t => {
    const label = t.status === 'pending_approval' ? 'Aguardando aprovação' : (t.status === 'approved' ? 'Viagem aprovada' : 'Inscrições abertas');
    return '<article class="home-notification"><span class="notification-mark">↗</span><div><strong>'+escapeHtml(t.title)+'</strong><p>'+escapeHtml(label)+' · '+escapeHtml(t.destination)+'</p><small>'+escapeHtml(dateLabel(t.departure_at))+'</small></div></article>';
  }).join('') : '<p class="home-empty">Nenhuma atualização de viagem no momento.</p>';
  const cards = document.querySelector('#home-upcoming');
  cards.innerHTML = upcoming.length ? upcoming.slice(0,3).map((t,i) => {
    const photo = t.image_data
      ? '<img class="upcoming-trip-photo" src="' + escapeHtml(t.image_data) + '" alt="Foto da viagem para ' + escapeHtml(t.destination) + '" loading="lazy">'
      : '<div class="trip-photo-placeholder trip-photo-'+(i+1)+'"><span>🚌</span><small>FOTO NÃO CADASTRADA</small></div>';
    return '<article class="upcoming-trip">'+photo+'<div class="upcoming-trip-body"><span class="trip-date-chip">'+escapeHtml(new Date(t.departure_at).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}))+'</span><strong>'+escapeHtml(t.title)+'</strong><p>'+escapeHtml(t.destination)+'</p><small>'+escapeHtml(tripStatusLabel(t.status))+'</small></div></article>';
  }).join('') : '<p class="home-empty">As próximas viagens aparecerão aqui quando forem cadastradas.</p>';
  renderCalendar();
}
function renderCalendar() {
  const title=document.querySelector('#calendar-month'), grid=document.querySelector('#calendar-grid');
  if(!title || !grid) return;
  title.textContent=calendarMonth.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  const year=calendarMonth.getFullYear(), month=calendarMonth.getMonth();
  const first=new Date(year,month,1), offset=(first.getDay()+6)%7, days=new Date(year,month+1,0).getDate();
  const labels=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
  const tripDates=new Map();
  dashboardTrips.forEach(t=>{const key=localDateKey(t.departure_at); if(key){if(!tripDates.has(key))tripDates.set(key,[]);tripDates.get(key).push(t);}});
  let markup=labels.map(x=>'<span class="calendar-weekday">'+x+'</span>').join('');
  for(let i=0;i<offset;i++) markup+='<span class="calendar-day empty"></span>';
  for(let day=1;day<=days;day++){
    const key=[year,String(month+1).padStart(2,'0'),String(day).padStart(2,'0')].join('-');
    const trips=tripDates.get(key)||[];
    markup+='<button type="button" class="calendar-day '+(trips.length?'has-trip':'')+'" data-calendar-date="'+key+'" aria-label="'+day+' de '+title.textContent+(trips.length?', '+trips.length+' viagem(ns)':'')+'">'+day+(trips.length?'<i></i>':'')+'</button>';
  }
  grid.innerHTML=markup;
}
function showCalendarDate(key) {
  const matches=dashboardTrips.filter(t=>localDateKey(t.departure_at)===key);
  const target=document.querySelector('#calendar-selected');
  const date=new Date(key+'T12:00:00').toLocaleDateString('pt-BR',{day:'numeric',month:'long'});
  target.innerHTML=matches.length ? '<strong>'+escapeHtml(date)+'</strong>'+matches.map(t=>'<p>'+escapeHtml(t.title)+' · '+escapeHtml(t.destination)+'</p>').join('') : 'Nenhuma viagem cadastrada para '+escapeHtml(date)+'.';
}
document.querySelector('#calendar-prev').addEventListener('click',()=>{calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()-1,1);renderCalendar();});
document.querySelector('#calendar-next').addEventListener('click',()=>{calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,1);renderCalendar();});
document.querySelector('#calendar-grid').addEventListener('click',event=>{const day=event.target.closest('[data-calendar-date]');if(day)showCalendarDate(day.dataset.calendarDate);});
document.querySelector('#dashboard-view').addEventListener('click',event=>{const link=event.target.closest('[data-open-tab]');if(!link)return;const target=link.dataset.openTab;document.querySelector('.tab[data-tab="'+target+'"]')?.click();});

async function loadTrips() {
  const list = document.querySelector('#trips-list');
  try {
    const data = await api('/api/trips');
    dashboardTrips = data.trips || [];
    document.querySelector('#trips-count').textContent = String(data.trips.length);
    renderHome();
    const canManage = currentUser && ['admin', 'direction', 'secretariat'].includes(currentUser.role);
    list.innerHTML = data.trips.length ? data.trips.map(trip => {
      let action = '';
      if (canManage && trip.status === 'draft') action = '<button type="button" class="small-action" data-trip-action="submit" data-trip-id="' + trip.id + '">Enviar para aprovação</button>';
      if (currentUser && ['admin', 'direction'].includes(currentUser.role) && trip.status === 'pending_approval') action = '<button type="button" class="small-action" data-trip-action="approve" data-trip-id="' + trip.id + '">Aprovar viagem</button>';
      const participantsButton = '<button type="button" class="small-action button-secondary" data-trip-action="participants" data-trip-id="' + trip.id + '" aria-expanded="false">Ver participantes</button>';
      const editActions = canManage && trip.status === 'draft'
        ? '<button type="button" class="small-action" data-trip-action="edit" data-trip-id="' + trip.id + '">Editar</button><button type="button" class="small-action reject-action" data-trip-action="delete" data-trip-id="' + trip.id + '">Excluir</button>'
        : '';
      const photo = trip.image_data ? '<img class="trip-card-photo" src="' + escapeHtml(trip.image_data) + '" alt="Foto da viagem ' + escapeHtml(trip.destination) + '">' : '<div class="trip-card-photo-empty">🚌<small>Adicione uma foto</small></div>';
      return '<article class="trip-card">' + photo + '<div class="trip-card-main"><div class="trip-title-row"><strong>' + escapeHtml(trip.title) + '</strong><span class="status-pill status-' + escapeHtml(trip.status) + '">' + escapeHtml(trip.statusLabel) + '</span></div><p>' + escapeHtml(trip.destination) + '</p><small>Saída: ' + escapeHtml(dateLabel(trip.departure_at)) + '</small><small>Retorno: ' + escapeHtml(dateLabel(trip.return_at)) + '</small><small>Participantes: ' + trip.participant_count + ' / ' + trip.capacity + '</small><small>Veículo: ' + escapeHtml(trip.vehicle_name || 'Não atribuído') + '</small>' + (canManage ? '<small>Condutor: ' + escapeHtml(trip.driver_name || 'Não atribuído') + '</small>' : '') + '</div><div class="trip-card-actions">' + action + editActions + participantsButton + '</div><div class="participants-area hidden" data-trip-participants="' + trip.id + '" data-trip-status="' + escapeHtml(trip.status) + '"></div></article>';
    }).join('') : '<p class="muted">Nenhuma viagem cadastrada.</p>';
    const options = '<option value="">Selecione uma viagem</option>' + data.trips.filter(t => t.status === 'draft').map(t =>
      '<option value="' + t.id + '">' + escapeHtml(t.title + ' · ' + t.destination) + '</option>'
    ).join('');
    document.querySelector('#trip-class-trip').innerHTML = options;
    document.querySelector('#trip-student-trip').innerHTML = options;
    document.querySelector('#trip-vehicle-trip').innerHTML = options;
    document.querySelector('#trip-driver-trip').innerHTML = options;
    document.querySelector('#trip-staff-trip').innerHTML = options;
  } catch (error) { if (error.name === 'AbortError') return; list.textContent = error.message; }
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
      escapeHtml(item.email) + ' · ' + escapeHtml(item.roleLabel) + '</span><small>E-mail verificado</small><small>Recebida em ' + escapeHtml(dateLabel(item.created_at)) + '</small></div>' +
      '<div class="registration-actions"><button type="button" class="small-action" data-registration-action="approve" data-registration-id="' + item.id + '"' + (item.email_verified ? '' : ' disabled title="A pessoa precisa confirmar o e-mail primeiro"') + '>Aprovar</button>' +
      '<button type="button" class="small-action reject-action" data-registration-action="reject" data-registration-id="' + item.id + '">Rejeitar</button></div></article>'
    ).join('') : '<p class="muted">Não há solicitações aguardando aprovação.</p>';
  } catch (error) { if (error.name === 'AbortError') return;
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
  } catch (error) { if (error.name === 'AbortError') return;
    showMessage('#registration-requests-message', error.message, true);
    button.disabled = false;
  }
});
let editingTripId = null;
async function optimizeTripImage(file) {
  if (!file) return '';
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Escolha uma imagem JPG, PNG ou WebP.');
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 1400 / bitmap.width, 1000 / bitmap.height);
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let quality = 0.78;
  let data = canvas.toDataURL('image/webp', quality);
  while (data.length > 740000 && quality > 0.42) {
    quality -= 0.08;
    data = canvas.toDataURL('image/webp', quality);
  }
  if (data.length > 740000) throw new Error('Essa imagem ficou muito grande. Escolha uma foto menor.');
  return data;
}
function resetTripEditor() {
  editingTripId = null;
  const form = document.querySelector('#trip-form');
  form.reset();
  document.querySelector('#trip-image-data').value = '';
  document.querySelector('#trip-photo-input').value = '';
  document.querySelector('#trip-photo-preview').classList.add('hidden');
  document.querySelector('#trip-submit-button').textContent = 'Criar rascunho';
  document.querySelector('#trip-cancel-edit').classList.add('hidden');
}
function localDateTimeValue(value) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0,16);
}
document.querySelector('#trip-photo-input').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const data = await optimizeTripImage(file);
    document.querySelector('#trip-image-data').value = data;
    const preview = document.querySelector('#trip-photo-preview');
    preview.src = data;
    preview.classList.remove('hidden');
  } catch (error) {
    event.target.value = '';
    showMessage('#trip-message', error.message, true);
  }
});
document.querySelector('#trip-cancel-edit').addEventListener('click', resetTripEditor);
document.querySelector('#trip-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.capacity = Number(payload.capacity);
  payload.image_data = document.querySelector('#trip-image-data').value || '';
  payload.departure_at = new Date(payload.departure_at).toISOString();
  payload.return_at = new Date(payload.return_at).toISOString();
  try {
    const result = await api(editingTripId ? '/api/trips/' + editingTripId : '/api/trips', {
      method: editingTripId ? 'PUT' : 'POST', body: JSON.stringify(payload)
    });
    resetTripEditor();
    showMessage('#trip-message', result.message);
    await loadTrips();
  } catch (error) { if (error.name === 'AbortError') return; showMessage('#trip-message', error.message, true); }
});
document.querySelector('#trip-class-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  try {
    const result = await api('/api/trips/' + Number(payload.trip_id) + '/classes', {
      method: 'POST', body: JSON.stringify({ class_id: Number(payload.class_id) })
    });
    showMessage('#trip-message', result.message);
  } catch (error) { if (error.name === 'AbortError') return; showMessage('#trip-message', error.message, true); }
});


document.querySelector('#refresh-reports').addEventListener('click', loadReports);
document.querySelector('#export-report-csv').addEventListener('click', exportReportCsv);

document.querySelector('#vehicle-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.capacity = Number(payload.capacity);
  try {
    const result = await api('/api/vehicles', {
      method: 'POST', body: JSON.stringify(payload)
    });
    form.reset();
    form.elements.capacity.value = '40';
    showMessage('#vehicle-message', result.message);
    await loadVehicles();
  } catch (error) { if (error.name === 'AbortError') return;
    showMessage('#vehicle-message', error.message, true);
  }
});

document.querySelector('#trip-vehicle-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  try {
    const result = await api('/api/trips/' + Number(payload.trip_id) + '/vehicle', {
      method: 'POST', body: JSON.stringify({ vehicle_id: Number(payload.vehicle_id) })
    });
    showMessage('#trip-message', result.message);
    await loadTrips();
  } catch (error) { if (error.name === 'AbortError') return;
    showMessage('#trip-message', error.message, true);
  }
});

document.querySelector('#driver-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  try {
    const result = await api('/api/drivers', {
      method: 'POST', body: JSON.stringify(payload)
    });
    form.reset();
    showMessage('#driver-message', result.message);
    await loadDrivers();
  } catch (error) { if (error.name === 'AbortError') return;
    showMessage('#driver-message', error.message, true);
  }
});

document.querySelector('#trip-driver-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  try {
    const result = await api('/api/trips/' + Number(payload.trip_id) + '/driver', {
      method: 'POST', body: JSON.stringify({ driver_id: Number(payload.driver_id) })
    });
    showMessage('#trip-message', result.message);
    await loadTrips();
  } catch (error) { if (error.name === 'AbortError') return;
    showMessage('#trip-message', error.message, true);
  }
});

document.querySelector('#trip-staff-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  try {
    const result = await api('/api/trips/' + Number(payload.trip_id) + '/staff', {
      method: 'POST', body: JSON.stringify({ user_id: Number(payload.user_id) })
    });
    form.reset();
    showMessage('#trip-staff-message', result.message);
  } catch (error) { if (error.name === 'AbortError') return; showMessage('#trip-staff-message', error.message, true); }
});
document.querySelector('#student-guardian-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  try {
    const result = await api('/api/students/' + Number(payload.student_id) + '/guardians', {
      method: 'POST',
      body: JSON.stringify({ email: payload.guardian_email, relationship: payload.relationship })
    });
    form.reset();
    showMessage('#student-guardian-message', result.message);
  } catch (error) { if (error.name === 'AbortError') return; showMessage('#student-guardian-message', error.message, true); }
});
document.querySelector('#trip-student-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  try {
    const result = await api('/api/trips/' + Number(payload.trip_id) + '/students', {
      method: 'POST', body: JSON.stringify({ student_id: Number(payload.student_id) })
    });
    showMessage('#trip-message', result.message);
    await loadTrips();
  } catch (error) { if (error.name === 'AbortError') return; showMessage('#trip-message', error.message, true); }
});
document.querySelector('#trips-list').addEventListener('click', async event => {
  const participantButton = event.target.closest('[data-participant-action]');
  if (participantButton) {
    participantButton.disabled = true;
    const tripId = Number(participantButton.dataset.tripId);
    const studentId = Number(participantButton.dataset.studentId);
    const action = participantButton.dataset.participantAction;
    const route = '/api/trips/' + tripId + '/participants/' + studentId + '/' + action;
    let payload;
    if (action === 'authorization') {
      payload = { status: participantButton.dataset.status };
    } else if (action === 'attendance') {
      payload = {
        checkpoint: participantButton.dataset.checkpoint,
        present: participantButton.dataset.present === 'true'
      };
    } else {
      payload = {};
    }
    try {
      const result = await api(route, { method: 'POST', body: JSON.stringify(payload) });
      showMessage('#trip-message', result.message);
      const area = participantButton.closest('.participants-area');
      await loadTripParticipants(tripId, area);
    } catch (error) { if (error.name === 'AbortError') return;
      showMessage('#trip-message', error.message, true);
      participantButton.disabled = false;
    }
    return;
  }

  const button = event.target.closest('[data-trip-action]');
  if (!button) return;
  if (button.dataset.tripAction === 'edit') {
    const trip = dashboardTrips.find(item => String(item.id) === String(button.dataset.tripId));
    if (!trip) return;
    editingTripId = Number(trip.id);
    const form = document.querySelector('#trip-form');
    form.elements.title.value = trip.title || '';
    form.elements.destination.value = trip.destination || '';
    form.elements.educational_purpose.value = trip.educational_purpose || '';
    form.elements.departure_at.value = localDateTimeValue(trip.departure_at);
    form.elements.return_at.value = localDateTimeValue(trip.return_at);
    form.elements.capacity.value = trip.capacity || 40;
    document.querySelector('#trip-image-data').value = trip.image_data || '';
    const preview = document.querySelector('#trip-photo-preview');
    if (trip.image_data) { preview.src = trip.image_data; preview.classList.remove('hidden'); }
    else preview.classList.add('hidden');
    document.querySelector('#trip-submit-button').textContent = 'Salvar alterações';
    document.querySelector('#trip-cancel-edit').classList.remove('hidden');
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  if (button.dataset.tripAction === 'delete') {
    if (!confirm('Excluir este rascunho de viagem? Essa ação não pode ser desfeita.')) return;
    button.disabled = true;
    try {
      const result = await api('/api/trips/' + button.dataset.tripId, { method: 'DELETE' });
      showMessage('#trip-message', result.message);
      await loadTrips();
    } catch (error) {
      showMessage('#trip-message', error.message, true);
      button.disabled = false;
    }
    return;
  }
  if (button.dataset.tripAction === 'participants') {
    const card = button.closest('.trip-card');
    const area = card?.querySelector('.participants-area');
    if (!area) {
      showMessage('#trip-message', 'Não foi possível abrir a área de participantes desta viagem. Atualize a página e tente novamente.', true);
      return;
    }
    const opening = area.classList.contains('hidden');
    area.classList.toggle('hidden', !opening);
    button.setAttribute('aria-expanded', opening ? 'true' : 'false');
    button.textContent = opening ? 'Ocultar participantes' : 'Ver participantes';
    if (opening && area.dataset.loaded !== 'true') {
      await loadTripParticipants(button.dataset.tripId, area);
    }
    if (opening) area.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }
  button.disabled = true;
  const originalLabel = button.textContent;
  button.textContent = button.dataset.tripAction === 'approve' ? 'Aprovando...' : 'Enviando...';
  try {
    const result = await api('/api/trips/' + button.dataset.tripId + '/' + button.dataset.tripAction, { method: 'POST', body: '{}' });
    showMessage('#trip-message', result.message);
    await loadTrips();
  } catch (error) {
    if (error.name === 'AbortError') return;
    showMessage('#trip-message', error.message, true);
    button.textContent = originalLabel;
    button.disabled = false;
  }
});

document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab === button));
  document.querySelectorAll('.module-panel').forEach(panel => panel.classList.toggle('hidden', panel.id !== button.dataset.tab));
  if (window.matchMedia('(max-width: 900px)').matches) {
    button.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }
}));
document.querySelector('#class-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.school_year = Number(payload.school_year);
  try {
    const result = await api('/api/classes', { method: 'POST', body: JSON.stringify(payload) });
    form.reset();
    form.elements.school_year.value = String(new Date().getFullYear());
    showMessage('#class-message', result.message);
    await loadClasses();
  } catch (error) { if (error.name === 'AbortError') return; showMessage('#class-message', error.message, true); }
});
document.querySelector('#student-account-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  try {
    const result = await api('/api/students/' + Number(payload.student_id) + '/account', {
      method: 'POST', body: JSON.stringify({ email: payload.email })
    });
    form.reset();
    showMessage('#student-account-message', result.message);
    await loadStudents();
  } catch (error) { if (error.name === 'AbortError') return; showMessage('#student-account-message', error.message, true); }
});
document.querySelector('#student-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.class_id = Number(payload.class_id);
  try {
    const result = await api('/api/students', { method: 'POST', body: JSON.stringify(payload) });
    form.reset();
    showMessage('#student-message', result.message);
    await loadStudents();
  } catch (error) { if (error.name === 'AbortError') return; showMessage('#student-message', error.message, true); }
});
const registrationForm = document.querySelector('#registration-form');
const registrationMessage = document.querySelector('#registration-message');
const loginHelper = document.querySelector('#login-view .helper');
document.querySelector('#show-registration').addEventListener('click', () => {
  loginForm.classList.add('hidden');
  registrationForm.classList.remove('hidden');
  registrationForm.setAttribute('aria-label', 'Formulário de criação de conta');
  document.querySelector('#show-registration').classList.add('hidden');
  registrationForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  if (values.password.length < 8 || values.password.length > 14) {
    showMessage('#registration-message', 'A senha deve ter entre 8 e 14 caracteres.', true);
    document.querySelector('#registration-password').focus();
    return;
  }
  if (values.password !== values.password_confirm) {
    showMessage('#registration-message', 'As senhas não coincidem.', true);
    return;
  }
  if (!window.firebase || !window.SGVE_FIREBASE_CONFIG) {
    showMessage('#registration-message', 'O cadastro Firebase não está configurado nesta página.', true);
    return;
  }
  const button = document.querySelector('#registration-submit');
  button.disabled = true;
  button.textContent = 'Criando conta...';
  try {
    if (!firebase.apps.length) firebase.initializeApp(window.SGVE_FIREBASE_CONFIG);
    const credential = await firebase.auth().createUserWithEmailAndPassword(values.email.trim(), values.password);
    await credential.user.updateProfile({ displayName: values.name.trim() });
    await credential.user.sendEmailVerification();
    const idToken = await credential.user.getIdToken(true);
    const result = await api('/api/registration-requests', {
      method: 'POST',
      body: JSON.stringify({ name: values.name, email: values.email, role: values.role, idToken })
    });
    await firebase.auth().signOut();
    registrationForm.reset();
    showMessage('#registration-message', result.message + ' Depois de confirmar, aguarde a aprovação do administrador.');
  } catch (error) {
    if (error.name === 'AbortError') return;
    if (error.code === 'auth/email-already-in-use') error.message = 'Este e-mail já possui uma conta. Entre ou solicite ajuda à secretaria.';
    if (error.code === 'auth/weak-password') error.message = 'Escolha uma senha mais forte.';
    showMessage('#registration-message', error.message || 'Não foi possível criar a conta.', true);
    try { if (window.firebase?.apps?.length) await firebase.auth().signOut(); } catch {}
  } finally {
    button.disabled = false;
    button.textContent = 'Criar conta e enviar solicitação';
  }
});
document.querySelector('#guardian-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  if (payload.password !== payload.password_confirm) {
    showMessage('#guardian-message', 'As senhas não coincidem.', true);
    return;
  }
  delete payload.password_confirm;
  payload.role = 'guardian';
  try {
    const result = await api('/api/users', { method: 'POST', body: JSON.stringify(payload) });
    form.reset();
    showMessage('#guardian-message', result.message + ' O responsável já pode ser vinculado a um estudante.');
    await loadLinkableUsers();
  } catch (error) {
    if (error.name === 'AbortError') return;
    showMessage('#guardian-message', error.message, true);
  }
});
document.querySelector('#teacher-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  try {
    const result = await api('/api/teachers', { method: 'POST', body: JSON.stringify(payload) });
    form.reset();
    showMessage('#teacher-message', result.message);
    await loadTeachers();
  } catch (error) {
    if (error.name === 'AbortError') return;
    showMessage('#teacher-message', error.message, true);
  }
});
document.querySelector('#user-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  try {
    const result = await api('/api/users', { method: 'POST', body: JSON.stringify(payload) });
    form.reset();
    showMessage('#user-message', result.message + ' Perfil: ' + result.user.roleLabel);
    await loadLinkableUsers();
  } catch (error) { if (error.name === 'AbortError') return; showMessage('#user-message', error.message, true); }
});
function applyTheme(mode) {
  const dark = mode === 'dark';
  document.body.classList.toggle('dark-mode', dark);
  const button = document.querySelector('#theme-toggle');
  button.innerHTML = '<span class="theme-sun" aria-hidden="true">☀</span><span class="theme-moon" aria-hidden="true">☾</span>';
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
    if (!window.firebase || !window.SGVE_FIREBASE_CONFIG) throw new Error('O login Firebase não está configurado nesta página.');
    if (!firebase.apps.length) firebase.initializeApp(window.SGVE_FIREBASE_CONFIG);
    const credential = await firebase.auth().signInWithEmailAndPassword(String(form.get('email')).trim(), String(form.get('password')));
    await credential.user.reload();
    if (!credential.user.emailVerified) {
      await credential.user.sendEmailVerification();
      await firebase.auth().signOut();
      throw new Error('Seu e-mail ainda não foi confirmado. Enviamos outro link de verificação. Confira sua caixa de entrada e o spam.');
    }
    const idToken = await credential.user.getIdToken(true);
    const data = await api('/api/auth/firebase', {
      method: 'POST',
      body: JSON.stringify({ idToken, role: form.get('role') })
    });
    await firebase.auth().signOut();
    csrfToken = data.csrfToken;
    loginForm.reset();
    showDashboard(data.user);
  } catch (error) {
    if (error.name === 'AbortError') return;
    try { if (window.firebase?.apps?.length) await firebase.auth().signOut(); } catch {}
    loginMessage.textContent = error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password'
      ? 'E-mail ou senha incorretos.'
      : error.message;
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = 'Entrar';
  }
});
googleLoginButton.addEventListener('click', async () => {
  loginMessage.textContent = '';
  if (!document.querySelector('#login-role').value) {
    loginMessage.textContent = 'Selecione seu perfil antes de continuar.';
    return;
  }
  googleLoginButton.disabled = true;
  googleLoginButton.textContent = 'Conectando ao Google...';
  try {
    if (!window.firebase || !window.SGVE_FIREBASE_CONFIG) throw new Error('O login Google não está configurado nesta página.');
    if (!firebase.apps.length) firebase.initializeApp(window.SGVE_FIREBASE_CONFIG);
    const provider = new firebase.auth.GoogleAuthProvider();
    const credential = await firebase.auth().signInWithPopup(provider);
    const idToken = await credential.user.getIdToken(true);
    const data = await api('/api/auth/firebase', {
      method: 'POST',
      body: JSON.stringify({ idToken, role: document.querySelector('#login-role').value })
    });
    await firebase.auth().signOut();
    csrfToken = data.csrfToken;
    showDashboard(data.user);
  } catch (error) {
    if (error.name === 'AbortError') return;
    try { if (window.firebase?.apps?.length) await firebase.auth().signOut(); } catch {}
    loginMessage.textContent = error.code === 'auth/popup-closed-by-user'
      ? 'A janela de login foi fechada antes da conclusão.'
      : (error.message || 'Não foi possível entrar com Google.');
  } finally {
    googleLoginButton.disabled = false;
    googleLoginButton.textContent = 'Entrar com Google';
  }
});
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.hidden = false;
});
installButton.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  installButton.disabled = true;
  try {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
  } finally {
    deferredInstallPrompt = null;
    installButton.hidden = true;
    installButton.disabled = false;
  }
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  installButton.hidden = true;
});

let pushMessageHandlerReady = false;
let pushVapidKey = '';
async function enableDevicePush() {
  const button = document.querySelector('#enable-push-button');
  const status = document.querySelector('#push-status');
  button.disabled = true;
  button.textContent = 'Ativando...';
  status.textContent = 'Verificando as permissões deste dispositivo...';
  try {
    if (!window.isSecureContext || !('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      throw new Error('Este navegador não oferece suporte a notificações push. Abra o SGVE no Chrome atualizado usando HTTPS.');
    }
    if (Notification.permission === 'denied') {
      throw new Error('As notificações estão bloqueadas para o SGVE. No Android, abra as configurações do site no Chrome, entre em Permissões > Notificações e permita. Depois volte e tente novamente.');
    }
    if (!window.firebase || !window.SGVE_FIREBASE_CONFIG) throw new Error('Firebase não está configurado nesta página.');
    if (!firebase.apps.length) firebase.initializeApp(window.SGVE_FIREBASE_CONFIG);
    // A permissão é solicitada diretamente no clique do usuário, antes de qualquer chamada de rede.
    const permission = Notification.permission === 'granted'
      ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Você não autorizou as notificações. Permita o aviso do navegador para continuar.');
    }
    status.textContent = 'Preparando o serviço de notificações...';
    const config = await api('/api/push/config');
    if (!config.enabled || !config.vapidKey) throw new Error('O servidor ainda não recebeu a chave Web Push do Firebase. Verifique FCM_WEB_PUSH_VAPID_KEY no Render.');
    if (typeof firebase.messaging.isSupported === 'function' && !(await firebase.messaging.isSupported())) {
      throw new Error('O serviço de mensagens do Firebase não é compatível com este navegador ou dispositivo.');
    }
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
    await navigator.serviceWorker.ready;
    await registration.update().catch(() => {});
    const messaging = firebase.messaging();
    status.textContent = 'Conectando este celular ao Firebase...';
    const token = await messaging.getToken({
      vapidKey: config.vapidKey.trim(),
      serviceWorkerRegistration: registration
    });
    if (!token) throw new Error('O Firebase não retornou um identificador para este dispositivo.');
    await api('/api/push/register', { method: 'POST', body: JSON.stringify({ token }) });
    if (!pushMessageHandlerReady) {
      messaging.onMessage(payload => {
        const title = payload.notification?.title || 'SGVE';
        const body = payload.notification?.body || 'Você recebeu uma nova atualização.';
        try { new Notification(title, { body, icon: '/icon.svg', tag: 'sgve-foreground' }); } catch {}
        const currentStatus = document.querySelector('#push-status');
        if (currentStatus) currentStatus.textContent = 'Notificação recebida: ' + title;
      });
      pushMessageHandlerReady = true;
    }
    button.textContent = 'Notificações ativadas';
    button.hidden = true;
    document.querySelector('#disable-push-button').hidden = false;
    status.textContent = 'Pronto! Este dispositivo está habilitado para receber avisos, mesmo com o SGVE fechado.';
  } catch (error) {
    button.textContent = 'Tentar ativar novamente';
    const code = error.code ? ' (' + error.code + ')' : '';
    status.textContent = (error.message || 'Não foi possível ativar as notificações.') + code;
  } finally { button.disabled = false; }
}
document.querySelector('#enable-push-button')?.addEventListener('click', enableDevicePush);
document.querySelector('#disable-push-button')?.addEventListener('click', async () => {
  const button = document.querySelector('#disable-push-button');
  const enableButton = document.querySelector('#enable-push-button');
  const status = document.querySelector('#push-status');
  button.disabled = true;
  try {
    const config = await api('/api/push/config');
    if (!config.enabled || !config.vapidKey) throw new Error('Não foi possível acessar a configuração do Firebase.');
    if (!firebase.apps.length) firebase.initializeApp(window.SGVE_FIREBASE_CONFIG);
    const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
    const messaging = firebase.messaging();
    const token = await messaging.getToken({ vapidKey: config.vapidKey, serviceWorkerRegistration: registration });
    if (token) await api('/api/push/unregister', { method: 'POST', body: JSON.stringify({ token }) });
    await messaging.deleteToken();
    button.hidden = true;
    enableButton.hidden = false;
    status.textContent = 'Notificações desativadas neste dispositivo.';
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
});

document.querySelector('#push-send-form')?.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const message = document.querySelector('#push-send-message');
  const values = new FormData(form);
  button.disabled = true;
  message.textContent = 'Enviando...';
  try {
    const result = await api('/api/push/send', {
      method: 'POST',
      body: JSON.stringify({ title: values.get('title'), body: values.get('body'), audience: values.get('audience') })
    });
    message.textContent = 'Enviada para ' + result.sent + ' dispositivo(s) com notificações ativadas.';
    form.reset();
  } catch (error) { message.textContent = error.message; }
  finally { button.disabled = false; }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {}));
}
function updateProfileMenu(user) {
  const initials = String(user.name || 'U').trim().split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase();
  document.querySelector('#profile-avatar-initials').textContent = initials || 'U';
  document.querySelector('#profile-menu-name').textContent = user.name || 'Minha conta';
  document.querySelector('#profile-menu-role').textContent = user.roleLabel || user.role || '';
  const image = document.querySelector('#profile-avatar-image');
  let savedPhoto = '';
  try { savedPhoto = localStorage.getItem('sgve-profile-photo:' + String(user.email || user.id || user.name)) || ''; } catch {}
  image.hidden = !savedPhoto;
  image.src = savedPhoto || '';
  document.querySelector('#profile-avatar-initials').hidden = Boolean(savedPhoto);
}
const profileMenuButton = document.querySelector('#profile-menu-button');
const profileDropdown = document.querySelector('#profile-dropdown');
profileMenuButton.addEventListener('click', () => {
  const opening = profileDropdown.classList.contains('hidden');
  profileDropdown.classList.toggle('hidden', !opening);
  profileMenuButton.setAttribute('aria-expanded', String(opening));
});
document.addEventListener('click', event => {
  if (!event.target.closest('.profile-menu-wrap')) {
    profileDropdown.classList.add('hidden');
    profileMenuButton.setAttribute('aria-expanded', 'false');
  }
});
document.querySelector('#add-profile-photo-button').addEventListener('click', () => document.querySelector('#profile-photo-input').click());
document.querySelector('#profile-photo-input').addEventListener('change', event => {
  const file = event.target.files && event.target.files[0];
  if (!file || !currentUser) return;
  if (!file.type.startsWith('image/')) { window.alert('Escolha um arquivo de imagem.'); return; }
  if (file.size > 2 * 1024 * 1024) { window.alert('A foto deve ter no máximo 2 MB.'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    const key = 'sgve-profile-photo:' + String(currentUser.email || currentUser.id || currentUser.name);
    try { localStorage.setItem(key, String(reader.result)); updateProfileMenu(currentUser); }
    catch { window.alert('Não foi possível salvar a foto neste dispositivo.'); }
  };
  reader.readAsDataURL(file);
  event.target.value = '';
});
const notificationButton = document.querySelector('#header-notification-button');
const notificationPopover = document.querySelector('#notification-popover');
notificationButton.addEventListener('click', event => {
  event.stopPropagation();
  const opening = notificationPopover.classList.contains('hidden');
  notificationPopover.classList.toggle('hidden', !opening);
  notificationButton.setAttribute('aria-expanded', String(opening));
});
notificationPopover?.addEventListener('click', event => event.stopPropagation());
document.addEventListener('click', event => {
  if (!event.target.closest('#notification-popover') && !event.target.closest('#header-notification-button')) {
    notificationPopover?.classList.add('hidden');
    notificationButton.setAttribute('aria-expanded', 'false');
  }
});
document.querySelector('#mark-notifications-read')?.addEventListener('click', () => {
  const read = getReadNotifications();
  dashboardTrips.filter(t => ['pending_approval','approved','open'].includes(t.status)).forEach(t => read.add(String(t.id) + ':' + t.status));
  try { localStorage.setItem(notificationStorageKey(), JSON.stringify([...read])); } catch {}
  renderHome();
});
document.querySelector('#change-profile-button').addEventListener('click', async () => {
  profileDropdown.classList.add('hidden');
  logoutButton.disabled = true;
  try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); if (window.firebase?.apps?.length) await firebase.auth().signOut(); showLogin(); }
  catch (error) { if (error.name === 'AbortError') return; window.alert(error.message); }
  finally { logoutButton.disabled = false; }
});
logoutButton.addEventListener('click', async () => {
  logoutButton.disabled = true;
  try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); if (window.firebase?.apps?.length) await firebase.auth().signOut(); showLogin(); }
  catch (error) { if (error.name === 'AbortError') return; window.alert(error.message); }
  finally { logoutButton.disabled = false; }
});
restoreSession();
