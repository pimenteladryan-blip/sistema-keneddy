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

function showDashboard(user) {
  sessionController.abort();
  sessionController = new AbortController();
  currentUser = user;
  loginView.classList.add('hidden');
  dashboardView.classList.remove('hidden');
  document.querySelector('#welcome-title').textContent = 'Olá, ' + user.name + '!';
  document.querySelector('#user-role').textContent = 'Perfil de acesso: ' + (user.roleLabel || user.role);
  const canManage = ['admin', 'direction', 'secretariat'].includes(user.role);
  if (!canManage) lastReport = null;
  document.querySelector('#class-form').classList.toggle('hidden', !canManage);
  document.querySelector('#student-form').classList.toggle('hidden', !canManage);
  document.querySelector('#student-account-form').classList.toggle('hidden', !canManage);
  document.querySelector('#students-tab').classList.toggle('hidden', user.role === 'teacher');
  document.querySelector('#trip-form').classList.toggle('hidden', !canManage);
  document.querySelector('#trip-assignment').classList.toggle('hidden', !canManage);
  document.querySelector('#users-tab').classList.toggle('hidden', !canManage);
  document.querySelector('#vehicles-tab').classList.toggle('hidden', !canManage);
  document.querySelector('#reports-tab').classList.toggle('hidden', !canManage);
  document.querySelector('#registration-requests-section').classList.toggle('hidden', user.role !== 'admin');
  document.querySelectorAll('[data-admin-only]').forEach(option => { option.hidden = user.role !== 'admin'; });
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === 'classes-panel'));
  document.querySelectorAll('.module-panel').forEach(panel => panel.classList.toggle('hidden', panel.id !== 'classes-panel'));
  loadClasses();
  if (user.role !== 'teacher') loadStudents();
  loadTrips();
  if (canManage) {
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
      const participantsButton = '<button type="button" class="small-action button-secondary" data-trip-action="participants" data-trip-id="' + trip.id + '">Participantes</button>';
      return '<article class="trip-card"><div class="trip-card-main"><div class="trip-title-row"><strong>' + escapeHtml(trip.title) + '</strong><span class="status-pill status-' + escapeHtml(trip.status) + '">' + escapeHtml(trip.statusLabel) + '</span></div><p>' + escapeHtml(trip.destination) + '</p><small>Saída: ' + escapeHtml(dateLabel(trip.departure_at)) + '</small><small>Retorno: ' + escapeHtml(dateLabel(trip.return_at)) + '</small><small>Participantes: ' + trip.participant_count + ' / ' + trip.capacity + '</small><small>Veículo: ' + escapeHtml(trip.vehicle_name || 'Não atribuído') + '</small>' + (canManage ? '<small>Condutor: ' + escapeHtml(trip.driver_name || 'Não atribuído') + '</small>' : '') + '</div><div class="trip-card-actions">' + action + participantsButton + '</div><div class="participants-area hidden" data-trip-participants="' + trip.id + '" data-trip-status="' + escapeHtml(trip.status) + '"></div></article>';
    }).join('') : '<p class="muted">Nenhuma viagem cadastrada.</p>';
    const options = '<option value="">Selecione uma viagem</option>' + data.trips.filter(t => t.status === 'draft').map(t =>
      '<option value="' + t.id + '">' + escapeHtml(t.title + ' · ' + t.destination) + '</option>'
    ).join('');
    document.querySelector('#trip-class-trip').innerHTML = options;
    document.querySelector('#trip-student-trip').innerHTML = options;
    document.querySelector('#trip-vehicle-trip').innerHTML = options;
    document.querySelector('#trip-driver-trip').innerHTML = options;
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
      escapeHtml(item.email) + ' · ' + escapeHtml(item.roleLabel) + '</span><small>Código de conferência: <strong class="verification-code-badge">' + escapeHtml(item.verification_code) + '</strong></small><small>Recebida em ' + escapeHtml(dateLabel(item.created_at)) + '</small></div>' +
      '<div class="registration-actions"><button type="button" class="small-action" data-registration-action="approve" data-registration-id="' + item.id + '">Aprovar</button>' +
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
  } catch (error) { if (error.name === 'AbortError') return; showMessage('#trip-message', error.message, true); }
});
document.querySelector('#trip-class-form').addEventListener('submit', async event => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
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
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  payload.capacity = Number(payload.capacity);
  try {
    const result = await api('/api/vehicles', {
      method: 'POST', body: JSON.stringify(payload)
    });
    event.currentTarget.reset();
    event.currentTarget.elements.capacity.value = '40';
    showMessage('#vehicle-message', result.message);
    await loadVehicles();
  } catch (error) { if (error.name === 'AbortError') return;
    showMessage('#vehicle-message', error.message, true);
  }
});

