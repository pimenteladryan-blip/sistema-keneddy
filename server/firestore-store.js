'use strict';

const { createHash } = require('node:crypto');
const { firestore } = require('./firebase');

const COLLECTIONS = Object.freeze({
  users: 'users',
  sessions: 'sessions',
  classes: 'classes',
  students: 'students',
  studentAccountLinks: 'student_account_links',
  studentGuardians: 'student_guardians',
  trips: 'trips',
  vehicles: 'vehicles',
  drivers: 'drivers',
  tripClasses: 'trip_classes',
  tripStudents: 'trip_students',
  tripStaff: 'trip_staff',
  auditLogs: 'audit_logs',
  registrationRequests: 'registration_requests'
});

function addAuditWrite(transaction, db, event) {
  if (!event) return;
  const actor = event.actor_user_id == null ? null : Number(event.actor_user_id);
  if (actor !== null && (!Number.isSafeInteger(actor) || actor < 1)) {
    throw new TypeError('Responsável pelo evento de auditoria inválido.');
  }
  if (typeof event.action !== 'string' || !event.action.trim() || event.action.length > 80 ||
      typeof event.entity_type !== 'string' || !event.entity_type.trim() || event.entity_type.length > 80) {
    throw new TypeError('Evento de auditoria inválido.');
  }
  const ref = db.collection('audit_logs').doc();
  transaction.create(ref, {
    actor_user_id: actor,
    action: event.action.trim(),
    entity_type: event.entity_type.trim(),
    entity_id: event.entity_id == null ? null : String(event.entity_id),
    created_at: new Date().toISOString()
  });
}

function requireFirestore() {
  if (!firestore) {
    throw new Error('Firestore não configurado. Defina FIREBASE_PROJECT_ID e FIREBASE_SERVICE_ACCOUNT_JSON.');
  }
  return firestore;
}

function collection(name) {
  const path = COLLECTIONS[name];
  if (!path) throw new Error('Coleção SGVE desconhecida: ' + name);
  return requireFirestore().collection(path);
}

function normalizeId(id) {
  const value = String(id ?? '').trim();
  if (!value || value.length > 150 || value.includes('/')) {
    throw new TypeError('Identificador inválido.');
  }
  return value;
}

async function get(name, id) {
  const snapshot = await collection(name).doc(normalizeId(id)).get();
  return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
}

async function list(name, options = {}) {
  let query = collection(name);
  for (const filter of options.filters || []) {
    if (!filter || typeof filter.field !== 'string' ||
        !['==', '!=', '<', '<=', '>', '>=', 'in', 'array-contains'].includes(filter.op)) {
      throw new TypeError('Filtro Firestore inválido.');
    }
    query = query.where(filter.field, filter.op, filter.value);
  }
  if (options.orderBy) {
    query = query.orderBy(options.orderBy.field, options.orderBy.direction || 'asc');
  }
  if (Number.isInteger(options.limit) && options.limit > 0) {
    query = query.limit(Math.min(options.limit, 5000));
  }
  const snapshot = await query.get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function create(name, data, id) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new TypeError('Os dados do documento devem ser um objeto.');
  }
  const ref = id === undefined ? collection(name).doc() : collection(name).doc(normalizeId(id));
  await ref.create({ ...data, created_at: data.created_at || new Date().toISOString() });
  return ref.id;
}

async function set(name, id, data, options = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new TypeError('Os dados do documento devem ser um objeto.');
  }
  await collection(name).doc(normalizeId(id)).set(data, { merge: options.merge === true });
}

async function update(name, id, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new TypeError('Os dados do documento devem ser um objeto.');
  }
  await collection(name).doc(normalizeId(id)).update(data);
}

async function remove(name, id) {
  await collection(name).doc(normalizeId(id)).delete();
}


const UNIQUE_FIELDS = Object.freeze({
  users: ['email'],
  registrationRequests: ['email'],
  vehicles: ['name_key'],
  drivers: ['name_key']
});

function uniqueIndexRef(name, field, value) {
  if (!UNIQUE_FIELDS[name]?.includes(field)) {
    throw new TypeError('Campo único não permitido para esta coleção.');
  }
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized || normalized.length > 254) throw new TypeError('Valor único inválido.');
  const key = createHash('sha256').update(normalized).digest('hex');
  return requireFirestore().collection('_sgve_unique_indexes').doc(name + '_' + field + '_' + key);
}

