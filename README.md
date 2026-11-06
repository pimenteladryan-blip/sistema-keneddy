# SGVE — Sistema de Gerenciamento de Viagens Escolares

Aplicação web para apoiar a organização de viagens escolares do Colégio Estadual Presidente Kennedy, em Ponta Grossa/PR.

## Funcionalidades implementadas

- Interface responsiva para computador e celular.
- Login com hash de senha scrypt, sessão em cookie HttpOnly/SameSite e token CSRF.
- Perfis: administrador, direção, secretaria, professor, responsável e estudante.
- Cadastro de turmas do Ensino Fundamental e Ensino Médio, incluindo cursos Regular, Técnico ADM e Técnico DS.
- Cadastro mínimo de estudantes (nome e turma).
- Criação de contas com permissões limitadas por perfil.
- Associação de responsável a estudante pela API; responsáveis consultam apenas estudantes vinculados.
- Estudantes consultam apenas o próprio cadastro quando uma conta estiver vinculada.
- Auditoria de ações de cadastro e autenticação.
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

Gestão de viagens e aprovação, atribuição de professores às turmas, vínculo de estudantes às viagens, autorizações, presença de saída/retorno, transporte e relatórios.

## Segurança e privacidade

Este projeto ainda é um protótipo em desenvolvimento e **não está aprovado para dados reais de crianças ou adolescentes**. Use apenas dados fictícios. O cadastro atual limita os dados de estudante a nome e turma; não adicione documentos, endereço, telefone ou dados sensíveis. Professores ainda não recebem listas de turma, pois a atribuição de turmas será implementada antes de liberar esse acesso. Antes de qualquer implantação institucional, são obrigatórias revisão técnica e de segurança, avaliação de privacidade/LGPD, definição de base legal e retenção, backups testados, validação da escola e controle de acesso operacional. O limite de tentativas de login atual é local à instância e não substitui rate limiting distribuído.
