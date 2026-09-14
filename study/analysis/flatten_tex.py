"""Gera uma versão do artigo em UM arquivo .tex, para colar no Overleaf.

    python study/analysis/flatten_tex.py

Lê study/artigo-icaart-2027/main.tex e substitui cada \\input{tables/...} pelo
conteúdo do arquivo. Saída: study/artigo-icaart-2027/overleaf/main.tex, junto
com uma cópia de refs.bib. No Overleaf basta substituir o main.tex do template
SCITEPRESS por este e subir o refs.bib — sem pasta tables/.

Rodar DEPOIS de form_agreement.py: o que é embutido é o que estiver gerado.
"""

import re
import shutil
from pathlib import Path

ART = Path(__file__).resolve().parents[2] / "study" / "artigo-icaart-2027"
OUT = ART / "overleaf"

INPUT = re.compile(r"^(?P<indent>[ \t]*)\\input\{(?P<path>tables/[A-Za-z0-9_-]+)\}[ \t]*$", re.M)


def inline(match: re.Match) -> str:
    path = ART / (match.group("path") + ".tex")
    body = path.read_text(encoding="utf-8").rstrip("\n")
    return f"% --- início de {match.group('path')}.tex (gerado) ---\n{body}\n% --- fim de {match.group('path')}.tex ---"


def main():
    src = (ART / "main.tex").read_text(encoding="utf-8")
    flat, n = INPUT.subn(inline, src)
    if "\\input{" in flat:
        raise SystemExit("sobrou \\input sem embutir — conferir main.tex")
    OUT.mkdir(exist_ok=True)
    (OUT / "main.tex").write_text(flat, encoding="utf-8")
    shutil.copyfile(ART / "refs.bib", OUT / "refs.bib")
    print(f"{n} arquivos embutidos → {OUT / 'main.tex'} (+ refs.bib)")


if __name__ == "__main__":
    main()