async function getByUnique(name, field, value) {
  const index = await uniqueIndexRef(name, field, value).get();
  if (!index.exists) return null;
  return get(name, index.data().documentId);
}

async function createUnique(name, field, value, data, auditEvent = null) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new TypeError('Os dados do documento devem ser um objeto.');
  }
  const db = requireFirestore();
  const indexRef = uniqueIndexRef(name, field, value);
  const counterRef = db.collection('_sgve_counters').doc(name);
  const normalized = String(value).trim().toLowerCase();
  return db.runTransaction(async transaction => {
    const indexSnapshot = await transaction.get(indexRef);
    if (indexSnapshot.exists) {
      const error = new Error('Registro duplicado: ' + field);
      error.code = 'already-exists';
      throw error;
    }
    const counterSnapshot = await transaction.get(counterRef);
    const id = (counterSnapshot.exists ? Number(counterSnapshot.data().value) : 0) + 1;
    const documentRef = collection(name).doc(String(id));
    transaction.create(documentRef, { ...data, [field]: normalized });
    transaction.set(counterRef, { value: id, updated_at: new Date().toISOString() });
    transaction.create(indexRef, { documentId: String(id), value: normalized });
    addAuditWrite(transaction, db, auditEvent ? { ...auditEvent, entity_id: id } : null);
    return id;
  });
}

async function createUniqueWithId(name, field, value, id, data) {
  if (!Number.isSafeInteger(Number(id)) || Number(id) < 1 ||
      !data || typeof data !== 'object' || Array.isArray(data)) {
    throw new TypeError('Identificador ou dados de importação inválidos.');
  }
  const db = requireFirestore();
  const documentId = String(Number(id));
  const indexRef = uniqueIndexRef(name, field, value);
  const documentRef = collection(name).doc(documentId);
  const counterRef = db.collection('_sgve_counters').doc(name);
  const normalized = String(value ?? '').trim().toLowerCase();
  return db.runTransaction(async transaction => {
    const [indexSnapshot, documentSnapshot, counterSnapshot] = await Promise.all([
      transaction.get(indexRef), transaction.get(documentRef), transaction.get(counterRef)
    ]);
    if (indexSnapshot.exists || documentSnapshot.exists) {
      const indexedId = indexSnapshot.exists
        ? String(indexSnapshot.data().documentId)
        : null;
      const existingData = documentSnapshot.exists ? documentSnapshot.data() : null;
      const existingEmail = existingData
        ? String(existingData.email || '').trim().toLowerCase()
        : null;
      const sameAccount = existingData &&
        existingData.display_name === data.display_name &&
        existingData.password_hash === data.password_hash &&
        existingData.role === data.role &&
        existingData.active === data.active;
      if (indexedId === documentId && existingEmail === normalized && sameAccount) {
        return documentId;
      }
      const error = new Error('Conflito de ID ou e-mail durante a importação.');
      error.code = 'already-exists';
      throw error;
    }
    const current = counterSnapshot.exists ? Number(counterSnapshot.data().value) : 0;
    const next = Math.max(Number.isSafeInteger(current) ? current : 0, Number(documentId));
    transaction.create(documentRef, { ...data, [field]: normalized });
    transaction.create(indexRef, { documentId, value: normalized });
    transaction.set(counterRef, { value: next, updated_at: new Date().toISOString() });
    return documentId;
  });
}

async function nextNumericId(name) {
  if (!COLLECTIONS[name]) throw new Error('Coleção SGVE desconhecida: ' + name);
  const db = requireFirestore();
  const counter = db.collection('_sgve_counters').doc(name);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(counter);
    const next = (snapshot.exists ? Number(snapshot.data().value) : 0) + 1;
    transaction.set(counter, { value: next, updated_at: new Date().toISOString() });
    return next;
  });
}

