# Solera: Human-in-the-Loop Multi-Agent Content Generation

Code, data, and figures accompanying **A Human-in-the-Loop Multi-Agent Architecture for Social Media Content Generation** (ICAART 2027).

Solera writes professional LinkedIn posts with five agents: Researcher, Analyst, Writer, Critic, and Publisher. A stateful LangGraph workflow coordinates them. An LLM-based Critic scores each draft on a four-dimension rubric, an acceptance rule computed in code decides whether the draft is rewritten or forwarded, and a human reviewer approves every post before publication.

The study compares the Critic with 19 human evaluators on ten generated posts. The Critic's scores were close to the mean human ratings but nearly constant across posts, so its exact agreement with individual evaluators (30.9%) did not exceed the level expected from the score distributions (31.2%). The Critic was stable across repeated runs and rejected 80% of truncated posts. A revision of its prompt alone changed 9 of the 10 acceptance decisions.

The figures and tables below follow the order in which they appear in the paper, each with a description based on the paper's text. Figure 1, the pipeline overview, is in the paper. The sections link to the prompts, data, and scripts behind the results.

## Architecture

The Researcher collects sources through web search (Tavily), the Analyst extracts the main insights, the Writer drafts the post, and the Critic scores it and suggests revisions. The agents are nodes of a LangGraph `StateGraph` and do not call one another: each node reads the shared state and returns a partial update, and conditional edges decide where execution goes next. The Critic never decides whether a post is accepted; that decision is computed in code. A rejected draft returns to the Writer for at most three automatic rewrites. A draft that passes, or exhausts its rewrites, waits for the human reviewer. While it waits, the workflow is suspended with `interrupt()` and its state is persisted, so the run resumes from the same point.

| Agent | Role | Model in the study | Temperature | Prompt |
|---|---|---|---:|---|
| Researcher | Searches recent sources on the topic | GPT-4o | 0.3 | [prompt](prompts/en/01-researcher.md) |
| Analyst | Filters the sources and extracts 3 to 5 insights | GPT-4o | 0.3 | [prompt](prompts/en/02-analyst.md) |
| Writer | Writes the post and the requested rewrites | GPT-4o / GPT-4o-mini | 0.9 | [prompt](prompts/en/03-writer.md) |
| Critic | Scores the post and lists what to improve | GPT-4.1 | 0.1 | [prompt](prompts/en/04-critic.md) |
| Human reviewer | Approves, requests changes, or cancels | | | |
| Publisher | Publishes the approved post on LinkedIn | | | |

The prompts ran in Brazilian Portuguese. The [originals](prompts/README.md) and their [English translations](prompts/en/README.md) are generated from the system itself.

## Human-in-the-Loop checkpoint

After the Critic stage, a human reviewer inspects the post with the Critic's scores and either approves it, which forwards it to the Publisher, or returns it with free-text feedback, which routes it back to the Writer. The revised version passes through the Critic again before returning to the reviewer, for at most three revision cycles.

**Figure - Free-text feedback after review, which routes the post back to the Writer.**

![Free-text feedback after review](figures/hitl-feedback.png)

The pipeline panel on the left shows the status of each agent; the HITL node is awaiting review and the Publisher is pending. On the right, the reviewer sees the draft together with the Critic's scores (Clarity 4/5, Relevance 3/5, Professional Appropriateness 4/5, Engagement 3/5, Overall 3/5) and the counters of automatic rewrites and human revisions, each limited to three. The reviewer can publish the post, cancel the run, or write what needs to change; here the request is to turn the post into a list of its most important points, which sends it back to the Writer. In the interface, the Critic appears as Judge.

**Figure - Example of the Human-in-the-Loop interaction and workflow execution.**

![Human-in-the-Loop interaction](figures/hitl-revision.png)

The same run after the requested revision. The Writer rewrote the post as a list and the Critic scored it again; the counters show two automatic rewrites and one human revision before the draft returned to the reviewer, who can again publish it, request another revision, or cancel. While the run waits for the reviewer, its state stays persisted, so it resumes from the same point. The screenshots come from an illustrative run, not from one of the ten evaluated posts.

## Critic rubric and acceptance rule

**Table - Quality criteria and scoring rubric used by the Critic agent and human evaluators (translated from Brazilian Portuguese).**

