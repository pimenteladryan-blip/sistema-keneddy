# SGVE | Sistema de Gerenciamento de Viagens Escolares

O **SGVE** é um sistema demonstrativo desenvolvido para apoiar a organização de viagens escolares do **Colégio Estadual Presidente Kennedy (CEPK)**, em Ponta Grossa/PR.

A proposta é reunir, em um só lugar, informações sobre viagens, estudantes, autorizações, transporte, professores, presença e relatórios, com acesso organizado conforme o perfil de cada usuário.

## Acesse a demonstração

**[Abrir o SGVE](https://pimenteladryan-blip.github.io/sistema-keneddy/)**

A demonstração funciona pelo navegador e também pode ser instalada como PWA em dispositivos compatíveis.

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
O repositório também contém uma estrutura de aplicação com **Node.js**, **Express** e **SQLite**, além de configurações para implantação. Essa versão de servidor é separada da demonstração estática publicada no GitHub Pages.

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
Demonstração: https://pimenteladryan-blip.github.io/sistema-keneddy/
