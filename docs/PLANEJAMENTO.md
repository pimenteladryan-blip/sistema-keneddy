# Planejamento do SGVE
## Sistema de Gerenciamento de Viagens Escolares

**Instituição de referência:** Colégio Estadual Presidente Kennedy — Ponta Grossa/PR  
**Repositório:** https://github.com/pimenteladryan-blip/sistema-keneddy  
**Status:** Planejamento inicial — implementação ainda não iniciada.

## 1. Objetivo

Desenvolver uma aplicação web responsiva para organizar viagens escolares, centralizando o planejamento, os participantes, as autorizações, a frequência, o transporte e os relatórios. A aplicação deverá funcionar em computadores e celulares.

O sistema é destinado a uso institucional. Como poderá tratar dados de crianças e adolescentes, nenhuma implantação com dados reais deve ocorrer antes de revisão técnica, validação da escola e avaliação de privacidade e conformidade com a LGPD.

## 2. Público e perfis de acesso

- **Administrador:** configura o sistema, gerencia contas e possui acesso administrativo.
- **Direção:** acompanha e aprova viagens e consulta relatórios.
- **Secretaria:** mantém cadastros escolares e organiza viagens.
- **Professor/responsável pela viagem:** consulta participantes e registra presença.
- **Responsável legal:** consulta as viagens vinculadas ao estudante e registra autorização ou recusa.
- **Estudante:** consulta informações da viagem que forem liberadas pela escola.

As permissões serão aplicadas no servidor, não apenas escondendo opções na interface. O acesso será limitado ao mínimo necessário para cada função.

## 3. Módulos funcionais

### 3.1 Painel inicial
- Próximas viagens e calendário.
- Situação das autorizações.
- Quantidade de participantes e vagas.
- Pendências operacionais.

### 3.2 Cadastros escolares
- Estudantes, turmas, responsáveis legais e professores.
- Veículos e dados operacionais estritamente necessários.
- Etapas: Ensino Fundamental (6º ao 9º ano) e Ensino Médio (1ª à 3ª série).
- Ensino Médio Regular e Técnico, com opções ADM e DS.
- Turmas e divisões flexíveis, sem limitar a escola a letras fixas.

### 3.3 Gestão de viagens
- Destino, objetivo pedagógico, data e horários.
- Turmas participantes, equipe responsável e transporte.
- Capacidade, vagas e lista de participantes.
- Situações: rascunho, aguardando aprovação, aberta, concluída e cancelada.

### 3.4 Autorizações
- Registro de autorização ou recusa pelo responsável legal.
- Registro administrativo de autorização em papel.
- Histórico de alterações, data e usuário responsável pelo registro.
- Situação individual visível somente a perfis autorizados.

### 3.5 Frequência e acompanhamento
- Lista de presença na saída e no retorno.
- Registro de ausência e observações operacionais necessárias.
- Histórico de quem realizou cada registro.

### 3.6 Financeiro e relatórios
- Registro de custos da viagem.
- Controle opcional de contribuições/pagamentos, quando aplicável.
- Relatórios por viagem, turma e período.
- Impressão e exportação com minimização de dados pessoais.

## 4. Fluxo principal

1. Secretaria cria a proposta de viagem.
2. Direção revisa e aprova.
3. Secretaria publica as informações permitidas e vincula participantes.
4. Responsáveis legais autorizam ou recusam; documentos em papel podem ser registrados pela secretaria.
5. Professor confere a lista e registra a presença na saída e no retorno.
6. Secretaria ou direção encerra a viagem e consulta os relatórios.

## 5. Arquitetura técnica proposta

- **Interface:** HTML, CSS e JavaScript, responsiva e acessível.
- **Servidor:** Node.js LTS/24+ e Express.
- **Banco de dados:** SQLite no protótipo; avaliar banco gerenciado para operação institucional e múltiplas instâncias.
- **Autenticação:** senhas armazenadas com hash forte, sessões protegidas e encerramento de sessão.
- **Hospedagem:** Render ou ambiente aprovado pela instituição, com armazenamento persistente e backups testados.
- **Testes:** testes automatizados de regras de negócio, autenticação, permissões e fluxos críticos.

