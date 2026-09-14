# 05 · Rubric and acceptance rule

[Index](README.md) · [Researcher](01-researcher.md) · [Analyst](02-analyst.md) · [Writer](03-writer.md) · [Critic](04-critic.md) · **Rubric**  
🌐 [Portuguese original](../05-rubrica-e-regra-de-aceitacao.md)

The rubric is the instrument shared by the Critic and the human raters. This is a translation of the Portuguese original, which is generated from `src/app/MAS/lib/rubric.ts` — the same file that feeds the Critic prompt. The wording matches the rubric table in the paper's appendix.

Rubric version: `v2`.

## Scale

| Point | Label |
|---|---|
| 1 | Very poor |
| 2 | Poor |
| 3 | Acceptable |
| 4 | Good |
| 5 | Excellent |

## Dimensions

### Clarity and readability (`clarity`)

**Question:** Is the post clear, understandable, well structured and easy to read?

**Weight in the composite:** 0.35

| Point | Anchor |
|---|---|
| 1 · Very poor | Confusing. Dense block or overly long sentences; the central idea cannot be identified. |
| 2 · Poor | Hard to follow. Weak structure, requires re-reading; the idea only appears at the end (or not at all). |
| 3 · Acceptable | Understandable with average effort. Acceptable structure, but some passages are dense, truncated or repetitive. |
| 4 · Good | Clear and well organized. Fluent reading, central idea evident early, line breaks help. |
| 5 · Excellent | Exceptionally clear. Each paragraph advances the idea, rhythm and formatting serve the reader, nothing is superfluous. |

### Relevance and informational value (`relevance`)

**Question:** Does the post deliver meaningful, substantive information appropriate for a professional audience, and does it fulfil the intent of the topic?

**Weight in the composite:** 0.35

| Point | Anchor |
|---|---|
| 1 · Very poor | No value or off-topic. Informs nothing and/or does not address the intent of the topic. |
| 2 · Poor | Generic. Common sense and broad claims without substance; only grazes the topic. |
| 3 · Acceptable | Correct but predictable information. Covers the basics of the topic without adding much for people in the field. |
| 4 · Good | Substantive. Provides a data point, example or useful distinction and addresses the intent of the topic well. |
| 5 · Excellent | High value. Non-obvious, specific and actionable insight for the professional audience. |

### Professional appropriateness (`professional`)

**Question:** Are the tone, language and presentation appropriate for a professional social network and the intended audience?

**Weight in the composite:** 0.15

| Point | Anchor |
|---|---|
| 1 · Very poor | Inappropriate. Offensive, sensationalist, jarringly informal, or aggressively promotional. |
| 2 · Poor | Out of place. Exaggeration, clickbait, empty marketing jargon, excessive emojis or punctuation. |
| 3 · Acceptable | Acceptable. Nothing improper, but the register fluctuates or sounds impersonal and generic ("AI text"). |
| 4 · Good | Appropriate. Consistent and authentic professional tone, language suited to the audience. |
| 5 · Excellent | Exemplary. Credible and natural professional voice, calibrated to the audience, free of clichés. |

### Engagement quality (`engagement`)

**Question:** Does the post attract attention, sustain interest and encourage appropriate professional interaction?

**Weight in the composite:** 0.15

| Point | Anchor |
|---|---|
| 1 · Very poor | Does not hold attention. Opening without a hook and nothing to sustain reading; or asks for interaction artificially. |
| 2 · Poor | Weak. Slow start and interest drops midway; generic invitation such as "what do you think?". |
| 3 · Acceptable | Average. Functional opening, keeps the reader until the end, invitation present but not very specific. |
| 4 · Good | Good. Scroll-stopping opening, sustained interest, invitation anchored in the content of the post. |
| 5 · Excellent | Excellent. The first line compels reading on, tension is maintained, and the invitation draws on a specific experience of the reader. |

### Overall quality (`overall`)

**Question:** All things considered, what is the overall quality of this post?

No per-point anchors. It is asked last and is not part of the acceptance rule.

## Acceptance rule

The decision is computed in code rather than requested from the model. A post is **accepted** when both conditions hold:

1. **Composite ≥ 3.5**, the composite being the weighted mean
   0.35 × clarity and readability + 0.35 × relevance and informational value + 0.15 × professional appropriateness + 0.15 × engagement quality.
2. **No floor violation:** the post is rejected if two dimensions fall below 3 and at least one of them is clarity or relevance.

Length outside the range, an external link in the body and an artificial request for engagement do not change the scores. They are separate conformance checks, which also send the draft back to the Writer.

---

[Index](README.md) · [Researcher](01-researcher.md) · [Analyst](02-analyst.md) · [Writer](03-writer.md) · [Critic](04-critic.md) · **Rubric**  
🌐 [Portuguese original](../05-rubrica-e-regra-de-aceitacao.md)