async function createWithNumericId(name, data, auditEvent = null) {
  if (!COLLECTIONS[name]) throw new Error('Coleção SGVE desconhecida: ' + name);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new TypeError('Os dados do documento devem ser um objeto.');
  }
  const db = requireFirestore();
  const counterRef = db.collection('_sgve_counters').doc(name);
  return db.runTransaction(async transaction => {
    const counterSnapshot = await transaction.get(counterRef);
    const current = counterSnapshot.exists ? Number(counterSnapshot.data().value) : 0;
    if (!Number.isSafeInteger(current) || current < 0 || current >= Number.MAX_SAFE_INTEGER) {
      throw new Error('Contador numérico inválido para a coleção: ' + name);
    }
    const id = current + 1;
    const now = new Date().toISOString();
    const documentRef = collection(name).doc(String(id));
    transaction.create(documentRef, {
      ...data,
      created_at: data.created_at || now
    });
    transaction.set(counterRef, { value: id, updated_at: now });
    addAuditWrite(transaction, db, auditEvent ? { ...auditEvent, entity_id: id } : null);
    return id;
  });
}


async function upsertUnique(name, field, value, createData, updateData, allowedExistingValues = []) {
  if (!createData || typeof createData !== 'object' || Array.isArray(createData) ||
      !updateData || typeof updateData !== 'object' || Array.isArray(updateData)) {
    throw new TypeError('Os dados do documento devem ser objetos.');
  }
  const db = requireFirestore();
  const indexRef = uniqueIndexRef(name, field, value);
  const counterRef = db.collection('_sgve_counters').doc(name);
  const normalized = String(value).trim().toLowerCase();
  return db.runTransaction(async transaction => {
    const indexSnapshot = await transaction.get(indexRef);
    if (indexSnapshot.exists) {
      const documentRef = collection(name).doc(normalizeId(indexSnapshot.data().documentId));
      const documentSnapshot = await transaction.get(documentRef);
      if (!documentSnapshot.exists) throw new Error('Índice único inconsistente no Firestore.');
      const existing = documentSnapshot.data();
      if (!allowedExistingValues.includes(existing.status)) {
        const error = new Error(existing.status === 'pending'
          ? 'Já existe uma solicitação pendente para este e-mail.'
          : 'Já existe um registro para este e-mail.');
        error.code = existing.status === 'pending' ? 'already-pending' : 'already-exists';
        throw error;
      }
      transaction.update(documentRef, updateData);
      return { id: documentRef.id, updated: true };
    }
    const counterSnapshot = await transaction.get(counterRef);
    const id = (counterSnapshot.exists ? Number(counterSnapshot.data().value) : 0) + 1;
    const documentRef = collection(name).doc(String(id));
    transaction.create(documentRef, { ...createData, [field]: normalized });
    transaction.set(counterRef, { value: id, updated_at: new Date().toISOString() });
    transaction.create(indexRef, { documentId: String(id), value: normalized });
    return { id: String(id), updated: false };
  });
}


async function createUniqueComposite(name, fields, data, auditEvent = null) {
  if (!['classes'].includes(name) || !Array.isArray(fields) || fields.length !== 5 ||
      fields.some(field => typeof field !== 'string' || !field)) {
    throw new TypeError('Chave composta não permitida.');
  }
  const normalized = fields.map((field, index) => {
    const value = data[field];
    if (value === undefined || value === null || String(value).trim() === '') {
      throw new TypeError('Campo obrigatório para chave composta: ' + field);
    }
    return index === 4 ? String(Number(value)) : String(value).trim().toLowerCase();
  });
  const key = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  const db = requireFirestore();
  const indexRef = db.collection('_sgve_unique_indexes').doc(name + '_composite_' + key);
  const counterRef = db.collection('_sgve_counters').doc(name);
  return db.runTransaction(async transaction => {
    const indexSnapshot = await transaction.get(indexRef);
    if (indexSnapshot.exists) {
      const error = new Error('Registro duplicado.');
      error.code = 'already-exists';
      throw error;
    }
    const counterSnapshot = await transaction.get(counterRef);
    const id = (counterSnapshot.exists ? Number(counterSnapshot.data().value) : 0) + 1;
    const documentRef = collection(name).doc(String(id));
    transaction.create(documentRef, { ...data, id, created_at: data.created_at || new Date().toISOString() });
    transaction.set(counterRef, { value: id, updated_at: new Date().toISOString() });
    transaction.create(indexRef, { documentId: String(id), fields: normalized });
    addAuditWrite(transaction, db, auditEvent ? { ...auditEvent, entity_id: id } : null);
    return id;
  });
}


