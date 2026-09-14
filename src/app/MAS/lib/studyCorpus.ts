import { AgentStatus, JudgeResult, JudgeRunMeta } from "../types/types";
import { SEED_CORPUS, postLabel, seededShuffle } from "./blind";
import { RUBRIC_VERSION } from "./rubric";
import {
  RunMetaRecord,
  VersionRecord,
  getAllVersionHistories,
  listRunMeta,
} from "./studyRecorder";

// ─── Corpus do estudo do gate (rubrica v2) ───────────────────────────────────
//
// FONTE DE VERDADE da amostra do desenho VIGENTE. A unidade de análise é o
// POST: cada item recebe uma nota do Judge e três notas humanas, no mesmo
// instrumento (lib/rubric.ts), e a comparação é entre esses dois julgamentos.
//
// Substitui a seleção de PARES antes/depois (`revisionPairs.ts`), que servia à
// pergunta anterior ("a revisão do Judge melhora o post?"). Aquele módulo
// continua vivo como material de MECANISMO — ver o Judge empacar reescrita após
// reescrita é achado por si só —, mas não alimenta mais o formulário humano.
//
// ── Por que a v1 de cada execução ───────────────────────────────────────────
//
// É o draft que o Critic viu primeiro, e é o único que existe em TODA execução.
// As versões seguintes são produto de "reescreve até este juiz aprovar": usá-las
// enviesaria o corpus para ACCEPT e esvaziaria três das quatro células da matriz
// de confusão — justamente a célula FALSE ACCEPT, que é o achado que o estudo
// persegue. A v1 tem variância natural: parte passa no gate, parte não.
//
// ── O que este módulo NÃO faz, de propósito ─────────────────────────────────
//
// NÃO equilibra o corpus por decisão do Judge. Escolher N aceitos + N reprovados
// tornaria a amostra estratificada na variável independente: a concordância
// continuaria medível, mas a taxa de falso-aceite deixaria de estimar a taxa de
// PRODUÇÃO sem reponderação, e é ela que motiva o estudo. A fila é cronológica e
// cega à nota. O que o módulo faz é MEDIR o desequilíbrio (`stats.balance`) e
// levantar a bandeira antes de o formulário ir a campo: com o corpus degenerado,
// a saída é gerar mais execuções (tópicos mais variados ou mais difíceis), não
// escolher a dedo quais entram.
//
// ── Estabilidade da amostra ─────────────────────────────────────────────────
//
// Fila FIFO (mais antigas primeiro) e rótulo por posição: uma execução nova
// entra no fim e apenas ACRESCENTA letras. Um formulário que já foi a campo
// continua batendo com o `mapping`. Ordenar por "mais recente" remapearia tudo a
// cada execução nova, e as respostas coletadas passariam a apontar para o post
// errado sem nenhum erro aparecer.

/** Teto do formulário. 3 avaliadores × 24 posts ≈ 45 min cada. */
export const CORPUS_MAX_POSTS = 24;

/** Avaliadores independentes por post — mínimo para uma mediana e para o α. */
export const RATERS_TARGET = 3;

/**
 * Piso de equilíbrio ACCEPT/REJECT abaixo do qual a matriz de confusão fica
 * degenerada (κ instável, célula de falso-aceite vazia ou quase).
 */
export const MIN_BALANCE = 0.2;

/**
 * Corpus mínimo para a bandeira de desequilíbrio valer alguma coisa.
 *
 * Com 1 ou 2 posts o balanço é 0 por aritmética, não por viés do juiz — avisar
 * ali é gritar lobo no primeiro run e ensinar a ignorar o aviso justamente
 * quando ele passar a significar algo.
 */
export const MIN_BALANCE_N = 5;

export type CorpusExclusion =
  /** Execução descartada do estudo pelo pesquisador. */
  | "run_descartado"
  /** Execução sem nenhuma versão de draft gravada. */
  | "sem_versao"
  /** A v1 existe mas não tem nota do Judge. */
  | "sem_nota"
  /** A nota é da rubrica antiga (0–10): incomparável com o form humano. */
  | "instrumento_v1"
  /** Já existe no corpus uma execução mais antiga do mesmo tópico. */
  | "topico_repetido"
  /** Elegível, mas o corpus já atingiu CORPUS_MAX_POSTS. */
  | "acima_do_teto";

