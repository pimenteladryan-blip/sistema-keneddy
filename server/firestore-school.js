'use strict';

const store = require('./firestore-store');

function numericId(value, label) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new TypeError(label + ' inválido.');
  return id;
}

async function audit(actorUserId, action, entityType, entityId = null) {
  return store.createWithNumericId('auditLogs', {
    actor_user_id: actorUserId == null ? null : Number(actorUserId),
    action: String(action),
    entity_type: String(entityType),
    entity_id: entityId == null ? null : String(entityId),
    created_at: new Date().toISOString()
  });
}

async function listClasses() {
  const rows = await store.list('classes', {
    filters: [{ field: 'active', op: '==', value: true }],
    limit: 500
  });
  return rows.sort((a, b) =>
    Number(b.school_year) - Number(a.school_year) ||
    String(a.level).localeCompare(String(b.level)) ||
    String(a.grade).localeCompare(String(b.grade)) ||
    String(a.course).localeCompare(String(b.course)) ||
    String(a.section).localeCompare(String(b.section))
  );
}

async function createClass(data, actorUserId = null) {
  const id = await store.createUniqueComposite('classes',
    ['level', 'grade', 'course', 'section', 'school_year'], {
      level: data.level, grade: data.grade, course: data.course,
      section: data.section, school_year: Number(data.schoolYear),
      active: true, created_at: new Date().toISOString()
    }, actorUserId == null ? null : { actor_user_id: actorUserId, action: 'create', entity_type: 'class' });
  return Number(id);
}

async function getClass(id) {
  return store.get('classes', numericId(id, 'Turma'));
}

async function createStudent(fullName, classId, actorUserId = null) {
  const result = await store.createStudentInActiveClass(
    String(fullName).trim(), numericId(classId, 'Turma'),
    actorUserId == null ? null : { actor_user_id: actorUserId, action: 'create', entity_type: 'student' }
  );
  return result.error ? null : Number(result.id);
}

async function listStudentsForUser(user) {
  let students;
  if (['admin', 'direction', 'secretariat'].includes(user.role)) {
    students = await store.list('students', {
      filters: [{ field: 'active', op: '==', value: true }],
      limit: 500
    });
  } else if (user.role === 'guardian') {
    const links = await store.list('studentGuardians', {
      filters: [{ field: 'guardian_user_id', op: '==', value: Number(user.id) }],
      limit: 500
    });
    const results = await Promise.all(links.map(link => store.get('students', link.student_id)));
    students = results.filter(student => student && student.active === true);
  } else if (user.role === 'student') {
    students = await store.list('students', {
      filters: [
        { field: 'user_id', op: '==', value: Number(user.id) },
        { field: 'active', op: '==', value: true }
      ],
      limit: 10
    });
  } else {
    const error = new Error('Seu perfil não permite consultar estudantes.');
    error.code = 'forbidden';
    throw error;
  }
  const result = await Promise.all(students.map(async student => {
    const schoolClass = await getClass(student.class_id);
    if (!schoolClass) return null;
    return {
      id: Number(student.id), full_name: student.full_name,
      class_id: Number(student.class_id), grade: schoolClass.grade,
      course: schoolClass.course, section: schoolClass.section,
      level: schoolClass.level, active: student.active !== false
    };
  }));
  return result.filter(Boolean).sort((a, b) => a.full_name.localeCompare(b.full_name));
}

async function linkGuardian(studentId, guardianEmail, relationship, actorUserId = null) {
  const guardian = await store.getByUnique('users', 'email', guardianEmail);
  if (!guardian) return false;
  return store.linkGuardianIfActive(
    numericId(studentId, 'Estudante'), numericId(guardian.id, 'Responsável'),
    relationship || null,
    actorUserId == null ? null : { actor_user_id: actorUserId, action: 'link_guardian', entity_type: 'student', entity_id: studentId }
  );
}

async function createTrip(data, createdBy) {
  const id = await store.createWithNumericId('trips', {
    title: data.title, destination: data.destination,
    educational_purpose: data.purpose,
    departure_at: data.departure, return_at: data.returning,
    capacity: Number(data.capacity), participant_count: 0, status: 'draft',
    created_by: Number(createdBy), approved_by: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  }, { actor_user_id: createdBy, action: 'create', entity_type: 'trip' });
  return Number(id);
}

