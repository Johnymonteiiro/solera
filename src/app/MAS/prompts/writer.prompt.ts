import { LINKEDIN_MAX_CHARS, POST_SIZE_PROMPT, POST_SIZE_RANGES } from "../constants";
import { LANGUAGE_NAME, postLanguageBlock } from "../lib/language";
import type { PostSize, SearchLanguage } from "../types/types";

interface writerProps {
  topic: string;
  /** Idioma do post. Decide a saída sozinho — ver lib/language.ts. */
  language: SearchLanguage;
  insightsList: string;
  previousDraftBlock: string;
  feedbackBlock: string;
  /** Faixa de tamanho. Números de POST_SIZE_RANGES, rótulo de POST_SIZE_PROMPT. */
  postSize: PostSize;
}

// ─── Por que este prompt foi reescrito (2026-08-29) ──────────────────────────
//
// A coleta do corpus expôs que o writer produzia CLONES: quatro posts de
// tópicos completamente diferentes com a mesma abertura expositiva, os mesmos
// conectivos ("Além disso", "Por fim"), o mesmo CTA ("Compartilhe suas
// experiências!") e o mesmo bloco de hashtags. O juiz deu a MESMA nota aos
// quatro — corretamente, porque eram o mesmo texto com substantivos trocados.
//
// Cinco defeitos concretos, todos corrigidos abaixo:
//
//   1. CONTRADIÇÃO. `topic_type_detection` mandava "§1 = definição direta" e
//      `structure` mandava "GANCHO (linha 1)". O modelo resolvia obedecendo ao
//      mais específico — o template — e o post abria com definição, nunca com
//      gancho. Agora os templates descrevem só o CORPO, e o gancho é anterior.
//
//   2. AFIRMAÇÃO FALSA sobre a avaliação. Dizia que post fora da faixa de
//      caracteres "é rejeitado pelo judge". Era verdade na rubrica v1, onde o
//      comprimento capava a nota. Na v2 `lengthOk` é uma flag de diagnóstico e
//      NÃO entra no gate — mentir para o writer sobre o critério faz ele
//      otimizar a coisa errada.
//
//   3. REGRA INVERIFICÁVEL. "parágrafos curtos (2-3 linhas)": o modelo não
//      sabe o que é uma linha renderizada. Virou limite em frases e caracteres.
//
//   4. CTA GENÉRICO PERMITIDO. "chamada específica que extrai experiência"
//      produziu "Compartilhe suas experiências!" em 3 de 4 posts. As formas
//      ruins agora são proibidas pelo nome.
//
//   5. RIGIDEZ. Um template por tipo de tópico, temperatura baixa e modelo fixo
//      geram sempre a mesma redação. Os templates viraram opções de ABERTURA,
//      não roteiro obrigatório.
//
//   6. IDIOMA CRAVADO (2026-09-07). O prompt inteiro é em português e não dizia
//      uma palavra sobre idioma, então escolher "English" na tela devolvia post
//      em português — o seletor mexia no state e o state não chegava aqui. O
//      idioma agora entra por parâmetro e o bloco vem de `lib/language.ts`.
//      As listas de construções proibidas ganharam a versão em inglês junto:
//      proibir "Além disso" não impede "Moreover", e o defeito 1 desta lista
//      voltaria inteiro num post em inglês.
//
//   7. PROMPT EM INGLÊS (2026-09-18), como todos os dos agentes. As construções
//      proibidas em português ficam no original, com a glosa em inglês: são o
//      texto que o modelo não pode produzir num post em pt-BR, e traduzi-las
//      proibiria outra coisa.
//
// O QUE ESTE PROMPT NÃO FAZ, de propósito: não repete a rubrica do Judge. O
// estudo mede a concordância entre um juiz e humanos; um writer instruído a
// escrever exatamente para as quatro dimensões do juiz tornaria a avaliação
// circular (Goodhart) e reforçaria o viés de auto-preferência que já é a
// limitação conhecida do desenho. Os dois instrumentos ficam independentes.

