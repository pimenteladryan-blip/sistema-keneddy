# Planejamento do SGVE
## Sistema de Gerenciamento de Viagens Escolares

**Instituição de referência:** Colégio Estadual Presidente Kennedy — Ponta Grossa/PR  
**Repositório:** https://github.com/pimenteladryan-blip/sistema-keneddy  
**Status:** Fundação, cadastros, viagens, autorizações, presença, transporte básico e relatórios agregados implementados; validação institucional e produção pendentes.

## Objetivo
Aplicação web responsiva para organizar viagens escolares, participantes, autorizações, frequência, transporte e relatórios. Como poderá tratar dados de crianças e adolescentes, não deve ser usada com dados reais antes de revisão técnica, validação institucional e avaliação de privacidade/LGPD.

## Perfis de acesso
- **Administrador:** configuração e gestão completa de contas.
- **Direção:** aprova viagens e acompanha relatórios; pode administrar cadastros.
- **Secretaria:** mantém cadastros escolares e organiza viagens; não cria contas administrativas.
- **Professor:** consulta somente viagens atribuídas ao seu perfil.
- **Responsável legal:** consulta somente viagens ligadas aos estudantes sob sua responsabilidade.
- **Estudante:** consulta somente viagens vinculadas ao próprio cadastro.

As permissões são verificadas no servidor. Esconder opções na interface não é considerado controle de segurança.

## Módulos e situação
1. **Fundação e acesso — implementado:** Node.js, Express, SQLite, login, sessões, CSRF, perfis e testes.
2. **Cadastros iniciais — implementado:** turmas, estudantes com dados mínimos, contas e associação de responsáveis.
3. **Gestão inicial de viagens — implementado:** criação de rascunho, vínculo de turmas/estudantes, envio para aprovação e aprovação pela direção/administração.
4. **Autorizações — backend implementado:** decisão digital pelo responsável vinculado e registro administrativo de autorização em papel, com trilha de auditoria. O sistema registra o status, não recebe nem armazena fotografia/documento assinado.
5. **Presença — backend e interface implementados:** listas de saída e retorno, com trilha de auditoria; validação visual final ainda pendente.
6. **Equipe e transporte — backend e interface básicos implementados:** atribuição de professores, cadastro de veículos e condutores e atribuição de ambos às viagens, com bloqueio de conflitos de horário; validação operacional e regras institucionais da frota ainda pendentes.
7. **Relatórios — parcialmente implementado:** resumo agregado e exportação CSV restritos à gestão, sem nomes de estudantes; filtros, relatórios específicos e eventual módulo financeiro ainda pendentes.
8. **Implantação — pendente:** revisão de segurança, privacidade, acessibilidade, backups, monitoramento e aprovação institucional.

## Etapas escolares
- Ensino Fundamental: 6º ao 9º ano.
- Ensino Médio: 1ª à 3ª série.
- Ensino Médio Regular e Técnico (ADM e DS).
- Divisões flexíveis por ano letivo.

## Arquitetura
- Interface: HTML, CSS e JavaScript.
- Servidor: Node.js 24+ e Express.
- Banco: SQLite para protótipo; avaliar banco gerenciado antes de uso institucional/múltiplas instâncias.
- Hospedagem: Render ou ambiente aprovado, com armazenamento persistente.
- Testes: regras de negócio, permissões e fluxos críticos.

## Segurança e privacidade
- Usar somente dados fictícios em desenvolvimento.
- Cadastro inicial de estudante contém apenas nome e turma.
- Responsáveis e estudantes só consultam viagens ligadas aos próprios vínculos.
- Professores só consultam viagens atribuídas; a atribuição de equipe precisa ser concluída antes de liberar listas.
- Não publicar documentos, endereços, telefones, autorizações ou listas de estudantes.
- Definir finalidade, base legal, retenção, correção e eliminação dos dados.
- Revisar controle de acesso, rate limiting, CSRF, sessões e logs.
- Preparar backups criptografados e testar restauração.
- Validar com a escola e obter revisão de privacidade/segurança antes da operação.

## Fora do escopo inicial
GPS em tempo real, aplicativo nativo, integração automática com sistemas oficiais e processamento de pagamentos.

## Próxima entrega
Validar visualmente os fluxos de transporte e relatórios com contas fictícias, definir relatórios e regras operacionais com a escola; depois revisar segurança, privacidade e operação institucional.

## Funcionalidades do protótipo estático (GitHub Pages)

A demonstração em `docs/` permite testar, com dados exclusivamente fictícios:
- Login local com seleção de Administrador, Direção, Secretaria, Professor, Responsável e Estudante.
- Visão de viagens, cadastro e exclusão de viagens e alteração de situação por Direção/Administração.
- Cadastro e consulta de estudantes fictícios e turmas.
- Acompanhamento de autorizações demonstrativas.
- Cadastro e remoção de veículos de exemplo.
- Cadastro de professores e associação a viagens.
- Lista demonstrativa de presença por viagem.
- Indicadores e exportação de relatórios CSV.
- Consulta dos perfis de demonstração e restauração dos dados locais.

**Limites importantes:** GitHub Pages não executa o servidor nem conecta ao SQLite. O login e as permissões dessa demonstração são apenas simulações no navegador; os registros ficam no `localStorage` do próprio navegador e não sincronizam entre dispositivos. Não usar nomes, contatos, documentos, autorizações ou qualquer dado real de estudantes. A autenticação e as permissões reais precisam ser feitas no servidor antes de qualquer uso institucional.


## Histórico de implementação e planejamento técnico (atualizado em 17/11/2026)

### Concluído no branch de desenvolvimento `feature/firestore-auth-migration`
- [x] Configuração do Firebase Admin SDK no servidor, lendo credencial somente de variável de ambiente e validando o projeto `svge-14ec7`.
- [x] Criação da base Firestore em `southamerica-east1` e configuração pública do Firebase Web no frontend de demonstração.
- [x] Autenticação Google no servidor: validação do ID token, e-mail verificado, conta previamente autorizada, sessão HttpOnly e auditoria.
- [x] Sessões do Firestore: consulta, expiração e encerramento com auditoria.
- [x] Camada de armazenamento Firestore com coleções permitidas, índices únicos e contadores transacionais.
- [x] Integração Firestore para turmas, estudantes, vínculo de responsáveis e fluxo inicial de viagens (rascunho, vínculos, envio e aprovação).
- [x] Testes automáticos anteriores dos commits de integração de viagens e correção de capacidade aprovados no GitHub Actions.
- [x] Nesta etapa: login por e-mail/senha, solicitações de cadastro, criação de contas, aprovação/rejeição de solicitações, listagem de usuários e bootstrap administrativo com ramificação Firestore quando configurado.

