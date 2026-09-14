# Análise do estudo do gate

Implementa os passos 6–10 de `../../Evaluation-Process.md` sobre a rubrica v2:
**o Critic é um controle de qualidade confiável quando o julgamento humano é a
referência externa?**

```bash
cd study/analysis
python -m venv .venv && source .venv/Scripts/activate   # Windows Git Bash
pip install -r requirements.txt

python gate_study.py --demo        # sintético — exercita tudo sem dado real
python gate_study.py               # dados reais em ../data/
```

`gate_study.py` **substitui** `quality_study.py`, que analisa o desenho v1
(critérios 0–10, braço com-judge × sem-judge). Aquele desenho não existe mais —
ver `../ACHADOS.md` §6. O script antigo continua no repositório porque a coleta
de 2026-06 foi feita sob ele.

## Entradas — em `../data/`

| arquivo | de onde vem | obrigatório |
|---|---|---|
| `corpus.csv` | `GET /api/mas/export/corpus?format=csv` | sim |
| `form-responses.csv` | export do Google Forms | sim |
| `mapping-corpus.csv` | `GET ...?format=mapping` | não — só confere |
| `judge-repeat.csv` | `GET /api/mas/export/judge-repeat?n=5&format=csv` | não |

Do `form-responses.csv`, **não renomeie nada**. O parser lê o código `[A1]` do
título da pergunta (post + dimensão) e aceita tanto a string inteira da opção
(`"4 — Bom: Claro e bem organizado…"`) quanto o número puro da escala linear.
Renomear colunas para um padrão "mais limpo" é o que quebra a leitura.

O `mapping-corpus.csv` é redundante de propósito: sai do mesmo endpoint que o
`corpus.csv`, então divergir entre os dois só é possível se alguém editou um
deles à mão — e é exatamente isso que ele acusa.

## Saídas — em `out/` (gitignorado)

| arquivo | conteúdo |
|---|---|
| `summary.txt` | tudo em texto, na ordem do desenho. É o que se lê primeiro. |
| `humanos_concordancia.csv` | §6 — α de Krippendorff ordinal, ICC(2,1)/(2,k), % de pares iguais |
| `avaliadores.csv` | média de cada avaliador e o desvio dele em relação ao grupo |
| `referencia_humana.csv` | §7 — mediana humana × nota do juiz, post a post, com a célula da matriz |
| `alinhamento.csv` | §8 — Spearman, ICC, viés, MAE, % exato e ±1, Wilcoxon |
| `gate_matriz.csv` | §9 — matriz de confusão, falso-aceite, sensibilidade, κ (nos dois limiares) |
| `discordancias.csv` | §10 — falso-aceites e diferenças ≥ 2, com tópico e trecho |
| `judge_retest.csv` | teto: quanto o juiz varia repontuando o mesmo texto |
| `human_ratings_long.csv` | 1 linha por (avaliador × post), com `versionId` resolvido |
| `avaliadores_identidade.csv` | pseudônimo → e-mail. **Não sai de `out/`.** |
| `fig_*.png` | juiz × humano, viés por dimensão, distribuição, matriz de confusão |

`human_ratings_long.csv` é a ponte para o banco: `pnpm study:import-humans` lê
esse arquivo, não o CSV do Forms. Um único parser do formulário, aqui — dois
parsers do mesmo arquivo divergem no primeiro ajuste, e a divergência aparece
como dado errado, não como erro.

## Como ler cada número

**§6 — α de Krippendorff, ordinal.** É o piso. Convenção: α ≥ 0,80 permite
conclusão, 0,67–0,80 é tentativo, abaixo disso a mediana daquela dimensão é
ruidosa — e um desalinhamento juiz–humano ali é ambíguo entre "o juiz erra" e
"a dimensão não é julgável de forma estável por pessoas".

**Com uma exceção que este corpus provavelmente vai provocar.** α e ICC são
razões de variância: o denominador é a diferença ENTRE posts. Num corpus em que
todo post merece quase a mesma nota, α desaba mesmo com avaliadores em acordo
quase perfeito. O ensaio com avaliadores fictícios (abaixo) produziu α = 0,17
com 50–65% de acordo exato e 96–100% dentro de ±1 — números que contam
histórias opostas, e o α é o que engana.

