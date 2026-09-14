"""
Gera avaliadores humanos FICTÍCIOS sobre o corpus REAL, para ver como o relatório
fica antes de o formulário ir a campo.

    python simular_humanos.py                      # cenário permissivo (default)
    python simular_humanos.py --cenario alinhado
    python simular_humanos.py --cenario ruidoso
    python simular_humanos.py --raters 5 --seed 42

Lê `../data/corpus.csv` (o corpus de verdade, com as notas de verdade do juiz) e
escreve em `../data/simulado/` um `form-responses.csv` no formato exato do Google
Forms. Depois:

    python gate_study.py --data-dir ../data/simulado --out-dir out/simulado

NADA DISTO É DADO. É um ensaio do dia D: serve para ler o relatório com números
plausíveis, achar coluna faltando e decidir o que reportar ANTES de gastar o
tempo de três pessoas. Nenhuma conclusão do artigo pode sair daqui — e por isso o
CSV sai com uma coluna `AVISO` e o diretório se chama `simulado`.

Por que o simulador NÃO é "nota do juiz + ruído"
------------------------------------------------
Porque isso responderia à pergunta do estudo por construção: o humano seria uma
cópia embaçada do juiz e a concordância mediria só o desvio-padrão que eu
escolhi. Aqui o humano lê o TEXTO. Cada dimensão sai de traços observáveis do
post — tamanho, emoji, hashtag, CTA genérico, conectivo clichê, presença de
número —, e o juiz não entra na conta em nenhum momento.

É essa a hipótese que o estudo persegue: o juiz não tem resolução dentro da faixa
que o pipeline produz (14 dos 16 posts do corpus real recebem o MESMO 4,3,4,3),
enquanto uma pessoa que lê os textos os separa. Se a hipótese estiver certa, o
relatório real vai se parecer com este. Se estiver errada, não vai — e é
exatamente por isso que a simulação não prova nada.

Os pesos abaixo são um chute informado, não uma medida. Estão explícitos para
poderem ser discordados.
"""
from __future__ import annotations

import argparse
import os
import re
import shutil
import sys

import numpy as np
import pandas as pd

from gate_study import DIM_BY_DIGIT, DIM_KEYS, SCALE

AQUI = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.normpath(os.path.join(AQUI, "..", "data"))

ESCALA = {1: "Muito ruim", 2: "Ruim", 3: "Aceitável", 4: "Bom", 5: "Excelente"}

# Traços que um leitor humano nota, e o quanto cada um pesa em cada dimensão.
# Positivo = melhora a nota. O intercepto é 3 ("aceitável"), que é onde a rubrica
# manda o avaliador começar.
PESOS: dict[str, dict[str, float]] = {
    #                     clarity relevance professional engagement
    "muito_longo":      {"clarity": -0.9, "engagement": -0.7},
    "curto_demais":     {"relevance": -0.6},
    "paragrafos_densos":{"clarity": -0.8},
    "emoji_demais":     {"professional": -0.9, "engagement": -0.2},
    "hashtag_demais":   {"professional": -0.7},
    "cta_generico":     {"engagement": -1.1},
    "cta_ancorado":     {"engagement": +0.9},
    "cta_pergunta_final": {"engagement": +0.4},
    "conectivo_cliche": {"professional": -0.5, "engagement": -0.4, "clarity": +0.2},
    "tem_numero":       {"relevance": +0.9},
    "tem_exemplo":      {"relevance": +0.7},
    "abre_com_pergunta":{"engagement": +0.6},
    "voz_generica":     {"professional": -0.6, "relevance": -0.5},
}

# Nível absoluto de cada dimensão, por cenário. Os traços dizem qual post é
# MELHOR; o nível diz onde a régua inteira fica. Separar os dois é o que evita
# esconder uma suposição forte dentro dos pesos: "o humano acha estes posts
# medianos em relevância e engajamento" é uma hipótese, e fica escrita.
BASE = 3.0