### Em andamento / próximos passos
- [x] Adicionados testes isolados e de integração para autenticação/cadastros Firestore, duplicidade, conta inativa, aprovação/rejeição via API e permissões dos seis perfis.
- [x] Teste específico de duas aprovações simultâneas concluído no Firestore Emulator; CI passou nas execuções 44084612085 e 44084621629.
- [x] Integração ponta a ponta com dados fictícios validada no Firestore Emulator, incluindo Express/API.
- [ ] Executar teste controlado no projeto Firebase real, com contas fictícias e sem dados de estudantes.
- [x] Arquitetura same-origin definida: Express serve `public/` e a API no mesmo host; `docs/` permanece demonstração separada. Cookies, Origin e CSRF mantidos.
- [x] Evitar a inicialização do SQLite quando Firebase estiver configurado: sessão, autenticação, cadastros e módulos integrados passam a usar Firestore sem criar banco local efêmero.
- [x] Cadastro e atribuição básica de condutores concluídos no SQLite e Firestore, com controle de conflito de agenda e interface; relatórios agregados já têm backend e interface.\n- [ ] Confirmar regras operacionais da frota e relatórios específicos com a escola; revisar dependências SQLite e plano de importação preservando IDs e relações.
- [x] Documentado em `docs/MIGRACAO_FIRESTORE.md` o plano de migração SQLite → Firestore, com mapeamento de tabelas, preservação de IDs/relações, índices/contadores, critérios de aceite e rollback; nenhum dado real foi exportado ou importado.
- [ ] Criar e revisar um importador idempotente, testá-lo no Emulator com dados sintéticos e só depois planejar teste controlado autorizado no Firebase real.
- [x] Gestão de ativação/desativação de contas e bootstrap administrativo implementados no Firestore; a validação real ainda depende de teste controlado no projeto Firebase.
- [ ] Fazer revisão de segurança, privacidade/LGPD, acessibilidade, backup/restauração e validação institucional.
- [ ] Só depois configurar segredo de conta de serviço no Render, testar leitura e escrita real, configurar persistência/infraestrutura adequada e preparar implantação. Não implantar antes de aprovação explícita.

### Registro de alterações no GitHub
- Branch de trabalho: `feature/firestore-auth-migration`.
- PR de desenvolvimento: https://github.com/pimenteladryan-blip/sistema-keneddy/pull/1 (permanece aberto e não mesclado).
- Commits da fundação Firestore/autenticação Google e integração parcial: `5bdf556`, `2bd0e77`, `0586741`, `9336f49`, `9beeca5`, `f8aef90`.
- Commit `56fe5f9`: servidor deixa de inicializar SQLite quando Firestore está configurado; GitHub Actions verificou sintaxe e todos os testes passaram.
- Commits desta etapa: `da371ba` (sessões com senha), `47f94f2` (rotas de contas e solicitações no Firestore), `88ce582` (registro do planejamento), `a844690` (correções de validação/compatibilidade), `48d8b98` (teste de sessões por senha e Google) e `ac4791f` (isolamento dos testes e CI verde).
- Correção do ambiente dos testes: os testes de integração SQLite agora desativam explicitamente a credencial Firebase, evitando que dependam de segredos externos ou tentem usar Firestore em vez do banco temporário.
- GitHub Actions no commit `ac4791f` concluiu com sucesso: verificação de sintaxe, protótipo e todos os testes automatizados passaram.
- A migração de rotas de contas foi validada pelos testes existentes, mas ainda falta teste de integração real com Firestore e revisão do fluxo de permissões.
- Cada nova etapa, alteração de código, teste e pendência deve ser registrada neste planejamento.
- GitHub Actions verde confirma os testes automatizados existentes, não substitui teste real de leitura/escrita no Firestore.

### Revisão técnica rápida (17/11/2026)
- [x] Conferido o HEAD do PR #1: `dd1e3261675a5bf77d2dea2cc3e8c13375ae1dd3`.
- [x] Conferido GitHub Actions desse commit: execução `44007977240` concluída com resultado `success`.
- [x] Auditoria estática de `server/index.js`: os acessos SQLite encontrados nas rotas de autenticação, turmas, estudantes, responsáveis, usuários, solicitações e viagens estão dentro dos caminhos de fallback SQLite; no modo Firebase, os respectivos caminhos retornam/ramificam para Firestore antes de acessar `db`. O middleware de sessão e o bootstrap administrativo também têm ramificação explícita.
- [ ] Isso ainda não comprova que todas as rotas e regras de negócio funcionam no Firestore real; manter testes de integração e revisão de permissões como bloqueadores.
- [x] Frontend real `public/` servido pelo Express na mesma origem da API; GitHub Pages `docs/` permanece demonstração separada. A validação final de cookies/domínio/HTTPS no Render continua pendente.
- [x] Etapas de frontend/API same-origin, login Google com ID token, testes Firestore Emulator e revisão inicial de endpoints concluídas. Permanecem pendentes testes reais, revisão independente e módulos restantes.
- Não mesclar o PR nem implantar sem aprovação explícita. Nenhuma chave privada deve ser enviada ao chat ou commitada.

### Integração inicial do login Google no frontend (17/11/2026)
- [x] Criado `public/firebase-config.js` com apenas a configuração pública do Firebase Web; nenhuma chave privada foi adicionada.
- [x] Adicionados SDKs Firebase compat via CDN e botão “Entrar com Google” em `public/index.html`.
- [x] Integrado `public/js/app.js`: popup Google, obtenção do Firebase ID token, envio para `POST /api/auth/google`, criação da sessão do servidor e encerramento da sessão Firebase ao sair.
- [x] Ajustada a Content Security Policy do Express para permitir somente os hosts necessários ao SDK/Auth do Firebase nesta implementação.
- [x] GitHub Actions de frontend/CSP e login Google passaram nos workflows mais recentes da branch, incluindo o commit `c9c6f0b864fb6f8ad25f835241ab4e5786d8fbbe`.
- [ ] Testar login Google somente quando o frontend `public/` e a API estiverem servidos na mesma origem HTTPS; GitHub Pages `docs/` continua sendo demonstração separada e não deve ser usado para testar a sessão do backend.
- [ ] Antes do teste real, revisar a CSP com o navegador, confirmar domínio autorizado do Firebase e configurar a credencial privada apenas no ambiente seguro do Render por um adulto responsável. Não usar dados reais de estudantes.

