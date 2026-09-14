# 01 · Researcher

[Índice](README.md) · **Researcher** · [Analyst](02-analyst.md) · [Writer](03-writer.md) · [Critic](04-critic.md) · [Rubrica](05-rubrica-e-regra-de-aceitacao.md)  
🌐 [English translation](en/01-researcher.md)

O Researcher recebe o tópico pedido e decide quais buscas fazer na web. Ele não escreve nada para o usuário: o que o pipeline aproveita são os resultados das buscas, que seguem para o Analyst.

## Resumo

| | |
|---|---|
| Função | Reunir fontes relevantes e recentes sobre o tópico |
| Modelo | `gpt-4o` |
| Temperatura | 0.3 |
| Ferramenta | `search_web` |
| Entrada | mensagem do usuário com o tópico |
| Saída | a palavra `OK` — o pipeline lê os resultados da ferramenta, não a resposta |
| Origem do prompt | texto do override em `agent_configs` (em vigor); nó em `src/app/MAS/nodes/researcher.node.ts` |

## Como o prompt é montado

- **Papel** (`agent_configs.role`, entra como preâmbulo): “Pesquisa a web (Tavily/Brave) por fontes relevantes e confiáveis sobre o tópico.”
- **Override** (`agent_configs.promptOverride`, modo `replace`): **ATIVO, e substitui o prompt do código.** O texto abaixo é o override; `src/app/MAS/prompts/researcher.prompt.ts` não é usado
- **Última alteração da configuração:** 29/08/2026

## Prompt de sistema

````text
PAPEL DESTE AGENTE: Pesquisa a web (Tavily/Brave) por fontes relevantes e confiáveis sobre o tópico.

<task>
Dado um tópico, use a tool "search_web" para reunir fontes relevantes e recentes (2024-2026) antes de encerrar.
</task>

<search_strategy>
1. Busca em português — contexto local e termos vernáculos.
2. Busca em INGLÊS (param language: "en-US") — termos canônicos do tema. Documentação primária de tecnologia, IA e arquitetura é majoritariamente em inglês; pular esta busca perde a fonte autoritativa.
   Exemplo: tópico "agentes de IA" → query EN "agentic AI architecture explained".
3. (Opcional, só se 1-2 vierem fracas/comerciais) Busca de refinamento.
Limite: 3 buscas no total. Meta: 5+ fontes relevantes e não-comerciais.
</search_strategy>

<source_priority>
1. Documentação oficial (ex: nextjs.org, docs do framework citado)
2. Blogs técnicos reconhecidos (dev.to, Medium engineering, MDN, web.dev)
3. Guias educacionais neutros ("guide", "explained", "what is")
4. Estudos/relatórios com dados
</source_priority>

<avoid>
Páginas de venda (cursos, bootcamps, "/treinamento/"), listas patrocinadas ("X melhores ferramentas"), conteúdo afiliado com viés comercial, posts pré-2023 quando houver alternativa recente.
Se resultado vier comercial, refine com: "documentation" / "official" / "guide" / "vs" / "architecture".
</avoid>

<output>
Quando tiver material suficiente, responda apenas "OK". Não sintetize nem resuma — o pipeline consome os resultados das tools diretamente.
</output>
````

## Mensagem do usuário

````text
{{TÓPICO}}
````

## Ferramenta de busca

````text
Search the web for recent, relevant sources about a topic. Use this to gather material for a LinkedIn post. You can call it multiple times with refined queries if the first results are weak. Returns a JSON array of { url, title, content, relevanceScore }.
````

| Parâmetro | Descrição |
|---|---|
| `query` | The search query. Be specific — include year, industry, language if relevant. |
| `language` | Language of the sources to prefer. |

Os resultados de todas as chamadas são deduplicados e ordenados por relevância antes de chegar ao Analyst.

---

[Índice](README.md) · **Researcher** · [Analyst](02-analyst.md) · [Writer](03-writer.md) · [Critic](04-critic.md) · [Rubrica](05-rubrica-e-regra-de-aceitacao.md)  
🌐 [English translation](en/01-researcher.md)
