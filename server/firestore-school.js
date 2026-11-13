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

async function createClass(data) {
  const id = await store.createUniqueComposite('classes',
    ['level', 'grade', 'course', 'section', 'school_year'], {
      level: data.level, grade: data.grade, course: data.course,
      section: data.section, school_year: Number(data.schoolYear),
      active: true, created_at: new Date().toISOString()
    });
  return Number(id);
}

async function getClass(id) {
  return store.get('classes', numericId(id, 'Turma'));
}

async function createStudent(fullName, classId) {
  const schoolClass = await getClass(classId);
  if (!schoolClass || schoolClass.active === false) return null;
  const id = await store.createWithNumericId('students', {
    full_name: String(fullName).trim(),
    class_id: Number(classId),
    user_id: null,
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  return Number(id);
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
    students = results.filter(student => student && student.active !== false);
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

async function linkGuardian(studentId, guardianEmail, relationship) {
  const student = await store.get('students', numericId(studentId, 'Estudante'));
  const guardian = await store.getByUnique('users', 'email', guardianEmail);
  if (!student || student.active === false || !guardian ||
      guardian.role !== 'guardian' || guardian.active === false) return false;
  const id = Number(student.id) + '_' + Number(guardian.id);
  const existing = await store.get('studentGuardians', id);
  if (!existing) await store.create('studentGuardians', {
    student_id: Number(student.id), guardian_user_id: Number(guardian.id),
    relationship_label: relationship || null, created_at: new Date().toISOString()
  }, id);
  return true;
}

async function createTrip(data, createdBy) {
  const id = await store.createWithNumericId('trips', {
    title: data.title, destination: data.destination,
    educational_purpose: data.purpose,
    departure_at: data.departure, return_at: data.returning,
    capacity: Number(data.capacity), participant_count: 0, status: 'draft',
    created_by: Number(createdBy), approved_by: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  });
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
    const owned = new Set(students.filter(item => linked.has(Number(item.id))).map(item => Number(item.id)));
    const tripIds = new Set(participations.filter(item => owned.has(Number(item.student_id))).map(item => Number(item.trip_id)));
    visible = trips.filter(item => tripIds.has(Number(item.id)));
  } else if (user.role === 'student') {
    const owned = new Set(students.filter(item => Number(item.user_id) === Number(user.id)).map(item => Number(item.id)));
    const tripIds = new Set(participations.filter(item => owned.has(Number(item.student_id))).map(item => Number(item.trip_id)));
    visible = trips.filter(item => tripIds.has(Number(item.id)));
  } else if (!['admin', 'direction', 'secretariat'].includes(user.role)) {
    const error = new Error('Seu perfil não permite consultar viagens.');
    error.code = 'forbidden';
    throw error;
  }
  const result = await Promise.all(visible.map(async trip => {
    const members = await store.list('tripStudents', {
      filters: [{ field: 'trip_id', op: '==', value: Number(trip.id) }],
      limit: 1000
    });
    return {
      ...trip, id: Number(trip.id), participant_count: members.length,
      statusLabel: ({
        draft: 'Rascunho', pending_approval: 'Aguardando aprovação',
        approved: 'Aprovada', open: 'Inscrições abertas',
        completed: 'Concluída', cancelled: 'Cancelada'
      })[trip.status] || trip.status
    };
  }));
  return result.sort((a, b) => String(b.departure_at).localeCompare(String(a.departure_at))).slice(0, 100);
}

async function linkTripClass(tripId, classId) {
  const [trip, schoolClass] = await Promise.all([getTrip(tripId), getClass(classId)]);
  if (!trip || !schoolClass || schoolClass.active === false) return { error: 'not-found' };
  if (trip.status !== 'draft') return { error: 'not-draft' };
  const id = Number(trip.id) + '_' + Number(schoolClass.id);
  if (!await store.get('tripClasses', id)) {
    await store.create('tripClasses', {
      trip_id: Number(trip.id), class_id: Number(schoolClass.id),
      created_at: new Date().toISOString()
    }, id);
  }
  return { ok: true };
}

async function linkTripStudent(tripId, studentId) {
  return store.createTripStudentWithinCapacity(
    numericId(tripId, 'Viagem'), numericId(studentId, 'Estudante')
  );
}

async function assignTripTeacher(tripId, userId) {
  const [trip, teacher] = await Promise.all([
    getTrip(tripId), store.get('users', numericId(userId, 'Professor'))
  ]);
  if (!trip || !teacher || teacher.role !== 'teacher' || teacher.active === false) return { error: 'not-found' };
  if (trip.status !== 'draft') return { error: 'not-draft' };
  const id = Number(trip.id) + '_' + Number(teacher.id);
  if (!await store.get('tripStaff', id)) await store.create('tripStaff', {
    trip_id: Number(trip.id), user_id: Number(teacher.id),
    assignment_label: 'Professor responsável', created_at: new Date().toISOString()
  }, id);
  return { ok: true };
}

async function submitTrip(tripId) {
  const trip = await getTrip(tripId);
  if (!trip) return { error: 'not-found' };
  if (trip.status !== 'draft') return { error: 'not-draft' };
  const classes = await store.list('tripClasses', {
    filters: [{ field: 'trip_id', op: '==', value: Number(trip.id) }],
    limit: 500
  });
  if (!classes.length) return { error: 'no-classes' };
  await store.update('trips', trip.id, {
    status: 'pending_approval', updated_at: new Date().toISOString()
  });
  return { ok: true };
}

async function approveTrip(tripId, approverId) {
  const trip = await getTrip(tripId);
  if (!trip) return { error: 'not-found' };
  if (trip.status !== 'pending_approval') return { error: 'not-pending' };
  await store.update('trips', trip.id, {
    status: 'approved', approved_by: Number(approverId),
    updated_at: new Date().toISOString()
  });
  return { ok: true };
}

module.exports = {
  audit, listClasses, createClass, getClass, createStudent,
  listStudentsForUser, linkGuardian, createTrip, getTrip,
  listTripsForUser, linkTripClass, linkTripStudent,
  assignTripTeacher, submitTrip, approveTrip
};