### Testes automatizados do login Google (17/11/2026)
- [x] Criado `test/google-login-frontend.test.js` para validar ordem de carregamento dos SDKs, botão Google, obtenção/envio do ID token, configuração pública sem credenciais privadas, verificação do token no servidor e hospedagem do frontend/API na mesma origem.
- [x] Testes automatizados do login Google passaram no GitHub Actions, inclusive no commit `c9c6f0b864fb6f8ad25f835241ab4e5786d8fbbe`.
- [ ] Testes estáticos não substituem um teste ponta a ponta com popup Google e Firestore real/emulador.

### Etapa concluída: testes de integração do Firestore (17/11/2026)
- [x] Adicionado modo Firestore Emulator restrito a `NODE_ENV=test`; se `FIRESTORE_EMULATOR_HOST` for informado fora de testes, a inicialização falha com erro explícito. O caminho de produção continua exigindo credencial privada do Firebase Admin.
- [x] Criado `firebase.json` para o emulador local do Firestore.
- [x] Criado `test/firestore-emulator.test.js`: exercita índices únicos e usuários, sessões/auditoria, criação/listagem de turmas e estudantes, vínculo de responsáveis, capacidade de viagem, equipe, submissão/aprovação, solicitação de cadastro e desativação de conta.
- [x] O teste também inicia a aplicação Express em modo Firestore e valida via HTTP login por senha, criação de turma/estudante/viagem, vínculos, aprovação, consulta e logout. Dados são fictícios e isolados no emulador.
- [x] Pipeline CI agora prepara Java 21 e executa Firestore Emulator; execução `44010800638`, commit `73ee543b8436e9b82e6493e01e00f7d64f115af4`, concluída com sucesso.
- [x] CI foi configurado para executar também em pushes da branch de migração, não apenas em PRs.
- [ ] O emulador não substitui teste de conectividade/autorização no projeto Firebase real. Isso depende de configurar a conta de serviço de forma privada no ambiente de hospedagem, sem compartilhar a chave no chat ou GitHub.

### Próxima etapa prioritária
- [x] Matriz HTTP inicial dos seis perfis exercitada no Firestore Emulator, com leituras permitidas e operações proibidas; revisão independente final permanece pendente.
- [x] `firestore.indexes.json` criado e vinculado ao `firebase.json`, com índices das consultas conhecidas.
- [ ] Confirmar índices adicionais após consultas reais controladas no Firebase.
- [x] Atomicidade dos eventos de auditoria nas operações críticas e integridade transacional dos contadores numéricos revisadas e testadas no Firestore Emulator.
- [ ] Preparar Render somente depois dos testes e da revisão de segurança. Não mesclar nem implantar sem autorização explícita.

### Etapa de índices e matriz de permissões (17/11/2026)
- [x] Criado `firestore.indexes.json` com índices compostos para consultas de estudantes por `user_id + active` e fila de solicitações por `status + created_at`.
- [x] Referenciado o arquivo de índices em `firebase.json` e incluída validação JSON no comando `npm run check`.
- [x] Ampliados os testes do emulador para iniciar o servidor Express no modo Firestore e percorrer a API HTTP, além dos testes diretos do repositório.
- [x] Matriz dos seis perfis validada no CI e no Firestore Emulator; resultados detalhados registrados na seção anterior.
- [x] Auditoria atômica e contadores transacionais revisados e testados.
- [ ] Confirmar necessidade de índices adicionais e desempenho de consultas somente após teste controlado com dados fictícios no Firebase real.

### Resultado da matriz de permissões no emulador (17/11/2026)
- [x] Testes HTTP no Express em modo Firestore para os perfis professor, responsável, estudante, direção e secretaria, além do administrador.
- [x] Professor: consulta somente viagens atribuídas; bloqueado para estudantes, lista de usuários e criação de turma.
- [x] Responsável: consulta apenas estudantes vinculados e viagens relacionadas; bloqueado para lista de usuários.
- [x] Estudante: consulta apenas seu próprio cadastro e viagens relacionadas; bloqueado para lista de usuários.
- [x] Direção: pode listar usuários e tem acesso ao fluxo de aprovação de viagem; não acessa a fila de solicitações de cadastro.
- [x] Secretaria: consulta estudantes, mas não lista usuários nem acessa solicitações de cadastro.
- [x] Execuções do CI para commit `5809d7ab03e585de957945b28031737169d2e9bd`: push e pull request concluídos com sucesso.
- [x] Eventos de auditoria das operações críticas passaram a ser gravados atomicamente na mesma transação Firestore.
- [x] Contadores numéricos protegidos por transações e teste concorrente.
- [ ] Medir desempenho de listagens em coleções grandes antes da produção.

### Integridade de contadores numéricos (17/11/2026)
- [x] Refatorado `createWithNumericId`: agora lê o contador, cria o documento e atualiza o contador dentro da mesma transação Firestore. Evita reservar um ID numa transação e falhar a gravação do documento numa segunda operação.
- [x] Validação explícita de coleção, objeto de dados e contador numérico seguro.
- [x] Adicionado teste concorrente com 12 gravações simultâneas para verificar que os IDs gerados não se repetem.
- [x] CI passou para o commit `8422fd5c37ef5f58f488ecb91f89e608d6b902b2`: verificações gerais, testes HTTP por perfil e integração com Firestore Emulator concluídos com sucesso.
- [x] Revisão concluída: gravações de negócio e eventos de auditoria estão na mesma transação nas operações críticas listadas acima.
- [x] Teste ponta a ponta adicional confirma que o Express serve `/`, `/firebase-config.js` e `/js/app.js` na mesma origem da API, que `/api/health` identifica o Admin SDK inicializado no emulador e que `/api/auth/me` recupera a sessão autenticada.
- [x] CI do commit `07eccc64bd1ab4befcdafe4c3bd15da41de07135` concluído com sucesso nas execuções push e pull request.

