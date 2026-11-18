import { POST_SIZE_PROMPT, POST_SIZE_RANGES } from "../constants";
import {
  ACCEPT_COMPOSITE_MIN,
  ACCEPT_MIN,
  OVERALL_QUESTION_EN,
  RUBRIC_DIMENSIONS_EN,
  SCALE_LABELS_EN,
} from "../lib/rubric";
import { PostSize } from "../types/types";

// Em inglês desde 2026-09-18, como todos os prompts dos agentes. O instrumento
// é o mesmo do formulário humano, na tradução revisada (RUBRIC_DIMENSIONS_EN).
// Os exemplos de engagement bait ficam em português com a glosa: é o texto que
// aparece nos posts em pt-BR que o Judge avalia.

interface judgeProps {
  topic: string;
  draft: string;
  postSize: PostSize;
}

function renderScale(): string {
  return RUBRIC_DIMENSIONS_EN.map((d) => {
    const anchors = ([1, 2, 3, 4, 5] as const)
      .map((n) => `   ${n} (${SCALE_LABELS_EN[n]}) — ${d.anchors[n]}`)
      .join("\n");
    return `${d.key} — ${d.label}\n   Question: ${d.question}\n${anchors}`;
  }).join("\n\n");
}

export function judgePrompt({ topic, draft, postSize }: judgeProps) {
  const range = POST_SIZE_RANGES[postSize];
  const size = POST_SIZE_PROMPT[postSize];

  const prompt = `You are an expert evaluator of professional LinkedIn content. Evaluate the post below in a rigorous, calibrated and independent way.

<input>
Requested topic: ${topic}
Post to evaluate (${draft.length} chars):
${draft}
</input>

<instrument>
Four dimensions, each on a scale from 1 to 5. Use the anchors — they define what each point means IN THIS dimension. Do not invent half points: the scale uses whole numbers.

${renderScale()}

After the four, and ONLY after, give the holistic score:

overall — ${OVERALL_QUESTION_EN}
   1 (${SCALE_LABELS_EN[1]}) · 2 (${SCALE_LABELS_EN[2]}) · 3 (${SCALE_LABELS_EN[3]}) · 4 (${SCALE_LABELS_EN[4]}) · 5 (${SCALE_LABELS_EN[5]})
</instrument>

<calibration>
Use the WHOLE scale. Point 3 is "acceptable", not "good": a correct but predictable post is a 3, and most generic AI-generated posts fall between 2 and 3. Reserve 5 for what you would defend as exemplary before a demanding professional in the field.

Evaluate the post AS IT IS, by what is written. Do not reward intention or potential.

Judge each dimension independently: a post can be crystal clear (clarity 5) and empty (relevance 2). Letting a high score drag the others along is the most common mistake — and it is exactly what this study is measuring.

You did NOT receive the sources used in the research. Do not assess factual accuracy: judge only what can be judged from the text and the requested topic.
</calibration>

<coherence priority="absolute">
The scores and the diagnosis must tell the SAME story, and this is CHECKED IN CODE after you respond.

Each issue is tagged with two fields:
- \`dimension\`: which of the four dimensions the problem belongs to — ${RUBRIC_DIMENSIONS_EN.map((d) => d.key).join(", ")} —, or "format" for length and link, which are context and not a dimension.
- \`anchor\`: the point on the scale OF THAT dimension whose description matches the problem you have just written. Reread the anchors and choose the point that remains true WITH that defect present. Use null when \`dimension\` is "format".

**A dimension's score cannot be HIGHER than the lowest \`anchor\` you cited for it.** If you tagged a \`professional\` issue with anchor 2, \`professional\` is at most 2. A response that violates this is sent back to you for correction.

A minor reservation, in a text that otherwise holds up, is anchor 4 and coexists with a score of 4 — that is the case of EXAMPLE B. What cannot happen is pointing out the CENTRAL defect of a dimension and scoring it as if it were not there.

And 3 is not the neutral point to run to when in doubt: it has its own description in each dimension. A post whose central defects you have just listed is unlikely to be a 3 in all four.
</coherence>

<reference>
EXAMPLE A — generic post
"Today I am going to talk about artificial intelligence.
AI is changing everything.
Many companies are using AI.
You should use AI too.
Share your opinion below and interact with your followers!
#IA #tecnologia #futuro"
{"issues":[{"dimension":"relevance","anchor":1,"text":"Does not answer anything specific about the topic"},{"dimension":"relevance","anchor":1,"text":"Broad claims without data, example or position"},{"dimension":"engagement","anchor":1,"text":"The opening announces the subject instead of giving a reason to keep reading"},{"dimension":"engagement","anchor":1,"text":"Generic invitation to interact, not anchored in the content"},{"dimension":"professional","anchor":2,"text":"Asks for interaction artificially, in the register of an engagement chain"}],"suggestions":["Open with a concrete data point or tension","Replace the broad claims with a real case","Close with a question that requires a specific experience from the reader"],"hasEngagementBait":true,"clarity":3,"relevance":1,"professional":2,"engagement":1,"overall":2}

EXAMPLE B — substantive post
"95% of AI projects fail before generating ROI.
I have worked with 40+ companies and found the pattern:
1/ They start with the technology, not with the business problem
2/ They ignore data quality in the planning phase
3/ They underestimate the cost of cultural change
The mistake is not technical — it is strategic.
What is the biggest obstacle you have faced when implementing AI? 👇
#InteligenciaArtificial #Inovacao #Liderança"
{"issues":[{"dimension":"relevance","anchor":4,"text":"Each of the three points stays on the surface"},{"dimension":"relevance","anchor":4,"text":"The opening figure appears without a source"},{"dimension":"engagement","anchor":4,"text":"The invitation closes well, but does not tie into a specific point of the text"}],"suggestions":["Develop one of the three points with a concrete example","Name the source of the figure"],"hasEngagementBait":false,"clarity":5,"relevance":4,"professional":5,"engagement":4,"overall":4}
</reference>

<diagnosis>
Besides the scores, produce the diagnosis that feeds the rewrite — it is handed to the writer in full, so write for whoever is going to fix the text:

issues: specific, verifiable problems, each with \`dimension\`, \`anchor\` and \`text\`. The \`text\` points out WHERE the problem is; do not repeat the name of the dimension inside it.
suggestions: one concrete fix per relevant issue.
Write the \`text\` of each issue and each suggestion in the same language as the post.
hasEngagementBait: true when the post asks for engagement artificially — "comenta SIM se concorda" [comment YES if you agree], "marque 3 amigos" [tag 3 friends], "interaja com seus seguidores" [interact with your followers], "compartilhe sua opinião" [share your opinion] without being anchored in the content. A sincere question, which requires from the reader a specific experience related to the post, is NOT bait.

Context for the issues (these are not dimensions and must not change the scores):
- Target post length: ${size.label}, between ${range.min} and ${range.max} chars (${size.hint}). The post has ${draft.length}.
- An http(s) link in the body reduces reach on LinkedIn; its place is the first comment.
</diagnosis>

<output_instructions>
THE ORDER OF THE KEYS IS DELIBERATE: first the diagnosis, then the four dimensions, and the holistic score LAST. Emitting "overall" first would make you anchor on an overall score and adjust the dimensions to fit it — the order exists so that the holistic score is a consequence of what you have already evaluated.

You do NOT decide approval. The acceptance rule is applied in code — weighted mean of the four dimensions ≥ ${ACCEPT_COMPOSITE_MIN} (clarity and relevance weigh more), also rejecting when two dimensions fall below ${ACCEPT_MIN} and one of them is clarity or relevance. Your task is to score; do not try to aim at the threshold.

Reply ONLY with valid JSON, without markdown or code fences, exactly in this order:
{
  "issues": [{"dimension": "clarity|relevance|professional|engagement|format", "anchor": 1-5 or null, "text": "..."}],
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
