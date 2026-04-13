# Solera — UI Design System

> Use este documento como referência para todos os componentes da aplicação.

---

## Paleta de cores

### Backgrounds
| Token | Hex | Uso |
|---|---|---|
| `--bg-base` | `#0D0D0F` | Fundo principal da página |
| `--bg-sidebar` | `#111114` | Sidebar / painéis laterais |
| `--bg-card` | `#18181C` | Cards, modais, painéis |
| `--bg-card-hover` | `#1F1F25` | Estado hover de cards |
| `--bg-input` | `#1A1A20` | Inputs e campos de formulário |
| `--bg-highlight` | `#1E1B2E` | Highlight de item ativo no menu |

### Texto
| Token | Hex | Uso |
|---|---|---|
| `--text-primary` | `#E8E8EE` | Títulos e conteúdo principal |
| `--text-secondary` | `#8888A0` | Labels, subtítulos, metadados |
| `--text-muted` | `#55556A` | Placeholders, texto desabilitado |
| `--text-accent` | `#FFFFFF` | Números e destaques máximos |

### Bordas
| Token | Hex | Uso |
|---|---|---|
| `--border-subtle` | `#222228` | Bordas padrão de cards |
| `--border-active` | `#333340` | Bordas em foco ou hover |

### Cores de acento (brand)
| Token | Hex | Uso |
|---|---|---|
| `--accent-purple` | `#7B5CF0` | Ações primárias, botões CTA, item ativo |
| `--accent-purple-dim` | `#2D1F6E` | Background de badges e highlights purple |
| `--accent-green` | `#22C55E` | Status publicado, sucesso, tendência positiva |
| `--accent-green-dim` | `#0F2E1A` | Background de badges verdes |
| `--accent-amber` | `#F59E0B` | Revisão pendente, alertas, avisos |
| `--accent-amber-dim` | `#2D1F00` | Background de badges amber |
| `--accent-red` | `#EF4444` | Erro, falha, tendência negativa |
| `--accent-red-dim` | `#2D0F0F` | Background de badges vermelhos |
| `--accent-blue` | `#3B82F6` | Info, links, escrevendo/processando |
| `--accent-blue-dim` | `#0F1E3A` | Background de badges azuis |

---

## Tipografia

- Importar do next/fonts
```css
font-family: 'JetBrains Mono', 'Fira Code', monospace; /* labels técnicos, IDs, threads */
font-family: 'Inter', 'DM Sans', sans-serif;            /* corpo geral */
```

### Escala
| Nome | Tamanho | Peso | Uso |
|---|---|---|---|
| `display` | 32px | 700 | Números de KPI |
| `heading` | 18px | 600 | Títulos de seção |
| `body` | 14px | 400 | Conteúdo geral |
| `label` | 12px | 500 | Labels, badges, tags |
| `micro` | 11px | 400 | Metadados, timestamps, IDs |
| `mono` | 12px | 400 | Thread IDs, código inline |

---

## Componentes

### Sidebar
- Largura expandida: `200px`
- Largura colapsada: `56px`
- Background: `--bg-sidebar`
- Borda direita: `1px solid var(--border-subtle)`
- Item ativo: background `--bg-highlight`, cor `--accent-purple`, borda esquerda `2px solid --accent-purple`
- Item inativo: cor `--text-secondary`, hover `--text-primary`
- Seção label: `--text-muted`, 10px, letter-spacing 1.5px, uppercase

### Cards de KPI
- Background: `--bg-card`
- Border: `1px solid var(--border-subtle)`
- Border-radius: `12px`
- Padding: `20px 24px`
- Número: `display` scale, `--text-accent`
- Label: `label` scale, `--text-secondary`
- Badge de tendência: pill com background `dim` e texto da cor correspondente

### Badges de status
```
publicado   → bg: --accent-green-dim   | text: --accent-green
revisão     → bg: --accent-amber-dim   | text: --accent-amber
escrevendo  → bg: --accent-blue-dim    | text: --accent-blue
erro        → bg: --accent-red-dim     | text: --accent-red
pendente    → bg: --accent-purple-dim  | text: --accent-purple
```
- Border-radius: `6px`
- Padding: `3px 10px`
- Font: 11px, weight 500, monospace

### Botão primário (CTA)
- Background: `--accent-purple`
- Texto: `#FFFFFF`
- Border-radius: `8px`
- Padding: `8px 18px`
- Font: 13px, weight 500
- Hover: brightness(1.15)

### Botão secundário
- Background: `--bg-card`
- Border: `1px solid var(--border-active)`
- Texto: `--text-primary`
- Hover: background `--bg-card-hover`

### Tabela / lista de execuções
- Row background: `--bg-card`
- Row hover: `--bg-card-hover`
- Separador: `1px solid var(--border-subtle)`
- Avatar de agente: circle 32px, background colorido por tipo de agente
- Thread ID: monospace, `--text-muted`

---

## Espaçamento

```
--space-1:  4px
--space-2:  8px
--space-3:  12px
--space-4:  16px
--space-5:  20px
--space-6:  24px
--space-8:  32px
--space-10: 40px
--space-12: 48px
```

---

## Bordas e raios

```
--radius-sm:  6px   /* badges, inputs pequenos */
--radius-md:  8px   /* botões */
--radius-lg:  12px  /* cards */
--radius-xl:  16px  /* modais, painéis destacados */
--radius-full: 9999px /* pills, avatares */
```

---

## Iconografia
- Biblioteca: **Lucide Icons** (stroke, 16px ou 18px)
- Cor padrão: `--text-secondary`
- Cor ativa: `--accent-purple` ou `--text-primary`
- Stroke-width: `1.5px`

---

## Estado de sidebar colapsada
Quando colapsada, exibir apenas ícones centralizados (sem labels). Manter tooltip com o nome ao hover. Botão de toggle no topo com ícone de chevron ou menu hamburger.