| Criterion | Evaluation question | Scoring rubric (1-5) |
|---|---|---|
| Clarity and Readability | Is the post clear, understandable, well structured and easy to read? | **(1) Very poor:** Confusing; dense block or overly long sentences, with no identifiable central idea.<br>**(2) Poor:** Hard to follow; weak structure and requires re-reading; the idea appears only at the end or not at all.<br>**(3) Acceptable:** Understandable with average effort; acceptable structure, but some passages are dense, truncated, or repetitive.<br>**(4) Good:** Clear and well organized; fluent reading, central idea evident early, and line breaks support readability.<br>**(5) Excellent:** Exceptionally clear; each paragraph advances the idea, rhythm and formatting serve the reader, and nothing is superfluous. |
| Relevance and Informational Value | Does the post deliver meaningful, substantive information appropriate for a professional audience, and does it fulfil the intent of the topic? | **(1) Very poor:** No value or off-topic; provides no information and/or does not address the topic's intent.<br>**(2) Poor:** Generic; relies on common sense or broad claims without substance and only marginally addresses the topic.<br>**(3) Acceptable:** Correct but predictable; covers the basics without adding much value for people in the field.<br>**(4) Good:** Substantive; provides a data point, example, or useful distinction and addresses the topic's intent well.<br>**(5) Excellent:** High value; provides a non-obvious, specific, and actionable insight for the professional audience. |
| Professional Appropriateness | Are the tone, language and presentation appropriate for a professional social network and the intended audience? | **(1) Very poor:** Inappropriate; offensive, sensationalist, jarringly informal, or aggressively promotional.<br>**(2) Poor:** Out of place; uses exaggeration, clickbait, empty marketing jargon, excessive emojis, or punctuation.<br>**(3) Acceptable:** Nothing improper, but the register fluctuates or sounds impersonal and generic.<br>**(4) Good:** Appropriate; consistent and authentic professional tone with language suited to the audience.<br>**(5) Excellent:** Exemplary; credible and natural professional voice, calibrated to the audience and free of clichés. |
| Engagement Quality | Does the post attract attention, sustain interest and encourage appropriate professional interaction? | **(1) Very poor:** Does not hold attention; no effective opening or sustained interest, or artificially requests interaction.<br>**(2) Poor:** Weak; slow start and declining interest, with a generic invitation such as 'what do you think?'.<br>**(3) Acceptable:** Average; functional opening and sufficient interest to reach the end, but the invitation is not very specific.<br>**(4) Good:** Attention-grabbing opening, sustained interest, and an invitation anchored in the post's content.<br>**(5) Excellent:** The first line compels continued reading, tension is maintained, and the invitation draws on a specific reader experience. |

Every point of the 1-5 scale has a verbal anchor. Clarity and Readability is motivated by the role of message characteristics in reactions to posts in professional groups; Relevance and Informational Value and Professional Appropriateness by evidence on what LinkedIn users post and engage with; and Engagement Quality by work on engagement factors on LinkedIn. The Critic receives the topic and the post but not the research sources, so factual accuracy is not assessed. For each dimension it gives a score with observations and suggestions, and each issue it reports is tagged with a dimension and a scale point; a check in code lowers a score that is higher than the worst point cited for that dimension if the Critic does not resolve the contradiction when asked once. The Critic then gives a holistic Overall Quality score, last and without per-point anchors, which does not enter the acceptance rule. The [original rubric](prompts/05-rubrica-e-regra-de-aceitacao.md) is in Portuguese.

**Acceptance rule.** The decision between Writer revision and human review is computed in code, not elicited from the model. A post is accepted by the automated gate when the composite `0.35 Cla + 0.35 Rel + 0.15 Pro + 0.15 Eng` is at least 3.5 and no two dimensions score below 3 with at least one of them being Clarity or Relevance. Length, external links, and engagement bait are checked separately for reporting and do not affect routing.

## Evaluation protocol

