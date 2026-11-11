// Configuração pública do aplicativo Web Firebase.
// Preencha com os dados exibidos em Configurações do projeto > Seus apps > SDK setup.
// Estes valores identificam o projeto, mas NÃO substituem as regras de segurança.
export const firebaseConfig = {
  apiKey: "COLE_A_API_KEY_DO_FIREBASE",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  projectId: "SEU_PROJECT_ID",
  storageBucket: "SEU_PROJETO.firebasestorage.app",
  messagingSenderId: "SEU_MESSAGING_SENDER_ID",
  appId: "SEU_APP_ID"
};

export const firebaseConfigured =
  firebaseConfig.apiKey !== "COLE_A_API_KEY_DO_FIREBASE" &&
  firebaseConfig.projectId !== "SEU_PROJECT_ID" &&
  firebaseConfig.appId !== "SEU_APP_ID";