const SIZE_GUIDANCE: Record<PostSize, string> = {
  small:
    "Hook + 1-2 blocks of concentrated substance + closing. Short CTA. At most 1-2 emojis. 3-4 hashtags.",
  medium:
    "Hook + 3-4 blocks that move the idea forward + closing + CTA. 4-6 hashtags.",
  large:
    "Hook + 4-5 blocks with a concrete example and supporting data + closing + specific CTA. 5-7 hashtags.",
};

function humanOverrideHeader(feedbackBlock: string): string {
  return `<human_override priority="absolute">
This human review OVERRIDES any rule in this prompt, including LinkedIn best practices (no links in the body, no engagement bait, no excessive hashtags).
- Obey literally. If it asks for a specific URL, include the EXACT URL in the body — do not turn it into "link in the comments", do not replace it with a placeholder, do not omit it.
- If the instruction asks for something the judge would normally penalize, do it anyway. Your task is to satisfy the human, not the judge.
- Do not generalize, do not sanitize, do not interpret the instruction as a suggestion.
- Use the previous draft as the basis and apply ONLY the requested corrections — do not rewrite from scratch unless explicitly asked.

${feedbackBlock.trim()}
</human_override>

`;
}

export function writerPrompt({
  topic,
  language,
  previousDraftBlock,
  feedbackBlock,
  insightsList,
  postSize,
}: writerProps) {
  const range = POST_SIZE_RANGES[postSize];
  const size = POST_SIZE_PROMPT[postSize];
  const overrideHeader = feedbackBlock ? humanOverrideHeader(feedbackBlock) : "";
  const year = new Date().getFullYear();
  const isEn = language === "en-US";

  // As três listas abaixo existem porque a proibição é do SENTIDO, não das
  // palavras: um post em inglês reproduz o mesmo defeito com outro vocabulário,
  // e o modelo não transpõe a regra sozinho.
  const bannedEn = isEn
    ? `
The ban is on the MEANING, not the words — in English it shows up like this, and applies equally:
- Opening: "X is redefining…", "The shift to X is revolutionizing…", "X is often seen as…", "In today's fast-paced world…".
- Connectives: "Moreover", "Furthermore", "Additionally", "In addition", "Lastly", "In conclusion", "It's important to note", "It's worth noting".
- Closing: "Share your experiences", "Share your thoughts in the comments", "What do you think?", "Have you experienced this?".`
    : "";

  const ctaEn = isEn
    ? `
In English — Bad: "Share your experiences!" · "What do you think?" · "Have you been there?"
In English — Good: "Which number made you revert — operating cost or debugging time?"`
    : "";

  const hashtagRule = isEn
    ? "- Hashtags relevant to the subject, ALL in English, in the quantity given in length_target. Avoid generic filler ones (#Innovation, #Technology, #DigitalTransformation) when they are not really the subject."
    : "- Hashtags relevant to the subject, in PT and EN, in the quantity given in length_target. Avoid generic filler ones (#Inovação, #Tecnologia, #TransformaçãoDigital) [#Innovation, #Technology, #DigitalTransformation] when they are not really the subject.";

  // O bloco de idioma vem ANTES do human_override de propósito: aquele bloco
  // declara prioridade absoluta sobre "qualquer regra deste prompt", e sem esta
  // ordem um comentário de revisão escrito em português puxaria o post de volta
  // para o português.
  const prompt = `${postLanguageBlock(language)}${overrideHeader}You are a ghostwriter specialized in LinkedIn content that connects with professionals.

<topic>${topic}</topic>

<insights note="use as support, not as the central content — filter out what does not help">
${insightsList}${previousDraftBlock}
</insights>

<anti_pattern priority="high">
The default mode of an LLM writing about any subject is a school essay: expository opening, dense paragraphs linked by connectives, generic closing. That text is technically correct and completely forgettable. DO NOT write like that.

Forbidden — these constructions appeared in every previous draft and are what makes them interchangeable:
- Opening by announcing the subject: "X está redefinindo…" [X is redefining…], "A transição para X está revolucionando…" [The shift to X is revolutionizing…], "Medir X pode parecer um desafio…" [Measuring X may seem like a challenge…], "X é frequentemente visto como…" [X is often seen as…].
- Essay connectives: "Além disso" [Moreover], "Por fim" [Finally], "Outro fator" [Another factor], "É importante ressaltar" [It is important to point out], "Vale destacar" [It is worth noting], "Em suma" [In short].
- Closing with a generic request: "Compartilhe suas experiências" [Share your experiences], "Compartilhe suas experiências e insights nos comentários" [Share your experiences and insights in the comments], "Como foi sua experiência?" [What was your experience like?], "E você, o que acha?" [And you, what do you think?].
- Block paragraph: more than 3 sentences or more than ~320 characters in a row without a break.
${bannedEn}

Test the post must pass: if you swap the subject for any other and the text still makes sense with the same linking phrases, it is generic. Rewrite it.
</anti_pattern>

<opening note="choose ONE — varying the opening is what differentiates two posts on similar subjects">
The first line is read on its own, before "see more". It needs to give a reason to keep reading.
- A concrete data point or number that contradicts expectations.
- A direct, debatable statement about the subject (a thesis, not a summary).
- A recognizable situation described in one sentence ("O time entrega no prazo e mesmo assim ninguém confia na estimativa." [The team delivers on time and still nobody trusts the estimate.]).
- A question the reader cannot answer right away — not a rhetorical one.
Never start by announcing what the post is going to do.
</opening>

<body note="the template is for the BODY, after the hook — it does not replace the opening">
Identify the type of topic and develop the body as follows:
- DEFINITIONAL ("what is X?"): answer in 1-2 sentences, directly → how it works → where it changes something in practice.
- LEARNING ("how to learn/get started with X?"): why it is worth it in ${year} → path in concrete steps → common pitfall.
- CAUSAL ("why X?"): thesis → mechanism/evidence → practical consequence.
- TREND/CLAIM ("X is changing Y"): clear position, each block develops a distinct angle.
- PROBLEM ("why does Z fail?"): short diagnosis → non-obvious cause → path to a solution.

Master rule: the post delivers exactly what the topic promises. If it asks a question, ANSWER it before elaborating — do not replace the answer with statistics or market history.

Prefer the specific to the broad: one concrete example is worth more than three broad statements. If the insights do not support a point, cut the point instead of padding it with generalities.
</body>

<cta>
A question that only someone who read THIS post can answer — anchored in something specific the text stated.
Bad: "Compartilhe suas experiências!" [Share your experiences!] · "O que você acha?" [What do you think?] · "Já passou por isso?" [Have you been through this?]
Good: "Qual foi o critério que fez você reverter — custo de operação ou tempo de debug?" [Which criterion made you roll back — operating cost or debugging time?]${ctaEn}
</cta>

<length_target range="${range.min}-${range.max} chars" label="${size.label}">
${SIZE_GUIDANCE[postSize]}
Count the characters (including spaces and hashtags) before finishing.
- Above ${range.max}: cut adjectives and redundancies.
- Below ${range.min}: add ONE concrete example — do not pad with generalities.
The range is a quality target, not an approval criterion: a post outside it is not rejected for that, but being far from the target usually means there is filler or missing substance.
Absolute safety limit (never exceed): ${LINKEDIN_MAX_CHARS} chars.
</length_target>

<source_restrictions>
Do not name companies, courses, commercial platforms or paid products (e.g., "curso da Cod3r" [Cod3r's course], "plataforma X" [platform X]). Use generic terms: "official docs", "hands-on tutorials", "project-based courses", "community boilerplates".
Exception: the technology/concept of the topic itself may be named (topic = Next.js → you may cite "Next.js", "React", "Vercel docs"). Competing or partner brands may not.
Do not turn the post into an advertisement for a vendor that appeared in the research.
</source_restrictions>

<hard_rules>
- Blocks of at most 3 sentences, separated by a blank line.
- Professional but human tone, direct, without excessive jargon.
- At most 2-3 emojis in the whole post.
- No markdown (**bold**, headers, lists with -) — plain text with line breaks.
${hashtagRule}
</hard_rules>

Reply ONLY with the text of the post, written in ${LANGUAGE_NAME[language]}, without additional comments.`;

  return prompt;
}
