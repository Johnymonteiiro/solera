import { analystPrompt } from "../prompts/analyst.prompt";
import { judgePrompt } from "../prompts/judge.prompt";
import { RESEARCHER_PROMPT } from "../prompts/researcher.prompt";
import { writerPrompt } from "../prompts/writer.prompt";
import { AgentId, composeSystemPrompt } from "./configStore";
import { DEFAULT_LANGUAGE } from "./language";

// O system prompt de cada agente, montado pelas MESMAS funções que o grafo usa,
// para a tela /agentes mostrar (só leitura). O que depende da execução — tópico,
// insights, post — entra como marcador {{…}}; idioma e tamanho usam o default
// (pt-BR, médio). Não é uma cópia do texto: mudou o código, muda aqui.

export function renderAgentPrompts(): Partial<Record<AgentId, string>> {
  const judge = judgePrompt({ topic: "{{TOPIC}}", draft: "{{POST}}", postSize: "medium" })
    // O prompt interpola o tamanho do post; com o marcador sairia "8 chars".
    .replace("Post to evaluate (8 chars):", "Post to evaluate ({{N_CHARS}} chars):")
    .replace("The post has 8.", "The post has {{N_CHARS}}.");
  return {
    researcher: composeSystemPrompt("researcher", RESEARCHER_PROMPT),
    analyst: composeSystemPrompt("analyst", analystPrompt(DEFAULT_LANGUAGE)),
    writer: composeSystemPrompt(
      "writer",
      writerPrompt({
        topic: "{{TOPIC}}",
        language: DEFAULT_LANGUAGE,
        insightsList: "{{INSIGHTS}}",
        previousDraftBlock: "",
        feedbackBlock: "",
        postSize: "medium",
      }),
    ),
    judge: composeSystemPrompt("judge", judge),
  };
}
