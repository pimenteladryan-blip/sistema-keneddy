'use strict';
const ROLE_LABELS = Object.freeze({
  admin: 'Administrador', direction: 'Direção', secretariat: 'Secretaria',
  teacher: 'Professor', guardian: 'Responsável', student: 'Estudante'
});
const RECORD_MANAGERS = Object.freeze(['admin', 'direction', 'secretariat']);
const USER_MANAGERS = Object.freeze(['admin', 'direction', 'secretariat']);
function hasRole(user, roles) {
  return Boolean(user && Array.isArray(roles) && roles.includes(user.role));
}
module.exports = { ROLE_LABELS, RECORD_MANAGERS, USER_MANAGERS, hasRole };
