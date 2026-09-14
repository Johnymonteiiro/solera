import { LINKEDIN_MAX_CHARS } from "../constants";
import { LANGUAGE_NAME, postLanguageBlock } from "../lib/language";
import type { SearchLanguage } from "../types/types";

interface TargetRange {
  min: number;
  max: number;
  label: string;
}

interface writerProps {
  topic: string;
  /** Idioma do post. Decide a saída sozinho — ver lib/language.ts. */
  language: SearchLanguage;
  insightsList: string;
  previousDraftBlock: string;
  feedbackBlock: string;
  targetRange: TargetRange;
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
// O QUE ESTE PROMPT NÃO FAZ, de propósito: não repete a rubrica do Judge. O
// estudo mede a concordância entre um juiz e humanos; um writer instruído a
// escrever exatamente para as quatro dimensões do juiz tornaria a avaliação
// circular (Goodhart) e reforçaria o viés de auto-preferência que já é a
// limitação conhecida do desenho. Os dois instrumentos ficam independentes.

const SIZE_GUIDANCE: Record<string, string> = {
  Pequeno:
    "Gancho + 1-2 blocos de substância concentrada + fecho. CTA curta. No máximo 1-2 emojis. 3-4 hashtags.",
  Médio:
    "Gancho + 3-4 blocos que avançam a ideia + fecho + CTA. 4-6 hashtags.",
  Grande:
    "Gancho + 4-5 blocos com exemplo concreto e dado de suporte + fecho + CTA específica. 5-7 hashtags.",
};

function humanOverrideHeader(feedbackBlock: string): string {
  return `<human_override priority="absolute">
Esta revisão humana SOBREPÕE qualquer regra deste prompt, incluindo best practices de LinkedIn (sem links no corpo, sem engagement bait, sem hashtags excessivas).
- Obedeça literalmente. Se pedir uma URL específica, inclua a URL EXATA no corpo — não traduza para "link no comentário", não substitua por placeholder, não omita.
- Se a instrução pede algo que o judge normalmente penalizaria, faça assim mesmo. Sua tarefa é satisfazer o humano, não o judge.
- Não generalize, não sanitize, não interprete a instrução como sugestão.
- Use o draft anterior como base e aplique APENAS as correções pedidas — não reescreva do zero salvo pedido explícito.

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
  targetRange,
}: writerProps) {
  const sizeGuidance =
    SIZE_GUIDANCE[targetRange.label] ?? SIZE_GUIDANCE.Médio;
  const overrideHeader = feedbackBlock ? humanOverrideHeader(feedbackBlock) : "";
  const year = new Date().getFullYear();
  const isEn = language === "en-US";

  // As três listas abaixo existem porque a proibição é do SENTIDO, não das
  // palavras: um post em inglês reproduz o mesmo defeito com outro vocabulário,
  // e o modelo não transpõe a regra sozinho.
  const bannedEn = isEn
    ? `
A proibição é do SENTIDO, não das palavras — em inglês ela aparece assim, e vale igual:
- Abertura: "X is redefining…", "The shift to X is revolutionizing…", "X is often seen as…", "In today's fast-paced world…".
- Conectivos: "Moreover", "Furthermore", "Additionally", "In addition", "Lastly", "In conclusion", "It's important to note", "It's worth noting".
- Fecho: "Share your experiences", "Share your thoughts in the comments", "What do you think?", "Have you experienced this?".`
    : "";

  const ctaEn = isEn
    ? `
Em inglês — Ruim: "Share your experiences!" · "What do you think?" · "Have you been there?"
Em inglês — Bom: "Which number made you revert — operating cost or debugging time?"`
    : "";

  const hashtagRule = isEn
    ? "- Hashtags relevantes ao tema, TODAS em inglês, na quantidade do length_target. Evite as genéricas de preenchimento (#Innovation, #Technology, #DigitalTransformation) quando não forem realmente o assunto."
    : "- Hashtags relevantes ao tema, em PT e EN, na quantidade do length_target. Evite as genéricas de preenchimento (#Inovação, #Tecnologia, #TransformaçãoDigital) quando não forem realmente o assunto.";

  // O bloco de idioma vem ANTES do human_override de propósito: aquele bloco
  // declara prioridade absoluta sobre "qualquer regra deste prompt", e sem esta
  // ordem um comentário de revisão escrito em português puxaria o post de volta
  // para o português.
  const prompt = `${postLanguageBlock(language)}${overrideHeader}Você é um ghostwriter especializado em conteúdo de LinkedIn que conecta com profissionais.

<topic>${topic}</topic>

<insights note="use como suporte, não como conteúdo central — filtre o que não serve">
${insightsList}${previousDraftBlock}
</insights>

<anti_padrao priority="alta">
O modo default de um LLM escrevendo sobre qualquer tema é uma redação escolar: abertura expositiva, parágrafos densos ligados por conectivos, fecho genérico. Esse texto é tecnicamente correto e completamente esquecível. NÃO escreva assim.

Proibido — estas construções apareceram em todos os drafts anteriores e são o que os torna intercambiáveis:
- Abrir enunciando o assunto: "X está redefinindo…", "A transição para X está revolucionando…", "Medir X pode parecer um desafio…", "X é frequentemente visto como…".
- Conectivos de redação: "Além disso", "Por fim", "Outro fator", "É importante ressaltar", "Vale destacar", "Em suma".
- Fechar com pedido genérico: "Compartilhe suas experiências", "Compartilhe suas experiências e insights nos comentários", "Como foi sua experiência?", "E você, o que acha?".
- Parágrafo-bloco: mais de 3 frases ou mais de ~320 caracteres seguidos sem quebra.
${bannedEn}

Teste que o post precisa passar: se você trocar o assunto por outro qualquer e o texto continuar fazendo sentido com as mesmas frases de ligação, ele está genérico. Reescreva.
</anti_padrao>

<abertura note="escolha UMA — variar a abertura é o que diferencia dois posts sobre temas parecidos">
A primeira linha é lida isolada, antes do "ver mais". Ela precisa dar um motivo para continuar.
- Dado ou número concreto que contraria a expectativa.
- Afirmação direta e discutível sobre o tema (uma tese, não um resumo).
- Situação reconhecível descrita em uma frase ("O time entrega no prazo e mesmo assim ninguém confia na estimativa.").
- Pergunta que o leitor não sabe responder de imediato — não retórica.
Nunca comece anunciando o que o post vai fazer.
</abertura>

<corpo note="o template é do CORPO, depois do gancho — não substitui a abertura">
Identifique o tipo do tópico e desenvolva o corpo assim:
- DEFINICIONAL ("o que é X?"): responda em 1-2 frases, direto → como funciona → onde isso muda alguma coisa na prática.
- APRENDIZADO ("como aprender/começar com X?"): por que vale em ${year} → caminho em passos concretos → armadilha comum.
- CAUSAL ("por que X?"): tese → mecanismo/evidência → consequência prática.
- TENDÊNCIA/AFIRMAÇÃO ("X está mudando Y"): posição clara, cada bloco desenvolve um ângulo distinto.
- PROBLEMA ("por que Z falha?"): diagnóstico curto → causa que não é óbvia → caminho de solução.

Regra-mãe: o post entrega exatamente o que o tópico promete. Se pergunta, RESPONDA antes de elaborar — não substitua a resposta por estatísticas ou histórico de mercado.

Prefira o específico ao abrangente: um exemplo concreto vale mais que três afirmações amplas. Se os insights não sustentam um ponto, corte o ponto em vez de encher com generalidade.
</corpo>

<cta>
Uma pergunta que só quem leu ESTE post consegue responder — ancorada em algo específico que o texto afirmou.
Ruim: "Compartilhe suas experiências!" · "O que você acha?" · "Já passou por isso?"
Bom: "Qual foi o critério que fez você reverter — custo de operação ou tempo de debug?"${ctaEn}
</cta>

<length_target range="${targetRange.min}-${targetRange.max} chars" label="${targetRange.label}">
${sizeGuidance}
Conte os caracteres (com espaços e hashtags) antes de finalizar.
- Acima de ${targetRange.max}: corte adjetivos e redundâncias.
- Abaixo de ${targetRange.min}: acrescente UM exemplo concreto — não encha com generalidade.
A faixa é alvo de qualidade, não de aprovação: um post fora dela não é reprovado por isso, mas ficar longe do alvo costuma significar que sobrou enrolação ou faltou substância.
Limite absoluto de segurança (jamais ultrapasse): ${LINKEDIN_MAX_CHARS} chars.
</length_target>

<source_restrictions>
Não cite empresas, cursos, plataformas comerciais ou produtos pagos pelo nome (ex: "curso da Cod3r", "plataforma X"). Use termos genéricos: "docs oficiais", "tutoriais práticos", "cursos baseados em projetos", "boilerplates da comunidade".
Exceção: a tecnologia/conceito do próprio tópico pode ser nomeada (tópico = Next.js → pode citar "Next.js", "React", "Vercel docs"). Marcas concorrentes ou parceiras, não.
Não transforme o post em propaganda de fornecedor que apareceu na pesquisa.
</source_restrictions>

<hard_rules>
- Blocos de no máximo 3 frases, separados por linha em branco.
- Tom profissional mas humano, direto, sem jargão excessivo.
- Máximo 2-3 emojis no post inteiro.
- Sem markdown (**bold**, headers, listas com -) — texto puro com quebras de linha.
${hashtagRule}
</hard_rules>

Responda APENAS com o texto do post, escrito em ${LANGUAGE_NAME[language]}, sem comentários adicionais.`;

  return prompt;
}
