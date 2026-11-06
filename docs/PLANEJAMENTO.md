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
