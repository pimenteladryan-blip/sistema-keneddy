'use strict';
const ROLE_LABELS = Object.freeze({
  admin: 'Administrador', direction: 'Direção', secretariat: 'Secretaria',
  teacher: 'Professor', pedagogue: 'Pedagogo', guardian: 'Responsável', student: 'Estudante'
});
const RECORD_MANAGERS = Object.freeze(['admin', 'direction', 'secretariat']);
const USER_MANAGERS = Object.freeze(['admin', 'direction', 'secretariat']);
const TRIP_EDITORS = Object.freeze(['admin', 'direction']);
const ACTIVE_TRIP_STATUSES = Object.freeze(['pending_approval', 'approved', 'open']);
function hasRole(user, roles) {
  return Boolean(user && Array.isArray(roles) && roles.includes(user.role));
}
function canEditTrip(user, status) {
  if (!user) return false;
  if (status === 'draft') return hasRole(user, RECORD_MANAGERS);
  return hasRole(user, TRIP_EDITORS) && ACTIVE_TRIP_STATUSES.includes(status);
}
module.exports = {
  ROLE_LABELS, RECORD_MANAGERS, USER_MANAGERS, TRIP_EDITORS,
  ACTIVE_TRIP_STATUSES, hasRole, canEditTrip
};
