// Constantes de modelo. Módulo FOLHA de propósito: `configStore` precisa do
// default do judge e `llm.ts` precisa ler a config dos agentes — se as duas
// constantes morassem em `llm.ts`, o import fecharia um ciclo.

/** Usado quando nem o agente nem `LLM_MODEL` definem modelo. */
export const FALLBACK_MODEL = "gpt-4o";

/**
 * Modelo do Judge — deliberadamente DIFERENTE do dos demais agentes.
 *
 * Até 2026-08-29 todo agente lia `LLM_MODEL`, então o juiz avaliava sempre o
 * texto do próprio modelo. É um confundimento conhecido da literatura de
 * LLM-as-judge (viés de auto-preferência: modelos pontuam mais alto o texto que
 * eles mesmos produziriam), e era a limitação mais séria do desenho.
 *
 * Por que um modelo IRMÃO e não um menor: o juiz não pode ser mais fraco que o
 * escritor. A capacidade de discriminar foi verificada em gpt-4o com três
 * textos-âncora (lixo 2/5, médio 3/5, bom 4/5) e é dela que o estudo depende —
 * um juiz que não separa qualidade não mede nada. Mesma família continua
 * compartilhando treino, então o viés é reduzido, não eliminado: isso vai na
 * seção de limitações.
 *
 * Trocar este valor obriga a RE-PONTUAR o corpus inteiro. Notas de juízes
 * diferentes no mesmo corpus não se comparam — `judgements.model` registra qual
 * foi usado em cada uma, que é como o erro fica detectável.
 */
export const JUDGE_DEFAULT_MODEL = "gpt-4.1";
