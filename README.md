# Sistema Kennedy | SGVE

Sistema de Gerenciamento de Viagens Escolares do Colégio Estadual Presidente Kennedy.

## Estrutura

```text
.
├── public/
│   ├── assets/          # Mascotes e imagens
│   ├── css/             # Folhas de estilo
│   ├── js/              # Código da interface
│   ├── index.html
│   ├── firebase-config.js
│   ├── manifest.webmanifest
│   ├── sw.js
│   └── icon.svg
├── server/
│   └── index.js         # Servidor HTTP e entrega dos arquivos públicos
├── package.json
├── .gitignore
└── README.md
```

## Executar localmente

Requer Node.js 18 ou superior.

```bash
npm start
```

O servidor usa a variável `PORT` fornecida pelo ambiente (Render) ou a porta 3000 localmente.

Para verificar a sintaxe dos arquivos JavaScript:

```bash
npm run check
```

## Publicação no Render

Criar/Manter como **Web Service**. Comandos:

- Build Command: `npm install`
- Start Command: `npm start`

Não configurar como Static Site.

## Situação técnica importante

Esta branch mantém a versão atual da interface e organiza os arquivos sem substituir a aplicação por outra branch. O servidor aqui entrega os arquivos estáticos; ele ainda não implementa as rotas `/api` chamadas pela interface. Portanto, esta reorganização, sozinha, não torna cadastro, login por senha, turmas, estudantes ou viagens funcionais. A implementação e os testes da API devem ser uma etapa separada antes de considerar a versão pronta para uso.

A configuração web do Firebase é pública por natureza. Credenciais privadas do Firebase Admin nunca devem ser colocadas em arquivos públicos ou commitadas no repositório.
