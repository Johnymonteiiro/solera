import type { SearchLanguage } from "../types/types";

// ─── Idioma de saída: fonte única ────────────────────────────────────────────
//
// O seletor da tela de criar post existia desde o começo e não fazia nada: o
// `language` entrava no state, atravessava o grafo inteiro e só reaparecia no
// `publisher`, gravado na linha do post. Nenhum prompt o lia. Escolher "English"
// devolvia um post em português — os prompts do writer e do analyst cravavam PT
// no texto, e é o texto do prompt que decide.
//
// A regra, que vale para todo agente que produz texto para o usuário:
//
//   o idioma da SAÍDA é o escolhido na UI, não importa o idioma da ENTRADA.
//
// Tópico, fontes, insights e comentários do revisor podem chegar em qualquer
// idioma — inclusive misturados, que é o caso normal aqui (o researcher busca
// em PT e EN de propósito). O agente traduz a substância; espelhar o idioma da
// entrada é o modo de falha, não um comportamento aceitável.
//
// Os blocos ficam neste arquivo e não copiados dentro de cada prompt: duas
// cópias de uma mesma regra divergem no primeiro ajuste, e a divergência é
// silenciosa — o post continua saindo, só que no idioma errado.
//
// Até 2026-09-17 o bloco era escrito NO idioma alvo, porque o prompt inteiro
// era em português e "write in English" no meio dele era sinal fraco. Desde
// 2026-09-18 todos os prompts são em inglês, e o bloco também: o que puxa a
// saída para o português agora é a instrução explícita e o aviso de que a
// entrada em outro idioma não muda o idioma do post.

/** Idioma do post quando a requisição não manda nada. */
export const DEFAULT_LANGUAGE: SearchLanguage = "pt-BR";

/** Nome do idioma como ele aparece nos prompts (em inglês). */
export const LANGUAGE_NAME: Record<SearchLanguage, string> = {
  "pt-BR": "Brazilian Portuguese",
  "en-US": "English",
};

/**
 * Bloco de idioma para o WRITER — o texto que o usuário recebe.
 *
 * Vem antes do `<human_override>` no prompt e diz isso explicitamente: aquele
 * bloco declara prioridade absoluta sobre "qualquer regra deste prompt", e sem
 * a ressalva um comentário de revisão escrito em português bastaria para o
 * writer voltar a escrever em português num post marcado como inglês.
 */
export function postLanguageBlock(language: SearchLanguage): string {
  if (language === "en-US") {
    return `<output_language priority="absolute">
Write the post in ENGLISH (en-US). This rule outranks every other instruction in this prompt, including the human review block.
The topic, the insights, the sources and the reviewer's notes may arrive in any language — Portuguese included. Translate the substance; never mirror the language of the input.
A post in any other language is invalid output, no matter how good the text is.
</output_language>

`;
  }
  return `<output_language priority="absolute">
Write the post in BRAZILIAN PORTUGUESE (pt-BR). This rule outranks every other instruction in this prompt, including the human review block.
This prompt is written in English, and the topic, the insights, the sources and the reviewer's notes may arrive in any language — English included. Translate the substance; never mirror the language of the instructions or of the input.
A post in any other language is invalid output, no matter how good the text is.
</output_language>

`;
}

/**
 * Bloco de idioma para o ANALYST.
 *
 * Os insights não são entregues ao usuário, mas viram o material do writer e
 * aparecem na timeline da execução. Deixá-los sempre em PT obrigaria o writer a
 * traduzir enquanto escreve, que é exatamente o momento em que ele escorrega de
 * volta para o idioma do material.
 */
export function insightLanguageBlock(language: SearchLanguage): string {
  if (language === "en-US") {
    return `<output_language priority="high">
The sources come mostly in English, sometimes in Portuguese. The insights are ALWAYS written in ENGLISH (en-US).
You read in any language and write in English — translate the content, don't copy it. The writer produces an English post and the rules below are checked in English.
</output_language>`;
  }
  return `<output_language priority="high">
The sources come mostly in ENGLISH. The insights are ALWAYS written in BRAZILIAN PORTUGUESE (pt-BR).
You read in any language and write in Portuguese — translate the content, don't copy it. An insight in English is invalid output: the writer produces a Portuguese post, and this prompt being in English does not change that.
</output_language>`;
}
