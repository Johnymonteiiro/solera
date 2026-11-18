// Constantes de modelo. Módulo FOLHA de propósito: `configStore` precisa do
// default do judge e `llm.ts` precisa ler a config dos agentes — se as duas
// constantes morassem em `llm.ts`, o import fecharia um ciclo.

/**
 * Usado quando o agente não define modelo (Researcher e Analyst hoje).
 * Era o `LLM_MODEL=gpt-4o` do .env, que saiu em 2026-09-17: mesmo valor, então
 * os dois agentes seguem no modelo do corpus.
 */
export const FALLBACK_MODEL = "gpt-4o";

/** Writer sem linha default em `llm_models` (banco vazio / sem banco). */
export const FALLBACK_WRITER_MODEL = "openai/gpt-4.1";

/**
 * Nome gravado na config → slug do OpenRouter.
 *
 * `agent_configs.model` e o `judgements.model` já gravados usam o nome da
 * OpenAI sem prefixo (`gpt-4.1`). Convertendo aqui, e não reescrevendo o
 * banco, o dataset continua registrando o nome que sempre registrou.
 */
export function toOpenRouterSlug(model: string): string {
  return model.includes("/") ? model : `openai/${model}`;
}

/**
 * Provedores permitidos para cada família, SEM fallback.
 *
 * O OpenRouter roteia a mesma chamada entre provedores diferentes (e alguns
 * servem versões quantizadas). O artigo cita o modelo exato de cada agente;
 * sem fixar o provedor, dois posts do "mesmo" modelo podem ter saído de
 * servidores diferentes sem registro disso. Família fora da tabela → sem
 * restrição (o OpenRouter escolhe), e o log avisa.
 */
export const PROVIDERS_BY_FAMILY: Record<string, string[]> = {
  openai: ["openai"],
  anthropic: ["anthropic"],
  google: ["google-vertex", "google-ai-studio"],
};

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