### Reforço de segurança: auditoria atômica e validação de origem (17/11/2026)
- [x] Operações críticas do Firestore agora gravam os respectivos eventos de auditoria na mesma transação que altera os dados: criação de turma/estudante/viagem/usuário, vínculos de responsáveis, turmas, estudantes e professores, envio/aprovação de viagens e aprovação/rejeição de cadastros.
- [x] Removidas as gravações de auditoria separadas após as operações correspondentes no caminho Firestore, evitando respostas de erro após uma alteração já ter sido confirmada sem log.
- [x] Login, login Google, envio de cadastro e mutações autenticadas agora exigem cabeçalho Origin explícito e mesma origem. Origens ausentes, inválidas ou de outro host são recusadas.
- [x] Adicionados testes para confirmar os eventos de auditoria críticos e bloquear login sem Origin no Firestore Emulator.
- [x] CI da revisão de auditoria atômica e validação de origem passou em push e pull request, incluindo o commit `1aa206dbc2409d4719d7feb3bc6c349e008c2da2`.
- [ ] Permanecem pendentes teste controlado no Firebase real, revisão final de segurança/privacidade, migração de dados e implantação segura no Render.
- [x] Auditoria transacional finalizada para os fluxos escolares e de contas listados acima; os eventos de criação agora guardam também o ID exato do registro criado.
- [x] Testes do emulador verificam que os eventos de auditoria são gravados junto com as alterações e que cada evento de criação referencia o registro correto.
- [x] A proteção de origem foi endurecida: cabeçalho Origin ausente também é recusado. Os testes automatizados de cadastro foram ajustados para simular corretamente o navegador.
- [x] CI do commit `1aa206dbc2409d4719d7feb3bc6c349e008c2da2` passou em push e pull request, incluindo testes unitários, autenticação, permissões, auditoria e Firestore Emulator.

### Proteção contra acesso direto ao Firestore (17/11/2026)
- [x] Criado `firestore.rules` com negação padrão de leitura e gravação para clientes web/mobile. O sistema usa o Firebase Admin SDK no servidor, que não depende das regras de cliente.
- [x] Vinculadas as regras e os índices ao `firebase.json`.
- [x] Adicionado teste automatizado para confirmar que a configuração aponta para as regras e que elas não permitem acesso público.
- [ ] As regras estão preparadas no repositório, mas ainda NÃO foram publicadas no projeto Firebase real. A publicação será feita somente na etapa controlada de implantação, após revisão e autorização.
- [x] Acrescentado teste de integração que consulta a API REST do Firestore Emulator sem autenticação; deve receber HTTP 403, confirmando que as regras negam leitura anônima direta e não apenas que o arquivo de regras existe.
- [x] CI do teste de bloqueio anônimo passou no commit `cf5c2f04a56a5af999630726d2ceb58b9e441bc3`; o Firestore Emulator respondeu HTTP 403 à leitura anônima.
- [x] CI do commit `cf5c2f04a56a5af999630726d2ceb58b9e441bc3` passou em push e pull request. A consulta REST anônima ao Firestore Emulator foi recusada com HTTP 403, enquanto os testes de servidor/Admin SDK continuaram passando.
- [x] CI do commit de documentação `018a5b11377928b2bfb9fe41e5570022f26e5cf2` passou no evento push; verificação do pull request ainda estava em andamento durante esta atualização.

### Manutenção de dependências (17/11/2026)
- [x] Configurado Dependabot para verificar semanalmente dependências npm e GitHub Actions, abrindo atualizações com rótulos de dependência/segurança.
- [ ] Revisar e aprovar individualmente cada atualização automática; não habilitar merge automático de dependências.

### Documentação do estado atual (17/11/2026)
- [x] README atualizado para separar claramente a demonstração estática do GitHub Pages e o backend Express/Firestore em desenvolvimento.
- [x] Documentado que a integração Firestore está na branch de migração, não foi mesclada nem implantada, e que o emulador não equivale à validação do Firebase real.
- [x] Documentados os limites de uso com dados fictícios e o tratamento obrigatório de credenciais privadas como segredos.
- [x] Reforçado `.gitignore` para ignorar arquivos locais de contas de serviço Firebase, chaves privadas `.pem/.key` e variações comuns de nomes de service account. Isso reduz risco de inclusão acidental de credenciais no Git.
- [x] Descrição do PR #1 atualizada com escopo implementado, validações, pendências de produção e aviso explícito de que continua em rascunho, sem mesclagem ou implantação.


### Revisão adicional de segurança e CI (17/11/2026)
- [x] CI do commit de documentação mais recente (`2df05c56972d4f5fef80bb4b76b63dd4f0632d99`, execução 44013326573) concluído com sucesso; testes gerais e Firestore Emulator passaram.
- [x] Revisados os módulos de segurança, autorização, inicialização Firebase, autenticação Firestore e rotas centrais da API.
- [x] Substituídos os antigos limitadores de tentativas por transações Firestore compartilhadas em modo Firebase; o limitador em memória ficou limitado a 10.000 buckets e restrito ao desenvolvimento local.
- [x] Incluídos testes automatizados para limites por IP/conta, expiração, bloqueio e concorrência de transações no Firestore Emulator.
- [ ] Continuar revisão de autorização por endpoint, validação de entrada, concorrência e consultas Firestore; os testes existentes não substituem revisão independente de segurança e privacidade.
- [ ] Não implantar nem expor o serviço publicamente até concluir os itens acima, a revisão LGPD/escolar e os testes controlados no Firebase real.