async function createTripRelationIfDraft(name, tripId, relatedId, data, auditEvent = null) {
  if (!['tripClasses', 'tripStaff'].includes(name)) {
    throw new TypeError('Relação de viagem não permitida.');
  }
  const tripKey = normalizeId(tripId);
  const relatedKey = normalizeId(relatedId);
  const tripRef = collection('trips').doc(tripKey);
  const targetCollection = name === 'tripClasses' ? 'classes' : 'users';
  const targetRef = collection(targetCollection).doc(relatedKey);
  const relationRef = collection(name).doc(tripKey + '_' + relatedKey);
  return requireFirestore().runTransaction(async transaction => {
    const [tripSnapshot, targetSnapshot, relationSnapshot] = await Promise.all([
      transaction.get(tripRef), transaction.get(targetRef), transaction.get(relationRef)
    ]);
    if (!tripSnapshot.exists) return { error: 'not-found' };
    if (tripSnapshot.data().status !== 'draft') return { error: 'not-draft' };
    if (!targetSnapshot.exists || targetSnapshot.data().active !== true) {
      return { error: 'target-not-found' };
    }
    if (name === 'tripStaff' && targetSnapshot.data().role !== 'teacher') {
      return { error: 'target-not-found' };
    }
    if (!relationSnapshot.exists) {
      transaction.create(relationRef, data);
      addAuditWrite(transaction, requireFirestore(), auditEvent);
    }
    return { ok: true };
  });
}

async function transitionTripStatus(tripId, expectedStatus, nextStatus, extra = {}, requireLinkedClass = false, auditEvent = null) {
  const tripKey = normalizeId(tripId);
  const db = requireFirestore();
  const tripRef = collection('trips').doc(tripKey);
  return db.runTransaction(async transaction => {
    const tripSnapshot = await transaction.get(tripRef);
    if (!tripSnapshot.exists) return { error: 'not-found' };
    if (tripSnapshot.data().status !== expectedStatus) {
      return { error: expectedStatus === 'draft' ? 'not-draft' : 'not-pending' };
    }
    if (requireLinkedClass) {
      const classesQuery = collection('tripClasses')
        .where('trip_id', '==', Number(tripKey)).limit(1);
      const classesSnapshot = await transaction.get(classesQuery);
      if (classesSnapshot.empty) return { error: 'no-classes' };
    }
    transaction.update(tripRef, {
      status: nextStatus, ...extra, updated_at: new Date().toISOString()
    });
    addAuditWrite(transaction, db, auditEvent);
    return { ok: true };
  });
}

async function createStudentInActiveClass(fullName, classId, auditEvent = null) {
  const classKey = normalizeId(classId);
  const db = requireFirestore();
  const classRef = collection('classes').doc(classKey);
  const counterRef = db.collection('_sgve_counters').doc('students');
  return db.runTransaction(async transaction => {
    const [classSnapshot, counterSnapshot] = await Promise.all([
      transaction.get(classRef), transaction.get(counterRef)
    ]);
    if (!classSnapshot.exists || classSnapshot.data().active !== true) {
      return { error: 'class-not-found' };
    }
    const id = (counterSnapshot.exists ? Number(counterSnapshot.data().value) : 0) + 1;
    const now = new Date().toISOString();
    transaction.create(collection('students').doc(String(id)), {
      full_name: String(fullName).trim(), class_id: Number(classKey),
      user_id: null, active: true, created_at: now, updated_at: now
    });
    transaction.set(counterRef, { value: id, updated_at: now });
    addAuditWrite(transaction, db, auditEvent ? { ...auditEvent, entity_id: id } : null);
    return { id };
  });
}