async function getTrip(id) {
  return store.get('trips', numericId(id, 'Viagem'));
}

async function listTripsForUser(user) {
  const trips = await store.list('trips', { limit: 500 });
  const [staff, participations, guardians, students] = await Promise.all([
    store.list('tripStaff', { filters: [{ field: 'user_id', op: '==', value: Number(user.id) }], limit: 500 }),
    store.list('tripStudents', { limit: 1000 }),
    user.role === 'guardian' ? store.list('studentGuardians', { filters: [{ field: 'guardian_user_id', op: '==', value: Number(user.id) }], limit: 500 }) : Promise.resolve([]),
    user.role === 'guardian' || user.role === 'student'
      ? store.list('students', { limit: 1000 }) : Promise.resolve([])
  ]);
  let visible = trips;
  if (user.role === 'teacher') {
    const ids = new Set(staff.map(item => Number(item.trip_id)));
    visible = trips.filter(item => ids.has(Number(item.id)));
  } else if (user.role === 'guardian') {
    const linked = new Set(guardians.map(item => Number(item.student_id)));
    const owned = new Set(students.filter(item =>
      item.active === true && linked.has(Number(item.id))
    ).map(item => Number(item.id)));
    const tripIds = new Set(participations.filter(item => owned.has(Number(item.student_id))).map(item => Number(item.trip_id)));
    visible = trips.filter(item => tripIds.has(Number(item.id)));
  } else if (user.role === 'student') {
    const owned = new Set(students.filter(item =>
      item.active === true && Number(item.user_id) === Number(user.id)
    ).map(item => Number(item.id)));
    const tripIds = new Set(participations.filter(item => owned.has(Number(item.student_id))).map(item => Number(item.trip_id)));
    visible = trips.filter(item => tripIds.has(Number(item.id)));
  } else if (!['admin', 'direction', 'secretariat'].includes(user.role)) {
    const error = new Error('Seu perfil não permite consultar viagens.');
    error.code = 'forbidden';
    throw error;
  }
  const vehicles = await store.list('vehicles', { limit: 500 });
  const vehicleNames = new Map(vehicles.map(vehicle => [Number(vehicle.id), vehicle.name]));
  const result = await Promise.all(visible.map(async trip => {
    const members = await store.list('tripStudents', {
      filters: [{ field: 'trip_id', op: '==', value: Number(trip.id) }],
      limit: 1000
    });
    return {
      ...trip, id: Number(trip.id), participant_count: members.length,
      vehicle_name: vehicleNames.get(Number(trip.vehicle_id)) || null,
      statusLabel: ({
        draft: 'Rascunho', pending_approval: 'Aguardando aprovação',
        approved: 'Aprovada', open: 'Inscrições abertas',
        completed: 'Concluída', cancelled: 'Cancelada'
      })[trip.status] || trip.status
    };
  }));
  return result.sort((a, b) => String(b.departure_at).localeCompare(String(a.departure_at))).slice(0, 100);
}

async function linkTripClass(tripId, classId, actorUserId = null) {
  const id = numericId(classId, 'Turma');
  return store.createTripRelationIfDraft('tripClasses', tripId, id, {
    trip_id: numericId(tripId, 'Viagem'), class_id: id,
    created_at: new Date().toISOString()
  }, actorUserId == null ? null : { actor_user_id: actorUserId, action: 'link_class', entity_type: 'trip', entity_id: tripId });
}

async function linkTripStudent(tripId, studentId, actorUserId = null) {
  return store.createTripStudentWithinCapacity(
    numericId(tripId, 'Viagem'), numericId(studentId, 'Estudante'),
    actorUserId == null ? null : { actor_user_id: actorUserId, action: 'link_student', entity_type: 'trip', entity_id: tripId }
  );
}

async function assignTripTeacher(tripId, userId, actorUserId = null) {
  const id = numericId(userId, 'Professor');
  return store.createTripRelationIfDraft('tripStaff', tripId, id, {
    trip_id: numericId(tripId, 'Viagem'), user_id: id,
    assignment_label: 'Professor responsável', created_at: new Date().toISOString()
  }, actorUserId == null ? null : { actor_user_id: actorUserId, action: 'assign_teacher', entity_type: 'trip', entity_id: tripId });
}