### Controle de tentativas e inicialização segura (17/11/2026)
- [x] Criado limitador local com limpeza por janela, limite máximo de 10.000 buckets e bloqueio preventivo quando a capacidade é atingida.
- [x] No modo Firebase, tentativas de login e cadastro passam a usar transações Firestore compartilhadas entre instâncias; identificadores de IP/e-mail são armazenados somente como hashes.
- [x] Login: limite por e-mail de 5 tentativas em 15 minutos e limite por IP de 60 tentativas em 15 minutos.
- [x] Cadastro: limite por e-mail de 5 solicitações por hora e limite por IP de 20 solicitações por hora.
- [x] Adicionada configuração TTL para `expires_at` na coleção `_sgve_rate_limits`; a configuração está versionada, mas ainda precisa ser aplicada ao Firebase real e verificada após implantação.
- [x] Produção agora falha na inicialização se Firebase Admin não estiver configurado, impedindo que o backend de produção use acidentalmente o SQLite local.
- [x] Adicionados testes unitários para janelas, bloqueio atômico e limite de memória, além de testes do Firestore Emulator para concorrência lógica, expiração e bloqueio HTTP após tentativas excessivas.
- [x] CI do commit `b48a2cb39be33d7b3182d9570bd75326cc7c430c` passou integralmente nas execuções 44078581719 e 44078590536, incluindo teste concorrente no Firestore Emulator.
- [ ] Antes de produção, aplicar a política TTL no Firebase real, validar custos/limites do Firestore e testar com tráfego controlado; a proteção Firestore depende da disponibilidade do banco.
- Nota de segurança: o modo sem Firebase continua destinado apenas ao desenvolvimento local; o limitador em memória não é distribuído entre processos e não deve ser usado como proteção de produção.
- [x] A rota de login Google também recebeu limite por IP, com teste estático para impedir regressão.
- [x] CI do commit `c1a3cab832d38978d145e4aa6eada5ce8db424d3` passou integralmente (execuções 44073140327 e 44073151728): sintaxe, testes unitários, frontend e Firestore Emulator.
- [x] Revisado o uso de `trust proxy` em produção: Express confia em um salto de proxy para obter o IP do cliente no Render.
- [x] CI do teste concorrente passou integralmente no commit `b48a2cb39be33d7b3182d9570bd75326cc7c430c`.

- [x] O teste concorrente confirmou que, entre três requisições simultâneas para as mesmas chaves, exatamente duas são aceitas quando o limite é dois.
- [x] Padronizado o separador usado no hash dos identificadores do limitador Firestore.
- [x] CI do ajuste final de hash passou nas execuções 44078780465 e 44078788580.


### Revisão do fluxo de solicitação de cadastro (17/11/2026)
- [x] Confirmado que o código de solicitação é devolvido na resposta da API para o próprio solicitante e deve ser tratado como identificador para conferência manual, não como prova de posse do endereço de e-mail.
- [ ] Antes da produção, definir com a escola o processo de confirmação de identidade/contato (por exemplo, conferência presencial pela secretaria ou integração de e-mail institucional). Não apresentar o e-mail como verificado enquanto esse processo não existir.
- [ ] Revisar com a escola a necessidade de reduzir a exposição de dados pessoais na resposta e no fluxo de aprovação de cadastros.
- [x] Adicionado teste de regressão que percorre todas as rotas POST privadas e exige `requireAuth` e `requireCsrf`; somente cadastro inicial e logins password/Google são exceções públicas explícitas, protegidas por validação de origem e controles próprios.
- [x] CI do teste de cobertura CSRF passou nas execuções 44079022217 e 44079031735.

### Ajuste de experiência no limite de login (17/11/2026)
- [x] Limite por e-mail é limpo após autenticação válida, evitando que várias tentativas anteriores seguidas de uma senha correta mantenham o usuário bloqueado.
- [x] Limpeza implementada nos dois modos: Firestore compartilhado e limitador em memória de desenvolvimento.
- [x] Adicionados testes unitários, testes diretos no Firestore Emulator e teste da API que confirma que um login válido libera novas tentativas por conta.
- [x] CI da limpeza de limite após login válido passou integralmente nas execuções 44079513584 e 44079521470, incluindo testes unitários e Firestore Emulator.
- [x] O fluxo de autenticação, o teste de concorrência Firestore, o teste de CSRF nas rotas POST e a limpeza de limite após login válido passaram no CI do GitHub Actions.
- [x] CI da atualização do planejamento passou nas execuções 44079715109 e 44079726541.

- [x] Registrado cuidado de privacidade: hashes determinísticos de IP/e-mail são pseudonimização, não anonimização; os registros de limite continuam sujeitos a controle de acesso, retenção e revisão LGPD.

### Proteção de dados nas listagens administrativas (17/11/2026)
- [x] Adicionados testes no Firestore Emulator para confirmar que a lista administrativa de solicitações de cadastro e a listagem de usuários nunca retornam `password_hash`.
- [x] O teste também exercita a rejeição de uma solicitação via API administrativa, com autenticação, CSRF e auditoria.
- [x] CI da cobertura adicional de privacidade passou nas execuções 44080374025 e 44080384981.

### Correção das rotas de aprovação/rejeição (17/11/2026)
- [x] O teste de integração detectou que a validação de ID numérico nas rotas Firestore de aprovar/rejeitar cadastro estava com escape incorreto e rejeitava IDs válidos com HTTP 400.
- [x] Corrigida a expressão regular nas duas rotas.
- [x] Ampliado o teste de integração para executar rejeição e aprovação pela API, confirmar resposta HTTP 200 e verificar que a conta aprovada fica ativa.
- [x] CI após a correção das rotas e ampliação dos testes passou nas execuções 44080374025 e 44080384981.
- [x] CI integral aprovado no commit `c9c6f0b864fb6f8ad25f835241ab4e5786d8fbbe`: sintaxe, testes unitários, frontend e Firestore Emulator, incluindo aprovação/rejeição por API e privacidade das listagens.
- [x] CI do planejamento passou nas execuções 44080580250 e 44080589091.


### Minimização de dados de solicitações analisadas (17/11/2026)
- [x] Após aprovação ou rejeição, o hash de senha temporário e o código de solicitação são apagados do registro pendente no Firestore.
- [x] No fallback SQLite, o hash temporário é apagado e o campo obrigatório do código é limpo para string vazia, sem exigir migração do esquema.
- [x] Testes do Firestore Emulator verificam que senha e código deixam de existir no registro após aprovação e rejeição.
- [x] CI da limpeza adicional de dados passou nas execuções 44080922888 e 44080929949.
- [x] Adicionados testes SQLite que consultam o banco temporário e confirmam que `password_hash` é nulo e `verification_code` vazio após aprovação e rejeição.
- [x] Testes de limpeza de dados no Firestore Emulator e no SQLite passaram no commit `5d42e0c9b5385159926204cc8d6331c35d9ea6e9`, execuções 44080922888 e 44080929949.

### Consolidação do planejamento (17/11/2026)
- [x] Reconciliadas pendências históricas com as etapas efetivamente concluídas, mantendo separados os testes no Emulator e os testes ainda necessários no Firebase real.
- [x] CI desta consolidação passou em push e pull request nas execuções 44081347027 e 44081354662.

- [x] Consolidação final do planejamento validada no GitHub Actions; nenhuma pendência histórica de CI permanece aberta nesta seção.


