# Coleta do estudo — status e checklist

Estado da coleta do estudo "Agent-as-judge vs avaliação humana" e o que falta para
fechá-la. Ver também `FORM-AVALIACAO.md` (montagem do form) e `analysis/README.md`
(rodar a análise).

## Desenho vigente: pares antes/depois

A unidade de análise mudou (2026-08-26) e **este documento, da seção seguinte em
diante, descreve o desenho ANTERIOR** (com judge × sem judge), mantido pela coleta
já feita. A unidade atual é o par antes/depois **dentro da mesma execução**: o
primeiro draft contra a última versão que o loop do Judge produziu. Mesma pesquisa,
mesmos insights — só a revisão muda.

Fonte de verdade: `src/app/MAS/lib/revisionPairs.ts` (`selectRevisionPairs`).
Tela: painel no topo da `/estudo`, com as duas versões lado a lado e a crítica que
disparou a reescrita. Material:

| Export | O que é |
|---|---|
| `GET /api/mas/export/revision-pairs` | JSON `{ pairs, runs, stats }` (é o que a tela usa) |
| `?format=csv` \| `xlsx` | **1 linha por par** (wide) — teste pareado direto no delta |
| `?format=versions` | **1 linha por versão** (long) — é o que casa com as respostas humanas |
| `?format=runs` | 1 linha por execução — onde estão os aprovados de primeira |
| `?format=posts` | textos cegos p/ o Form |
| `?format=mapping` | `mapping-pairs.csv`: rótulo ↔ versão/par |
| `?threadId=X` | histórico de UMA execução (diagnóstico) |

Conferência local: `pnpm test:pairs` (contra o banco) e `pnpm test:sample-rule`
(a regra de amostragem com dados sintéticos — dedupe, teto, prioridade, estabilidade).

### Qual par vai ao form

Nem todo par válido é avaliado por humano. A regra está em `selectRevisionPairs` e a
coluna `sampleExclusion` do `?format=csv` registra o que caiu e por quê:

1. **Um par por execução — o LOOP INTEIRO: v1 × última versão do Judge** (`kind=loop`).
   A pergunta do estudo é "a revisão do agente melhorou o post?", e quem responde isso
   é o antes/depois do loop, não uma crítica isolada — ninguém entrega a v2, entrega a
   última. Num run com 3 reescritas o par é **v1→v4**. É também o contraste com mais
   chance de aparecer no delta humano: os Δ consecutivos medidos até aqui foram 0, +1,
   −1, +2, 0, 0, pequenos demais para esta amostra.

   **Revisão humana trunca o par.** O "depois" é a última versão antes da primeira
   `human_revision` — assim que o humano edita, o texto deixa de ser produto só da
   crítica do Judge. No `thread_1d8e23eb` (initial, 3× judge_retry, 2× human_revision)
   o par é v1→v4, não v1→v6.

   Os pares consecutivos (`kind=consecutive`, v1→v2, v2→v3…) continuam no dataset e
   nos exports marcados `par_intermediario`: são eles que mostram a nota do Judge
   empacando reescrita após reescrita, que é achado por si só. Como só o par `loop`
   entra no form, **n = execuções** e a não-independência do item 3 fica resolvida.
2. **Um par por tópico normalizado** (a execução mais antiga vence, `topico_repetido`).
   Duas execuções do mesmo tópico poriam quatro textos quase idênticos no mesmo form.
3. **Teto de 8 posts = 4 pares** (`FORM_MAX_POSTS`), priorizando execuções `exhausted`
   e, dentro disso, as mais antigas (`acima_do_teto`).

**Rótulos são estáveis por acréscimo.** Cada par da fila recebe um bloco fixo de duas
letras (par 0 → A,B; par 1 → C,D; …), então rodar uma execução nova só ACRESCENTA
letras — diferente do desenho anterior, onde qualquer post novo remapeava tudo e
obrigava a refazer o form. Qual das duas versões fica com a letra menor sai de um
sorteio determinístico por par, para "letra ímpar = antes" não entregar a direção da
revisão; e o `?format=posts` embaralha a **ordem de apresentação**, para as duas
metades de um par não caírem lado a lado.

> **Única exceção:** com o teto cheio, uma execução `exhausted` nova entra na frente e
> desloca outra — letras já distribuídas mudam de dono. Se o form já foi a campo,
> reexporte o `mapping-pairs.csv` antes de cruzar as respostas.

**Três coisas que NÃO podem sair do relatório:**

1. **A taxa de aprovação de primeira** (`stats.firstPassRate`, coluna `outcome` do
   `?format=runs`). Analisar só quem revisou é seleção em variável pós-tratamento:
   responde "quando o Judge intervém, ajuda?", não "o loop melhora a qualidade".
   Os aprovados de primeira são os casos de efeito zero.
