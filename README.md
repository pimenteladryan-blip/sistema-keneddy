# Sistema Kennedy | SGVE

Sistema de Gerenciamento de Viagens Escolares do Colégio Estadual Presidente Kennedy.

## Estrutura

- `public/`: interface, estilos, scripts, configuração web do Firebase e mascotes.
- `server/`: API Express, autenticação administrativa do Firebase e acesso ao Firestore.
- `database/schema.sql`: estrutura do banco local de desenvolvimento.
- `firestore.rules`: bloqueia acesso direto do navegador ao Firestore. A aplicação acessa os dados pela API confiável do servidor.

## Requisitos e execução local

Requer Node.js 22.5 ou superior.

1. Copie `.env.example` para `.env`.
2. Preencha as variáveis privadas do Firebase Admin e os dados do administrador inicial.
3. Instale e inicie:

```bash
npm install
npm start
```

O servidor usa a variável `PORT` fornecida pelo ambiente ou a porta 3000 localmente.

Para verificar a sintaxe JavaScript:

```bash
npm run check
```

## Configuração Firebase

No Firebase Console do projeto `svge-14ec7`:

1. Ative Authentication com **Email/Password** e **Google**.
2. Confirme o modelo **Email address verification**.
3. Em Authorized domains, autorize o domínio do serviço Render.
4. Crie/ative o Firestore Database.
5. Publique as regras de `firestore.rules`. O acesso direto do navegador fica bloqueado; o servidor usa Firebase Admin.

No Render, mantenha o serviço como **Web Service**, nunca Static Site:

- Build Command: `npm install`
- Start Command: `npm start`

Configure em **Render → Environment**:

- `NODE_ENV=production`
- `FIREBASE_PROJECT_ID=svge-14ec7`
- `FIREBASE_SERVICE_ACCOUNT_JSON`: JSON completo da conta de serviço do mesmo projeto
- `ADMIN_EMAIL`: e-mail da conta administrativa inicial
- `ADMIN_PASSWORD`: senha inicial com pelo menos 14 caracteres
- `ADMIN_NAME`: nome do administrador (opcional)

Nunca coloque o JSON da conta de serviço, chave privada ou senha administrativa no GitHub, navegador ou mensagens.

## Fluxo de acesso

O cadastro público cria uma identidade no Firebase Authentication e envia um link de verificação. A solicitação fica registrada no Firestore, mas só aparece para o administrador depois que o e-mail estiver confirmado. A aprovação cria o perfil ativo no SGVE. O login exige e-mail verificado e aprovação administrativa.

As senhas são gerenciadas pelo Firebase Authentication e não são armazenadas pelo SGVE no Firestore. Contas criadas pela equipe também precisam confirmar o e-mail antes do primeiro acesso.

## Validação antes da publicação

`npm run check` verifica a sintaxe dos arquivos JavaScript. Isso não substitui testes de integração. Antes de publicar, testar com contas fictícias: cadastro, entrega e confirmação do e-mail, aprovação/rejeição, login por senha, login Google, logout, permissões e operações dos módulos. Não usar dados reais de estudantes durante os testes.