Por isso a tabela traz `variancia_entre_posts` e `pct_pares_iguais` ao lado do α,
e o relatório levanta um **ATENÇÃO** explícito quando α baixo aparece junto de
acordo bruto alto. No artigo, os três vão juntos: um α de 0,1 apresentado sozinho
será lido como instrumento quebrado, quando o que ele está dizendo é que o
pipeline não produz posts distinguíveis — que é o achado, não o defeito.

Ordinal, e não nominal: discordar 4×5 não é o mesmo erro que discordar 1×5.
Ordinal, e não intervalar: ninguém garante que a distância 1→2 é igual à 4→5.
O cálculo está implementado no próprio script — a biblioteca do PyPI usa métrica
de intervalo por padrão, e trocar a métrica em silêncio muda o número que vai
para o artigo.

**§8 — três leituras, nenhuma dispensável.**

| coluna | responde |
|---|---|
| `spearman_rho` | o juiz **ordena** os posts como os humanos? |
| `vies_medio` | e erra sempre para o mesmo lado? `> 0` = juiz mais generoso |
| `pct_exato`, `pct_ate_1` | quanto ele **acerta a nota**, sem depender de variância |
| `icc_a1_juiz_humano` | concordância absoluta — pune deslocamento constante |

Um juiz que dá sempre um ponto a mais que os humanos tem Spearman perfeito e
concordância ruim. `vies_medio` isola exatamente isso, e é a coluna que responde
à pergunta que motivou o estudo.

**§9 — a taxa de falso-aceite tem o denominador que importa.** Ela é
`falso_aceite / (o que o juiz APROVOU)`, e não sobre o total: a pergunta
operacional é "dos posts que o gate deixou passar, quantos o humano reprovaria?".

**κ vem com motivo.** Numa matriz com margem constante o script devolve o
motivo em vez de um número mudo — o corpus todo-ACCEPT produz esse caso, e um
`nan` sem explicação no relatório já foi lido como bug de script uma vez.

**Teste-reteste é teto, não enfeite.** O juiz não pode concordar com o humano
mais do que concorda consigo mesmo. Com ~1 ponto de ruído a T=0,1
(`../ACHADOS.md` §2.1), uma concordância "baixa" pode estar no limite do
mensurável.

## O modo demo

```bash
python gate_study.py --demo            # imita o corpus real: todo-ACCEPT, juiz travado
python gate_study.py --demo-balanced   # corpus com REJECT — exercita κ e Spearman
```

Escreve o sintético em `../data/demo/` e as saídas em `out/demo/`. **Nunca toca
em `../data/`**: rodar a demo não sobrescreve coleta real.

O default é o caso *degenerado* de propósito — juiz preso perto de `4,3,4,3`,
humano mais duro em relevância e engajamento. É o cenário que o corpus de hoje
produz, e é o que precisa passar sem quebrar. O `--demo-balanced` existe para
exercitar os caminhos que o corpus real não alcança.

Rodar a demo depois de mexer no script não é opcional: é o único teste que
existe, e o custo de descobrir um erro no dia em que as respostas chegarem é o
formulário inteiro.

## O ensaio: avaliadores fictícios sobre o corpus REAL

```bash
pnpm study:corpus-csv                          # extrai o corpus real do banco
python simular_humanos.py                      # cenário permissivo (a hipótese)
python simular_humanos.py --cenario alinhado   # e se o juiz estiver certo
python simular_humanos.py --cenario ruidoso    # e se os humanos não convergirem
python gate_study.py --data-dir ../data/simulado --out-dir out/simulado
```

Diferente da demo: aqui o **corpus é o de verdade**, com as notas de verdade do
juiz. Só os avaliadores são inventados. Serve para ler o relatório com números
plausíveis e decidir o que reportar antes de gastar o tempo de três pessoas.

O simulador **não** é "nota do juiz + ruído" — isso responderia à pergunta do
estudo por construção. O humano fictício lê o TEXTO: cada dimensão sai de traços
observáveis do post (tamanho, parágrafo denso, emoji, hashtag, CTA genérico ou
ancorado, conectivo clichê, número, voz genérica), **centrados na média do
corpus**. Traço que dispara igual em todos os posts não distingue nada e é
descontado; o nível absoluto fica no parâmetro `nivel` do cenário, escrito, para
a suposição não se esconder dentro dos pesos.

Os pesos são um chute informado, não uma medida — estão no topo do arquivo para
poderem ser discordados. **Nada que sai daí entra no artigo**: as saídas vão para
`../data/simulado*/` (gitignorado, com `LEIA-ME.txt` e coluna `AVISO` no CSV).
