# SGVE — Sistema de Gerenciamento de Viagens Escolares

Aplicação web para apoiar a organização de viagens escolares do Colégio Estadual Presidente Kennedy, em Ponta Grossa/PR.

## Funcionalidades implementadas

- Interface responsiva para computador e celular.
- Login com hash de senha scrypt, sessão em cookie HttpOnly/SameSite e token CSRF.
- Perfis: administrador, direção, secretaria, professor, responsável e estudante.
- Cadastro de turmas do Ensino Fundamental e Ensino Médio, incluindo cursos Regular, Técnico ADM e Técnico DS.
- Cadastro mínimo de estudantes (nome e turma).
- Criação de contas com permissões limitadas por perfil e associação de responsáveis a estudantes.
- Planejamento de viagens com destino, objetivo pedagógico, datas, capacidade e status.
- Vínculo de turmas e estudantes às viagens.
- Envio de rascunhos para aprovação e aprovação exclusiva da direção/administração.
- Consulta de viagens limitada aos vínculos de cada perfil.
- Auditoria de ações de cadastro, autenticação e aprovação.
- Testes automatizados e GitHub Actions.
- Configuração inicial para Render com armazenamento persistente.

## Executar localmente

Requer Node.js 24 ou superior.

1. Execute `npm install`.
2. Copie `.env.example` para `.env`.
3. Defina `ADMIN_EMAIL` e uma `ADMIN_PASSWORD` com pelo menos 14 caracteres.
4. Execute `npm start` e acesse `http://localhost:3000`.

Não existe senha administrativa padrão. Não envie o arquivo `.env` ao GitHub.

## Verificações

- `npm run check`
- `npm test`

## Próximas etapas

Atribuição de professores às viagens/turmas, autorizações digitais e registro em papel, presença de saída/retorno, transporte e relatórios.

## Segurança e privacidade

Este projeto ainda é um protótipo em desenvolvimento e **não está aprovado para dados reais de crianças ou adolescentes**. Use apenas dados fictícios. O cadastro atual limita os dados de estudante a nome e turma; não adicione documentos, endereço, telefone ou dados sensíveis. Professores só consultam viagens atribuídas; a atribuição de equipe e turmas precisa ser concluída antes do uso operacional. Antes de qualquer implantação institucional, são obrigatórias revisão técnica e de segurança, avaliação de privacidade/LGPD, definição de base legal e retenção, backups testados, validação da escola e controle de acesso operacional. O limite de tentativas de login atual é local à instância e não substitui rate limiting distribuído.
