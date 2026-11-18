import { NextRequest, NextResponse } from "next/server";
import { ORIGINAL_ARM, formOrder, getCorpusSelection } from "@/app/MAS/lib/studyCorpus";
import {
  CORPUS_ITEM_COLUMNS,
  CORPUS_MAPPING_COLUMNS,
  corpusItemRow,
  corpusMappingRow,
} from "@/app/MAS/lib/corpusCsv";
import { requireArea } from "@/lib/dal";
import { sheetResponse } from "@/lib/sheet";

// Export do corpus do estudo do gate (rubrica v2).
//
//   GET /api/mas/export/corpus                 → JSON { items, stats, arm, arms }
//   ...&model=<slug>                           → o mesmo, para um braço do benchmark
//   GET /api/mas/export/corpus?format=csv|xlsx → 1 linha por CANDIDATO (auditável)
//   GET /api/mas/export/corpus?format=posts    → textos cegos p/ montar o Form
//   GET /api/mas/export/corpus?format=mapping  → rótulo ↔ versão (chave de junção)
//
// ESCOPO por formato: `csv`/`xlsx` trazem TODOS os candidatos, com `inCorpus` e
// `exclusion` como colunas — é o registro do que ficou de fora e por quê, que é
// parte do método. `posts` e `mapping` cobrem só o corpus.
//
// O `mapping` é o artefato que o pesquisador GUARDA antes de o formulário ir a
// campo: é ele que reencontra qual versão está por trás de cada letra quando as
// respostas voltarem. `versionId` (e não o rótulo) é a chave de junção com
// `human_ratings`, porque a letra depende da fila e o id não depende de nada.

export async function GET(req: NextRequest) {
  // Área `estudo` na matriz (padrão: colaborador para cima).
  const auth = await requireArea("estudo");
  if (!auth.ok) return auth.response;

  const format = req.nextUrl.searchParams.get("format");
  // Braço do benchmark (modelo do Writer). Ausente = corpus original, que é o
  // que o formulário humano usou — os exports sem parâmetro não mudam.
  const model = req.nextUrl.searchParams.get("model") ?? ORIGINAL_ARM;
  const { items, stats, arm, arms } = await getCorpusSelection(auth.ownerId, model);

  if (format === "posts") {
    // O TÓPICO VAI JUNTO — e isto é uma inversão deliberada em relação ao
    // formato equivalente do desenho de pares, que o omitia.
    //
    // O Judge recebe o tópico no prompt, e `relevance` pergunta se o post
    // atende à intenção dele. Esconder o tópico do avaliador humano faria os
    // dois responderem a mesma pergunta com informações diferentes, e a
    // divergência resultante mediria a assimetria, não o juízo.
    //
    // Ordem embaralhada (formOrder), não alfabética: a fila do corpus é
    // cronológica, então listar por rótulo entregaria a data no formulário.
    const body = formOrder(items)
      .map(
        (i) =>
          `### Post ${i.label}\n\n**Tópico solicitado:** ${i.topic}\n\n${i.content}\n`,
      )
      .join("\n---\n\n");
    return new NextResponse(body, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (format === "mapping") {
    const rows = items
      .filter((i) => i.inCorpus)
      .map(corpusMappingRow);
    return sheetResponse(CORPUS_MAPPING_COLUMNS, rows, `mapping-corpus${suffix(arm)}.csv`);
  }

  if (format === "csv" || format === "xlsx") {
    return sheetResponse(
      CORPUS_ITEM_COLUMNS,
      items.map(corpusItemRow),
      `corpus${suffix(arm)}.${format}`,
    );
  }

  return NextResponse.json({ items, stats, arm, arms });
}

/** Sufixo do arquivo por braço: `openai/gpt-4.1` → `-openai-gpt-4.1`. */
function suffix(arm: string): string {
  return arm ? `-${arm.replace(/[^A-Za-z0-9.-]+/g, "-")}` : "";
}