async function submitTrip(tripId, actorUserId = null) {
  return store.transitionTripStatus(tripId, 'draft', 'pending_approval', {}, true,
    actorUserId == null ? null : { actor_user_id: actorUserId, action: 'submit_for_approval', entity_type: 'trip', entity_id: tripId });
}

async function approveTrip(tripId, approverId) {
  return store.transitionTripStatus(tripId, 'pending_approval', 'approved', {
    approved_by: Number(approverId)
  }, false, { actor_user_id: approverId, action: 'approve', entity_type: 'trip', entity_id: tripId });
}



async function listVehicles() {
  const vehicles = await store.list('vehicles', {
    filters: [{ field: 'active', op: '==', value: true }],
    limit: 500
  });
  return vehicles.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}


async function getReportSummary() {
  const [trips, students, vehicles, participants] = await Promise.all([
    store.list('trips', { limit: 500 }),
    store.list('students', { filters: [{ field: 'active', op: '==', value: true }], limit: 5000 }),
    store.list('vehicles', { filters: [{ field: 'active', op: '==', value: true }], limit: 500 }),
    store.list('tripStudents', { limit: 5000 })
  ]);
  const vehicleNames = new Map(vehicles.map(vehicle => [Number(vehicle.id), vehicle.name]));
  const perTrip = new Map();
  const totals = {
    trips: trips.length,
    students: students.length,
    vehicles: vehicles.length,
    participants: participants.length,
    authorized: 0,
    pending: 0,
    declined: 0,
    paper_recorded: 0,
    departure_present: 0,
    departure_absent: 0,
    return_present: 0,
    return_absent: 0
  };
  for (const participant of participants) {
    const tripId = Number(participant.trip_id);
    if (!perTrip.has(tripId)) {
      perTrip.set(tripId, {
        participants: 0, authorized: 0, pending: 0, declined: 0,
        paper_recorded: 0, departure_present: 0, departure_absent: 0,
        return_present: 0, return_absent: 0
      });
    }
    const row = perTrip.get(tripId);
    row.participants += 1;
    const authorization = ['authorized', 'declined', 'paper_recorded'].includes(participant.authorization_status)
      ? participant.authorization_status : 'pending';
    row[authorization] += 1;
    totals[authorization] += 1;
    if (participant.departure_present === true) {
      row.departure_present += 1;
      totals.departure_present += 1;
    } else if (participant.departure_present === false) {
      row.departure_absent += 1;
      totals.departure_absent += 1;
    }
    if (participant.return_present === true) {
      row.return_present += 1;
      totals.return_present += 1;
    } else if (participant.return_present === false) {
      row.return_absent += 1;
      totals.return_absent += 1;
    }
  }
  const rows = trips.map(trip => {
    const counts = perTrip.get(Number(trip.id)) || {
      participants: 0, authorized: 0, pending: 0, declined: 0,
      paper_recorded: 0, departure_present: 0, departure_absent: 0,
      return_present: 0, return_absent: 0
    };
    return {
      id: Number(trip.id), title: trip.title, destination: trip.destination,
      departure_at: trip.departure_at, status: trip.status,
      capacity: Number(trip.capacity), vehicle_name: vehicleNames.get(Number(trip.vehicle_id)) || null,
      ...counts
    };
  }).sort((a, b) => String(b.departure_at).localeCompare(String(a.departure_at))).slice(0, 100);
  return {
    generated_at: new Date().toISOString(),
    partial: trips.length > 100 || trips.length === 500 || students.length === 5000 ||
      vehicles.length === 500 || participants.length === 5000,
    totals,
    trips: rows
  };
}

async function createVehicle(data, actorUserId) {
  const name = String(data.name).trim();
  const id = await store.createUnique('vehicles', 'name_key', name.toLocaleLowerCase('pt-BR'), {
    name,
    type: data.type,
    capacity: Number(data.capacity),
    active: true,
    created_by: Number(actorUserId),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }, {
    actor_user_id: Number(actorUserId),
    action: 'create',
    entity_type: 'vehicle'
  });
  return Number(id);
}

async function assignTripVehicle(tripId, vehicleId, actorUserId) {
  return store.assignTripVehicle(
    numericId(tripId, 'Viagem'),
    numericId(vehicleId, 'Veículo'),
    {
      actor_user_id: Number(actorUserId),
      action: 'assign_vehicle',
      entity_type: 'trip',
      entity_id: numericId(tripId, 'Viagem')
    }
  );
}

