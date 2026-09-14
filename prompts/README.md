# Prompts dos agentes

Esta pasta reúne, na íntegra, os prompts usados pelos agentes do Solera e a rubrica de avaliação. É a referência citada no artigo.

> Gerado automaticamente em 2026-09-14 por `pnpm prompts:export`, a partir do código e da configuração dos agentes. Não edite à mão: altere a origem e gere de novo.

🌐 **English translation:** [en/README.md](en/README.md)

## Índice

| # | Agente | O que faz | Modelo (configuração atual) | Temperatura |
|---|---|---|---|---|
| 01 | [Researcher](01-researcher.md) | Pesquisa fontes sobre o tópico | `gpt-4o` | 0.3 |
| 02 | [Analyst](02-analyst.md) | Filtra as fontes e extrai insights | `gpt-4o` | 0.3 |
| 03 | [Writer](03-writer.md) | Escreve e reescreve o post | `gpt-4o-mini` | 0.9 |
| 04 | [Critic](04-critic.md) | Avalia o post com a rubrica | `gpt-4.1` | 0.1 |
| 05 | [Rubrica e regra de aceitação](05-rubrica-e-regra-de-aceitacao.md) | Instrumento comum ao Critic e aos humanos | — | — |

### Atalhos

- Researcher: [prompt de sistema](01-researcher.md#prompt-de-sistema) · [ferramenta de busca](01-researcher.md#ferramenta-de-busca)
- Analyst: [prompt de sistema](02-analyst.md#prompt-de-sistema) · [mensagem do usuário](02-analyst.md#mensagem-do-usuário)
- Writer: [prompt de sistema](03-writer.md#prompt-de-sistema) · [reescrita após o Critic](03-writer.md#reescrita-após-reprovação-do-critic) · [revisão humana](03-writer.md#revisão-pedida-pelo-humano) · [faixas de tamanho](03-writer.md#faixas-de-tamanho)
- Critic: [prompt de sistema](04-critic.md#prompt-de-sistema) · [retentativa de coerência](04-critic.md#retentativa-de-coerência)
- Rubrica: [dimensões](05-rubrica-e-regra-de-aceitacao.md#dimensões) · [regra de aceitação](05-rubrica-e-regra-de-aceitacao.md#regra-de-aceitação)

## Como ler estes prompts

- **Idioma.** Os prompts estão em português do Brasil, o idioma em que rodaram no estudo. A [tradução para o inglês](en/README.md) acompanha a mesma estrutura.
- **Placeholders.** Trechos como `{{TÓPICO}}`, `{{INSIGHTS}}` e `{{POST}}` marcam o que é preenchido a cada execução.
- **Montagem.** Cada prompt de sistema começa com o papel do agente (`PAPEL DESTE AGENTE: …`). Depois vem o texto do código ou, se houver, o override configurado na interface, que substitui o texto do código (Researcher, Analyst) ou é colocado antes dele (Writer, Critic). Na geração desta pasta havia override ativo em: **researcher, analyst**.
- **Renderizado × transcrito.** Os prompts de sistema são renderizados pelas mesmas funções que o pipeline usa. Os blocos que os nós montam na hora (reescrita do Writer, pedido do revisor humano, correção de coerência do Critic) são transcritos do código e estão sinalizados como tal.

## Agentes sem prompt

- **Revisão humana (HITL).** Pausa a execução e mostra o post e as notas ao revisor, que pode aprovar, pedir revisão com um comentário ou encerrar. O comentário vira o bloco de [revisão humana](03-writer.md#revisão-pedida-pelo-humano) do Writer.
- **Publisher.** Publica o post aprovado no LinkedIn e registra a publicação.

## Versões e relação com o estudo

- **Critic.** O hash do prompt gerado aqui é `732946eb8d5147df`, igual ao gravado nas notas do Critic analisadas no artigo. O prompt desta pasta é exatamente o que produziu aquelas notas.
- **Researcher.** O prompt em vigor é o override gravado na configuração (a última gravação da configuração, em 2026-08-29 18:53 UTC, ocorreu durante a geração dos posts, mas o texto é idêntico ao da configuração em arquivo de 27/08/2026, anterior aos posts — portanto foi este o texto usado neles). O texto de `src/app/MAS/prompts/researcher.prompt.ts` não é usado enquanto o override existir.
- **Analyst.** O prompt em vigor é o override gravado na configuração (a última gravação da configuração, em 2026-08-29 18:53 UTC, ocorreu durante a geração dos posts, mas o texto é idêntico ao da configuração em arquivo de 27/08/2026, anterior aos posts — portanto foi este o texto usado neles). O texto de `src/app/MAS/prompts/analyst.prompt.ts` não é usado enquanto o override existir.
- **Writer.** O prompt é o do código, cuja última modificação é de 08/09/2026, depois da geração dos posts do estudo (29/08 a 02/09/2026). A mudança principal foi o bloco de idioma de saída, para permitir posts em inglês; a versão exata usada nos posts não está versionada.
- **Modelo do Writer.** A configuração atual (`gpt-4o-mini`) foi gravada em 2026-08-29 18:53 UTC, durante a geração dos posts do estudo. Pelos registros de execução, sete posts foram escritos por `gpt-4o-2024-08-06` e três (J, L e P) por `gpt-4o-mini-2024-07-18`. Researcher e Analyst usaram `gpt-4o-2024-08-06` e o Critic, `gpt-4.1-2025-04-14`.
