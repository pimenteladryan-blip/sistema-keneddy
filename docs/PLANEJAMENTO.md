# Planejamento do SGVE
## Sistema de Gerenciamento de Viagens Escolares

**Instituição de referência:** Colégio Estadual Presidente Kennedy — Ponta Grossa/PR  
**Repositório:** https://github.com/pimenteladryan-blip/sistema-keneddy  
**Status:** Fundação, cadastros e fluxo inicial de viagens implementados.

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
4. **Autorizações — próximo:** autorização digital do responsável e registro administrativo de autorização em papel, com histórico.
5. **Presença — próximo:** listas de saída e retorno, com usuário e horário do registro.
6. **Equipe e transporte — pendente:** atribuição de professores, veículos e condutores com acesso restrito.
7. **Financeiro e relatórios — pendente:** custos e contribuições opcionais; exportação com minimização de dados.
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
Implementar autorizações digitais e registro de documentos em papel, com acesso restrito ao responsável vinculado e trilha de auditoria.

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
- [ ] Adicionar testes isolados para rotas e transações de autenticação/cadastros Firestore, incluindo duplicidade, aprovação concorrente, conta inativa e permissões por perfil.
- [ ] Verificar integração de ponta a ponta com projeto de teste Firestore, usando somente contas e dados fictícios.
- [ ] Corrigir arquitetura de origem entre GitHub Pages e API: definir domínio/proxy same-origin ou estratégia de sessão segura. Não relaxar CORS, SameSite, CSRF ou cookies sem revisão.
- [x] Evitar a inicialização do SQLite quando Firebase estiver configurado: sessão, autenticação, cadastros e módulos integrados passam a usar Firestore sem criar banco local efêmero.
- [ ] Migrar os demais módulos e revisar toda dependência residual do SQLite; o caminho Firestore foi separado, mas precisa de validação ponta a ponta antes de ser considerado pronto.
- [ ] Planejar migração/importação controlada dos dados existentes, preservando IDs e relações; não importar dados pessoais reais nesta fase.
- [ ] Implementar gestão de ativação/desativação de contas no Firestore e revisar o provisionamento inicial de administrador.
- [ ] Implementar autorização digital, presença, transporte, relatórios e demais módulos previstos.
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
- [ ] Prioridade para reduzir retrabalho: usar o próprio servidor Express/Render para servir o frontend real de `public/` e a API em mesma origem, evitando depender do GitHub Pages para autenticação com cookies. Manter `docs/` como demonstração separada. Validar configuração de cookies, CSRF, domínio e HTTPS antes de publicar.
- [ ] Próxima sequência curta: (1) revisar `public/index.html` e `public/js/app.js` para confirmar chamadas relativas à API e estado de login; (2) implementar/testar autenticação Google no frontend com o ID token; (3) criar testes Firestore/emulador para as operações críticas; (4) revisar endpoints restantes e só então preparar Render.
- Não mesclar o PR nem implantar sem aprovação explícita. Nenhuma chave privada deve ser enviada ao chat ou commitada.

### Integração inicial do login Google no frontend (17/11/2026)
- [x] Criado `public/firebase-config.js` com apenas a configuração pública do Firebase Web; nenhuma chave privada foi adicionada.
- [x] Adicionados SDKs Firebase compat via CDN e botão “Entrar com Google” em `public/index.html`.
- [x] Integrado `public/js/app.js`: popup Google, obtenção do Firebase ID token, envio para `POST /api/auth/google`, criação da sessão do servidor e encerramento da sessão Firebase ao sair.
- [x] Ajustada a Content Security Policy do Express para permitir somente os hosts necessários ao SDK/Auth do Firebase nesta implementação.
- [ ] Aguardar e conferir GitHub Actions após os commits de frontend e CSP.
- [ ] Testar login Google somente quando o frontend `public/` e a API estiverem servidos na mesma origem HTTPS; GitHub Pages `docs/` continua sendo demonstração separada e não deve ser usado para testar a sessão do backend.
- [ ] Antes do teste real, revisar a CSP com o navegador, confirmar domínio autorizado do Firebase e configurar a credencial privada apenas no ambiente seguro do Render por um adulto responsável. Não usar dados reais de estudantes.

### Testes automatizados do login Google (17/11/2026)
- [x] Criado `test/google-login-frontend.test.js` para validar ordem de carregamento dos SDKs, botão Google, obtenção/envio do ID token, configuração pública sem credenciais privadas, verificação do token no servidor e hospedagem do frontend/API na mesma origem.
- [ ] Confirmar o resultado do GitHub Actions após a inclusão dos testes; corrigir qualquer falha antes de seguir.
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
- [ ] Auditoria completa dos endpoints e permissões em modo Firestore, com testes HTTP por perfil (admin, direção, secretaria, professor, responsável e estudante), incluindo casos proibidos.
- [ ] Confirmar índices compostos necessários no Firestore de produção e criar `firestore.indexes.json` quando a auditoria das consultas estiver concluída.
- [ ] Revisar atomicidade da auditoria de eventos de negócio e consistência dos contadores/índices; não declarar o banco pronto para produção antes dessa revisão.
- [ ] Preparar Render somente depois dos testes e da revisão de segurança. Não mesclar nem implantar sem autorização explícita.