CTA_GENERICO = re.compile(
    r"(o que voc[êe]s? ach|compartilh\w+ (sua|suas|nos|conosco)|comente? abaixo|"
    r"deixe seu coment|e voc[êe]\?|qual (a )?sua opini)", re.I
)
CTA_ANCORADO = re.compile(
    r"(qual foi o crit[ée]rio|como (voc[êe]s?|seu time) (lida|resolveu|decidiu)|"
    r"em que ponto|conte (um|o) caso|j[áa] passou por|o que voc[êe] j[áa] fez)", re.I
)
CONECTIVO = re.compile(r"(al[ée]m disso|por fim|em resumo|no mundo (de|da|dos)|vale lembrar)", re.I)
NUMERO = re.compile(r"\b\d+([.,]\d+)?\s*(%|mil|milh|x|vezes|dias|meses|anos|R\$)", re.I)
EXEMPLO = re.compile(r"(por exemplo|como no caso|imagine|na pr[áa]tica|um time que)", re.I)
GENERICA = re.compile(r"(no mundo atual|nos dias de hoje|cada vez mais|[ée] fundamental|[ée] essencial)", re.I)
EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿]")


def tracos(texto: str) -> dict[str, float]:
    """Traços observáveis do post. Cada um em 0–1, para os pesos serem comparáveis."""
    n = len(texto)
    paragrafos = [p for p in texto.split("\n") if p.strip()]
    maior = max((len(p) for p in paragrafos), default=0)
    return {
        "muito_longo": min(max(n - 1200, 0) / 800, 1.0),
        "curto_demais": min(max(700 - n, 0) / 400, 1.0),
        "paragrafos_densos": min(max(maior - 320, 0) / 300, 1.0),
        "emoji_demais": min(len(EMOJI.findall(texto)) / 4, 1.0),
        "hashtag_demais": min(max(texto.count("#") - 2, 0) / 4, 1.0),
        "cta_generico": 1.0 if CTA_GENERICO.search(texto) else 0.0,
        "cta_ancorado": 1.0 if CTA_ANCORADO.search(texto) else 0.0,
        # Fechar com pergunta ao leitor é convite, mesmo quando não é nem o
        # clichê nem a pergunta específica. Todos os 16 posts do corpus real
        # fazem isso — sem este traço o modelo não veria convite nenhum.
        "cta_pergunta_final": 1.0 if "?" in texto[-260:] else 0.0,
        "conectivo_cliche": min(len(CONECTIVO.findall(texto)) / 2, 1.0),
        "tem_numero": min(len(NUMERO.findall(texto)) / 2, 1.0),
        "tem_exemplo": 1.0 if EXEMPLO.search(texto) else 0.0,
        "abre_com_pergunta": 1.0 if "?" in texto[:180] else 0.0,
        "voz_generica": min(len(GENERICA.findall(texto)) / 2, 1.0),
    }


def qualidade_latente(
    texto: str, medias: dict[str, float], nivel: dict[str, float]
) -> dict[str, float]:
    """
    Nota "verdadeira" de cada dimensão, antes do avaliador e do ruído.

    Os traços entram CENTRADOS na média do corpus. Um traço que dispara igual em
    todos os 16 posts — no corpus real, hashtag em excesso e pergunta no
    fechamento — não distingue post nenhum: entrando cru, ele só empurraria a
    escala inteira para baixo e a simulação viraria um enunciado sobre os meus
    pesos. Centrado, ele some do contraste e o nível absoluto fica onde o
    cenário disser, que é onde a suposição deve estar: visível.
    """
    t = tracos(texto)
    q = {k: BASE + nivel.get(k, 0.0) for k in DIM_KEYS}
    for traco, pesos in PESOS.items():
        desvio = t[traco] - medias[traco]
        for dim, w in pesos.items():
            q[dim] += w * desvio
    return q