### Correção e cobertura das rotas de aprovação/rejeição (17/11/2026)
- [x] Corrigida a validação de IDs numéricos nas rotas administrativas de aprovação e rejeição: a expressão regular estava escapada em duplicidade e rejeitava IDs válidos.
- [x] Adicionados testes de integração no Firestore Emulator para rejeitar e aprovar solicitações pela API; o teste confirma que a conta aprovada fica ativa.
- [x] CI da correção e dos novos testes passou integralmente nas execuções 44081669964 e 44081679667, incluindo testes unitários e Firestore Emulator.
- [x] Confirmado no CI que aprovação e rejeição de solicitações funcionam pela API com IDs numéricos válidos; a conta aprovada fica ativa e as listagens não expõem hashes de senha.
- [x] CI desta atualização final do planejamento passou em push e pull request nas execuções 44084841107 e 44084853000.


### Concorrência na aprovação de cadastros (17/11/2026)
- [x] Adicionado teste de integração que dispara duas aprovações simultâneas para a mesma solicitação no Firestore Emulator.
- [x] O comportamento esperado é exatamente uma resposta de sucesso (200) e uma resposta de solicitação já analisada (404), sem duplicar a conta.
- [x] CI do teste concorrente passou nas execuções 44084612085 e 44084621629.

### Validação defensiva de hashes de senha (17/11/2026)
- [x] `verifyPassword` agora valida tipo, algoritmo, tamanho e caracteres hexadecimais do hash antes de chamar `scrypt`, evitando custo computacional desnecessário com valores malformados ou enormes.
- [x] A derivação usa sempre o tamanho fixo esperado de 64 bytes e compara os resultados com `timingSafeEqual`.
- [x] Criados testes para senha correta/incorreta, hash malformado, entrada excessivamente grande e senha de tipo inválido.
- [x] Testes de hash e aprovação concorrente passaram em push e pull request nas execuções 44084612085 e 44084621629.
- Nota histórica resolvida: a primeira fixture de teste usava `TUV123`, com dígito fora do alfabeto permitido. Foi corrigida para `TUV234`; a falha era do dado fictício, não da transação.
- [x] Instrumentado o teste de integração para capturar respostas e logs do servidor, identificando que a falha era do dado de teste, não da transação.
- [x] Corrigido o código fictício para `TUV234`, respeitando o alfabeto de verificação.
- [x] CI após a correção do fixture passou em push e pull request nas execuções 44084612085 e 44084621629; o teste confirmou uma única aprovação concorrente e uma resposta 404 para a tentativa duplicada.
- [x] Validação final desta rodada: 37 testes unitários aprovados, sintaxe aprovada e Firestore Emulator aprovado, incluindo concorrência de aprovação de cadastro.
- [x] CI da atualização final do planejamento passou nas execuções 44084841107 e 44084853000.

- [x] CI final da rodada de segurança e cadastro aprovado em push e pull request; a suíte incluiu 37 testes unitários e integração Firestore Emulator com aprovação concorrente.

### Auditoria idempotente de vínculos (17/11/2026)
- [x] Corrigido o registro de auditoria ao vincular turma à viagem, professor à viagem ou responsável ao estudante: uma tentativa repetida não cria novo evento quando a relação já existe.
- [x] Mantida a resposta idempotente das operações: o vínculo já existente continua sendo considerado válido, sem duplicar a relação nem o evento de auditoria.
- [x] Acrescentados testes no Firestore Emulator para repetir os três vínculos e confirmar que cada operação gera somente um evento de auditoria para a alteração efetiva.
- [x] CI do GitHub Actions passou em push e pull request nas execuções `44085879599` e `44085889268`, incluindo testes unitários e Firestore Emulator.

