# SGVE | Sistema de Gerenciamento de Viagens Escolares

O **SGVE** é uma aplicação em desenvolvimento para apoiar a organização de viagens escolares do **Colégio Estadual Presidente Kennedy (CEPK)**, em Ponta Grossa/PR.

## Acesse o sistema

**[ABRIR SGVE no Render](https://sistema-keneddy.onrender.com/)**

A antiga demonstração estática do GitHub Pages, que utilizava contas e registros fictícios armazenados no navegador, foi retirada. O acesso público do GitHub Pages agora encaminha para a aplicação hospedada no Render.

## Funcionalidades implementadas no servidor

- Autenticação por e-mail e senha e login Google, com validação no servidor.
- Solicitação de cadastro com aprovação administrativa.
- Gestão de usuários, turmas e estudantes.
- Cadastro e planejamento de viagens escolares.
- Vínculo de turmas, estudantes, professores, responsáveis, veículos e condutores às viagens.
- Autorizações familiares e registro administrativo de autorização em papel.
- Controle de presença na saída e no retorno.
- Relatórios agregados e exportação CSV.
- Controle de acesso por perfil, proteção CSRF, sessões seguras e auditoria das operações.
- Interface responsiva com identidade visual do CEPK.

## Dados e autenticação

A aplicação do Render usa a API do servidor e o Firestore quando o Firebase Admin está configurado. Não há conta administrativa demonstrativa nem senha padrão. As contas válidas devem ser criadas e autorizadas pela administração responsável.

Os dados sintéticos permanecem somente nos testes automatizados e no Firestore Emulator. Eles servem para verificar os fluxos sem inserir registros fictícios no banco usado pela aplicação hospedada.

**Não cadastre dados reais de estudantes ou da comunidade escolar sem autorização formal da instituição, revisão de privacidade/LGPD, política de acesso e rotina de backup aprovadas.**

## Executar localmente

Requer Node.js 24 ou superior.

1. Execute `npm install`.
2. Copie `.env.example` para `.env`.
3. Configure as variáveis necessárias. Para produção, use `FIREBASE_PROJECT_ID` e `FIREBASE_SERVICE_ACCOUNT_JSON` somente no ambiente seguro do servidor.
4. Defina `ADMIN_EMAIL` e uma `ADMIN_PASSWORD` forte com pelo menos 14 caracteres, se a inicialização administrativa estiver habilitada no ambiente.
5. Execute `npm start`.
6. Acesse `http://localhost:3000`.

Nunca envie o arquivo `.env`, chaves privadas ou JSON de conta de serviço ao GitHub.

## Verificações

- `npm run check`
- `npm test`
- `npm run test:firestore`

## Documentação

- [Planejamento do projeto](docs/PLANEJAMENTO.md)
- [Plano de migração SQLite para Firestore](docs/MIGRACAO_FIRESTORE.md)

O plano de migração é documentação técnica. Não significa que dados reais tenham sido importados. Testes no emulador não substituem validação controlada no projeto Firebase real.

---

**SGVE | Colégio Estadual Presidente Kennedy**