2. **O Δ do próprio Judge não é evidência.** Judge e Writer são o mesmo modelo e a
   v2 foi escrita para agradar este juiz — ele pontua acima quase por construção.
   Quem mede alguma coisa é o Δ humano.
3. **Pares da mesma execução não são independentes.** No form isto já está resolvido
   pela regra "um par por execução" (n = execuções). Mas o `?format=csv` traz TODOS
   os pares, inclusive os `par_intermediario` — se a análise usar o CSV cheio, agregue por
   `threadId` ou use modelo misto; tratar cada linha como observação independente é
   pseudo-replicação.

Execuções que estouraram `MAX_JUDGE_RETRIES` (`exhausted`) são as mais limpas: o
Judge nunca aprovou, então a versão final não passou pela seleção "revisado até o
juiz aceitar".

**Herança da migração:** execuções anteriores ao versionamento aparecem como
`historico_incompleto` — o contador registra reescritas do Judge, mas só o draft
**final** sobreviveu ao `threads.json` e entrou como v1. Elas não geram par e ficam
fora da taxa de aprovação de primeira, de propósito.

## Como a amostra é escolhida

Não é manual. `src/app/MAS/lib/studySample.ts` (`selectStudySample`) é a única fonte
de verdade — os quatro exports e a página `/estudo` consomem dela, então **rótulo,
texto e métricas concordam por construção**. A regra:

1. **Elegível:** tem `judgement`, tem draft não-vazio, status não é `stopped`/`error`.
2. **Uma execução por célula** (tópico normalizado × condição) — a mais recente vence.
   O tópico é normalizado (sem acento, sem caixa, sem pontuação), então
   `"Como conseguir X?"` e `"como conseguir x"` são o mesmo tópico.
3. **Só tópicos com as duas condições.** O RQ2 é pareado; célula solta não entra.
4. **Ordem embaralhada com seed fixa** — reprodutível entre chamadas e *não* é
   com/sem alternado (que entregaria a condição para quem olhasse a sequência).

O que ficou de fora e por quê aparece em `GET /api/mas/export/agent-metrics` (campo
`excluded`) e, resumido, num aviso na página `/estudo`.

## Publicar NÃO é requisito

Uma execução entra na tabela e no estudo assim que o Judge a pontua — normalmente em
`awaiting_review`, antes de qualquer decisão humana. O nó `publisher` só é alcançado na
decisão `approve`, e nada no caminho do estudo depende dele: o dataset precisa de
`draft` + `judgement`, que existem bem antes. Com 0 posts publicados a amostra funciona
igual.

O que segura uma execução **fora do dataset** é outra coisa: falta do par da outra
condição. Essas aparecem na tabela marcadas como `fora`, com a nota visível — só não
recebem letra nem entram nos exports.

## ⚠️ Status desatualizado — a amostra abaixo não existe mais

Em **2026-08-24** o `data/threads.json` tinha 7 execuções (6 em `error` sem draft, 1
nova avaliada). As 10 execuções avaliadas descritas abaixo — incluindo os 6 posts
A–F — **foram removidas do threadStore**. Os exports devolvem amostra vazia.

O **texto** dos 6 drafts sobreviveu: está integral em `FORM-EXEMPLO.md`. Se quiser
seguir com aqueles posts, o material do form está lá. Para os exports voltarem a
funcionar é preciso regerar as execuções (3 tópicos × 2 condições).

## Status anterior (histórico — verificado em 2026-08-23)

**Lado do agente: fechado.** 3 tópicos × 2 condições = 6 posts.

| Post | Condição | Tópico | score do Judge |
|---|---|---|---|
| A | sem_judge | Hoje vou falar sobre inteligência artificial | 5 |
| B | sem_judge | Ainda vale apena aprender UI Design em 2026? | 6 |
| C | com_judge | Ainda vale apena aprender UI Design em 2026? | 7 |
| D | com_judge | Hoje vou falar sobre inteligência artificial | 7 |
| E | sem_judge | Como conseguir 1000 seguidores rapido? | 5 |
| F | com_judge | Como conseguir 1000 seguidores rapido? | 7 |

Excluídos: 1 execução parada em `stopped`, 6 sem `judgement`, 2 re-execuções
substituídas pela mais recente da mesma célula e 2 sem par
(`O impacto de IA nas empresas de software?` só tem com-judge;
`Como ganhar 1000 seguidores rapido?` só tem sem-judge).

> Quer 4 tópicos em vez de 3? Rode `O impacto de IA nas empresas de software?` na
> condição **sem judge** — o par se fecha sozinho e o post entra na amostra.
> Cuidado: isso **remapeia as letras**, então refaça o form se ele já tiver ido a campo.

