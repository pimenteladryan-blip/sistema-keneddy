# Sistema Kennedy | SGVE

Sistema de Gerenciamento de Viagens Escolares do Colégio Estadual Presidente Kennedy.

## Estrutura

```text
.
├── public/
│   ├── assets/          # Mascotes e imagens
│   ├── css/             # Folhas de estilo
│   ├── js/              # Código da interface
│   ├── index.html
│   ├── firebase-config.js
│   ├── manifest.webmanifest
│   ├── sw.js
│   └── icon.svg
├── server/
│   └── index.js         # Servidor HTTP e entrega dos arquivos públicos
├── package.json
├── .gitignore
└── README.md
```

## Executar localmente

Requer Node.js 20 ou superior.

```bash
npm start
```

O servidor usa a variável `PORT` fornecida pelo ambiente (Render) ou a porta 3000 localmente.

Para verificar a sintaxe dos arquivos JavaScript:

```bash
npm run check
```

## Publicação no Render

Criar/Manter como **Web Service**. Comandos:

- Build Command: `npm install`
- Start Command: `npm start`

Não configurar como Static Site.

## Situação técnica importante

Esta branch mantém a versão atual da interface e organiza os arquivos sem substituir a aplicação por outra branch. O servidor aqui entrega os arquivos estáticos; ele ainda não implementa as rotas `/api` chamadas pela interface. Portanto, esta reorganização, sozinha, não torna cadastro, login por senha, turmas, estudantes ou viagens funcionais. A implementação e os testes da API devem ser uma etapa separada antes de considerar a versão pronta para uso.

A configuração web do Firebase é pública por natureza. Credenciais privadas do Firebase Admin nunca devem ser colocadas em arquivos públicos ou commitadas no repositório.

## Firebase Authentication e Firestore

Em produção, configure o Render como **Web Service** e adicione estas variáveis privadas:

- `NODE_ENV=production`
- `FIREBASE_PROJECT_ID=svge-14ec7`
- `FIREBASE_SERVICE_ACCOUNT_JSON`: JSON completo de uma conta de serviço do mesmo projeto Firebase
- `ADMIN_EMAIL`: e-mail da conta administrativa inicial
- `ADMIN_PASSWORD`: senha inicial forte, com pelo menos 14 caracteres
- `ADMIN_NAME`: nome exibido do administrador (opcional)

Nunca coloque o JSON da conta de serviço, a chave privada ou a senha administrativa no GitHub, no navegador ou em mensagens. Cadastre esses valores somente em **Render → Environment**. A conta de serviço deve ter acesso ao Firestore do projeto.

No Firebase Console, habilite **Authentication → Sign-in method → Email/Password** e **Google**. Em **Authentication → Settings → Authorized domains**, mantenha o domínio do serviço Render autorizado. O modelo de e-mail **Email address verification** deve estar ativo.

O cadastro público cria a identidade no Firebase Authentication, envia a verificação por e-mail e registra uma solicitação no Firestore. A solicitação só aparece para aprovação depois que o endereço estiver verificado. A aprovação cria o perfil ativo no SGVE. Senhas não são armazenadas no Firestore pelo SGVE.

Contas administrativas iniciais são vinculadas pelo servidor usando `ADMIN_EMAIL` e `ADMIN_PASSWORD`. Contas criadas pela equipe recebem a senha no Firebase Authentication e precisam confirmar o e-mail antes do primeiro acesso.

## Verificações

```bash
npm install
npm run check
```

A verificação de sintaxe não substitui testes de integração com Firebase Authentication e Firestore. Antes de publicar, teste cadastro, recebimento do e-mail, confirmação, aprovação administrativa, login, logout e permissões com contas de teste.