async function listTripParticipantsForUser(tripId, user) {
  const id = numericId(tripId, 'Viagem');
  const trip = await getTrip(id);
  if (!trip) return null;
  const participations = await store.list('tripStudents', {
    filters: [{ field: 'trip_id', op: '==', value: id }],
    limit: 5000
  });
  let allowedStudentIds = null;
  if (['admin', 'direction', 'secretariat'].includes(user.role)) {
    allowedStudentIds = new Set(participations.map(item => Number(item.student_id)));
  } else if (user.role === 'teacher') {
    const assignment = await store.get('tripStaff', id + '_' + numericId(user.id, 'Usuário'));
    if (!assignment) {
      const error = new Error('Você não está vinculado a esta viagem.');
      error.code = 'forbidden';
      throw error;
    }
    allowedStudentIds = new Set(participations.map(item => Number(item.student_id)));
  } else if (user.role === 'guardian') {
    const links = await store.list('studentGuardians', {
      filters: [{ field: 'guardian_user_id', op: '==', value: Number(user.id) }],
      limit: 1000
    });
    allowedStudentIds = new Set(links.map(item => Number(item.student_id)));
  } else if (user.role === 'student') {
    const ownStudents = await store.list('students', {
      filters: [
        { field: 'user_id', op: '==', value: Number(user.id) },
        { field: 'active', op: '==', value: true }
      ],
      limit: 10
    });
    allowedStudentIds = new Set(ownStudents.map(item => Number(item.id)));
  } else {
    const error = new Error('Seu perfil não permite consultar participantes.');
    error.code = 'forbidden';
    throw error;
  }

  const visible = participations.filter(item => allowedStudentIds.has(Number(item.student_id)));
  const result = await Promise.all(visible.map(async item => {
    const student = await store.get('students', item.student_id);
    if (!student || student.active !== true) return null;
    return {
      student_id: Number(item.student_id),
      full_name: student.full_name,
      authorization_status: item.authorization_status || 'pending',
      departure_present: item.departure_present ?? null,
      return_present: item.return_present ?? null
    };
  }));
  return result.filter(Boolean).sort((a, b) => a.full_name.localeCompare(b.full_name));
}

async function setTripStudentAuthorization(tripId, studentId, guardianId, status) {
  return store.setTripStudentAuthorization(
    numericId(tripId, 'Viagem'),
    numericId(studentId, 'Estudante'),
    numericId(guardianId, 'Responsável'),
    status,
    {
      actor_user_id: Number(guardianId),
      action: status === 'authorized' ? 'authorize_trip_student' : 'decline_trip_student',
      entity_type: 'trip_student',
      entity_id: numericId(tripId, 'Viagem') + '_' + numericId(studentId, 'Estudante')
    }
  );
}


async function recordPaperAuthorization(tripId, studentId, actorUser) {
  const tripKey = numericId(tripId, 'Viagem');
  const studentKey = numericId(studentId, 'Estudante');
  return store.recordPaperAuthorization(
    tripKey, studentKey, numericId(actorUser.id, 'Usuário'), actorUser.role,
    {
      actor_user_id: Number(actorUser.id),
      action: 'record_paper_authorization',
      entity_type: 'trip_student',
      entity_id: tripKey + '_' + studentKey
    }
  );
}

async function setTripAttendance(tripId, studentId, actorUser, checkpoint, present) {
  const tripKey = numericId(tripId, 'Viagem');
  const studentKey = numericId(studentId, 'Estudante');
  return store.setTripAttendance(
    tripKey, studentKey, numericId(actorUser.id, 'Usuário'),
    actorUser.role, checkpoint, present,
    {
      actor_user_id: Number(actorUser.id),
      action: 'mark_' + checkpoint + '_' + (present ? 'present' : 'absent'),
      entity_type: 'trip_student',
      entity_id: tripKey + '_' + studentKey
    }
  );
}

module.exports = {
  audit, listClasses, createClass, getClass, createStudent,
  listStudentsForUser, linkGuardian, createTrip, getTrip,
  listTripsForUser, linkTripClass, linkTripStudent,
  assignTripTeacher, submitTrip, approveTrip,
  listTripParticipantsForUser, setTripStudentAuthorization, setTripAttendance,
  listVehicles, createVehicle, assignTripVehicle, getReportSummary,
  recordPaperAuthorization
};
