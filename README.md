# SGVE — Sistema de Gerenciamento de Viagens Escolares

Aplicação web para apoiar a organização de viagens escolares do Colégio Estadual Presidente Kennedy, em Ponta Grossa/PR.

## Estado atual

Esta primeira etapa contém a fundação do projeto:
- Interface inicial responsiva para computador e celular.
- Servidor Node.js com Express.
- Banco SQLite com tabelas iniciais para usuários, sessões, turmas, viagens e auditoria.
- Login com hash de senha usando scrypt.
- Sessões aleatórias armazenadas no banco e cookie HttpOnly/SameSite.
- Proteção CSRF para encerramento de sessão, cabeçalhos de segurança e limite básico de tentativas de login.
- Health check para hospedagem.
- Configuração inicial para Render.

O painel ainda é um esqueleto. Cadastros escolares, viagens, autorizações, presença e relatórios serão implementados nas próximas etapas.

## Requisitos

- Node.js 24 ou superior.
- npm.

## Executar localmente

1. Instale as dependências com: npm install
2. Copie .env.example para .env e configure ADMIN_EMAIL e ADMIN_PASSWORD. A senha inicial deve ter pelo menos 14 caracteres.
3. Inicie com: npm start
4. Acesse http://localhost:3000.

A conta administrativa é criada somente quando ADMIN_EMAIL e ADMIN_PASSWORD são configurados e ainda não existe uma conta com aquele e-mail. Não há senha padrão.

## Verificações

- npm run check
- npm test

## Render

O arquivo render.yaml define o serviço, o health check e um disco persistente para o SQLite. Configure ADMIN_EMAIL e ADMIN_PASSWORD como variáveis secretas no painel do Render. Não coloque senhas ou tokens no repositório.

## Importante — antes de usar dados reais

Este repositório está em desenvolvimento e **não está aprovado para operação com dados reais de estudantes**. O controle de tentativas de login desta versão é mantido em memória e não substitui proteção distribuída. Ainda são necessárias revisão de segurança, política de retenção, backups testados, validação institucional e avaliação de privacidade/LGPD. Use apenas dados fictícios em desenvolvimento e testes. Não publique dados pessoais de estudantes, responsáveis ou funcionários.

Consulte também docs/PLANEJAMENTO.md.
