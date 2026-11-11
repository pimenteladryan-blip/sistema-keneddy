// Configuração do aplicativo Web do Firebase (SGVE).
// Estes valores identificam o projeto; não inclua credenciais privadas neste arquivo.
export const firebaseConfig = {
  apiKey: "AIzaSyAjCY6nydEIs_v9vv8mDczk6ODRilPPy7c",
  authDomain: "svge-14ec7.firebaseapp.com",
  projectId: "svge-14ec7",
  storageBucket: "svge-14ec7.firebasestorage.app",
  messagingSenderId: "427867210389",
  appId: "1:427867210389:web:be34bea9e71787f571519c",
  measurementId: "G-8YG8N5TKFK"
};

export const firebaseConfigured = Object.values(firebaseConfig).every(
  (value) => typeof value === "string" && value.length > 0
);
