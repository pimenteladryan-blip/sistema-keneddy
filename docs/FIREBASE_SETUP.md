# Preparação do Firebase no SGVE

Esta branch contém a primeira camada de integração. A interface publicada ainda usa o modo demonstrativo: **não use dados reais de estudantes nesta etapa**.

## Arquivos adicionados

- `docs/js/firebase-config.js`: configuração pública do app Web (preencher no projeto da escola).
- `docs/js/firebase.js`: inicialização do SDK modular.
- `docs/js/firebase-auth.js`: cadastro pendente, login, logout e observação de sessão.
- `firestore.rules`: regras iniciais de segurança.
- `firebase.json`: aponta para as regras do Firestore.

## Configurar o aplicativo Web

1. No Firebase Console, abra Configurações do projeto > Geral > Seus apps.
2. Registre um app Web, caso ainda não exista.
3. Copie o objeto de configuração do SDK.
4. Substitua os valores de exemplo em `docs/js/firebase-config.js`.
5. Ative Authentication > Sign-in method > E-mail/senha.
6. Crie o banco Cloud Firestore em modo de produção.
7. Publique `firestore.rules` pelo Firebase CLI (`firebase deploy --only firestore:rules`) ou copie o conteúdo para a aba Regras do Firestore e publique.

A configuração Web contém identificadores públicos do projeto, não uma credencial administrativa. Nunca coloque chave de conta de serviço, token privado ou segredo de servidor no site.

## Primeiro administrador

O cadastro público aceita somente os perfis `estudante`, `responsavel` e `professor`, todos com estado `pending`. Isso evita que alguém se conceda perfil administrativo.

O primeiro administrador precisa ser provisionado por uma pessoa autorizada da escola, depois de validar a identidade e o UID da conta, usando procedimento administrativo seguro. Não habilite um botão público para promover usuários.

## Modelo inicial esperado

- `users/{uid}`: `name`, `email`, `role`, `status` (pending/active/disabled).
- `classes/{classId}`: `name`, `schoolYear`, `active`.
- `students/{studentId}`: cadastro do estudante e `classId` atual, quando aplicável.
- `enrollments/{studentId}_{classId}`: `studentId`, `classId`, `active`.
- `teacherAssignments/{teacherUid}_{classId}`: `teacherUid`, `classId`, `active`.
- `guardianships/{guardianUid}_{studentId}`: `guardianUid`, `studentId`, `active`.
- `attendance/{attendanceId}`: `studentId`, `classId`, `teacherUid`, `date`, `status`.

## Importante antes de publicar

As regras são uma primeira barreira e precisam ser testadas no Firebase Emulator Suite com cada um dos seis perfis. A consulta do professor deve filtrar explicitamente pelas turmas atribuídas. O esquema final de alunos/matrículas e os campos reais do SGVE ainda precisam ser alinhados antes de ligar telas ou importar qualquer cadastro.

A tela atual, as rotinas demonstrativas e o service worker não foram substituídos nesta etapa. Não há migração de dados fictícios para o Firestore. A branch `firebase-integracao` está isolada da `main`.