# Cenários. O default é a HIPÓTESE do estudo; os outros dois existem para saber
# como o mesmo relatório se parece quando ela é falsa, e assim não confundir
# "achado" com "formato de saída".
# `nivel` desloca cada dimensão em relação ao 3 ("aceitável"). É a suposição
# sobre onde o leitor humano coloca a régua, e no cenário `permissivo` ela diz o
# que o estudo desconfia: o post é bem escrito (clareza e adequação acima do
# aceitável) e vazio (relevância e engajamento abaixo).
CENARIOS = {
    "permissivo": dict(
        desc="humanos leem o texto e são mais duros que o juiz — a hipótese do estudo",
        peso_texto=1.0, ancora_juiz=0.0, ruido=0.50, dispersao_rater=0.30,
        nivel={"clarity": +0.5, "relevance": -0.4, "professional": +0.2, "engagement": -0.5},
    ),
    "alinhado": dict(
        desc="humanos concordam com o juiz — o cenário em que o gate se sustenta",
        peso_texto=0.25, ancora_juiz=0.75, ruido=0.40, dispersao_rater=0.20,
        nivel={},
    ),
    "ruidoso": dict(
        desc="humanos discordam ENTRE SI — α baixo, e nada é concluível",
        peso_texto=0.5, ancora_juiz=0.0, ruido=1.30, dispersao_rater=0.90,
        nivel={"clarity": +0.3, "relevance": -0.2, "professional": +0.2, "engagement": -0.2},
    ),
}


