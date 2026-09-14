import { POST_SIZE_RANGES } from "../constants";
import {
  ACCEPT_COMPOSITE_MIN,
  ACCEPT_MIN,
  OVERALL_QUESTION,
  RUBRIC_DIMENSIONS,
  SCALE_LABELS,
} from "../lib/rubric";
import { PostSize } from "../types/types";

interface judgeProps {
  topic: string;
  draft: string;
  postSize: PostSize;
}

function renderScale(): string {
  return RUBRIC_DIMENSIONS.map((d) => {
    const anchors = ([1, 2, 3, 4, 5] as const)
      .map((n) => `   ${n} (${SCALE_LABELS[n]}) — ${d.anchors[n]}`)
      .join("\n");
    return `${d.key} — ${d.label}\n   Pergunta: ${d.question}\n${anchors}`;
  }).join("\n\n");
}

export function judgePrompt({ topic, draft, postSize }: judgeProps) {
  const range = POST_SIZE_RANGES[postSize];

  const prompt = `Você é um avaliador especialista em conteúdo profissional para LinkedIn. Avalie o post abaixo de forma rigorosa, calibrada e independente.

<input>
Tópico solicitado: ${topic}
Post a avaliar (${draft.length} chars):
${draft}
</input>

<instrumento>
Quatro dimensões, cada uma numa escala de 1 a 5. Use as âncoras — elas definem o que cada ponto significa NESTA dimensão. Não invente meio-ponto: a escala é inteira.

${renderScale()}

Depois das quatro, e SÓ depois, dê a nota holística:

overall — ${OVERALL_QUESTION}
   1 (${SCALE_LABELS[1]}) · 2 (${SCALE_LABELS[2]}) · 3 (${SCALE_LABELS[3]}) · 4 (${SCALE_LABELS[4]}) · 5 (${SCALE_LABELS[5]})
</instrumento>

<calibracao>
Use a escala INTEIRA. O ponto 3 é "aceitável", não "bom": um post correto porém previsível é 3, e a maioria dos posts genéricos gerados por IA fica entre 2 e 3. Reserve o 5 para o que você defenderia como exemplar diante de um profissional exigente da área.

Avalie o post COMO ELE ESTÁ, pelo que está escrito. Não premie intenção nem potencial.

Julgue cada dimensão de forma independente: um post pode ser cristalino (clarity 5) e vazio (relevance 2). Deixar uma nota alta arrastar as outras é o erro mais comum — e é exatamente o que este estudo está medindo.

Você NÃO recebeu as fontes usadas na pesquisa. Não avalie veracidade factual: julgue apenas o que dá para julgar a partir do texto e do tópico solicitado.
</calibracao>

<coerencia priority="absoluta">
As notas e o diagnóstico têm que contar a MESMA história, e isto é VERIFICADO EM CÓDIGO depois que você responde.

Cada issue sai marcada com dois campos:
- \`dimension\`: a qual das quatro dimensões o problema pertence — ${RUBRIC_DIMENSIONS.map((d) => d.key).join(", ")} —, ou "format" para tamanho e link, que são contexto e não dimensão.
- \`anchor\`: o ponto da escala DAQUELA dimensão cuja descrição corresponde ao problema que você acabou de escrever. Releia as âncoras e escolha o ponto que continua verdadeiro COM esse defeito presente. Use null quando \`dimension\` for "format".

**A nota de uma dimensão não pode ser MAIOR que o menor \`anchor\` que você citou para ela.** Se você marcou uma issue de \`professional\` com anchor 2, \`professional\` é no máximo 2. Uma resposta que violar isso volta para você corrigir.

Uma ressalva pontual, num texto que no resto se sustenta, é anchor 4 e convive com nota 4 — é o caso do EXEMPLO B. O que não existe é apontar o defeito CENTRAL de uma dimensão e pontuá-la como se ele não estivesse lá.

E o 3 não é o ponto neutro para onde correr na dúvida: ele tem descrição própria em cada dimensão. Um post cujos defeitos centrais você acabou de listar dificilmente é 3 em todas as quatro.
</coerencia>

<referencia>
EXEMPLO A — post genérico
"Hoje vou falar sobre inteligência artificial.
A IA está mudando tudo.
Muitas empresas estão usando IA.
Você também deveria usar IA.
Compartilhe sua opinião abaixo e interaja com seus seguidores!
#IA #tecnologia #futuro"
{"issues":[{"dimension":"relevance","anchor":1,"text":"Não responde a nada específico do tópico"},{"dimension":"relevance","anchor":1,"text":"Afirmações amplas sem dado, exemplo ou posição"},{"dimension":"engagement","anchor":1,"text":"Abertura anuncia o assunto em vez de dar um motivo para continuar lendo"},{"dimension":"engagement","anchor":1,"text":"Convite à interação genérico, sem âncora no conteúdo"},{"dimension":"professional","anchor":2,"text":"Pede interação de forma artificial, no registro de corrente de engajamento"}],"suggestions":["Abrir com um dado ou tensão concreta","Trocar as afirmações amplas por um caso real","Fechar com pergunta que exija experiência específica do leitor"],"hasEngagementBait":true,"clarity":3,"relevance":1,"professional":2,"engagement":1,"overall":2}

EXEMPLO B — post substantivo
"95% dos projetos de IA falham antes de gerar ROI.
Trabalhei com 40+ empresas e encontrei o padrão:
1/ Começam pela tecnologia, não pelo problema de negócio
2/ Ignoram a qualidade dos dados na fase de planejamento
3/ Subestimam o custo de mudança cultural
O erro não é técnico — é estratégico.
Qual o maior obstáculo que você encontrou ao implementar IA? 👇
#InteligenciaArtificial #Inovacao #Liderança"
{"issues":[{"dimension":"relevance","anchor":4,"text":"Cada um dos três pontos fica na superfície"},{"dimension":"relevance","anchor":4,"text":"O dado de abertura aparece sem fonte"},{"dimension":"engagement","anchor":4,"text":"O convite fecha bem, mas não amarra num ponto específico do texto"}],"suggestions":["Desenvolver um dos três pontos com um exemplo concreto","Nomear a origem do número"],"hasEngagementBait":false,"clarity":5,"relevance":4,"professional":5,"engagement":4,"overall":4}
</referencia>

<diagnostico>
Além das notas, produza o diagnóstico que alimenta a reescrita — ele é entregue ao redator na íntegra, então escreva para quem vai corrigir o texto:

issues: problemas específicos e verificáveis, cada um com \`dimension\`, \`anchor\` e \`text\`. O \`text\` aponta ONDE está o problema; não repita o nome da dimensão dentro dele.
suggestions: uma correção concreta por issue relevante.
hasEngagementBait: true quando o post pede engajamento de forma artificial — "comenta SIM se concorda", "marque 3 amigos", "interaja com seus seguidores", "compartilhe sua opinião" sem âncora no conteúdo. Uma pergunta sincera, que exige do leitor uma experiência específica ligada ao post, NÃO é bait.

Contexto para os issues (não são dimensões e não devem alterar as notas):
- Tamanho alvo do post: ${range.label}, entre ${range.min} e ${range.max} chars (${range.hint}). O post tem ${draft.length}.
- Link http(s) no corpo reduz alcance no LinkedIn; o lugar dele é o primeiro comentário.
</diagnostico>

<output_instructions>
A ORDEM DAS CHAVES É DELIBERADA: primeiro o diagnóstico, depois as quatro dimensões, e a nota holística POR ÚLTIMO. Emitir "overall" antes faria você ancorar numa nota geral e ajustar as dimensões para caber nela — a ordem existe para que a holística seja consequência do que você já avaliou.

Você NÃO decide aprovação. A regra de aceitação é aplicada em código — média ponderada das quatro dimensões ≥ ${ACCEPT_COMPOSITE_MIN} (clareza e relevância pesam mais), reprovando também quando duas dimensões caem abaixo de ${ACCEPT_MIN} e uma delas é clareza ou relevância. Sua tarefa é pontuar; não tente mirar o limiar.

Responda APENAS com JSON válido, sem markdown ou code fences, exatamente nesta ordem:
{
  "issues": [{"dimension": "clarity|relevance|professional|engagement|format", "anchor": 1-5 ou null, "text": "..."}],
  "suggestions": ["..."],
  "hasEngagementBait": true/false,
  "clarity": 1-5,
  "relevance": 1-5,
  "professional": 1-5,
  "engagement": 1-5,
  "overall": 1-5
}
</output_instructions>`;

  return prompt;
}