export interface CorpusItem {
  /** Rótulo cego mostrado ao avaliador. null = fora do corpus. */
  label: string | null;
  threadId: string;
  /** id da draft_version — é a chave de junção com human_ratings. */
  versionId: string;
  version: number;
  topic: string;
  topicKey: string;
  content: string;
  charCount: number;
  status: AgentStatus;
  createdAt: string;
  /** Condição experimental: modelo que escreveu este post. */
  writerModel: string;
  judgement: JudgeResult | null;
  judgeMeta: JudgeRunMeta | null;
  inCorpus: boolean;
  exclusion: CorpusExclusion | null;
}

export interface CorpusStats {
  runs: number;
  /** Execuções que produziram uma v1 avaliada no instrumento vigente. */
  candidatos: number;
  corpus: number;
  maxPosts: number;
  raters: number;
  /** Julgamentos humanos esperados = corpus × raters. */
  avaliacoesEsperadas: number;
  topicos: number;
  accept: number;
  reject: number;
  /** min(accept, reject) ÷ corpus. null com corpus vazio. */
  balance: number | null;
  /** balance < MIN_BALANCE: a matriz de confusão vai degenerar. */
  balanceWarning: boolean;
  excluded: Record<CorpusExclusion, number>;
}

export interface CorpusSelection {
  /** TODOS os candidatos, dentro e fora — o registro auditável. */
  items: CorpusItem[];
  stats: CorpusStats;
}

const ZERO_EXCLUDED: Record<CorpusExclusion, number> = {
  run_descartado: 0,
  sem_versao: 0,
  sem_nota: 0,
  instrumento_v1: 0,
  topico_repetido: 0,
  acima_do_teto: 0,
};

/**
 * Motivo de a v1 de uma execução não poder entrar no corpus, ou null.
 *
 * `instrumento_v1` é a checagem que não pode faltar: uma nota 0–10 da rubrica
 * antiga não é comparável com respostas humanas em 1–5, e misturar as duas não
 * dispara erro nenhum — só produz uma correlação sem significado.
 *
 * NÃO FILTRA POR `judgeLoop`, ao contrário do desenho de pares — e a diferença
 * é intencional. Lá o loop ERA o tratamento, então `judgeLoop=false` não tinha
 * par nenhum. Aqui a unidade é a v1, que existe igual nos dois modos: o Judge
 * pontua sempre, só não reescreve. A coleta é feita justamente com o loop
 * DESLIGADO, porque as reescritas custam crédito e o corpus não as usa.
 *
 * Também não filtra por `status`: uma execução que parou depois ainda produziu
 * um draft real, avaliado no instrumento vigente. Se o pipeline abortou antes,
 * ela cai em `sem_versao`/`sem_nota` por conta própria.
 */
function elegibilidade(
  run: RunMetaRecord,
  v1: VersionRecord | undefined,
): CorpusExclusion | null {
  if (run.excludedAt) return "run_descartado";
  if (!v1 || !v1.content.trim()) return "sem_versao";
  if (!v1.judgement) return "sem_nota";
  if (v1.judgeMeta?.rubricVersion !== RUBRIC_VERSION) return "instrumento_v1";
  return null;
}