### Etapa de índices e matriz de permissões (17/11/2026)
- [x] Criado `firestore.indexes.json` com índices compostos para consultas de estudantes por `user_id + active` e fila de solicitações por `status + created_at`.
- [x] Referenciado o arquivo de índices em `firebase.json` e incluída validação JSON no comando `npm run check`.
- [x] Ampliados os testes do emulador para iniciar o servidor Express no modo Firestore e percorrer a API HTTP, além dos testes diretos do repositório.
- [ ] Validar a matriz completa de permissões dos seis perfis no CI após a última ampliação de testes. O teste cobre leitura permitida e operações negadas para professor, responsável e estudante, e permissões de direção/secretaria.
- [ ] Depois da matriz, revisar atomicidade dos logs de auditoria e integridade de contadores/índices; confirmar se há outros índices necessários com consultas reais.

### Resultado da matriz de permissões no emulador (17/11/2026)
- [x] Testes HTTP no Express em modo Firestore para os perfis professor, responsável, estudante, direção e secretaria, além do administrador.
- [x] Professor: consulta somente viagens atribuídas; bloqueado para estudantes, lista de usuários e criação de turma.
- [x] Responsável: consulta apenas estudantes vinculados e viagens relacionadas; bloqueado para lista de usuários.
- [x] Estudante: consulta apenas seu próprio cadastro e viagens relacionadas; bloqueado para lista de usuários.
- [x] Direção: pode listar usuários e tem acesso ao fluxo de aprovação de viagem; não acessa a fila de solicitações de cadastro.
- [x] Secretaria: consulta estudantes, mas não lista usuários nem acessa solicitações de cadastro.
- [x] Execuções do CI para commit `5809d7ab03e585de957945b28031737169d2e9bd`: push e pull request concluídos com sucesso.
- [ ] Revisar os eventos de auditoria de operações escolares para reduzir o risco de uma gravação de negócio concluir e o log separado falhar.
- [ ] Revisar os contadores numéricos e o desempenho de listagens em coleções grandes.

### Integridade de contadores numéricos (17/11/2026)
- [x] Refatorado `createWithNumericId`: agora lê o contador, cria o documento e atualiza o contador dentro da mesma transação Firestore. Evita reservar um ID numa transação e falhar a gravação do documento numa segunda operação.
- [x] Validação explícita de coleção, objeto de dados e contador numérico seguro.
- [x] Adicionado teste concorrente com 12 gravações simultâneas para verificar que os IDs gerados não se repetem.
- [x] CI passou para o commit `8422fd5c37ef5f58f488ecb91f89e608d6b902b2`: verificações gerais, testes HTTP por perfil e integração com Firestore Emulator concluídos com sucesso.
- [ ] Próxima revisão: tornar as gravações de negócio e os respectivos eventos de auditoria atômicos nas operações escolares críticas; atualmente alguns logs são gravados após a operação principal.
- [x] Teste ponta a ponta adicional confirma que o Express serve `/`, `/firebase-config.js` e `/js/app.js` na mesma origem da API, que `/api/health` identifica o Admin SDK inicializado no emulador e que `/api/auth/me` recupera a sessão autenticada.
- [x] CI do commit `07eccc64bd1ab4befcdafe4c3bd15da41de07135` concluído com sucesso nas execuções push e pull request.

### Reforço de segurança: auditoria atômica e validação de origem (17/11/2026)
- [x] Operações críticas do Firestore agora gravam os respectivos eventos de auditoria na mesma transação que altera os dados: criação de turma/estudante/viagem/usuário, vínculos de responsáveis, turmas, estudantes e professores, envio/aprovação de viagens e aprovação/rejeição de cadastros.
- [x] Removidas as gravações de auditoria separadas após as operações correspondentes no caminho Firestore, evitando respostas de erro após uma alteração já ter sido confirmada sem log.
- [x] Login, login Google, envio de cadastro e mutações autenticadas agora exigem cabeçalho Origin explícito e mesma origem. Origens ausentes, inválidas ou de outro host são recusadas.
- [x] Adicionados testes para confirmar os eventos de auditoria críticos e bloquear login sem Origin no Firestore Emulator.
- [ ] Aguardar CI desta revisão e corrigir qualquer falha antes de avançar.
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
- [ ] Aguardar CI do teste de bloqueio anônimo antes de considerar esta etapa validada.
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
