# Agent prompts — English translation

This folder is an English translation of the [agent prompts](../README.md) of Solera and of the evaluation rubric. It accompanies the paper, which cites these prompts.

> **The Portuguese originals are the authoritative version:** they are the text the agents actually received. This translation is provided for readers who do not read Portuguese. Generated on 2026-09-14 by `pnpm prompts:export`.

## Index

| # | Agent | What it does | Model (current configuration) | Temperature |
|---|---|---|---|---|
| 01 | [Researcher](01-researcher.md) | Searches for sources on the topic | `gpt-4o` | 0.3 |
| 02 | [Analyst](02-analyst.md) | Filters the sources and extracts insights | `gpt-4o` | 0.3 |
| 03 | [Writer](03-writer.md) | Writes and rewrites the post | `gpt-4o-mini` | 0.9 |
| 04 | [Critic](04-critic.md) | Scores the post with the rubric | `gpt-4.1` | 0.1 |
| 05 | [Rubric and acceptance rule](05-rubric-and-acceptance-rule.md) | Instrument shared by the Critic and human raters | — | — |

### Shortcuts

- Researcher: [system prompt](01-researcher.md#system-prompt) · [search tool](01-researcher.md#search-tool)
- Analyst: [system prompt](02-analyst.md#system-prompt) · [user message](02-analyst.md#user-message)
- Writer: [system prompt](03-writer.md#system-prompt) · [rewrite after Critic rejection](03-writer.md#rewrite-after-critic-rejection) · [human revision](03-writer.md#human-revision-request) · [length ranges](03-writer.md#length-ranges)
- Critic: [system prompt](04-critic.md#system-prompt) · [coherence retry](04-critic.md#coherence-retry)
- Rubric: [dimensions](05-rubric-and-acceptance-rule.md#dimensions) · [acceptance rule](05-rubric-and-acceptance-rule.md#acceptance-rule)

## Translation conventions

- **Structure tags.** Tag and attribute names (`<insights>`, `<anti_padrao>`, `priority`, …) are kept exactly as in the original, some of them in Portuguese; attribute values and the text inside the tags are translated.
- **Quoted Portuguese.** Phrases that the prompts quote as examples to avoid or imitate (for instance, banned connectives such as “Além disso”) are kept in Portuguese and followed by an English gloss in brackets, because the model was instructed about those exact strings.
- **Placeholders.** Values filled in at run time are shown as English placeholders, such as `{{TOPIC}}`, `{{INSIGHTS}}` and `{{POST}}`.
- **Staleness check.** Each translated block records a hash of the Portuguese block it translates. If the original changes and the translation is not revised, the page shows a warning next to the block.

## How to read these prompts

- **Assembly.** Each system prompt starts with the agent's role (`PAPEL DESTE AGENTE: …`, “AGENT ROLE” in the translation). It is followed by the code prompt or, if set, by the override configured in the interface, which replaces the code prompt (Researcher, Analyst) or is placed before it (Writer, Critic). When this folder was generated, an override was active for: **researcher, analyst**.
- **Rendered vs. transcribed.** System prompts are rendered by the same functions the pipeline uses. The blocks that the nodes build at run time (the Writer's rewrite block, the human reviewer's request, the Critic's coherence correction) are transcribed from the code and marked as such.

## Agents without a prompt

- **Human review (HITL).** Pauses the run and shows the post and the scores to the reviewer, who can approve it, request a revision with a comment or cancel. The comment becomes the Writer's [human revision](03-writer.md#human-revision-request) block.
- **Publisher.** Publishes the approved post on LinkedIn and records the publication.

## Versions and relationship to the study

- **Critic.** The hash of the prompt generated here is `732946eb8d5147df`, identical to the one stored with the Critic scores analysed in the paper. The prompt in this folder is exactly the one that produced those scores.
- **Researcher.** The prompt in effect is the override stored in the configuration (the configuration was last saved on 2026-08-29 18:53 UTC, while the posts were being generated, but the text is identical to the file-based configuration of 2026-08-27, which predates the posts — so this is the text used for them). The text in `src/app/MAS/prompts/researcher.prompt.ts` is not used while the override exists.
- **Analyst.** The prompt in effect is the override stored in the configuration (the configuration was last saved on 2026-08-29 18:53 UTC, while the posts were being generated, but the text is identical to the file-based configuration of 2026-08-27, which predates the posts — so this is the text used for them). The text in `src/app/MAS/prompts/analyst.prompt.ts` is not used while the override exists.
- **Writer.** The prompt is the code prompt, last modified on 2026-09-08, after the study posts were generated (2026-08-29 to 2026-09-02). The main change was the output-language block, added to allow posts in English; the exact version used for the posts is not under version control.
- **Writer model.** The current configuration (`gpt-4o-mini`) was saved on 2026-08-29 18:53 UTC, while the study posts were being generated. According to the execution records, seven posts were written by `gpt-4o-2024-08-06` and three (J, L and P) by `gpt-4o-mini-2024-07-18`. The Researcher and Analyst used `gpt-4o-2024-08-06`, and the Critic used `gpt-4.1-2025-04-14`.
