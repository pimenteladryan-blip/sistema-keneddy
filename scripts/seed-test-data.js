'use strict';

require('dotenv').config();

const crypto = require('node:crypto');
const { getAuth } = require('firebase-admin/auth');
const { firebaseApp, firebaseConfigured } = require('../server/firebase');
const firestoreAuth = require('../server/firestore-auth');

const TEST_USERS = [
  { email: 'teste.solicitacao.professor@example.com', display_name: 'TESTE - Professor', role: 'teacher' },
  { email: 'teste.solicitacao.responsavel@example.com', display_name: 'TESTE - Responsável', role: 'guardian' },
  { email: 'teste.solicitacao.estudante@example.com', display_name: 'TESTE - Estudante', role: 'student' }
];

async function main() {
  if (!firebaseConfigured || !firebaseApp) {
    throw new Error('Firebase Admin não está configurado neste ambiente.');
  }

  if (!process.argv.includes('--apply')) {
    console.log('Prévia: serão criadas/garantidas 3 solicitações de teste (professor, responsável e estudante).');
    console.log('Nenhum dado foi alterado. Execute npm run seed:test-data -- --apply para confirmar.');
    return;
  }

  const auth = getAuth(firebaseApp);
  for (const item of TEST_USERS) {
    let identity;
    try {
      identity = await auth.getUserByEmail(item.email);
      if (!String(identity.displayName || '').startsWith('TESTE -')) {
        throw new Error('O e-mail reservado já existe e não está identificado como conta de teste: ' + item.email);
      }
      if (identity.emailVerified !== true) {
        identity = await auth.updateUser(identity.uid, { emailVerified: true });
      }
    } catch (error) {
      if (error.code !== 'auth/user-not-found') throw error;
      identity = await auth.createUser({
        email: item.email,
        password: crypto.randomBytes(32).toString('base64url'),
        displayName: item.display_name,
        emailVerified: true,
        disabled: false
      });
    }

    const result = await firestoreAuth.createFirebaseRegistrationRequest({
      display_name: item.display_name,
      email: item.email,
      firebase_uid: identity.uid,
      role: item.role
    });
    console.log('Solicitação de teste pronta:', item.role, result.id);
  }

  console.log('Concluído. As três solicitações devem aparecer na área administrativa.');
}

main().catch(error => {
  console.error('Falha ao preparar dados de teste:', error.message);
  process.exitCode = 1;
});