The pipeline generated ten LinkedIn posts in Brazilian Portuguese on different topics, and the Critic accepted all of them at the first pass. Nineteen evaluators (computer engineering students, software developers, and teachers, all of them LinkedIn users) rated each post on the four rubric questions and Overall Quality. They were asked to judge each dimension independently and not to assess factual accuracy; the posts were not presented as AI-generated, and the Critic's scores were not disclosed. Each evaluator gave 50 ratings, 950 in total. Each post was also scored five more times by the stored Critic configuration and once more after truncation. The pipeline was then run again on the same topics with Claude Sonnet 5 and Gemini 3.8 Flash as the Writer.

**Table - Evaluated posts: requested topic (translated), length in characters, stored Critic scores (Clarity, Relevance, Professional Appropriateness, Engagement, Overall) and mean human score per dimension.**

| Post | Requested topic (translated) | Chars | Critic | Cla | Rel | Pro | Eng | Ov |
|---|---|---:|:---:|---:|---:|---:|---:|---:|
| A | What is technical debt and how can it be explained to non-technical people? | 896 | 4,3,4,4,3 | 4.2 | 3.9 | 4.0 | 3.6 | 3.9 |
| J | Junior programmers will no longer be hired from 2027 onwards | 1361 | 4,3,4,3,3 | 4.2 | 4.3 | 4.2 | 4.2 | 4.2 |
| D | Legacy code that nobody wants to touch and nobody manages to replace | 1867 | 4,4,4,4,4 | 4.0 | 3.9 | 4.2 | 3.8 | 3.8 |
| L | Why do retrospective meetings change nothing? | 1686 | 4,3,5,3,3 | 3.9 | 3.7 | 4.2 | 3.6 | 3.7 |
| F | Technical certifications have lost value in hiring processes | 1227 | 4,3,4,3,3 | 3.8 | 3.6 | 3.9 | 3.8 | 3.8 |
| P | A college degree is no longer of any use in the job market | 1197 | 4,4,4,4,4 | 3.8 | 3.8 | 3.7 | 3.5 | 3.7 |
| I | Artificial intelligence will transform the future of work | 1309 | 4,3,4,3,3 | 3.7 | 3.9 | 3.6 | 3.7 | 3.9 |
| E | How to double a development team's productivity in 30 days? | 938 | 4,3,4,3,3 | 3.9 | 3.5 | 3.9 | 3.4 | 3.6 |
| H | What is the future of programming? | 1555 | 4,3,4,3,3 | 3.7 | 3.5 | 3.7 | 3.5 | 3.6 |
| C | Daily stand-up meetings have become an empty ritual in most tech teams | 1183 | 4,3,4,3,3 | 4.2 | 3.7 | 4.2 | 3.7 | 3.9 |

The Critic scores were generally close to the mean human ratings, but varied much less across posts. It assigned Clarity and Readability a 4 to all ten posts, while the human means ranged from 3.7 to 4.2, and similar concentration occurred in the other dimensions. Six of the ten posts received a composite of exactly 3.50, the acceptance threshold. The mean human score for a post ranged only from 3.42 to 4.26.

Records: [Post texts and metadata](study/data/corpus.csv) · [Critic scores of the rated posts](study/data/critic-scores.csv) · [Questionnaire responses](study/data/form-responses.xlsx) · [Post-letter mapping](study/data/mapping-corpus.csv).

## Critic-human agreement and human reliability

**Table - Exact and within-one (±1) agreement between pairs of human evaluators, between the Critic and human evaluators, and expected by chance for Critic-human comparisons given the observed score distributions.**

| Dimension | H-H exact | H-H ±1 | C-H exact | C-H ±1 | Chance exact | Chance ±1 |
|---|---:|---:|---:|---:|---:|---:|
| Clarity and Readability | 32.5% | 71.5% | 40.0% | 90.0% | 40.0% | 90.0% |
| Relevance and Informational Value | 27.5% | 66.6% | 21.1% | 66.3% | 19.9% | 65.4% |
| Professional Appropriateness | 30.9% | 74.2% | 41.1% | 88.9% | 41.3% | 89.1% |
| Engagement Quality | 25.7% | 64.4% | 21.6% | 66.8% | 23.6% | 67.7% |
| **Four dimensions** | **29.1%** | **69.2%** | **30.9%** | **78.0%** | **31.2%** | **78.0%** |
| 95% CI | 21.7% to 37.3% | 56.3% to 81.3% | 22.3% to 39.9% | 66.8% to 87.7% | | |
| Overall Quality | 27.4% | 67.4% | 22.6% | 67.9% | 23.3% | 67.7% |

