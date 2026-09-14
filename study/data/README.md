# study/data

Os arquivos brutos da coleta. Nada aqui é gerado por cálculo — são exports do
app e o retorno do formulário. As saídas da análise ficam em `../analysis/out/`,
que é gitignorado.

| arquivo | de onde vem | versionado |
|---|---|---|
| `corpus.csv` | `GET /api/mas/export/corpus?format=csv` | sim |
| `mapping-corpus.csv` | `GET /api/mas/export/corpus?format=mapping` | sim |
| `form-responses.csv` | Google Forms → Sheets → download `.csv` | sim |
| `judge-repeat.csv` | `GET /api/mas/export/judge-repeat?n=5&format=csv` | sim |
| `arms-*.json` | `pnpm arms` — experimento dos braços do writer | sim |
| `demo/` | `python ../analysis/gate_study.py --demo` | **não** (regenerável) |
| `simulado*/` | `python ../analysis/simular_humanos.py` | **não** (fictício) |

As duas últimas pastas **não são dado**. `demo/` é corpus e respostas inventados
do zero; `simulado*/` é o corpus REAL com avaliadores FICTÍCIOS por cima, para
ensaiar o relatório antes de o formulário ir a campo. Cada uma traz um
`LEIA-ME.txt` dizendo isso, e o `form-responses.csv` simulado carrega uma coluna
`AVISO`. Nenhum número que sai delas entra no artigo.

**Baixar os quatro primeiros no mesmo momento.** `corpus.csv` e
`mapping-corpus.csv` saem do mesmo endpoint e precisam descrever o mesmo estado
do corpus — o script compara os dois e acusa divergência, mas o estrago já
estaria feito: uma execução nova entre os dois downloads move letras, e as
respostas passam a apontar para o post errado sem nenhum erro aparecer.

**O `form-responses.csv` vai como veio.** Não renomeie coluna nenhuma: o parser
lê o código `[A1]` do título da pergunta. E não apague a coluna de e-mail antes
de rodar a análise — é ela que identifica o avaliador para o α; a
pseudonimização acontece no script, e o mapa fica só em `../analysis/out/`.

Ver `../COLETA.md` §7 para a ordem das operações no dia em que as respostas
chegarem.
