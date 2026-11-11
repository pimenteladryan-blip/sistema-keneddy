# Planejamento geral do SGVE
## Sistema de Gerenciamento de Viagens Escolares

**Instituição de referência:** Colégio Estadual Presidente Kennedy (CEPK), Ponta Grossa/PR  
**Repositório:** https://github.com/pimenteladryan-blip/sistema-keneddy  
**Branch de desenvolvimento:** `firebase-integracao`  
**Hospedagem exigida pelo projeto:** Render  
**Status geral:** protótipo visual e estrutura inicial de servidor existentes; integração, implantação e validação para uso real ainda precisam ser concluídas.

> Este documento reúne o histórico, as decisões técnicas, o que já existe e todos os próximos passos previstos. Os itens marcados como concluídos indicam trabalho presente no repositório, não significam aprovação para uso institucional.

---

## 1. Objetivo do projeto

Construir uma aplicação web responsiva para organizar viagens escolares, participantes, autorizações, presença, equipe, transporte e relatórios. O sistema deve funcionar em computadores e celulares, com contas individuais e permissões diferentes para cada perfil.

O SGVE só poderá receber dados reais depois de revisão técnica, validação e autorização da escola e avaliação de privacidade/LGPD. Até lá, desenvolvimento e testes usarão exclusivamente dados fictícios.

## 2. Perfis previstos

- **Administrador:** configura o sistema e gerencia contas e permissões.
- **Direção:** acompanha a operação, aprova viagens e consulta relatórios.
- **Secretaria:** mantém cadastros escolares e organiza viagens.
- **Professor:** consulta viagens e turmas atribuídas e executa tarefas autorizadas.
- **Responsável legal:** consulta informações e autorizações apenas dos estudantes vinculados.
- **Estudante:** consulta apenas as próprias informações e viagens disponíveis conforme autorização.

As permissões precisam ser verificadas no backend e no banco de dados. Esconder botões na interface não é segurança.

## 3. Decisões técnicas

| Parte | Tecnologia / decisão |
|---|---|
| Código e versionamento | GitHub |
| Branch de trabalho | `firebase-integracao` |
| Hospedagem da aplicação inteira | Render Web Service |
| Interface | HTML, CSS e JavaScript |
| Backend | Node.js 24+ e Express |
| Autenticação | Firebase Authentication, após integração e definição do fluxo seguro |
| Banco compartilhado | Cloud Firestore |
| Configuração e segredos | Variáveis de ambiente do Render |
| Testes | Node.js Test Runner, verificações de código e testes manuais |
| Publicação atual | GitHub Pages permanece apenas como demonstração antiga até a migração e validação |

### Como a arquitetura deverá funcionar

1. O navegador abre o endereço público fornecido pelo Render.
2. O serviço Node.js/Express hospedado no Render entrega a interface e atende às rotas da API.
3. O Firebase Authentication identifica o usuário.
4. O backend valida a identidade e as permissões antes de operações protegidas.
5. O Cloud Firestore guarda os dados compartilhados entre usuários e dispositivos.
6. O GitHub mantém o código e o histórico de alterações; ele não será o servidor de produção.

**Importante sobre o banco atual:** existe estrutura Node.js/Express com SQLite no repositório. O SQLite será tratado como etapa de protótipo/transição. Antes de produção, os dados e operações deverão ser migrados e testados no Firestore, ou deverá haver uma decisão técnica documentada e aprovada para manter outro banco persistente. Não usar SQLite em armazenamento efêmero do Render para dados escolares: os dados podem ser perdidos em reinicializações ou novas implantações.

## 4. Histórico e base já existente

- [x] Nome e objetivo do SGVE definidos.
- [x] Perfis e módulos principais planejados.
- [x] Protótipo visual com telas para os módulos escolares.
- [x] Interface responsiva e temas claro/escuro trabalhados.
- [x] Repositório GitHub criado e versionado.
- [x] Branch `firebase-integracao` criada para desenvolver sem alterar a branch principal.
- [x] Projeto Firebase criado e aplicação Web registrada.
- [x] Firebase Authentication com e-mail/senha habilitado no Console.
- [x] Cloud Firestore criado na região `southamerica-east1`.
- [x] Arquivos iniciais de configuração e autenticação Firebase adicionados ao repositório.
- [x] Regras iniciais do Firestore escritas, ainda pendentes de revisão e testes.
- [x] Estrutura Node.js/Express e scripts de verificação/teste presentes.
- [x] Arquivo `render.yaml` inicial presente.
- [x] Planejamento central documentado neste arquivo.

### O que ainda não deve ser considerado pronto

- [ ] Login real integrado de ponta a ponta à interface atual.
- [ ] Validação de identidade e permissões em todas as rotas.
- [ ] Migração completa das operações e dados para o banco definitivo.
- [ ] Regras Firestore revisadas e testadas com usuários de cada perfil.
- [ ] Persistência e configuração de produção do Render validadas.
- [ ] Testes completos em computador e celular.
- [ ] Aprovação institucional e revisão de privacidade.
- [ ] Liberação para dados reais.

## 5. Roteiro completo de execução

