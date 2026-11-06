# Planejamento do SGVE
## Sistema de Gerenciamento de Viagens Escolares

**Instituição de referência:** Colégio Estadual Presidente Kennedy — Ponta Grossa/PR  
**Repositório:** https://github.com/pimenteladryan-blip/sistema-keneddy  
**Status:** Fundação e cadastros iniciais implementados; fluxos de viagem ainda pendentes.

## Objetivo
Aplicação web responsiva para organizar viagens escolares, participantes, autorizações, frequência, transporte e relatórios. Como poderá tratar dados de crianças e adolescentes, não deve ser usada com dados reais antes de revisão técnica, validação institucional e avaliação de privacidade/LGPD.

## Perfis de acesso
- **Administrador:** configuração e gestão completa de contas.
- **Direção:** aprova viagens e acompanha relatórios; pode administrar cadastros.
- **Secretaria:** mantém cadastros escolares e organiza viagens; não cria contas administrativas.
- **Professor:** consulta somente registros operacionais que forem atribuídos ao seu perfil.
- **Responsável legal:** consulta viagens vinculadas e registra autorização/recusa.
- **Estudante:** consulta somente informações liberadas e vinculadas à sua conta.

As permissões são verificadas no servidor. Esconder opções na interface não é considerado controle de segurança.

## Módulos e situação
1. **Fundação e acesso — implementado:** Node.js, Express, SQLite, login, sessões, CSRF, perfis e testes.
2. **Cadastros iniciais — implementado:** turmas, estudantes com dados mínimos, contas e associação de responsáveis.
3. **Gestão de viagens — próximo:** proposta, destino, finalidade pedagógica, datas, capacidade, turmas, equipe, transporte e aprovação da direção.
4. **Participantes e autorizações:** vincular estudantes à viagem; autorização digital do responsável e registro administrativo de autorização em papel.
5. **Presença:** listas de saída e retorno, com usuário e horário do registro.
6. **Transporte:** cadastro operacional de veículos e condutores, com acesso restrito.
7. **Financeiro e relatórios:** custos e contribuições opcionais; exportação com minimização de dados.
8. **Implantação:** revisão de segurança, privacidade, acessibilidade, backups, monitoramento e aprovação institucional.

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
- Professores não consultam listas gerais; a atribuição de turmas deve ser implementada antes de liberar suas listas.
- Não publicar documentos, endereços, telefones, autorizações ou listas de estudantes.
- Definir finalidade, base legal, retenção, correção e eliminação dos dados.
- Revisar controle de acesso, rate limiting, CSRF, sessões e logs.
- Preparar backups criptografados e testar restauração.
- Validar com a escola e obter revisão de privacidade/segurança antes da operação.

## Fora do escopo inicial
GPS em tempo real, aplicativo nativo, integração automática com sistemas oficiais e processamento de pagamentos.

## Próxima entrega
Implementar cadastro de viagens, aprovação pela direção e vínculo de turmas/estudantes à viagem, mantendo permissões verificadas no servidor.
