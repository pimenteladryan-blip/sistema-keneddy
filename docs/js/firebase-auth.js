// Operações básicas de autenticação. A criação de conta não concede privilégios.
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { auth, db, firebaseConfigured } from "./firebase.js";

function requireFirebase() {
  if (!firebaseConfigured || !auth || !db) {
    throw new Error("Firebase ainda não foi configurado. Preencha docs/js/firebase-config.js.");
  }
}

const PUBLIC_ROLES = new Set(["estudante", "responsavel", "professor"]);

export async function registerAccount({ name, email, password, role }) {
  requireFirebase();
  const cleanName = String(name || "").trim();
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanName || !cleanEmail || !password) throw new Error("Preencha nome, e-mail e senha.");
  if (!PUBLIC_ROLES.has(role)) throw new Error("Perfil não permitido para cadastro público.");

  const credential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
  await updateProfile(credential.user, { displayName: cleanName });
  await setDoc(doc(db, "users", credential.user.uid), {
    name: cleanName,
    email: cleanEmail,
    role,
    status: "pending",
    createdAt: serverTimestamp()
  });
  return credential.user;
}

export async function loginAccount(email, password) {
  requireFirebase();
  const credential = await signInWithEmailAndPassword(auth, String(email || "").trim(), password);
  return credential.user;
}

export async function logoutAccount() {
  requireFirebase();
  return signOut(auth);
}

export function observeAuth(callback) {
  requireFirebase();
  return onAuthStateChanged(auth, callback);
}
