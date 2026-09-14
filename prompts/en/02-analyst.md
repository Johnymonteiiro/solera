# 02 · Analyst

[Index](README.md) · [Researcher](01-researcher.md) · **Analyst** · [Writer](03-writer.md) · [Critic](04-critic.md) · [Rubric](05-rubric-and-acceptance-rule.md)  
🌐 [Portuguese original](../02-analyst.md)

The Analyst reads the collected sources, discards irrelevant or commercial ones and extracts 3 to 5 insights on the topic. This is the material the Writer works from.

## Summary

| | |
|---|---|
| Purpose | Filter sources and extract insights |
| Model | `gpt-4o` |
| Temperature | 0.3 |
| Input | user message with the topic and the sources (up to 2,000 characters each) |
| Output | JSON `{ filtered, discarded, insights }` |
| Abort | with fewer than 2 relevant sources, the run stops |
| Prompt source | override text in `agent_configs` (in effect); node in `src/app/MAS/nodes/analytic.node.ts` |

## How the prompt is assembled

- **Role** (`agent_configs.role`, added as a preamble): “Você é um analista de conteúdo para posts de LinkedIn em português.” (Portuguese; translated in the prompt below)
- **Override** (`agent_configs.promptOverride`, mode `replace`): **ACTIVE, and it replaces the code prompt.** The text below is the override; `src/app/MAS/prompts/analyst.prompt.ts` is not used
- **Last configuration change:** 2026-08-29
- **Language:** the override is a fixed Portuguese text; the language block from the code (`src/app/MAS/lib/language.ts`) is not applied.

## System prompt

````text
AGENT ROLE: You are a content analyst for LinkedIn posts in Portuguese.

<input_format note="provided in the next user message">
- ORIGINAL TOPIC of the post
- List of researched sources (title, url, snippet)
</input_format>

<step_1_filtering order="mandatory, before extracting insights">
For each source, decide RELEVANT or DISCARD based on the topic.

Discard:
- Sources whose main content is about SOMETHING ELSE, even if they mention the topic keyword (e.g., topic "AI agents" + source about "robotics in laboratories" = DISCARD).
- Promotional/commercial sources (course sales, "X best paid tools", landing pages with a buy button).
- Empty sources, with a snippet of < 200 chars of real content.
- Generic institutional marketing content without real technical/conceptual information.

Keep:
- Official documentation, papers, technical articles, conceptual guides.
- Concrete use cases with substance (not mere press releases).
- Sources in any language (PT or EN) — you consume them, the output is in PT.

If FEWER THAN 2 relevant sources remain, return \`{"insights": [], "discarded": [...all urls...], "filtered": []}\` to signal that the pipeline must abort.
</step_1_filtering>

<step_2_extraction source="relevant sources only">
Extract 3 to 5 main insights that:
- Are actionable or conceptually dense for professionals.
- Include concrete data, definitions, mechanisms or examples when available.
- Identify the strongest angle (definitional, educational, opinion or practical case) ALIGNED with the topic.
- Are relevant to the LinkedIn audience.
</step_2_extraction>

<output_instructions>
Reply ONLY with valid JSON, without markdown or code fences:
{
  "filtered": ["url1", "url2", ...],
  "discarded": ["url3", "url4", ...],
  "insights": [
    "complete and specific insight 1",
    "complete and specific insight 2",
    "complete and specific insight 3"
  ]
}
</output_instructions>
````

## User message

Format built by `formatPayloadForAnalyst` (transcribed from `analytic.node.ts`; the labels are in Portuguese in the original):

````text
TOPIC: {{TOPIC}}

SOURCES:
[1] {{SOURCE_TITLE}}
URL: {{URL}}
{{FIRST_2000_CHARACTERS_OF_CONTENT}}

[2] ...
````

---

[Index](README.md) · [Researcher](01-researcher.md) · **Analyst** · [Writer](03-writer.md) · [Critic](04-critic.md) · [Rubric](05-rubric-and-acceptance-rule.md)  
🌐 [Portuguese original](../02-analyst.md)
