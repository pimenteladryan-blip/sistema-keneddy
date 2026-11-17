# Plano de migração SQLite → Firestore

**Estado:** planejamento técnico, não executado.  
**Projeto de destino:** Firebase/Firestore do SGVE, região `southamerica-east1`.  
**Regra de segurança:** não exportar, colar, anexar ou versionar dados reais de estudantes, hashes de senha ou credenciais.

Este documento descreve como preparar uma migração futura. Não é um script de importação e não autoriza a migração, a publicação de regras ou a implantação do sistema.

## 1. Pré-condições obrigatórias

1. Aprovação formal da escola e definição de responsável institucional pelo tratamento dos dados.
2. Revisão independente de segurança, privacidade/LGPD, retenção e acesso.
3. Backup íntegro do SQLite, armazenado em local controlado e com restauração testada.
4. Janela de manutenção: interromper escritas no sistema antigo durante exportação, importação e conferência. Não fazer sincronização bidirecional.
5. Projeto Firebase, região, regras, índices, TTL, quotas e custos conferidos por adulto responsável.
6. Credencial de serviço configurada somente em segredo do ambiente, nunca no repositório, chat, planilha ou arquivo de exportação compartilhado.
7. Teste completo no Firestore Emulator com base sintética antes de qualquer teste controlado no projeto real.

## 2. Mapeamento das tabelas

Os IDs numéricos do SQLite devem ser preservados nos IDs dos documentos Firestore para manter referências e facilitar reconciliação.

| SQLite | Coleção Firestore | Documento / relação |
|---|---|---|
| `users` | `users` | `{id}`; preservar papel, estado e hash scrypt validado |
| `registration_requests` | `registration_requests` | `{id}`; preservar estado e revisão; tratar pedidos pendentes como credenciais |
| `classes` | `classes` | `{id}`; reconstruir índice único composto |
| `students` | `students` | `{id}`; preservar `class_id` e `user_id` opcional |
| `student_guardians` | `student_guardians` | `{student_id}_{guardian_user_id}` |
| `trips` | `trips` | `{id}`; preservar estado, horários, capacidade, `vehicle_id` e `driver_id` |
| `trip_classes` | `trip_classes` | `{trip_id}_{class_id}` |
| `trip_students` | `trip_students` | `{trip_id}_{student_id}`; preservar autorização e presença |
| `trip_staff` | `trip_staff` | `{trip_id}_{user_id}` |
| `vehicles` | `vehicles` | `{id}`; reconstruir índice único de `name_key` |
| `drivers` | `drivers` | `{id}`; reconstruir índice único de `name_key` |
| `audit_logs` | `audit_logs` | preservar ID numérico histórico e campos de auditoria |

### Dados que não devem ser migrados como sessões ativas

- `sessions`: não copiar cookies, hashes de token ou tokens CSRF. Encerrar todas as sessões antigas e exigir novo login após a virada.
- `_sgve_rate_limits`: iniciar vazio no destino; limites antigos não são sessões nem histórico escolar.
- Cache local, dados de demonstração do GitHub Pages e `localStorage`: não fazem parte da migração do banco institucional.

## 3. Ordem de importação

A ordem respeita as chaves estrangeiras do SQLite:

1. Usuários e classes.
2. Veículos e condutores.
3. Estudantes.
4. Responsáveis vinculados aos estudantes.
5. Viagens.
6. Vínculos de turmas, estudantes e professores às viagens.
7. Auditoria histórica.
8. Índices únicos e contadores internos do SGVE, reconciliados com os documentos importados.

A importação deve usar IDs determinísticos e ser idempotente: executar novamente um lote já importado não pode duplicar registros nem sobrescrever silenciosamente dados divergentes.

## 4. Campos e regras especiais

- **Contas:** os hashes existentes usam o formato scrypt validado pelo servidor. Se a escola aprovar a preservação de login por senha, transferir somente o hash já derivado, em canal seguro. Nunca exportar senhas em texto puro. Conferir e-mail normalizado, papel e estado ativo.
- **Solicitações pendentes:** contêm hash de senha e código de verificação. Migrar somente se houver necessidade institucional e política de retenção aprovada. Não expor esses campos em relatórios ou logs.
- **Turmas:** reconstruir a chave composta usando nível, série/ano, curso, seção e ano letivo, com a mesma normalização da aplicação.
- **Relações:** usar os IDs compostos indicados na tabela e verificar que os documentos de origem existem antes de gravar cada vínculo.
- **Viagens:** preservar `vehicle_id` e `driver_id` somente se apontarem para registros válidos. Recalcular `participant_count` a partir de `trip_students`; não confiar em contadores antigos.
- **Autorizações e presença:** preservar os estados existentes. Metadados de quem/quando alterou uma decisão só podem ser preenchidos quando existirem no banco de origem; não inventar histórico.
- **Auditoria:** preservar ator, ação, tipo, identificador da entidade e data. Registros sem ator válido permanecem com ator nulo.
- **Contadores:** reconciliar `_sgve_counters` com o maior ID importado de cada coleção numérica (`users`, `registrationRequests`, `classes`, `students`, `trips`, `vehicles`, `drivers` e `auditLogs`). Isso evita que a próxima criação reutilize um ID existente.
- **Índices únicos:** reconstruir `_sgve_unique_indexes` para e-mails de usuários e solicitações, nomes de veículos/condutores e chave composta das turmas. Verificar colisões antes da gravação.

## 5. Execução técnica futura

O importador ainda precisa ser criado e revisado. Ele deverá:

1. Ler uma cópia consistente e somente leitura do SQLite.
2. Validar tipos, IDs, referências, datas, estados e unicidade antes de gravar.
3. Produzir um relatório de pré-validação apenas com contagens e códigos de erro, sem nomes, e-mails, hashes ou dados de estudantes.
4. Gravar em lotes limitados, respeitando o limite de operações por batch do Firestore.
5. Registrar checkpoints técnicos sem dados pessoais para permitir retomada segura.
6. Ser idempotente e interromper diante de conflito de ID, chave única ou referência ausente.
7. Validar contagens, relações, estados, totais e amostras sintéticas antes de liberar tráfego.
8. Manter o SQLite original congelado e imutável até a aprovação do resultado.

Não executar um importador improvisado diretamente na base real. A camada Admin do Firebase ignora as regras de cliente do Firestore, então o script precisa validar todas as entradas por conta própria.

## 6. Critérios de aceite

- Contagem por tabela/coleção reconciliada.
- Nenhum ID duplicado ou referência órfã.
- Todas as relações de responsáveis, turmas, estudantes, professores, veículos e condutores verificadas.
- Contadores e índices únicos testados com uma criação fictícia após a importação.
- Login de contas fictícias, permissões por perfil, viagens, autorização, presença, transporte e relatórios validados.
- Regras, índices e TTL conferidos no projeto correto.
- Backup restaurável e plano de rollback ensaiado.
- Aprovação explícita da escola antes da virada.

## 7. Virada e rollback

A virada só ocorre após aceite formal: congelar escritas no SQLite, fazer backup final, importar, reconciliar, executar smoke tests com contas fictícias e liberar o novo backend. Manter o backup original intacto.

Se qualquer critério falhar, interromper a virada e manter o sistema antigo em modo controlado. Não tentar sincronizar alterações parcialmente importadas de volta automaticamente. Qualquer retorno exige decidir qual base é a fonte oficial e reconciliar as alterações ocorridas durante a janela.

**Situação atual:** nenhum dado real foi exportado ou importado; nenhum teste de migração foi executado no Firebase real.