async function linkStudentAccount(studentId, userId, auditEvent = null) {
  const studentKey = normalizeId(studentId);
  const userKey = normalizeId(userId);
  const db = requireFirestore();
  const studentRef = collection('students').doc(studentKey);
  const userRef = collection('users').doc(userKey);
  // A deterministic per-account document serializes concurrent attempts to
  // link the same account to different student records.
  const accountLinkRef = collection('studentAccountLinks').doc(userKey);
  return db.runTransaction(async transaction => {
    const [studentSnapshot, userSnapshot, accountLinkSnapshot, legacyLinksSnapshot] = await Promise.all([
      transaction.get(studentRef),
      transaction.get(userRef),
      transaction.get(accountLinkRef),
      transaction.get(collection('students').where('user_id', '==', Number(userKey)).limit(2))
    ]);
    if (!studentSnapshot.exists || studentSnapshot.data().active !== true) return { error: 'student-not-found' };
    if (!userSnapshot.exists || userSnapshot.data().active !== true || userSnapshot.data().role !== 'student') {
      return { error: 'student-account-not-found' };
    }
    const currentUserId = studentSnapshot.data().user_id == null ? null : Number(studentSnapshot.data().user_id);
    const linkedStudentId = accountLinkSnapshot.exists ? Number(accountLinkSnapshot.data().student_id) : null;
    const legacyStudent = legacyLinksSnapshot.docs.find(doc => doc.id !== studentKey);
    if (legacyStudent || (linkedStudentId !== null && linkedStudentId !== Number(studentKey))) {
      return { error: 'account-already-linked' };
    }
    if (currentUserId !== null && currentUserId !== Number(userKey)) return { error: 'student-already-linked' };
    if (currentUserId === Number(userKey)) {
      if (!accountLinkSnapshot.exists) {
        transaction.create(accountLinkRef, {
          student_id: Number(studentKey), user_id: Number(userKey),
          created_at: new Date().toISOString()
        });
      }
      return { ok: true, changed: false };
    }
    transaction.update(studentRef, { user_id: Number(userKey), updated_at: new Date().toISOString() });
    if (!accountLinkSnapshot.exists) {
      transaction.create(accountLinkRef, {
        student_id: Number(studentKey), user_id: Number(userKey),
        created_at: new Date().toISOString()
      });
    }
    addAuditWrite(transaction, db, auditEvent);
    return { ok: true, changed: true };
  });
}

async function linkGuardianIfActive(studentId, guardianId, relationship, auditEvent = null) {
  const studentKey = normalizeId(studentId);
  const guardianKey = normalizeId(guardianId);
  const studentRef = collection('students').doc(studentKey);
  const guardianRef = collection('users').doc(guardianKey);
  const relationRef = collection('studentGuardians').doc(studentKey + '_' + guardianKey);
  return requireFirestore().runTransaction(async transaction => {
    const [studentSnapshot, guardianSnapshot, relationSnapshot] = await Promise.all([
      transaction.get(studentRef), transaction.get(guardianRef), transaction.get(relationRef)
    ]);
    if (!studentSnapshot.exists || studentSnapshot.data().active !== true ||
        !guardianSnapshot.exists || guardianSnapshot.data().active !== true ||
        guardianSnapshot.data().role !== 'guardian') return false;
    if (!relationSnapshot.exists) {
      transaction.create(relationRef, {
        student_id: Number(studentKey), guardian_user_id: Number(guardianKey),
        relationship_label: relationship || null, created_at: new Date().toISOString()
      });
      addAuditWrite(transaction, requireFirestore(), auditEvent);
    }
    return true;
  });
}

async function createTripStudentWithinCapacity(tripId, studentId, auditEvent = null) {
  const tripKey = normalizeId(tripId);
  const studentKey = normalizeId(studentId);
  const tripRef = collection('trips').doc(tripKey);
  const studentRef = collection('students').doc(studentKey);
  const participantRef = collection('tripStudents').doc(tripKey + '_' + studentKey);
  return requireFirestore().runTransaction(async transaction => {
    const [tripSnapshot, studentSnapshot, participantSnapshot] = await Promise.all([
      transaction.get(tripRef), transaction.get(studentRef), transaction.get(participantRef)
    ]);
    if (!tripSnapshot.exists || !studentSnapshot.exists || studentSnapshot.data().active !== true) {
      return { error: 'not-found' };
    }
    const trip = tripSnapshot.data();
    const student = studentSnapshot.data();
    if (trip.status !== 'draft') return { error: 'not-draft' };
    const capacity = Number(trip.capacity);
    if (!Number.isSafeInteger(capacity) || capacity < 1) return { error: 'invalid-capacity' };
    const classKey = normalizeId(student.class_id);
    const classLinkRef = collection('tripClasses').doc(tripKey + '_' + classKey);
    const classRef = collection('classes').doc(classKey);
    const [classLinkSnapshot, classSnapshot] = await Promise.all([
      transaction.get(classLinkRef), transaction.get(classRef)
    ]);
    if (!classLinkSnapshot.exists) return { error: 'class-not-linked' };
    if (!classSnapshot.exists || classSnapshot.data().active !== true) return { error: 'class-not-found' };
    if (participantSnapshot.exists) return { ok: true };
    let count = Number(trip.participant_count);
    if (!Number.isSafeInteger(count) || count < 0) {
      const existing = await transaction.get(
        collection('tripStudents').where('trip_id', '==', Number(tripKey))
      );
      count = existing.size;
    }
    if (!Number.isSafeInteger(count) || count < 0) return { error: 'invalid-count' };
    if (count >= capacity) return { error: 'capacity' };
    transaction.create(participantRef, {
      trip_id: Number(tripKey), student_id: Number(studentKey),
      authorization_status: 'pending', departure_present: null,
      return_present: null, created_at: new Date().toISOString()
    });
    transaction.update(tripRef, {
      participant_count: count + 1, updated_at: new Date().toISOString()
    });
    addAuditWrite(transaction, requireFirestore(), auditEvent);
    return { ok: true };
  });
}