H-H compares every pair of evaluators on each post (1,710 pairs per dimension), and C-H compares the Critic with each evaluator on each post (190 comparisons per dimension). Confidence intervals come from a percentile bootstrap that resamples both posts and evaluators. Critic-human exact agreement was only slightly higher than human-human agreement and close to what the score distributions alone would produce: the observed minus expected difference ranged from −3.1 to +2.7 percentage points. A constant predictor assigning the most frequent human score, 4, in every dimension would reach 37.9%, more than the Critic. Because the scores concentrate on a few values, within-one agreement is high (78.0%) but equal to the chance level. For human-human pairs, chance exact agreement is 29.0%, almost exactly the observed 29.1%.

**Figure - Distribution of human evaluators' ratings for each post and quality criterion (n = 19).**

![Distribution of human ratings](figures/human-ratings-distribution.png)

Each stacked bar shows how many evaluators assigned each score on the 1-5 scale to one post, from 1 (very poor, dark red) to 5 (excellent, dark green); letters are post identifiers. Ratings of 4 and 5 dominate every post, and the bars of different posts look alike. Differences between posts accounted for only 2% to 4% of the variation in human scores, against 41% to 44% for differences between evaluators, so the ratings say more about who rated than about which post was rated, which leaves little separation between posts for the Critic to reproduce. Excluding the two evaluators who gave the minimum score to at least half of their ratings did not change this: Critic-human exact agreement was 32.6%, against 32.9% expected from the score distributions.

**Table - Score levels and association.**

| Dimension | Human M (SD) | Critic M (SD) | Bias [95% CI] | MAE | κw | ρ | α (humans) |
|---|---:|---:|---:|---:|---:|---:|---:|
| Clarity and Readability | 3.94 (1.10) | 4.00 (0.00) | +0.06 [−0.28, +0.44] | 0.76 | 0.00 | n/a | −0.02 |
| Relevance and Informational Value | 3.79 (1.18) | 3.20 (0.42) | −0.59 [−1.03, −0.13] | 1.14 | 0.02 | 0.22 | −0.01 |
| Professional Appropriateness | 3.96 (1.06) | 4.10 (0.32) | +0.14 [−0.22, +0.52] | 0.75 | 0.04 | 0.47 | 0.00 |
| Engagement Quality | 3.69 (1.23) | 3.30 (0.48) | −0.39 [−0.88, +0.10] | 1.14 | −0.01 | −0.04 | −0.01 |
| Overall Quality | 3.82 (1.12) | 3.20 (0.42) | −0.62 [−1.05, −0.15] | 1.11 | −0.01 | −0.17 | −0.03 |

M (SD) is the mean and standard deviation over all ratings, and bias is Critic minus human. κw is the quadratic weighted kappa, ρ the Spearman correlation between the Critic score and the mean human score per post (n = 10; n/a when the Critic gave all posts the same score), and α Krippendorff's ordinal alpha among evaluators. The Critic was lower than the human means by 0.59 points for Relevance and 0.62 for Overall Quality, and within 0.06 and 0.14 points for Clarity and Professional Appropriateness, but its standard deviations were much smaller. Weighted kappa near zero and low-to-moderate or undefined correlations indicate limited post-level correspondence, and α between −0.03 and 0.00 shows that the evaluators did not agree with one another either.

Records: [Agreement analysis](study/analysis/form_agreement.py) · [Questionnaire responses](study/data/form-responses.xlsx) · [Critic scores](study/data/critic-scores.csv).

## Critic stability and response to degraded posts

In five repeated runs of the stored Critic configuration, the score matched the stored one in 100% of cases for Clarity and Relevance, 86% for Professional Appropriateness, 92% for Engagement, and 94% for Overall Quality (mean within-post SD at most 0.10), and never differed by more than one point. The acceptance decision changed across runs for one post (H), whose composite moved between 3.50 and 3.35. When each post was truncated, the Critic rejected 80% of them: mean Engagement fell from 3.38 to 2.20 and Clarity from 4.00 to 3.30, while Relevance changed little (3.20 to 2.90). The low agreement with the evaluators is therefore not due to run-to-run instability: the Critic is stable and responds to substantial degradation, but varies little across intact posts.

