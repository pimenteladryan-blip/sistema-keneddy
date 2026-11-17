# SGVE | Sistema de Gerenciamento de Viagens Escolares

O **SGVE** é um sistema demonstrativo desenvolvido para apoiar a organização de viagens escolares do **Colégio Estadual Presidente Kennedy (CEPK)**, em Ponta Grossa/PR.

A proposta é reunir, em um só lugar, informações sobre viagens, estudantes, autorizações, transporte, professores, presença e relatórios, com acesso organizado conforme o perfil de cada usuário.

## Acesse o sistema

**[ABRIR SGVE | Acessar a versão publicada](https://pimenteladryan-blip.github.io/sistema-keneddy/)**

Hospedagem: **GitHub Pages**. O projeto não depende do Render. A versão publicada é uma demonstração estática e pode ser instalada como PWA em dispositivos compatíveis.

## Funcionalidades

- **Painel inicial:** resumo das atividades, próximas viagens, avisos e calendário.
- **Viagens escolares:** consulta e cadastro de viagens, destino, data, quantidade de participantes, foto, valor, formas de pagamento e situação.
- **Solicitação de vaga:** estudantes e responsáveis podem demonstrar interesse nas viagens disponíveis.
- **Alunos:** consulta de estudantes fictícios, organização por turma e número de chamada.
- **Autorizações:** acompanhamento do status das autorizações de exemplo.
- **Transportes:** consulta e cadastro demonstrativo de ônibus, micro-ônibus e vans, incluindo capacidade.
- **Professores:** consulta e cadastro demonstrativo da equipe e associação com viagens.
- **Controle de presença:** lista de estudantes por viagem e registro de presença por perfis autorizados.
- **Relatórios:** indicadores de viagens, estudantes, autorizações e veículos, com exportação de arquivos CSV.
- **Pagamentos:** configuração demonstrativa do valor por pessoa, limite de parcelas e formas aceitas.
- **Notificações:** central com exemplos de comunicados.
- **Alarme de viagem:** configuração de lembrete pessoal para o horário de acordar. O navegador precisa permitir notificações e permanecer apto a executar o sistema; não substitui um despertador do aparelho.
- **Perfil:** edição do nome e foto de perfil.
- **Acessibilidade de uso:** interface adaptável a computador e celular, tema claro/escuro e instalação PWA.

## Perfis e permissões

| Perfil | Acesso principal |
|---|---|
| Administrador | Todos os módulos, inclusive gerenciamento de usuários. |
| Direção | Consulta e gestão dos módulos escolares, aprovação de viagens e relatórios. Não acessa Usuários. |
| Secretaria | Organização de viagens, alunos, autorizações, transportes, professores e relatórios. |
| Professor | Consulta viagens, alunos, autorizações, transportes, equipe e relatórios. Também pode registrar presença. Não cadastra nem exclui registros gerais. |
| Responsável | Consulta as informações disponíveis, acompanha autorizações vinculadas no exemplo e pode solicitar vaga em viagem. |
| Estudante | Consulta as informações disponíveis, acompanha o controle de faltas e pode solicitar vaga em viagem. Não altera registros nem marca presença. |

O módulo **Usuários** é exclusivo do administrador. Os formulários de cadastro e as ações de alteração são apresentados somente aos perfis autorizados.

## Tecnologias e ferramentas utilizadas

### Demonstração publicada
- **HTML5:** estrutura das páginas e formulários.
- **CSS3:** identidade visual, responsividade, tema claro/escuro e adaptação para telas menores.
- **JavaScript:** navegação, regras de interface, validações e funcionalidades interativas.
- **localStorage:** armazenamento local dos dados fictícios da demonstração.
- **sessionStorage:** manutenção da sessão de demonstração no navegador.
- **PWA e Service Worker:** recursos para instalação e cache da aplicação.
- **Git e GitHub:** versionamento e hospedagem do código.
- **GitHub Pages e GitHub Actions:** publicação automática da demonstração estática.

### Estrutura de servidor do projeto
O repositório também contém uma estrutura de servidor local com **Node.js**, **Express** e **SQLite**, separada da demonstração estática publicada no GitHub Pages. Ela não está conectada ao site público.

## Como testar

A demonstração disponibiliza contas fictícias para experimentar os diferentes perfis:

| Perfil | E-mail |
|---|---|
| Administrador | `admin@sgve.demo` |
| Direção | `direcao@sgve.demo` |
| Secretaria | `secretaria@sgve.demo` |
| Professor | `professor@sgve.demo` |
| Responsável | `responsavel@sgve.demo` |
| Estudante | `estudante@sgve.demo` |

**Senha de demonstração:** `Kennedy2026`

Essas credenciais são públicas e servem somente para testar a interface. Não são contas seguras nem devem ser reutilizadas em outros serviços.

## Limitações e privacidade

A versão do GitHub Pages é um **protótipo de demonstração**: os dados ficam no armazenamento do navegador/dispositivo e não são sincronizados entre usuários ou aparelhos. Solicitações de vaga, presença, cadastros, fotos e demais registros locais não constituem uma operação escolar real.

Utilize exclusivamente dados fictícios. Não insira nomes, fotos, documentos, contatos ou informações reais de estudantes. Antes de qualquer uso institucional, o sistema precisa passar por revisão técnica e de segurança, validação da escola, avaliação de privacidade e LGPD, configuração de banco de dados compartilhado, backups e testes de permissões.

## Executar a versão de servidor localmente

Requer Node.js 24 ou superior.

1. Execute `npm install`.
2. Copie `.env.example` para `.env`.
3. Defina `ADMIN_EMAIL` e uma `ADMIN_PASSWORD` forte com pelo menos 14 caracteres.
4. Execute `npm start`.
5. Acesse `http://localhost:3000`.

Não existe senha administrativa padrão. Não envie o arquivo `.env` ao GitHub.

## Verificações do projeto

- `npm run check`
- `npm test`

---

**SGVE | Colégio Estadual Presidente Kennedy**  
Versão publicada: https://pimenteladryan-blip.github.io/sistema-keneddy/


## Backend e integração Firebase

O repositório mantém duas partes separadas:

- **GitHub Pages (`docs/`)**: demonstração estática com dados locais fictícios em `localStorage/sessionStorage`. Ela não usa o backend e não sincroniza dados entre aparelhos.
- **Servidor (`server/` e `public/`)**: aplicação Express com API e interface servida na mesma origem. Quando Firebase Admin está configurado, as rotas migradas usam Firestore; sem Firebase configurado, o servidor local mantém o modo SQLite de compatibilidade.

### Recursos implementados na branch de migração

- Firebase Admin SDK no servidor, Firestore e sessões com cookies HttpOnly.
- Login por e-mail/senha e login Google, com validação do token no servidor e exigência de conta previamente autorizada no SGVE.
- Gestão de usuários, solicitações de cadastro, turmas, estudantes, responsáveis e viagens usando Firestore.
- Transações para unicidade, geração de IDs, capacidade de viagens, vínculos e mudança de status.
- Eventos de auditoria gravados na mesma transação das operações críticas.
- Regras Firestore com negação de acesso direto para clientes web/mobile. O navegador deve acessar os dados pela API autenticada.
- Testes automatizados e integração com Firestore Emulator no GitHub Actions, incluindo teste de leitura anônima bloqueada.

### Estado e limites atuais

A integração está em desenvolvimento na branch `feature/firestore-auth-migration` e no [pull request de revisão](https://github.com/pimenteladryan-blip/sistema-keneddy/pull/1). **Ainda não foi mesclada na branch principal nem implantada no Render.** Os testes do emulador usam dados fictícios e não substituem um teste controlado com o projeto Firebase real.

Antes de qualquer uso institucional ainda são necessários: revisão final de segurança e privacidade/LGPD, confirmação dos índices no projeto real, teste de conexão com credenciais privadas no ambiente de hospedagem, estratégia de backup/restauração, migração validada de dados e autorização da escola. Não utilize dados reais de estudantes nesta fase.

### Segredos e credenciais

O servidor usa `FIREBASE_PROJECT_ID` e `FIREBASE_SERVICE_ACCOUNT_JSON`. A conta de serviço é uma credencial privada: configure-a somente como segredo no ambiente de hospedagem, nunca em arquivos versionados, no frontend ou em conversas. A configuração Web do Firebase é pública e não substitui a proteção do servidor. Não publique o backend até concluir as etapas de revisão e teste.