def simular(corpus: pd.DataFrame, cenario: dict, n_raters: int, seed: int) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    # Severidade de cada avaliador, centrada em zero: alguém sempre é mais duro
    # que a média, e é isso que o `avaliadores.csv` da análise deve pegar.
    severidade = rng.normal(0, cenario["dispersao_rater"], n_raters)
    severidade -= severidade.mean()

    # Média de cada traço NO CORPUS: é o zero contra o qual cada post é medido.
    medias = {}
    tracos_por_post = {p: tracos(str(c)) for p, c in zip(corpus["post"], corpus["conteudo"])}
    for traco in PESOS:
        medias[traco] = float(np.mean([t[traco] for t in tracos_por_post.values()]))

    colunas = {}
    for post in corpus["post"]:
        for digito, dim in DIM_BY_DIGIT.items():
            colunas[(post, digito)] = "[%s%d] %s" % (post, digito, dim)

    linhas = []
    for r in range(n_raters):
        linha = {
            "Carimbo de data/hora": "2026-09-07 1%d:%02d:00" % (r // 6, (r * 7) % 60),
            "Endereço de e-mail": "ficticio%02d@simulado.invalid" % (r + 1),
            "AVISO": "DADOS FICTÍCIOS — gerados por study/analysis/simular_humanos.py",
        }
        for _, post in corpus.iterrows():
            latente = qualidade_latente(str(post["conteudo"]), medias, cenario["nivel"])
            notas = {}
            for dim in DIM_KEYS:
                alvo = (
                    cenario["peso_texto"] * latente[dim]
                    + cenario["ancora_juiz"] * float(post[dim])
                    + (1 - cenario["peso_texto"] - cenario["ancora_juiz"]) * BASE
                )
                v = alvo + severidade[r] + rng.normal(0, cenario["ruido"])
                notas[dim] = int(np.clip(round(v), *SCALE))
            # A holística é perguntada por último e não é composto: aqui ela sai
            # da média das dimensões com ruído PRÓPRIO, senão a análise
            # `overall ~ dimensões` seria verdadeira por construção.
            geral = np.mean(list(notas.values())) + rng.normal(0, cenario["ruido"] * 0.7)
            notas["overall"] = int(np.clip(round(geral), *SCALE))

            for digito, dim in DIM_BY_DIGIT.items():
                v = notas[dim]
                # Formato do Forms: múltipla escolha devolve a opção inteira,
                # escala linear devolve o número puro.
                linha[colunas[(post["post"], digito)]] = (
                    str(v) if digito == 5 else "%d — %s: âncora da opção" % (v, ESCALA[v])
                )
        linhas.append(linha)
    return pd.DataFrame(linhas)


def main() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass

    ap = argparse.ArgumentParser(description="Avaliadores fictícios sobre o corpus real.")
    ap.add_argument("--cenario", choices=sorted(CENARIOS), default="permissivo")
    ap.add_argument("--raters", type=int, default=3)
    ap.add_argument("--seed", type=int, default=20260907)
    ap.add_argument("--data-dir", default=DATA, help="onde está o corpus.csv real")
    ap.add_argument("--out-dir", default=None, help="destino (padrão: <data-dir>/simulado)")
    args = ap.parse_args()

    origem = os.path.join(args.data_dir, "corpus.csv")
    if not os.path.exists(origem):
        sys.exit(
            "não achei %s\nExtraia o corpus real primeiro:  pnpm study:corpus-csv" % origem
        )
    destino = args.out_dir or os.path.join(args.data_dir, "simulado")
    if os.path.abspath(destino) == os.path.abspath(args.data_dir):
        sys.exit("recusando escrever em cima de %s — o destino não pode ser a coleta real."
                 % args.data_dir)
    os.makedirs(destino, exist_ok=True)

    todos = pd.read_csv(origem, encoding="utf-8-sig")
    corpus = todos[todos["inCorpus"].astype(str).str.lower().isin(["true", "1"])].copy()
    for c in DIM_KEYS + ["overall"]:
        corpus[c] = pd.to_numeric(corpus[c], errors="coerce")
    corpus = corpus.dropna(subset=DIM_KEYS)
    if corpus.empty:
        sys.exit("corpus sem notas do juiz — nada para simular em cima.")

    cen = CENARIOS[args.cenario]
    respostas = simular(corpus, cen, args.raters, args.seed)

    # O corpus vai JUNTO para a pasta simulada: a análise precisa dos dois lado a
    # lado, e copiar evita que uma reexportação do real mude o chão embaixo de um
    # relatório simulado já gerado.
    shutil.copy(origem, os.path.join(destino, "corpus.csv"))
    mapping = os.path.join(args.data_dir, "mapping-corpus.csv")
    if os.path.exists(mapping):
        shutil.copy(mapping, os.path.join(destino, "mapping-corpus.csv"))
    respostas.to_csv(
        os.path.join(destino, "form-responses.csv"), index=False, encoding="utf-8"
    )
    with open(os.path.join(destino, "LEIA-ME.txt"), "w", encoding="utf-8") as f:
        f.write(
            "DADOS FICTÍCIOS.\n\n"
            "form-responses.csv NÃO veio de pessoa nenhuma: foi gerado por\n"
            "study/analysis/simular_humanos.py --cenario %s --raters %d --seed %d\n"
            "em %s.\n\n"
            "corpus.csv e mapping-corpus.csv são cópias dos reais.\n"
            "Nenhum número que sai daqui pode entrar no artigo.\n"
            % (args.cenario, args.raters, args.seed, pd.Timestamp.now().date())
        )

    print("cenário: %s\n  %s" % (args.cenario, cen["desc"]))
    print("  peso do texto %.2f · âncora no juiz %.2f · ruído %.2f · dispersão entre avaliadores %.2f"
          % (cen["peso_texto"], cen["ancora_juiz"], cen["ruido"], cen["dispersao_rater"]))
    if cen["nivel"]:
        print("  nível suposto (desvio do 3 = aceitável): "
              + " · ".join("%s %+.1f" % (k, v) for k, v in cen["nivel"].items()))
    print("\n%d posts × %d avaliadores fictícios → %s"
          % (len(corpus), args.raters, os.path.join(destino, "form-responses.csv")))

    # Traços por post: é o que explica por que a nota simulada caiu ou subiu, e
    # a única forma de discordar dos pesos olhando o texto.
    t = pd.DataFrame([tracos(str(c)) for c in corpus["conteudo"]], index=corpus["post"])
    ativos = t.loc[:, (t > 0).any()]
    print("\nTraços detectados no corpus real (0–1):")
    print(ativos.round(2).to_string())

    print("\nAgora:\n  python gate_study.py --data-dir %s --out-dir out/%s"
          % (os.path.relpath(destino, AQUI), os.path.basename(destino)))


if __name__ == "__main__":
    main()