export function selectCorpus(
  runs: RunMetaRecord[],
  histories: Map<string, VersionRecord[]>,
): CorpusSelection {
  type Pending = Omit<CorpusItem, "label" | "inCorpus"> & {
    exclusion: CorpusExclusion | null;
  };
  const pending: Pending[] = [];

  for (const run of runs) {
    const versions = histories.get(run.threadId) ?? [];
    const v1 = versions[0];
    const exclusion = elegibilidade(run, v1);

    // Sem versão nenhuma não há o que rotular nem exportar; entra só na
    // contagem de exclusões, para a soma fechar com o total de execuções.
    if (!v1) {
      pending.push({
        threadId: run.threadId,
        versionId: "",
        version: 0,
        topic: run.topic,
        topicKey: run.topicNorm,
        content: "",
        charCount: 0,
        status: run.status,
        createdAt: run.createdAt,
        writerModel: run.writerModel,
        judgement: null,
        judgeMeta: null,
        exclusion: exclusion ?? "sem_versao",
      });
      continue;
    }

    pending.push({
      threadId: run.threadId,
      versionId: v1.id,
      version: v1.version,
      topic: run.topic,
      topicKey: run.topicNorm,
      content: v1.content,
      charCount: v1.charCount,
      status: run.status,
      createdAt: v1.createdAt,
      writerModel: run.writerModel,
      judgement: v1.judgement,
      judgeMeta: v1.judgeMeta,
      exclusion,
    });
  }

  // Desempate por threadId: duas execuções podem compartilhar createdAt (mesmo
  // segundo), e a amostra não pode depender da ordem em que o banco devolveu.
  const older = (a: Pending, b: Pending) => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? a : b;
    return a.threadId < b.threadId ? a : b;
  };

  // 1 post por tópico normalizado: dois textos do mesmo tópico no mesmo
  // formulário fazem o avaliador reconhecer a repetição e parar de julgar às
  // cegas. Vence o mais antigo, pela estabilidade da fila.
  const porTopico = new Map<string, Pending>();
  for (const p of pending) {
    if (p.exclusion) continue;
    const atual = porTopico.get(p.topicKey);
    porTopico.set(p.topicKey, atual ? older(p, atual) : p);
  }
  for (const p of pending) {
    if (p.exclusion) continue;
    if (porTopico.get(p.topicKey) !== p) p.exclusion = "topico_repetido";
  }

  // Fila cronológica, cega à nota do Judge — ver "o que este módulo NÃO faz".
  const fila = [...porTopico.values()].sort((a, b) =>
    older(a, b) === a ? -1 : 1,
  );
  const escolhidos = new Set(
    fila.slice(0, CORPUS_MAX_POSTS).map((p) => p.versionId),
  );
  for (const p of fila) {
    if (!escolhidos.has(p.versionId)) p.exclusion = "acima_do_teto";
  }

  // Rótulo por POSIÇÃO na fila: acréscimo puro, as letras já distribuídas não
  // se movem quando uma execução nova entra.
  const labelPorVersao = new Map<string, string>();
  fila.slice(0, CORPUS_MAX_POSTS).forEach((p, i) => {
    labelPorVersao.set(p.versionId, postLabel(i));
  });

  const items: CorpusItem[] = pending.map((p) => ({
    ...p,
    label: labelPorVersao.get(p.versionId) ?? null,
    inCorpus: p.exclusion === null,
  }));

  const noCorpus = items.filter((i) => i.inCorpus);
  const accept = noCorpus.filter(
    (i) => i.judgement?.decision === "ACCEPT",
  ).length;
  const reject = noCorpus.length - accept;
  const balance = noCorpus.length
    ? Math.min(accept, reject) / noCorpus.length
    : null;

  const excluded = { ...ZERO_EXCLUDED };
  for (const i of items) if (i.exclusion) excluded[i.exclusion]++;

  return {
    items,
    stats: {
      runs: runs.length,
      candidatos: items.filter(
        (i) => i.exclusion === null || i.exclusion === "topico_repetido" || i.exclusion === "acima_do_teto",
      ).length,
      corpus: noCorpus.length,
      maxPosts: CORPUS_MAX_POSTS,
      raters: RATERS_TARGET,
      avaliacoesEsperadas: noCorpus.length * RATERS_TARGET,
      topicos: porTopico.size,
      accept,
      reject,
      balance,
      balanceWarning:
        balance !== null &&
        balance < MIN_BALANCE &&
        noCorpus.length >= MIN_BALANCE_N,
      excluded,
    },
  };
}

/**
 * Ordem em que os posts aparecem no formulário: embaralhada com seed própria.
 *
 * Separada da atribuição de letras de propósito — a ORDEM pode mudar sem
 * quebrar nada (o cruzamento é por rótulo). Embaralhar importa porque a fila é
 * cronológica: entregar os posts em ordem de geração faria a posição no
 * formulário carregar a data, e qualquer deriva de qualidade ao longo da coleta
 * viraria um efeito de ordem.
 */
export function formOrder(items: CorpusItem[]): CorpusItem[] {
  return seededShuffle(
    items.filter((i) => i.inCorpus && i.label),
    SEED_CORPUS,
  );
}

/** Atalho: lê o banco (duas queries) e devolve o corpus pronto, por dono. */
export async function getCorpusSelection(
  ownerId: string,
): Promise<CorpusSelection> {
  const [runs, histories] = await Promise.all([
    listRunMeta(ownerId),
    getAllVersionHistories(ownerId),
  ]);
  return selectCorpus(runs, histories);
}
