/**
 * Texto de uma resposta de modelo, seja string ou lista de blocos.
 *
 * Via OpenRouter, alguns modelos (Claude, Gemini) devolvem o conteúdo em
 * blocos `{type: "text", text}` em vez de string. Quem lia só a string recebia
 * "" em silêncio — o writer gravava um draft vazio e o analyst abortava por
 * "0 insights", sem nada dizer que a resposta tinha vindo em outro formato.
 */
export function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((b) =>
      typeof b === "string"
        ? b
        : b && typeof b === "object" && (b as { type?: unknown }).type === "text"
          ? String((b as { text?: unknown }).text ?? "")
          : "",
    )
    .join("");
}