A escolha final de hospedagem e banco deverá considerar disponibilidade, backups, controle de acesso, localização e tratamento dos dados.

## 6. Estrutura inicial de pastas

```text
public/
  css/
  js/
  images/
  index.html
server/
  routes/
  controllers/
  middleware/
  services/
  db.js
  index.js
database/
  schema.sql
tests/
docs/
  PLANEJAMENTO.md
.env.example
.gitignore
package.json
render.yaml
README.md
```

## 7. Etapas de desenvolvimento e entregas

| Etapa | Entrega | Critério de conclusão |
|---|---|---|
| 1. Fundação | Estrutura, configuração e documentação | Aplicação inicia em ambiente local |
| 2. Acesso | Login, sessões e perfis | Rotas protegidas e permissões testadas no servidor |
| 3. Cadastros | Turmas, estudantes, responsáveis, equipe e transporte | Operações validadas e acessos restritos |
| 4. Viagens | Criação, aprovação, calendário e participantes | Fluxo de criação e aprovação funcional |
| 5. Autorizações | Resposta do responsável e registro em papel | Histórico auditável e acesso individual controlado |
| 6. Presença | Listas de saída e retorno | Registros associados à viagem e ao usuário |
| 7. Relatórios | Custos, consultas e exportações | Relatórios conferidos e sem exposição excessiva |
| 8. Qualidade e implantação | Testes, revisão de segurança e publicação | Aprovação institucional, backups e monitoramento verificados |

## 8. Segurança, privacidade e proteção de menores

Antes de usar dados reais:
- Definir com a escola a finalidade e a base legal de cada dado coletado.
- Coletar somente os dados estritamente necessários.
- Não publicar listas de estudantes, documentos, contatos ou autorizações.
- Aplicar controle de acesso por perfil e por vínculo com a viagem/estudante.
- Proteger sessões, cookies e comunicações HTTPS.
- Validar entradas no servidor, limitar tentativas de login e proteger formulários contra CSRF.
- Manter trilha de auditoria para ações administrativas relevantes.
- Definir política de retenção, correção e eliminação de dados.
- Preparar backups criptografados e testar a restauração.
- Usar dados fictícios nos ambientes de desenvolvimento e teste.
- Não colocar senhas, tokens, chaves ou dados pessoais no GitHub.
- Obter validação da direção e revisão de privacidade/segurança antes da operação.

## 9. Fora do escopo da primeira versão

- Rastreamento GPS em tempo real.
- Integração automática com sistemas oficiais da rede de ensino.
- Aplicativo nativo para Android/iOS.
- Cobrança ou processamento de pagamentos.
- Envio automático de mensagens por serviços externos.

Esses itens poderão ser avaliados posteriormente, mediante necessidade e aprovação institucional.

## 10. Critérios gerais de aceite

- Interface utilizável em celular e computador.
- Perfis não conseguem acessar funções ou registros fora de sua autorização.
- Viagens seguem o fluxo de criação, aprovação, autorização e encerramento.
- Autorizações e presenças possuem histórico.
- Relatórios respeitam as permissões e exibem apenas os dados necessários.
- Testes cobrem os fluxos críticos e casos de acesso indevido.
- Documentação explica instalação, configuração, backups e implantação.

## 11. Decisões padrão para iniciar

- Identidade visual inicial: verde e branco, sem uso de logotipo não fornecido.
- Turmas: cadastro flexível de ano/série, curso e divisão.
- Financeiro: custos e pagamentos opcionais, configuráveis por viagem.
- Contas: criação administrativa por perfis autorizados; sem cadastro público.
- Autorizações: digitais e registro de documentos em papel.

**Próximo passo:** implementar a fundação técnica e o fluxo de autenticação/permissões, usando exclusivamente dados fictícios durante o desenvolvimento.