### Autorização familiar e controle de presença (17/11/2026)
- [x] Criada consulta de participantes da viagem com filtragem por perfil: gestão vê todos; professor somente viagens em que está vinculado; responsável somente estudantes sob sua responsabilidade; estudante somente sua própria participação.
- [x] Criada rota de autorização familiar: somente responsável autenticado e vinculado pode autorizar ou não autorizar estudante participante de viagem aprovada, antes do horário de saída.
- [x] Criada rota de presença: gestão e professores vinculados podem registrar presença/ausência na saída e no retorno; perfis sem permissão são bloqueados.
- [x] Operações Firestore são transacionais e registram auditoria somente quando há mudança real; repetição da mesma decisão não duplica eventos.
- [x] Implementado comportamento equivalente no SQLite com transação imediata e rollback em falhas.
- [x] Corrigidas também as auditorias de vínculos no SQLite: responsáveis, turmas, estudantes e professores só geram evento quando a relação é realmente criada; testes repetem os quatro vínculos e verificam ausência de eventos duplicados.
- [x] Interface de participantes adicionada ao painel de viagens, com ações exibidas conforme perfil e estado da viagem.
- [x] Testes de integração Firestore Emulator cobrem acesso por perfil, vínculo familiar, professor sem vínculo, autorização e presença idempotentes.
- [x] Teste de integração SQLite cobre autorização, presença, vínculos e bloqueios por perfil.
- [x] Testes estáticos verificam que a interface contém as ações e que as rotas exigem autenticação, CSRF e perfil adequado.
- [x] CI da implementação e dos novos testes de interface passou em push e pull request nas execuções `44088725204` e `44088738354`; sintaxe, testes automatizados e Firestore Emulator concluídos com sucesso.
- [ ] Validar fluxos visualmente com usuários de teste fictícios antes de qualquer uso escolar real.
### Cadastro e atribuição de veículos (17/11/2026)
- [x] Criada coleção Firestore `vehicles` com identificador numérico, chave de identificação única, tipo, capacidade e estado ativo.
- [x] Criada tabela SQLite `vehicles` e migração aditiva para bancos existentes, adicionando `trips.vehicle_id` sem apagar viagens anteriores.
- [x] Criada API protegida para listar e cadastrar veículos; somente administração, direção e secretaria podem gerenciar a frota.
- [x] Criada atribuição de veículo somente em viagem rascunho, com validação de capacidade suficiente para toda a capacidade planejada da viagem.
- [x] Bloqueada a reserva do mesmo veículo em viagens com horários sobrepostos; intervalos consecutivos sem sobreposição são aceitos.
- [x] Atribuição repetida do mesmo veículo é idempotente e não duplica eventos de auditoria.
- [x] A lista de viagens informa o veículo atribuído sem expor dados pessoais de condutores.
- [x] Adicionado painel de frota no frontend Express, com cadastro e vínculo de veículos às viagens.
- [x] Testes SQLite e Firestore Emulator cobrem identificação duplicada, tipo/capacidade inválidos, capacidade insuficiente, conflito de horário, horários consecutivos, viagem já aprovada, permissões e auditoria.
- [x] Adicionado teste de migração que inicia com banco SQLite legado e confirma que a viagem antiga permanece após a inclusão de `vehicle_id`.
- [x] CI da implementação e dos testes de migração passou em push e pull request no commit `739b3aaa35835c2a9a1aa7a92424fec5ca4325b6`, execuções `44090267231` e `44090275633`; sintaxe, testes SQLite e Firestore Emulator concluídos com sucesso.
- [ ] Validar visualmente o cadastro e a atribuição com contas fictícias; não cadastrar veículos reais nem informações de condutores nesta fase.
### Relatórios agregados e exportação (17/11/2026)
- [x] Criada rota GET `/api/reports/summary`, restrita a administração, direção e secretaria.
- [x] O resumo apresenta totais de viagens, estudantes ativos, veículos, participações, autorizações e presenças, sem retornar nomes ou contatos de estudantes.
- [x] Criada tabela por viagem com situação, capacidade, contagem de participantes, autorização, presença na saída/retorno e veículo.
- [x] Implementados cálculos equivalentes no SQLite e Firestore; limites de consulta são informados como relatório parcial, em vez de apresentar os dados como completos.
- [x] Adicionado painel de relatórios no frontend, botão de atualização e exportação CSV agregada.
- [x] Exportação CSV trata campos iniciados por caracteres que podem executar fórmulas em planilhas e usa codificação UTF-8.
- [x] Dados do relatório são limpos ao sair ou trocar para perfil sem permissão.
- [x] Testes de integração validam contagens, vínculo de veículo e bloqueio de acesso por perfil no SQLite e Firestore Emulator.
- [x] Testes verificam que os dados agregados não incluem `student_id` nem `full_name`.
- [x] CI da implementação e dos testes passou em push e pull request nos commits `a3b9a447d32455c7767483bfc98d78fb1e62b51a` e `d4306b23176179db991f26851aa456c48b6671f9`, execuções `44091163168` e `44091199067`; sintaxe, testes SQLite e Firestore Emulator concluídos com sucesso.
- [ ] Validar visualmente o painel com contas fictícias e confirmar quais relatórios a escola realmente precisa.
### Registro administrativo de autorização em papel (17/11/2026)
- [x] Criada rota protegida para administração, direção e secretaria registrarem que uma autorização em papel foi conferida para participante de viagem aprovada.
- [x] Registro em papel só é aceito enquanto o prazo da autorização está aberto e quando ainda não existe decisão digital.
- [x] Repetir o mesmo registro é idempotente; a primeira alteração gera um único evento de auditoria.
- [x] Uma autorização em papel não pode ser sobrescrita por uma decisão digital posterior; o servidor retorna conflito e preserva o histórico.
- [x] A interface oferece a ação somente para equipe gestora e somente quando a autorização está pendente; responsáveis não recebem ação administrativa.
- [x] Testes SQLite e Firestore Emulator cobrem repetição, conflito entre decisões, perfis e auditoria.
- [x] CI da implementação e dos testes passou em push e pull request no commit `a1d57a4aba5557b3822f2e3330024a3939320575`, execuções `44092485378` e `44092495455`; testes unitários, SQLite e Firestore Emulator concluídos com sucesso.
- [x] CI da atualização final da interface (ocultação de ações incompatíveis com autorização em papel) passou em push e pull request no commit `e523f1ef3cbbbe206d4df66bb3cd8a12709718e1`, execuções `44092572065` e `44092584118`.
- [x] CI dos testes finais de privacidade dos relatórios passou em push e pull request no commit `355e05975811bf625f1933bac8c85ebfdcdf75fb`, execuções `44093054594` e `44093061041`; sintaxe, suíte automatizada e Firestore Emulator concluídos com sucesso.
- [ ] Validar visualmente o fluxo com contas fictícias; não anexar documentos reais nem dados pessoais nesta fase.
### Plano de migração SQLite → Firestore (17/11/2026)
- [x] Criado `docs/MIGRACAO_FIRESTORE.md` com a ordem de importação, mapeamento de coleções, regras para sessões/hashes, índices únicos, contadores, validação, janela de manutenção e rollback.
- [x] Documento deixa explícito que o importador ainda não existe e que nenhuma migração real foi executada.
- [x] CI do runbook de migração passou no commit `3af24603d3f60f874e8ee0abf20d1cd8b6f34b29`, execuções `44098132046` (push) e `44098148289` (pull request).
- [ ] Próxima etapa técnica: desenhar e testar importador idempotente com banco sintético e Firestore Emulator; não acessar dados reais sem autorização institucional.
- [x] README atualizado para distinguir a demonstração GitHub Pages do backend e apontar para o runbook; CI passou no commit `f589ed3621d5ca04f96811e91b876bd8c2ffaed3`, execuções `44098386070` (push) e `44098399294` (pull request).

### Cadastro e atribuição básica de condutores (17/11/2026)
- [x] Criada coleção Firestore `drivers` e tabela SQLite `drivers`, com identificador, nome e estado ativo; cadastro não coleta CPF, número de CNH, telefone ou endereço.
- [x] Criadas rotas autenticadas e protegidas por CSRF para equipe gestora listar/cadastrar condutores e atribuir condutor a viagem em rascunho.
- [x] Atribuição bloqueia conflitos de horário, permite viagens consecutivas e é idempotente; Firestore usa transação e atualização do documento do condutor para serializar atribuições concorrentes; SQLite usa `BEGIN IMMEDIATE`.
- [x] Nome do condutor e lista de condutores ficam restritos à administração, direção e secretaria; demais perfis não recebem nome nem identificador interno do condutor.
- [x] Interface permite cadastrar condutores, selecionar viagem e atribuir; cartões de viagem mostram o nome apenas à equipe gestora.
- [x] Migração SQLite adiciona `driver_id` sem apagar viagens antigas e cria índice para consultas de agenda.
- [x] Testes cobrem duplicidade de nomes, dados inválidos, conflitos, intervalos consecutivos, idempotência, auditoria, migração e permissões nos testes SQLite e Firestore Emulator.
- [x] Testes concorrentes confirmam que duas tentativas simultâneas de reservar o mesmo condutor em horários sobrepostos resultam em exatamente uma atribuição aceita e uma recusada, tanto no SQLite quanto no Firestore Emulator.
- [x] CI completo passou no commit `206199b3b89d8f83ad7387fff8308380f30e29ee`, execuções `44096325779` (push) e `44096336173` (pull request), incluindo sintaxe, testes automatizados, migração SQLite e Firestore Emulator.
- [x] CI da cobertura concorrente, das permissões de cadastro/atribuição e da limpeza dos dados ao sair passou no commit `64d3338404567b827a3c4bf7ce9e8164c1aef1bd`, execuções `44097175469` (push) e `44097181098` (pull request), com testes SQLite e Firestore Emulator aprovados.
- [ ] Validar visualmente o fluxo com contas fictícias e confirmar com a escola quais verificações operacionais dos condutores devem ocorrer fora do sistema.

