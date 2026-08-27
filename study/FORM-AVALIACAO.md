# Form de avaliação humana — estudo "Agent-as-judge vs humanos"

Estrutura pronta para montar no **Google Forms**. Os avaliadores (colegas de turma)
pontuam os mesmos posts gerados pelos agentes, usando o **mesmo rubric** do Judge. As
respostas exportam em CSV (Forms → Sheets → baixar `.csv`) e entram no script de análise
(`study/analysis/quality_study.py`).

## Como preparar o material dos posts

A seleção, o embaralhamento e os rótulos A–F são **gerados pelo sistema**
(`selectStudySample`) — não monte nada à mão. Com o `pnpm dev` rodando, ou pelos botões
da página `/estudo`:

1. **Confira a amostra:** `GET /api/mas/export/agent-metrics` mostra os posts
   selecionados e, em `excluded`, o que ficou de fora e por quê. Cada tópico precisa das
   duas condições (com/sem judge) — ver `COLETA.md`.
2. **Baixe os textos:** `GET /api/mas/export/agent-metrics?format=posts`. Já vêm
   embaralhados (seed fixa) e rotulados `Post A … Post F`, **sem** indicar a condição.
3. **Baixe a chave:** `GET /api/mas/export/agent-metrics?format=mapping` →
   `study/data/mapping.csv`, ligando cada post ao `threadId`, condição e tópico.
   Guarde separado do form; é o que permite conferir o cruzamento depois.
4. **Baixe as métricas:** `GET /api/mas/export/agent-metrics?format=csv` →
   `study/data/agent-metrics.csv`.

> Os quatro formatos saem da mesma seleção, então post, texto, condição e métricas
> **concordam por construção**. O que não pode acontecer é editar as letras à mão: o
> script de análise cruza pela coluna `post`, e o `mapping.csv` existe justamente para
> detectar essa divergência (ele avisa).

> **Atenção:** rodar novas execuções pode **remapear as letras** (a amostra muda).
> Baixe os quatro artefatos de uma vez, logo antes de publicar o form, e não gere posts
> novos enquanto a coleta estiver aberta.

## Cabeçalho do formulário

- **Título:** Avaliação de qualidade de posts de LinkedIn
- **Descrição:** "Você vai ler 6 posts e avaliar cada um em 5 critérios (escala 0–10) e 2
  perguntas Sim/Não. Leve ~10 min. Não há resposta certa — queremos sua percepção."
- **Pergunta 1 (texto curto, obrigatória):** "Identificador do avaliador (nome ou matrícula)"

## Bloco repetido para cada post (Post A … Post F)

Crie uma **seção** por post. No topo da seção, cole o texto do post num item de descrição
(ou imagem). Depois, as 7 perguntas abaixo.

> As descrições de cada critério vêm do rubric do Judge (ver `POST-QUALITY.md`), para que
> humano e agente avaliem **a mesma coisa**.

**Critérios em escala linear 0–10** (Google Forms → "Escala linear", 0 a 10):

1. **Qualidade geral (overall)** — Nota holística do post: valor do conteúdo, escrita e
   capacidade de prender a atenção.
2. **Gancho (hook)** — As 1–2 primeiras linhas (antes do "ver mais"). Te fez parar o scroll?
3. **Originalidade** — Traz perspectiva autêntica/profunda ou parece texto genérico de IA /
   clichê de "coach corporativo"?
4. **Escaneabilidade** — Dá pra "escanear" com os olhos (espaçamento, quebras, listas) antes
   de decidir ler?
5. **Qualidade do CTA** — A chamada para ação na última linha é específica e convida a um
   comentário real (vs. "o que você acha?" genérico)?

**Perguntas Sim/Não** (Google Forms → "Múltipla escolha", opções Sim / Não):

6. **Tem engagement bait?** — Usa táticas artificiais de "mendigagem de engajamento"
   ("curta se concorda", "marque 3 amigos", enquete óbvia demais)? (Sim = ruim)
7. **Tem link externo no corpo?** — Há link (YouTube, Medium, etc.) **dentro** do texto do
   post? (Sim = penalizado pelo algoritmo)

## Mapeamento de colunas (Forms CSV → análise)

Ao exportar, cada avaliador é uma linha e cada pergunta é uma coluna. Renomeie as
colunas para o padrão abaixo (é o que o script espera):

```
rater_id
A_overall, A_hook, A_originality, A_scannability, A_cta, A_bait, A_link
B_overall, B_hook, ... (idem até F)
```

(`*_bait` e `*_link` em "Sim"/"Não" — o script converte para 1/0 e calcula Cohen's
kappa contra as flags do Judge.)

Salve como `study/data/form-responses.csv`. Com ele + o `agent-metrics.csv`, o script
calcula a concordância juiz×humano (RQ1) e o efeito com/sem judge (RQ2) — a junção é
pela coluna `post`, sem depender de ordem de linha.

> **Peça para cada avaliador responder os 6 posts.** É isso que permite o pareamento
> por avaliador no RQ2, que tem muito mais potência estatística que o pareamento por
> tópico (3 pares). Respostas parciais são descartadas nessa análise.