Records: [Repeated runs and truncation control](study/data/critic-repeat.csv) · [Script that produced them](scripts/study-critic-form.ts).

## Writer comparison and prompt sensitivity

**Figure - Critic scores for the ten topics written by three Writers.**

![Writer comparison](figures/writer-comparison.png)

Panel (a) shows the mean score per dimension under the current Critic prompt, with 95% bootstrap intervals over posts. Panel (b) shows the composite score per post; the horizontal line is the acceptance threshold (3.5). The open gray circles are the original scores of the human-rated GPT posts, and the filled markers use the current prompt (`e34fee1d`), so the distance between an open circle and the blue dot of the same post is the effect of the prompt revision alone. Claude and Gemini are above the threshold on all ten topics, with mean paired differences of +1.12 and +1.29 over the GPT posts. On the same GPT texts, the prompt revision lowered every dimension (Professional Appropriateness by 1.10, Relevance by 0.60) and changed the acceptance decision for 9 of the 10 posts.

**Table - Critic scores per Writer: accepted posts, mean composite with 95% bootstrap interval, and mean per dimension.**

| Writer | Accepted | Composite [95% CI] | Cla | Rel | Pro | Eng | Overall |
|---|---:|---:|---:|---:|---:|---:|---:|
| GPT-4o / GPT-4o-mini (original Critic prompt) | 10/10 | 3.63 [3.53, 3.75] | 4.0 | 3.2 | 4.1 | 3.3 | 3.2 |
| GPT-4o / GPT-4o-mini | 1/10 | 3.07 [2.87, 3.27] | 3.6 | 2.6 | 3.0 | 3.0 | 2.6 |
| Claude Sonnet 5 | 10/10 | 4.20 [4.03, 4.33] | 4.3 | 4.0 | 4.5 | 4.1 | 4.1 |
| Gemini 3.8 Flash | 10/10 | 4.36 [4.25, 4.46] | 4.6 | 4.0 | 5.0 | 4.0 | 4.0 |

The first row uses the original Critic prompt; the other rows share the current one. All Claude and Gemini posts were accepted, against one GPT post under the current prompt, and the difference between Gemini and Claude was smaller (+0.16, from −0.03 to +0.37). Within each Writer, the Critic again produced nearly constant scores: Relevance was 4 in all of the new posts, and the ten Gemini posts received only two distinct combinations of the four scores.

Records: [Script that re-scores the corpus with the current Critic](scripts/rejudge-corpus.ts).

## Repository guide

| Material | Location |
|---|---|
| Agent prompts (Brazilian Portuguese) and English translations | [prompts/](prompts/README.md) |
| Agents, LangGraph workflow, tools, and stores | [src/app/MAS/](src/app/MAS/) |
| Web interface (runs, review, study panels) | [src/app/(dashboard)/](src/app/%28dashboard%29/) |
| Questionnaire responses, corpus, and Critic scores | [study/data/](study/data/README.md) |
| Database schema and migrations | [drizzle/](drizzle/) |
| Figures used in this README | [figures/](figures/) |

## Running locally

Solera is a Next.js application that uses PostgreSQL and the OpenAI API.

1. Install the dependencies with `pnpm install`.
2. Create a `.env.local` file with the variables below.
3. Apply the migrations in [`drizzle/`](drizzle/) to the database.
4. Run `pnpm dev`, open `http://localhost:3000`, and sign in with your LinkedIn account.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection |
| `OPENAI_API_KEY`, `LLM_MODEL` | Model access and the agents' default model |
| `TAVILY_API_KEY` or `BRAVE_API_KEY` | Web search for the Researcher |
| `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_REDIRECT_URI` | LinkedIn sign-in and publishing |
| `SESSION_SECRET` | Signs the login session |
| `LANGCHAIN_API_KEY` | Optional: run tracing in LangSmith |
| `OWNER_ID` | Identifies the owner of the runs in the study scripts |

| Command | What it does |
|---|---|
| `pnpm prompts:export` | Regenerates `prompts/` from the system |
| `pnpm study:critic-form` | Exports the Critic scores of the rated posts |
| `python study/analysis/form_agreement.py` | Reruns the analysis and the paper tables |