async function setTripStudentAuthorization(tripId, studentId, guardianId, status, auditEvent = null) {
  if (!['authorized', 'declined'].includes(status)) {
    throw new TypeError('Status de autorização inválido.');
  }
  const tripKey = normalizeId(tripId);
  const studentKey = normalizeId(studentId);
  const guardianKey = normalizeId(guardianId);
  const db = requireFirestore();
  const tripRef = collection('trips').doc(tripKey);
  const studentRef = collection('students').doc(studentKey);
  const guardianRef = collection('users').doc(guardianKey);
  const guardianLinkRef = collection('studentGuardians').doc(studentKey + '_' + guardianKey);
  const participantRef = collection('tripStudents').doc(tripKey + '_' + studentKey);
  return db.runTransaction(async transaction => {
    const [tripSnapshot, studentSnapshot, guardianSnapshot, guardianLinkSnapshot, participantSnapshot] =
      await Promise.all([
        transaction.get(tripRef), transaction.get(studentRef), transaction.get(guardianRef),
        transaction.get(guardianLinkRef), transaction.get(participantRef)
      ]);
    if (!tripSnapshot.exists || !studentSnapshot.exists || studentSnapshot.data().active !== true) {
      return { error: 'not-found' };
    }
    if (!guardianSnapshot.exists || guardianSnapshot.data().active !== true ||
        guardianSnapshot.data().role !== 'guardian' || !guardianLinkSnapshot.exists) {
      return { error: 'forbidden' };
    }
    if (!participantSnapshot.exists) return { error: 'not-participant' };
    const trip = tripSnapshot.data();
    if (!['approved', 'open'].includes(trip.status)) return { error: 'not-approved' };
    const departureAt = Date.parse(trip.departure_at);
    if (!Number.isFinite(departureAt) || Date.now() >= departureAt) return { error: 'closed' };
    const currentStatus = participantSnapshot.data().authorization_status || 'pending';
    if (currentStatus === status) return { ok: true, changed: false };
    if (currentStatus === 'paper_recorded') return { error: 'already-decided' };
    const now = new Date().toISOString();
    transaction.update(participantRef, {
      authorization_status: status,
      authorization_updated_at: now,
      authorization_updated_by: Number(guardianKey)
    });
    addAuditWrite(transaction, db, auditEvent);
    return { ok: true, changed: true };
  });
}


