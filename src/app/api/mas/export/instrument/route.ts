import { NextRequest, NextResponse } from "next/server";
import {
  ACCEPT_COMPOSITE_MIN,
  ACCEPT_MIN,
  ACCEPT_MIN_STRICT,
  DIMENSION_WEIGHTS,
  OVERALL_QUESTION,
  RUBRIC_DIMENSIONS,
  RUBRIC_VERSION,
  SCALE_LABELS,
} from "@/app/MAS/lib/rubric";
import { requireArea } from "@/lib/dal";

// O INSTRUMENTO, em formato de montar formulário.
//
//   GET /api/mas/export/instrument            → JSON (dimensões + âncoras)
//   GET /api/mas/export/instrument?format=md  → texto pronto para colar no Form
//
// Por que existe: o formulário humano é montado à mão no Google Forms, e o
// desenho do estudo exige que o avaliador responda EXATAMENTE as mesmas
// perguntas, com as mesmas âncoras, que o Judge recebe no prompt. Digitar de
// novo é reintroduzir a divergência que `lib/rubric.ts` foi criado para
// eliminar — aqui o texto sai da mesma fonte que alimenta o prompt.
//
// A REGRA DE ACEITAÇÃO viaja junto de propósito: ela se aplica à mediana das
// respostas humanas exatamente como se aplica à nota do juiz, e é isso que faz
// a matriz de confusão comparar a mesma coisa dos dois lados.

function toMarkdown(): string {
  const linhas: string[] = [];

  linhas.push(`# Instrumento de avaliação — rubrica ${RUBRIC_VERSION}`);
  linhas.push("");
  linhas.push(
    "Cada post é avaliado nas quatro dimensões abaixo, numa escala de 1 a 5, " +
      "e depois recebe uma nota geral. As âncoras definem o que cada ponto " +
      "significa em cada dimensão — elas são o instrumento, não uma dica.",
  );
  linhas.push("");
  linhas.push("## Instruções ao avaliador");
  linhas.push("");
  linhas.push(
    "- Avalie o post **como ele está**, pelo que está escrito. Não premie intenção nem potencial.",
  );
  linhas.push(
    "- Julgue cada dimensão de forma **independente**: um post pode ser claro e vazio ao mesmo tempo.",
  );
  linhas.push(
    "- **Não avalie veracidade factual.** Você não recebeu as fontes usadas na pesquisa — e o avaliador automático também não. Comparar julgamentos feitos sobre informações diferentes não mede nada.",
  );
  linhas.push(
    "- O ponto **3 é “aceitável”, não “bom”**. Use a escala inteira.",
  );
  linhas.push(
    "- Você verá o **tópico solicitado** junto de cada post: ele é necessário para julgar relevância, e o avaliador automático recebe o mesmo.",
  );
  linhas.push(
    "- Os posts aparecem identificados por letra (Post A, Post B…), em ordem embaralhada. Não há relação entre a ordem e a qualidade.",
  );
  linhas.push("");

  for (const [i, d] of RUBRIC_DIMENSIONS.entries()) {
    linhas.push(`## ${i + 1}. ${d.label}`);
    linhas.push("");
    linhas.push(`**${d.question}**`);
    linhas.push("");
    for (const n of [1, 2, 3, 4, 5] as const) {
      linhas.push(`- **${n} — ${SCALE_LABELS[n]}:** ${d.anchors[n]}`);
    }
    linhas.push("");
  }

  linhas.push(`## ${RUBRIC_DIMENSIONS.length + 1}. Qualidade geral`);
  linhas.push("");
  linhas.push(`**${OVERALL_QUESTION}**`);
  linhas.push("");
  linhas.push(
    `- 1 — ${SCALE_LABELS[1]} · 2 — ${SCALE_LABELS[2]} · 3 — ${SCALE_LABELS[3]} · 4 — ${SCALE_LABELS[4]} · 5 — ${SCALE_LABELS[5]}`,
  );
  linhas.push("");
  linhas.push(
    "> Esta pergunta vem **por último**, depois das quatro dimensões, e é " +
      "respondida diretamente — não é a média delas. É ela que permite " +
      "descobrir depois, a partir dos dados, o peso que cada dimensão tem na " +
      "impressão geral. Derivar a nota geral de um composto com pesos " +
      "escolhidos por nós tornaria a comparação circular.",
  );
  linhas.push("");
  linhas.push("## Regra de aceitação (aplicada na análise, não pelo avaliador)");
  linhas.push("");
  linhas.push(
    "ACCEPT ⟺ as duas condições abaixo, aplicadas identicamente à nota do " +
      "avaliador automático e à mediana das notas humanas:",
  );
  linhas.push("");
  linhas.push(
    `1. média ponderada das quatro dimensões ≥ **${ACCEPT_COMPOSITE_MIN}** — ` +
      RUBRIC_DIMENSIONS.map(
        (d) => `${d.label.toLowerCase()} ${DIMENSION_WEIGHTS[d.key]}`,
      ).join(", ") +
      ";",
  );
  linhas.push(
    `2. não mais de uma dimensão abaixo de **${ACCEPT_MIN}** quando uma delas ` +
      "é clareza ou relevância.",
  );
  linhas.push("");
  linhas.push(
    `Análise de sensibilidade com o piso ≥ ${ACCEPT_MIN_STRICT}. A regra ` +
      `anterior — todas as dimensões ≥ ${ACCEPT_MIN} — era pré-registrada e foi ` +
      "substituída em 2026-09-08, depois de o corpus mostrar 22 de 22 execuções " +
      "aceitas sem nenhuma reescrita. É desvio de pré-registro, e está declarado.",
  );
  linhas.push("");
  linhas.push("## Nomes de coluna esperados no CSV de respostas");
  linhas.push("");
  linhas.push(
    "Para cada post (letra `X`): " +
      [...RUBRIC_DIMENSIONS.map((d) => `\`X_${d.key}\``), "`X_overall`"].join(
        ", ",
      ) +
      ".",
  );

  return linhas.join("\n");
}

export async function GET(req: NextRequest) {
  const auth = await requireArea("estudo");
  if (!auth.ok) return auth.response;

  if (req.nextUrl.searchParams.get("format") === "md") {
    return new NextResponse(toMarkdown(), {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": 'attachment; filename="instrumento.md"',
      },
    });
  }

  return NextResponse.json({
    rubricVersion: RUBRIC_VERSION,
    acceptMin: ACCEPT_MIN,
    acceptMinStrict: ACCEPT_MIN_STRICT,
    acceptCompositeMin: ACCEPT_COMPOSITE_MIN,
    dimensionWeights: DIMENSION_WEIGHTS,
    scaleLabels: SCALE_LABELS,
    dimensions: RUBRIC_DIMENSIONS,
    overall: { key: "overall", question: OVERALL_QUESTION },
  });
}