### Fase 1 — Auditoria e preparação
- [ ] Revisar a estrutura atual do repositório e identificar a versão de interface que será servida em produção.
- [ ] Mapear telas, formulários, funções, rotas da API e dados ainda fictícios ou locais.
- [ ] Confirmar que o backend Express serve a interface e os arquivos estáticos pelo mesmo serviço Render.
- [ ] Identificar dependências entre o protótipo antigo, o backend SQLite e os módulos Firebase.
- [ ] Criar uma lista de verificação para não perder funcionalidades nem identidade visual.
- [ ] Manter todos os trabalhos na branch `firebase-integracao`; não mesclar nem publicar na branch principal sem autorização explícita.

**Critério de conclusão:** mapa dos arquivos e funcionalidades, com plano de integração aprovado antes de alterações estruturais.

### Fase 2 — Preparar hospedagem completa no Render
- [ ] Configurar um Render Web Service para executar a aplicação Node.js/Express.
- [ ] Configurar o repositório e a branch de implantação.
- [ ] Conferir comandos de build e inicialização (`npm install` e `npm start`).
- [ ] Configurar `NODE_ENV=production` e a porta por `process.env.PORT`.
- [ ] Garantir que a interface, CSS, JavaScript, imagens e API sejam servidos pelo mesmo domínio.
- [ ] Configurar a rota de verificação de saúde `/api/health`.
- [ ] Revisar o `render.yaml`: não usar `/tmp` como armazenamento definitivo de dados.
- [ ] Configurar variáveis secretas diretamente no painel do Render; nunca colocar senhas, chaves privadas ou arquivos `.env` no GitHub.
- [ ] Avaliar plano, disponibilidade, limites, suspensão por inatividade e custos do Render antes da escolha final.
- [ ] Testar implantação de homologação sem dados pessoais.

**Critério de conclusão:** endereço Render abre o SGVE completo e a API responde com estado saudável.

### Fase 3 — Firebase e banco de dados
- [ ] Revisar a configuração pública do Firebase Web App.
- [ ] Conectar o login da interface ao Firebase Authentication.
- [ ] Definir como o backend verificará a identidade do usuário (Firebase Admin SDK e validação de tokens).
- [ ] Definir um único fluxo de sessão, evitando misturar autenticação local antiga com Firebase.
- [ ] Finalizar o modelo de coleções do Firestore: usuários, turmas, estudantes, vínculos, viagens, autorizações, presença, equipe e histórico.
- [ ] Definir campos obrigatórios, validações, identificadores e relacionamentos.
- [ ] Migrar cada operação do SQLite/localStorage para Firestore, se a decisão Firebase for mantida.
- [ ] Criar regras Firestore de menor privilégio e testar leitura, criação, edição e exclusão por perfil.
- [ ] Provisionar o primeiro administrador de forma controlada, sem cadastro público de privilégios.
- [ ] Configurar índices necessários e tratamento de falhas/rede.
- [ ] Criar dados de teste fictícios e removê-los antes de produção.

**Critério de conclusão:** dois dispositivos conseguem consultar os mesmos registros de teste, e cada perfil só acessa o que lhe é permitido.

### Fase 4 — Contas e permissões
- [ ] Implementar login, logout, recuperação de acesso e persistência segura de sessão.
- [ ] Implementar aprovação ou bloqueio de solicitações de cadastro.
- [ ] Associar contas a perfis e vínculos escolares.
- [ ] Implementar permissões de Administrador, Direção, Secretaria, Professor, Responsável e Estudante.
- [ ] Impedir que o próprio usuário eleve seu perfil ou altere vínculos protegidos.
- [ ] Validar permissões no backend e nas regras do Firestore.
- [ ] Registrar operações administrativas relevantes em trilha de auditoria.

**Critério de conclusão:** testes automatizados demonstram que tentativas não autorizadas são negadas no servidor e no banco.

### Fase 5 — Cadastros escolares
- [ ] Cadastro e edição de turmas por ano letivo.
- [ ] Cadastro e edição de estudantes com coleta mínima de dados.
- [ ] Associação de estudantes às turmas.
- [ ] Associação de responsáveis legais aos estudantes, com validação administrativa.
- [ ] Cadastro e gerenciamento de professores.
- [ ] Associação de professores às turmas.
- [ ] Importação de dados somente se houver autorização e validação, com revisão antes de gravar.

**Critério de conclusão:** cadastros persistem no Firestore e respeitam os vínculos e permissões.

### Fase 6 — Gestão de viagens
- [ ] Criar, editar, cancelar e consultar viagens.
- [ ] Definir destino, datas, horários, capacidade e situação.
- [ ] Vincular turmas, estudantes e professores.
- [ ] Implementar fluxo de rascunho, envio para aprovação e aprovação/rejeição.
- [ ] Controlar vagas e evitar duplicidades.
- [ ] Implementar solicitações de participação e confirmação.
- [ ] Manter histórico das alterações e responsáveis por cada ação.

**Critério de conclusão:** uma viagem de teste percorre o fluxo completo, da criação ao encerramento, sem dados fictícios fixos no código.