async function recordPaperAuthorization(tripId, studentId, actorUserId, actorRole, auditEvent = null) {
  if (!['admin', 'direction', 'secretariat'].includes(actorRole)) {
    return { error: 'forbidden' };
  }
  const tripKey = normalizeId(tripId);
  const studentKey = normalizeId(studentId);
  const actorKey = normalizeId(actorUserId);
  const db = requireFirestore();
  const tripRef = collection('trips').doc(tripKey);
  const studentRef = collection('students').doc(studentKey);
  const participantRef = collection('tripStudents').doc(tripKey + '_' + studentKey);
  return db.runTransaction(async transaction => {
    const [tripSnapshot, studentSnapshot, participantSnapshot] = await Promise.all([
      transaction.get(tripRef), transaction.get(studentRef), transaction.get(participantRef)
    ]);
    if (!tripSnapshot.exists || !studentSnapshot.exists || studentSnapshot.data().active !== true) {
      return { error: 'not-found' };
    }
    if (!participantSnapshot.exists) return { error: 'not-participant' };
    const trip = tripSnapshot.data();
    if (!['approved', 'open'].includes(trip.status)) return { error: 'not-approved' };
    const departureAt = Date.parse(trip.departure_at);
    if (!Number.isFinite(departureAt) || Date.now() >= departureAt) return { error: 'closed' };
    const currentStatus = participantSnapshot.data().authorization_status || 'pending';
    if (currentStatus === 'paper_recorded') return { ok: true, changed: false };
    if (currentStatus !== 'pending') return { error: 'already-decided' };
    transaction.update(participantRef, {
      authorization_status: 'paper_recorded',
      authorization_method: 'paper',
      authorization_updated_at: new Date().toISOString(),
      authorization_updated_by: Number(actorKey)
    });
    addAuditWrite(transaction, db, auditEvent);
    return { ok: true, changed: true };
  });
}

async function setTripAttendance(tripId, studentId, actorUserId, actorRole, checkpoint, present, auditEvent = null) {
  if (!['departure', 'return'].includes(checkpoint) || typeof present !== 'boolean') {
    throw new TypeError('Registro de presença inválido.');
  }
  if (!['admin', 'direction', 'secretariat', 'teacher'].includes(actorRole)) {
    return { error: 'forbidden' };
  }
  const tripKey = normalizeId(tripId);
  const studentKey = normalizeId(studentId);
  const actorKey = normalizeId(actorUserId);
  const db = requireFirestore();
  const tripRef = collection('trips').doc(tripKey);
  const studentRef = collection('students').doc(studentKey);
  const participantRef = collection('tripStudents').doc(tripKey + '_' + studentKey);
  const staffRef = collection('tripStaff').doc(tripKey + '_' + actorKey);
  return db.runTransaction(async transaction => {
    const [tripSnapshot, studentSnapshot, participantSnapshot, staffSnapshot] = await Promise.all([
      transaction.get(tripRef), transaction.get(studentRef), transaction.get(participantRef),
      actorRole === 'teacher' ? transaction.get(staffRef) : Promise.resolve(null)
    ]);
    if (!tripSnapshot.exists || !studentSnapshot.exists || studentSnapshot.data().active !== true) {
      return { error: 'not-found' };
    }
    if (!participantSnapshot.exists) return { error: 'not-participant' };
    if (actorRole === 'teacher' && !staffSnapshot.exists) return { error: 'not-assigned' };
    if (!['approved', 'open'].includes(tripSnapshot.data().status)) return { error: 'not-approved' };
    const field = checkpoint === 'departure' ? 'departure_present' : 'return_present';
    if (participantSnapshot.data()[field] === present) return { ok: true, changed: false };
    transaction.update(participantRef, {
      [field]: present,
      [field + '_updated_at']: new Date().toISOString(),
      [field + '_updated_by']: Number(actorKey)
    });
    addAuditWrite(transaction, db, auditEvent);
    return { ok: true, changed: true };
  });
}


