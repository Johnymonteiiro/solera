import { POST_SIZE_RANGES } from "../constants";
import { PostSize } from "../types/types";

interface criticProps {
  topic: string;
  draft: string;
  postSize: PostSize;
}

export function criticPrompt({ topic, draft, postSize }: criticProps) {
  const range = POST_SIZE_RANGES[postSize];

  const prompt = `Você é um crítico especialista em conteúdo para LinkedIn. Avalie o post abaixo de forma rigorosa e objetiva.

--- EXEMPLOS DE REFERÊNCIA ---

POST RUIM (score 3):
"Hoje vou falar sobre inteligência artificial.
A IA está mudando tudo.
Muitas empresas estão usando IA.
Você também deveria usar IA.
#IA #tecnologia #futuro"
Avaliação: {"score":3,"hookQuality":2,"lengthAdequate":false,"toneLinkedIn":false,"issues":["Gancho genérico sem impacto","Sem dados concretos","Sem CTA específico","Tom muito vago"],"suggestions":["Começar com dado surpreendente","Adicionar caso real","Incluir chamada para ação específica"]}

POST BOM (score 8):
"95% dos projetos de IA falham antes de gerar ROI.
Trabalhei com 40+ empresas e encontrei o padrão:
1/ Começam pela tecnologia, não pelo problema de negócio
2/ Ignoram a qualidade dos dados na fase de planejamento
3/ Subestimam o custo de mudança cultural
O erro não é técnico — é estratégico.
Qual o maior obstáculo que você encontrou ao implementar IA? 👇
#InteligenciaArtificial #Inovacao #Liderança #AIStrategy"
Avaliação: {"score":8,"hookQuality":9,"lengthAdequate":true,"toneLinkedIn":true,"issues":["Poderia ter mais profundidade em cada ponto"],"suggestions":["Adicionar um exemplo concreto de empresa"]}

--- TÓPICO ORIGINAL ---
${topic}

--- TAMANHO ALVO ---
${range.label} — entre ${range.min} e ${range.max} caracteres (${range.hint})

--- POST A AVALIAR ---
${draft}

REGRA CRÍTICA — RELEVÂNCIA À INTENÇÃO DO TÓPICO:
Antes de qualquer outra avaliação, verifique se o post entrega o que o tópico promete:
- Se o tópico é uma PERGUNTA ("o que é X?", "como Y?", "por que Z?"): o post DEVE responder a pergunta de forma clara e direta. Se ele se desvia para histórico, estatísticas ou diagnóstico de mercado SEM responder a pergunta, isso é uma falha CRÍTICA. Score máximo nesse caso é 5, e adicione em "issues" a frase exata: "post não responde à pergunta do tópico".
- Se o tópico é uma AFIRMAÇÃO ou TENDÊNCIA: o post deve argumentar ou explorar com posição clara, não apenas listar fatos.
- Se o tópico é um PROBLEMA: o post deve oferecer perspectiva ou caminho de solução.

Avalie rigorosamente considerando, em ordem de prioridade:
1. RELEVÂNCIA À INTENÇÃO (regra crítica acima — se falhar, score ≤ 5)
2. hookQuality (0-10): O gancho para o scroll? É específico e impactante?
3. score (0-10): Qualidade geral do post (incluindo relevância)
4. lengthAdequate: O post tem entre ${range.min} e ${range.max} caracteres? Esse é o range alvo de "${range.label}". (atual: ${draft.length} chars). Posts fora do range — muito curtos OU muito longos — devem retornar lengthAdequate=false.
5. toneLinkedIn: Tom profissional e autêntico para LinkedIn?
6. issues: Lista de problemas específicos encontrados. Se lengthAdequate=false, inclua um issue indicando se está curto ou longo demais para o tamanho ${range.label}.
7. suggestions: Sugestões concretas de melhoria

Responda APENAS com JSON válido, sem markdown ou code fences:
{
  "score": 0-10,
  "hookQuality": 0-10,
  "lengthAdequate": true/false,
  "toneLinkedIn": true/false,
  "issues": ["..."],
  "suggestions": ["..."]
}`;

  return prompt;
}