### Pré-validação da migração SQLite → Firestore (17/11/2026)
- [x] Criado `scripts/validate-firestore-migration.js`: abre o SQLite em modo somente leitura, ativa `query_only`, não conecta ao Firebase e não grava dados.
- [x] O relatório contém apenas contagens, maiores IDs e códigos agregados de inconsistência; não imprime nomes, e-mails, hashes, tokens ou dados de estudantes.
- [x] Verifica tabelas/colunas, integridade SQLite, chaves estrangeiras, IDs, duplicidades normalizadas, estados, hashes scrypt, datas e capacidade das viagens.
- [x] Sessões aparecem somente como contagem excluída; tokens e CSRF não entram na migração.
- [x] Adicionados testes com base sintética para aprovação, conflito de e-mail, referência órfã, ausência de saída com dados pessoais e garantia de que o arquivo não é alterado.
- [x] Atualizados `npm run check` e `npm test` para incluir o validador e seus testes.
- [x] Runbook atualizado com comando, pré-condições e códigos de saída.
- [x] CI do validador passou no PR no commit `d920c80c88b24eb8bf2363b1a920d6c2562c7106`, execução `44100450186`: instalação, sintaxe, testes automatizados, protótipo e Firestore Emulator concluídos com sucesso.
- [ ] Executar somente com cópia sintética/controle autorizada; não abrir a base escolar ativa nem importar dados reais nesta fase.
- [ ] O importador Firestore continua não implementado; nenhuma gravação ou migração real foi realizada.
- [ ] A execução anterior do PR CI `44098667872` terminou antes das verificações por falha de rede do npm (`ECONNRESET` ao baixar dependência do registry); não foi falha de teste ou do código. Repetir CI nos commits desta etapa.


## Atualização — 17/11/2026: identidade visual de produção

- Criada a branch `feature/production-kennedy-ui` a partir da versão com migração Firestore.
- Iniciada a adaptação da identidade visual do protótipo para a interface real servida pelo Render.
- Preservados os formulários e identificadores usados pelo frontend de produção, que continuam ligados à API e à autenticação real do servidor.
- Removida a referência demonstrativa `Ônibus DEMO-03` do placeholder do cadastro de veículos.
- Ajustados os textos da tela de acesso para “Bem-vindo ao SGVE” e “Criar uma conta”.
- Definido o tema escuro institucional como padrão inicial, mantendo a alternância de tema.
- **Não foram copiadas** contas de demonstração, senhas fictícias, dados locais de alunos ou fluxos de autenticação do protótipo.
- **Status:** alterações registradas na branch de trabalho; validação automatizada e revisão visual ainda pendentes. Nada foi mesclado na branch publicada e nenhum novo deploy foi iniciado.


### Retirada da demonstração fictícia da publicação estática (17/11/2026)
- [x] Substituída a página GitHub Pages que simulava login e armazenava alunos/viagens de exemplo por uma página de encaminhamento para a aplicação no Render.
- [x] Retirados da página pública os e-mails `@sgve.demo`, a senha compartilhada de demonstração e os registros de estudantes de exemplo.
- [x] Atualizado o Service Worker para remover caches antigos da demonstração e deixar de armazenar páginas e dados localmente.
- [x] Removido o teste de sintaxe do JavaScript demonstrativo e substituído por verificação do destino do redirecionamento e ausência de credenciais/dados fictícios na página publicada.
- [x] README atualizado para documentar a aplicação no Render e explicar que dados sintéticos ficam restritos aos testes automatizados e ao Firestore Emulator.
- [ ] Validar a publicação do redirecionamento no GitHub Pages após a integração da branch.
- [ ] Revisar os fluxos de ponta a ponta na aplicação hospedada antes de qualquer uso institucional.


### Remoção de dados fictícios e consolidação da aplicação real (17/11/2026)
- [x] Retirada da publicação GitHub Pages a interface estática com contas de demonstração, senha compartilhada e cadastros locais de estudantes/viagens fictícios; a página agora encaminha para o SGVE hospedado no Render.
- [x] Removidos os scripts e a configuração Firebase Web que pertenciam exclusivamente ao protótipo estático.
- [x] Atualizado o Service Worker antigo para limpar o cache da demonstração; a nova aplicação não deve armazenar respostas de API, autenticação ou dados pessoais em cache.
- [x] Login real ganhou seleção de perfil; o servidor compara o perfil selecionado com o perfil cadastrado antes de criar a sessão. O login Google também exige a seleção e valida o perfil no servidor.
- [x] Adicionado suporte PWA à aplicação real, com manifest, ícone, botão de instalação e cache restrito a CSS/JavaScript/arquivos estáticos. Rotas `/api/` e páginas autenticadas não são armazenadas pelo Service Worker.
- [x] Teste de integração SQLite verifica que perfil incorreto retorna HTTP 403 e não cria cookie de sessão.
- [x] CI completo desta atualização aprovado no GitHub Actions, execução `44197960974` (run 888): sintaxe/estrutura, testes automatizados e integração Firestore Emulator concluídos com sucesso.
- [ ] Validar visualmente login, seleção de perfil, instalação PWA e módulos com contas de teste, sem cadastrar dados pessoais reais.
- [ ] Após revisão, solicitar autorização explícita antes de mesclar e publicar as alterações no Render.
