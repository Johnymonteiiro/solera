
<div align="center">

```
╭─────────────────────────────────────────╮
│                                         │
│   ╭──╮                                  │
│   │ S │  solera                         │
│   ╰──╯  multi-agent content system      │
│                                         │
╰─────────────────────────────────────────╯
```

**Solera** é uma plataforma de geração de conteúdo para LinkedIn movida por múltiplos agentes de IA —
do briefing à publicação, orquestrada em um único dashboard.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)

</div>

---

## O que é

O Solera coordena uma cadeia de agentes de IA para criar, revisar e publicar conteúdo no LinkedIn de forma autônoma. Cada execução passa por um pipeline configurável onde agentes especializados — redatores, revisores, formatadores — trabalham em sequência até o post estar pronto para ir ao ar.

Tudo isso com rastreabilidade completa via LangSmith e um dashboard que dá visibilidade total de cada etapa.

---

## Funcionalidades

| Módulo | Descrição |
|---|---|
| **Dashboard** | Visão geral em tempo real — KPIs, execuções ativas e posts gerados |
| **Execuções** | Disparo e acompanhamento de pipelines multi-agente |
| **Revisões** | Fila de conteúdo aguardando aprovação humana antes de publicar |
| **Posts** | Histórico de posts publicados com métricas de engajamento |
| **Agentes** | Configuração individual de cada agente: modelo, temperatura, system prompt |
| **Ferramentas** | Gerenciamento das ferramentas disponíveis para os agentes |
| **Prompts** | Biblioteca de prompts versionados usados nas execuções |
| **Analytics** | Análise de performance de conteúdo ao longo do tempo |
| **LangSmith** | Rastreamento de traces para debugging e otimização dos agentes |

---

## Stack

```
Frontend       Next.js 16 · React 19 · TypeScript 5
Estilo         Tailwind CSS v4 · shadcn/ui (radix-nova) · Lucide Icons
Auth           LinkedIn OAuth 2.0 · JWT via jose · cookies httpOnly
Design System  Dark-first · CSS custom properties · tokens semânticos
```

---

## Primeiros passos

### Pré-requisitos

- Node.js 20+
- pnpm

### Instalação

```bash
# Clone o repositório
git clone <repo-url>
cd solera

# Instale as dependências
pnpm install
```

### Variáveis de ambiente

Crie um arquivo `.env.local` na raiz:

```env
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
LINKEDIN_REDIRECT_URI=http://localhost:3000/api/auth/callback
SESSION_SECRET=gere_uma_string_longa_e_aleatoria_aqui
```

> Para obter as credenciais do LinkedIn, crie um app em [linkedin.com/developers](https://www.linkedin.com/developers/) e configure o redirect URI acima como URL autorizada.

### Desenvolvimento

```bash
pnpm dev
```

Acesse [http://localhost:3000](http://localhost:3000) e faça login com sua conta LinkedIn.

---

## Estrutura do projeto

```
src/
├── app/
│   ├── (auth)/login/          # Página de login
│   ├── (dashboard)/           # Rotas protegidas do dashboard
│   │   ├── layout.tsx         # Layout com sidebar
│   │   ├── dashboard/
│   │   ├── execucoes/
│   │   ├── revisoes/
│   │   ├── posts/
│   │   ├── agentes/
│   │   ├── ferramentas/
│   │   ├── prompts/
│   │   ├── analytics/
│   │   └── langsmith/
│   ├── api/auth/
│   │   ├── linkedin/          # Inicia o fluxo OAuth
│   │   └── callback/          # Callback do LinkedIn
│   └── actions.ts             # Server Actions (logout, etc.)
├── components/
│   ├── dashboard/             # Componentes da aplicação
│   │   ├── app-sidebar.tsx
│   │   ├── topbar.tsx
│   │   ├── user-avatar-menu.tsx
│   │   ├── kpi-card.tsx
│   │   └── status-badge.tsx
│   └── ui/                    # Componentes shadcn/ui
├── lib/
│   └── sessions.ts            # Criação e verificação de sessão JWT
└── proxy.ts                   # Proteção de rotas (Next.js 16)
```

---

## Autenticação

O Solera usa **LinkedIn OAuth 2.0** com sessões JWT armazenadas em cookies `httpOnly`. Não há dependência de bibliotecas de auth externas.

```
/login → /api/auth/linkedin → LinkedIn → /api/auth/callback → /dashboard
```

- CSRF protegido via state aleatório por requisição
- Sessão válida por 60 dias
- Rotas do dashboard protegidas pelo proxy do Next.js 16

---

## Design system

O Solera tem um sistema de design dark-first com tokens CSS semânticos. A referência completa está em [`UI.md`](./UI.md).

**Principais tokens:**

```css
--accent-purple:  #7B5CF0  /* ações primárias, itens ativos */
--bg-base:        #0D0D0F  /* fundo da página */
--bg-card:        #18181C  /* cards e painéis */
--text-primary:   #E8E8EE  /* conteúdo principal */
--text-muted:     #55556A  /* metadados e placeholders */
```

---

<div align="center">

feito com foco · dark mode only · agentes no comando

</div>