### Fase 7 — Autorizações, presença e transporte
- [ ] Registrar autorização do responsável e autorização recebida em papel.
- [ ] Guardar status, data, responsável pelo registro e histórico.
- [ ] Restringir consulta de autorização ao vínculo permitido.
- [ ] Gerar lista de participantes para a viagem.
- [ ] Registrar presença na saída e no retorno por pessoa autorizada.
- [ ] Cadastrar veículos, capacidade e situação.
- [ ] Cadastrar condutores e equipe, com acesso restrito.
- [ ] Validar capacidade do veículo contra participantes confirmados.

**Critério de conclusão:** autorização e presença podem ser consultadas com histórico, e usuários sem permissão não conseguem acessar os registros.

### Fase 8 — Relatórios e comunicação
- [ ] Painel com indicadores calculados a partir do banco real.
- [ ] Relatórios de viagens, turmas, participantes, autorizações e presença.
- [ ] Exportação controlada, com apenas os campos necessários.
- [ ] Notificações e comunicados, se aprovados pela escola.
- [ ] Histórico de eventos e filtros por período.
- [ ] Não expor listas ou dados pessoais em links públicos.

**Critério de conclusão:** relatórios refletem os registros persistidos e respeitam as permissões do perfil.

### Fase 9 — Segurança, privacidade e qualidade
- [ ] Revisar autenticação, autorização, validação de entrada e tratamento de erros.
- [ ] Revisar cabeçalhos de segurança, política de conteúdo, CSRF/CORS conforme o fluxo final e limitação de tentativas.
- [ ] Proteger segredos e credenciais no Render.
- [ ] Revisar regras do Firestore com testes positivos e negativos.
- [ ] Minimizar dados pessoais e limitar retenção.
- [ ] Definir responsáveis pelo acesso, correção e exclusão dos dados.
- [ ] Definir rotina de backup e testar restauração.
- [ ] Configurar logs sem senhas, tokens ou dados pessoais desnecessários.
- [ ] Testar acessibilidade, responsividade, navegadores e conexão instável.
- [ ] Executar `npm run check` e `npm test`; corrigir falhas.
- [ ] Fazer revisão técnica e de privacidade com a escola.

**Critério de conclusão:** checklist de segurança aprovado, testes concluídos e plano de recuperação documentado.

### Fase 10 — Homologação e publicação
- [ ] Criar ambiente de homologação no Render.
- [ ] Testar com contas e dados exclusivamente fictícios.
- [ ] Obter validação dos responsáveis institucionais.
- [ ] Confirmar domínio, disponibilidade, limites e custos.
- [ ] Preparar procedimento de implantação e retorno à versão anterior.
- [ ] Fazer publicação oficial somente após autorização explícita.
- [ ] Comunicar endereço e instruções de acesso aos usuários autorizados.
- [ ] Só então avaliar a desativação da demonstração antiga do GitHub Pages.

**Critério de conclusão:** escola aprova o funcionamento, os responsáveis autorizam o uso e a versão de produção passa nos testes.

### Fase 11 — Manutenção e evolução
- [ ] Monitorar disponibilidade e erros do Render.
- [ ] Acompanhar uso, limites e custos dos serviços.
- [ ] Atualizar dependências e corrigir vulnerabilidades.
- [ ] Revisar contas e permissões periodicamente.
- [ ] Testar backups e restauração em intervalos definidos.
- [ ] Registrar solicitações de melhoria e priorizar por impacto.
- [ ] Manter documentação técnica e histórico de decisões atualizados.

## 6. Módulos fora da primeira versão

Podem ser avaliados depois da operação básica, mediante aprovação:
- GPS ou rastreamento em tempo real.
- Aplicativo nativo.
- Integrações automáticas com sistemas oficiais.
- Pagamentos online.
- Mensageria externa e notificações avançadas.

## 7. Regras de trabalho do repositório

1. Desenvolver na branch `firebase-integracao`.
2. Fazer alterações pequenas, verificáveis e com mensagens de commit claras.
3. Executar verificações e testes após mudanças relevantes.
4. Não alterar `main`, mesclar ou publicar sem autorização explícita.
5. Não inserir dados reais de estudantes, responsáveis ou funcionários em commits, exemplos, prints ou testes.
6. Não compartilhar credenciais, tokens, chaves privadas ou arquivos de ambiente.
7. Atualizar este planejamento quando uma etapa for concluída ou uma decisão mudar.

## 8. Próximas tarefas imediatas

1. Auditar a aplicação atual e mapear interface, API, SQLite e módulos Firebase.
2. Conferir e corrigir a configuração Render para que o serviço hospede o site completo e o backend.
3. Definir e documentar o fluxo definitivo Firebase Authentication + validação no backend.
4. Fechar o modelo Firestore e revisar as regras antes de integrar dados.
5. Integrar primeiro login e sessão; depois cadastros e viagens.
6. Testar em homologação no Render antes de qualquer publicação oficial.

**Não inserir dados reais nem declarar o SGVE pronto para uso escolar enquanto os critérios de segurança, persistência, testes e autorização institucional não forem cumpridos.**