document.querySelector('#trip-vehicle-form').addEventListener('submit', async event => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
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
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    const result = await api('/api/drivers', {
      method: 'POST', body: JSON.stringify(payload)
    });
    event.currentTarget.reset();
    showMessage('#driver-message', result.message);
    await loadDrivers();
  } catch (error) { if (error.name === 'AbortError') return;
    showMessage('#driver-message', error.message, true);
  }
});

document.querySelector('#trip-driver-form').addEventListener('submit', async event => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
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

document.querySelector('#trip-student-form').addEventListener('submit', async event => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
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
  if (button.dataset.tripAction === 'participants') {
    const area = button.closest('.trip-card').querySelector('.participants-area');
    area.classList.toggle('hidden');
    if (!area.classList.contains('hidden') && area.dataset.loaded !== 'true') {
      await loadTripParticipants(button.dataset.tripId, area);
    }
    return;
  }
  button.disabled = true;
  try {
    const result = await api('/api/trips/' + button.dataset.tripId + '/' + button.dataset.tripAction, { method: 'POST', body: '{}' });
    showMessage('#trip-message', result.message);
    await loadTrips();
  } catch (error) { if (error.name === 'AbortError') return;
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
  } catch (error) { if (error.name === 'AbortError') return; showMessage('#class-message', error.message, true); }
});
document.querySelector('#student-account-form').addEventListener('submit', async event => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    const result = await api('/api/students/' + Number(payload.student_id) + '/account', {
      method: 'POST', body: JSON.stringify({ email: payload.email })
    });
    event.currentTarget.reset();
    showMessage('#student-account-message', result.message);
    await loadStudents();
  } catch (error) { if (error.name === 'AbortError') return; showMessage('#student-account-message', error.message, true); }
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
  } catch (error) { if (error.name === 'AbortError') return; showMessage('#student-message', error.message, true); }
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
    showMessage('#registration-message', result.message + ' Código: ' + result.verificationCode);
  } catch (error) { if (error.name === 'AbortError') return;
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
  } catch (error) { if (error.name === 'AbortError') return; showMessage('#user-message', error.message, true); }
});
function applyTheme(mode) {
  const dark = mode === 'dark';
  document.body.classList.toggle('dark-mode', dark);
  const button = document.querySelector('#theme-toggle');
  button.innerHTML = (dark ? '☀ <span>Tema claro</span>' : '☾ <span>Tema escuro</span>');
  button.setAttribute('aria-label', dark ? 'Mudar para tema claro' : 'Mudar para tema escuro');
  button.setAttribute('aria-pressed', String(dark));
}
let savedTheme = 'dark';
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
      body: JSON.stringify({ email: form.get('email'), password: form.get('password'), role: form.get('role') })
    });
    csrfToken = data.csrfToken;
    loginForm.reset();
    showDashboard(data.user);
  } catch (error) { if (error.name === 'AbortError') return; loginMessage.textContent = error.message; }
  finally { loginButton.disabled = false; loginButton.textContent = 'Entrar'; }
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
    if (!window.firebase || !window.SGVE_FIREBASE_CONFIG) {
      throw new Error('O login Google não está configurado nesta página.');
    }
    if (!firebase.apps.length) firebase.initializeApp(window.SGVE_FIREBASE_CONFIG);
    const provider = new firebase.auth.GoogleAuthProvider();
    const credential = await firebase.auth().signInWithPopup(provider);
    const idToken = await credential.user.getIdToken(true);
    const data = await api('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken, role: document.querySelector('#login-role').value })
    });
    csrfToken = data.csrfToken;
    showDashboard(data.user);
  } catch (error) { if (error.name === 'AbortError') return;
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
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {}));
}
logoutButton.addEventListener('click', async () => {
  logoutButton.disabled = true;
  try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); if (window.firebase?.apps?.length) await firebase.auth().signOut(); showLogin(); }
  catch (error) { if (error.name === 'AbortError') return; window.alert(error.message); }
  finally { logoutButton.disabled = false; }
});
restoreSession();