**Lado humano: não começou.** É o que falta — e **não está bloqueado**: os avaliadores
veem só o texto dos drafts, que não muda.

## ⚠️ As notas do agente precisam ser refeitas

Até 2026-08-23 o `judge.promptOverride` em `data/agent-config.json` continha uma cópia
do rubric com os template literals **não interpolados** (`${draft}`, `${draft.length}`…).
Como o override é *prependado* ao prompt do código, o Judge recebia 11.855 chars com
cada seção duplicada — 43% lixo, incluindo um `<input>` degenerado. **Todas as notas
gravadas antes dessa data saíram disso.**

Corrigido: override zerado (backup em `data/agent-config.json.bak`), prompt agora com
7.272 chars e cada seção 1×. Foram adicionados também:

- **ordem de emissão invertida** — `issues` → `suggestions` → flags → subnotas →
  `score` **por último**. Antes o `score` era o primeiro campo do JSON, o que fazia o
  modelo ancorar na nota e racionalizar o resto (é a causa mecânica do halo r=0,946
  entre `score` e a média das subnotas);
- **procedência gravada em cada avaliação** (`JudgeRunMeta`: modelo, temperatura,
  `rubricHash`, timestamp), exportada no CSV e conferida pelo script;
- **guarda em runtime** que avisa no log se alguém puser o rubric no override de novo.

**O que fazer:** rodar `GET /api/mas/export/judge-repeat?n=5&format=csv` e salvar como
`study/data/judge-repeat.csv`. O script passa a usar a **mediana das rodadas** como nota
oficial do agente, substituindo as notas contaminadas sem reescrever o histórico. Isso
também fecha o RQ1d (test-retest) de uma vez.

**Consequência para o RQ2:** os drafts do braço com-judge foram produzidos sob o juiz
degradado (foram reescritos até ele aprovar). O A/B continua válido como "o sistema como
estava construído", mas o efeito medido é provavelmente um **piso**. Declarar no artigo.

**Consequência para o achado do cap:** a violação (`hasEngagementBait=true` com score
5–6, ver `FORM-EXEMPLO.md`) está **confundida** pelo prompt duplicado — não é publicável
como achado até ser reproduzida com o prompt limpo. O `judge-repeat` responde isso.

## Checklist para fechar

- [x] 3 tópicos pareados com/sem judge no `threadStore`
- [ ] **1. Baixar o material** (com o `pnpm dev` rodando):
      - `GET /api/mas/export/agent-metrics?format=csv` → `study/data/agent-metrics.csv`
      - `GET /api/mas/export/agent-metrics?format=mapping` → `study/data/mapping.csv`
      - `GET /api/mas/export/agent-metrics?format=posts` → textos p/ colar no form
      (os três também têm botão na página `/estudo`)
- [ ] **2. Montar o Google Form** seguindo `FORM-AVALIACAO.md`. Os posts já vêm
      embaralhados e rotulados A–F; **não** revele a condição aos avaliadores.
- [ ] **3. Coletar** — mínimo ~10 avaliadores. Cada um avalia os 6 posts (é o que
      permite o pareamento por avaliador, muito mais potente que os 3 por tópico).
- [ ] **4. Exportar respostas** (Forms → Sheets → CSV) → `study/data/form-responses.csv`,
      com as colunas renomeadas para o padrão `<POST>_<criterio>`.
- [ ] **5. Test-retest do juiz — agora OBRIGATÓRIO, não opcional:**
      `GET /api/mas/export/judge-repeat?n=5&format=csv` → `study/data/judge-repeat.csv`.
      Re-pontua os 6 drafts 5× com o prompt limpo (**~30 chamadas de LLM**). É o que
      substitui as notas contaminadas e fecha o RQ1d.
- [ ] **6. Rodar** `python study/analysis/quality_study.py`

## Cuidados que valem para o artigo

- **A amostra é pequena por desenho** (3 tópicos). Reporte sempre tamanho de efeito
  (delta, IC95, `cohen_dz`, `rank_biserial`), não só p-valor. O Wilcoxon com n=3 não
  consegue descer de p=0.25 nem no cenário perfeito — isso é limite do teste, não
  ausência de efeito.
- **O pareamento por avaliador é a análise com potência.** Está no script como
  RQ2/`unidade: avaliador`. Reporte os dois e explique a diferença.
- **A nota do agente não responde ao RQ2.** Na condição com-judge o draft passou pelo
  gate `score ≥ 7` do próprio juiz — ele é juiz e parte. Só a nota humana mede o efeito.
- **Não compare a concordância do juiz no vácuo.** O script agora dá os dois
  referenciais: ICC entre humanos (piso — se os humanos discordam entre si, a média
  deles é ruidosa) e test-retest do juiz (teto — o juiz não pode concordar com alguém
  mais do que concorda consigo mesmo).