async function assignTripDriver(tripId, driverId, auditEvent = null) {
  const tripKey = normalizeId(tripId);
  const driverKey = normalizeId(driverId);
  const db = requireFirestore();
  const tripRef = collection('trips').doc(tripKey);
  const driverRef = collection('drivers').doc(driverKey);
  return db.runTransaction(async transaction => {
    const [tripSnapshot, driverSnapshot] = await Promise.all([
      transaction.get(tripRef), transaction.get(driverRef)
    ]);
    if (!tripSnapshot.exists) return { error: 'not-found' };
    if (!driverSnapshot.exists || driverSnapshot.data().active !== true) {
      return { error: 'driver-not-found' };
    }
    const trip = tripSnapshot.data();
    const driver = driverSnapshot.data();
    if (trip.status !== 'draft') return { error: 'not-draft' };
    const departure = Date.parse(trip.departure_at);
    const returning = Date.parse(trip.return_at);
    if (!Number.isFinite(departure) || !Number.isFinite(returning) || departure >= returning) {
      return { error: 'invalid-schedule' };
    }
    const assignments = await transaction.get(
      collection('trips').where('driver_id', '==', Number(driverKey))
    );
    for (const assigned of assignments.docs) {
      if (assigned.id === tripKey) continue;
      const existing = assigned.data();
      if (['cancelled', 'completed'].includes(existing.status)) continue;
      const existingDeparture = Date.parse(existing.departure_at);
      const existingReturn = Date.parse(existing.return_at);
      if (!Number.isFinite(existingDeparture) || !Number.isFinite(existingReturn) ||
          (departure < existingReturn && returning > existingDeparture)) {
        return { error: 'schedule-conflict' };
      }
    }
    if (Number(trip.driver_id) === Number(driverKey)) return { ok: true, changed: false };
    transaction.update(driverRef, {
      schedule_version: Number(driver.schedule_version || 0) + 1,
      updated_at: new Date().toISOString()
    });
    transaction.update(tripRef, {
      driver_id: Number(driverKey),
      updated_at: new Date().toISOString()
    });
    addAuditWrite(transaction, db, auditEvent);
    return { ok: true, changed: true };
  });
}

async function assignTripVehicle(tripId, vehicleId, auditEvent = null) {
  const tripKey = normalizeId(tripId);
  const vehicleKey = normalizeId(vehicleId);
  const db = requireFirestore();
  const tripRef = collection('trips').doc(tripKey);
  const vehicleRef = collection('vehicles').doc(vehicleKey);
  return db.runTransaction(async transaction => {
    const [tripSnapshot, vehicleSnapshot] = await Promise.all([
      transaction.get(tripRef), transaction.get(vehicleRef)
    ]);
    if (!tripSnapshot.exists) return { error: 'not-found' };
    if (!vehicleSnapshot.exists || vehicleSnapshot.data().active !== true) {
      return { error: 'vehicle-not-found' };
    }
    const trip = tripSnapshot.data();
    const vehicle = vehicleSnapshot.data();
    if (trip.status !== 'draft') return { error: 'not-draft' };
    const tripCapacity = Number(trip.capacity);
    const vehicleCapacity = Number(vehicle.capacity);
    if (!Number.isSafeInteger(tripCapacity) || tripCapacity < 1 ||
        !Number.isSafeInteger(vehicleCapacity) || vehicleCapacity < tripCapacity) {
      return { error: 'insufficient-capacity' };
    }
    const departure = Date.parse(trip.departure_at);
    const returning = Date.parse(trip.return_at);
    if (!Number.isFinite(departure) || !Number.isFinite(returning) || departure >= returning) {
      return { error: 'invalid-schedule' };
    }
    const assignments = await transaction.get(
      collection('trips').where('vehicle_id', '==', Number(vehicleKey))
    );
    for (const assigned of assignments.docs) {
      if (assigned.id === tripKey) continue;
      const existing = assigned.data();
      if (['cancelled', 'completed'].includes(existing.status)) continue;
      const existingDeparture = Date.parse(existing.departure_at);
      const existingReturn = Date.parse(existing.return_at);
      if (!Number.isFinite(existingDeparture) || !Number.isFinite(existingReturn) ||
          (departure < existingReturn && returning > existingDeparture)) {
        return { error: 'schedule-conflict' };
      }
    }
    if (Number(trip.vehicle_id) === Number(vehicleKey)) return { ok: true, changed: false };
    transaction.update(tripRef, {
      vehicle_id: Number(vehicleKey),
      updated_at: new Date().toISOString()
    });
    addAuditWrite(transaction, db, auditEvent);
    return { ok: true, changed: true };
  });
}

module.exports = {
  COLLECTIONS,
  get,
  list,
  create,
  set,
  update,
  remove,
  nextNumericId,
  createWithNumericId,
  getByUnique,
  createUnique,
  createUniqueWithId,
  upsertUnique,
  createUniqueComposite,
  createTripStudentWithinCapacity,
  createStudentInActiveClass,
  linkGuardianIfActive,
  linkStudentAccount,
  createTripRelationIfDraft,
  transitionTripStatus,
  setTripStudentAuthorization,
  recordPaperAuthorization,
  setTripAttendance,
  assignTripVehicle,
  assignTripDriver
};
