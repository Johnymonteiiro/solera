# Exemplo de formulário — amostra real do estudo

Formulário de avaliação humana montado com os **6 posts reais** da amostra atual
(3 tópicos × 2 condições). Copie a PARTE 1 para o Google Forms; guarde a PARTE 2
separada — ela quebra o cego se vazar.

Regenerar depois de novas execuções: os rótulos A–F podem mudar. Baixe os textos
atualizados em `GET /api/mas/export/agent-metrics?format=posts` e a chave em
`?format=mapping`. Ver `COLETA.md`.

---

# PARTE 1 — Conteúdo do formulário (o que o avaliador vê)

## Cabeçalho

**Título:** Avaliação de qualidade de posts de LinkedIn

**Descrição:**
> Você vai ler 6 posts e avaliar cada um em 5 critérios (escala 0–10) e 2 perguntas
> Sim/Não. Leve ~10 min. Não há resposta certa — queremos sua percepção.
> Avalie cada post de forma independente, sem voltar para comparar com os anteriores.

**Pergunta 1** (texto curto, obrigatória):
> Identificador do avaliador (nome ou matrícula)

> Configuração do Forms: crie **uma seção por post**. Cole o texto num item de
> descrição (ou imagem, se quiser preservar as quebras de linha exatamente como o
> LinkedIn renderiza) e repita as 7 perguntas abaixo em cada seção.

---

## Seção A — Post A

> Cole no item de descrição da seção:

```
A inteligência artificial está transformando o mundo em 2024, mas como exatamente isso está acontecendo?

A automação de processos empresariais e a análise preditiva avançada estão no centro das tendências emergentes de IA. Essas tecnologias estão ajudando empresas a otimizar operações, reduzir custos e melhorar a eficiência, mostrando um impacto significativo nos negócios. No entanto, o setor jurídico brasileiro viu uma redução de 10,9% nos novos projetos de IA, destacando a necessidade de estratégias mais consistentes para a implementação dessas tecnologias.

No cenário global, o Reino Unido está se destacando como um líder em IA, expandindo sua contribuição econômica através de políticas de suporte e investimento contínuo. Enquanto isso, os modelos de fundação, sistemas de larga escala treinados em grandes volumes de dados, estão dominando as discussões. Eles são mais flexíveis e eficientes, aplicando conhecimentos adquiridos em um contexto para outro, superando os modelos tradicionais.

Por outro lado, a governança obrigatória de IA enfrenta resistência, mesmo quando visa mitigar riscos catastróficos. Isso reflete o desafio de equilibrar inovação com regulamentação em um campo tão dinâmico.

Como você vê o futuro da IA em sua área de atuação? Compartilhe suas experiências e insights!

#InteligenciaArtificial #AI2024 #Inovação #Tecnologia #Automação #IA
```

### Perguntas da seção A

**Escala linear 0–10:**

1. **Qualidade geral** — Nota holística: valor do conteúdo, escrita e capacidade de prender a atenção.
2. **Gancho** — As 1–2 primeiras linhas (antes do "ver mais"). Te fez parar o scroll?
3. **Originalidade** — Traz perspectiva autêntica/profunda, ou parece texto genérico de IA / clichê de "coach corporativo"?
4. **Escaneabilidade** — Dá pra "escanear" com os olhos (espaçamento, quebras, listas) antes de decidir ler?
5. **Qualidade do CTA** — A chamada para ação na última linha é específica e convida a um comentário real (vs. "o que você acha?" genérico)?

**Sim / Não:**

6. **Tem engagement bait?** — Usa táticas artificiais de "mendigagem de engajamento" ("curta se concorda", "marque 3 amigos", pedido de interação sem âncora no conteúdo)? *(Sim = ruim)*
7. **Tem link externo no corpo?** — Há link (YouTube, Medium, etc.) **dentro** do texto do post? *(Sim = penalizado pelo algoritmo)*

*(Nomes das colunas no CSV exportado: `A_overall`, `A_hook`, `A_originality`, `A_scannability`, `A_cta`, `A_bait`, `A_link`)*

---

## Seção B — Post B

> Cole no item de descrição da seção:

```
Ainda vale a pena aprender UI Design em 2026? A resposta é um sonoro sim! O campo do design de interfaces está mais vibrante e dinâmico do que nunca, impulsionado por avanços tecnológicos e uma demanda crescente por experiências digitais personalizadas.

Em 2026, o design UX/UI está profundamente integrado com tecnologias emergentes como inteligência artificial, realidade aumentada e virtual. Essas inovações estão transformando a forma como interagimos com interfaces, tornando-as mais intuitivas e adaptativas ao comportamento do usuário. Aprender UI Design agora significa estar na vanguarda dessas mudanças, criando experiências que não apenas atendem, mas superam as expectativas dos usuários.

Para entrar nesse campo, o aprendizado autodirigido combinado com mentoria pode ser uma estratégia poderosa. Ao invés de depender exclusivamente de cursos formais, explorar tutoriais práticos e participar de comunidades de design pode oferecer uma base sólida. A chave é buscar feedback estruturado e manter-se responsável pelo próprio progresso. Além disso, habilidades como pesquisa UX, wireframing, prototipagem e acessibilidade são essenciais para se destacar.

Por fim, uma dica valiosa: não subestime o poder de um portfólio bem-curado. Ele é seu cartão de visitas no mundo do design. Concentre-se em projetos que demonstrem não apenas suas habilidades técnicas, mas também sua capacidade de entender e resolver problemas do usuário.

E você, já está se preparando para as tendências de design de 2026? Compartilhe suas experiências e desafios nos comentários!

#UIDesign #UXDesign #Inovação #Tecnologia #DesignThinking #FuturoDigital
```

### Perguntas da seção B

**Escala linear 0–10:**

1. **Qualidade geral** — Nota holística: valor do conteúdo, escrita e capacidade de prender a atenção.
2. **Gancho** — As 1–2 primeiras linhas (antes do "ver mais"). Te fez parar o scroll?
3. **Originalidade** — Traz perspectiva autêntica/profunda, ou parece texto genérico de IA / clichê de "coach corporativo"?
4. **Escaneabilidade** — Dá pra "escanear" com os olhos (espaçamento, quebras, listas) antes de decidir ler?
5. **Qualidade do CTA** — A chamada para ação na última linha é específica e convida a um comentário real (vs. "o que você acha?" genérico)?

**Sim / Não:**

6. **Tem engagement bait?** — Usa táticas artificiais de "mendigagem de engajamento" ("curta se concorda", "marque 3 amigos", pedido de interação sem âncora no conteúdo)? *(Sim = ruim)*
7. **Tem link externo no corpo?** — Há link (YouTube, Medium, etc.) **dentro** do texto do post? *(Sim = penalizado pelo algoritmo)*

*(Nomes das colunas no CSV exportado: `B_overall`, `B_hook`, `B_originality`, `B_scannability`, `B_cta`, `B_bait`, `B_link`)*

---

## Seção C — Post C

> Cole no item de descrição da seção:

```
Ainda vale a pena aprender UI Design em 2026?

A resposta é um enfático sim! Em 2026, a demanda por designers de UI continua a crescer, impulsionada pela proliferação de produtos digitais, aplicativos e websites. Este campo, embora competitivo, oferece oportunidades incríveis para aqueles que estão dispostos a se atualizar continuamente com as últimas tendências e ferramentas.

Uma das tendências mais marcantes é a hiperpersonalização. Interfaces adaptadas ao contexto individual do usuário estão em alta, mas é essencial que as marcas mantenham a transparência de dados e permitam que os usuários controlem o nível de personalização. Isso não apenas melhora a experiência do usuário, mas também constrói confiança.

Além disso, o design inclusivo e a acessibilidade se tornaram padrões obrigatórios. Elementos como botões legíveis, contraste adequado e navegação por voz são essenciais para garantir que todos tenham acesso a experiências digitais de qualidade. Isso amplia o alcance das marcas e promove a inclusão.

Outra área em ascensão é a integração de realidade aumentada e virtual (RA/RV). Com 88% das empresas de médio porte investindo nessas tecnologias, o design de UI/UX que incorpora RA/RV pode aumentar significativamente as métricas de engajamento do usuário. As microinterações, como animações e feedback visual imediato, também são fundamentais para uma experiência de usuário fluida e intuitiva.

E você, já está se preparando para essas tendências? Compartilhe suas experiências e opiniões nos comentários!

#UIDesign #Acessibilidade #Hiperpersonalização #RealidadeAumentada #DesignInclusivo #Tendências2026
```

### Perguntas da seção C

**Escala linear 0–10:**

1. **Qualidade geral** — Nota holística: valor do conteúdo, escrita e capacidade de prender a atenção.
2. **Gancho** — As 1–2 primeiras linhas (antes do "ver mais"). Te fez parar o scroll?
3. **Originalidade** — Traz perspectiva autêntica/profunda, ou parece texto genérico de IA / clichê de "coach corporativo"?
4. **Escaneabilidade** — Dá pra "escanear" com os olhos (espaçamento, quebras, listas) antes de decidir ler?
5. **Qualidade do CTA** — A chamada para ação na última linha é específica e convida a um comentário real (vs. "o que você acha?" genérico)?

**Sim / Não:**

6. **Tem engagement bait?** — Usa táticas artificiais de "mendigagem de engajamento" ("curta se concorda", "marque 3 amigos", pedido de interação sem âncora no conteúdo)? *(Sim = ruim)*
7. **Tem link externo no corpo?** — Há link (YouTube, Medium, etc.) **dentro** do texto do post? *(Sim = penalizado pelo algoritmo)*

*(Nomes das colunas no CSV exportado: `C_overall`, `C_hook`, `C_originality`, `C_scannability`, `C_cta`, `C_bait`, `C_link`)*

---

## Seção D — Post D

> Cole no item de descrição da seção:

```
A inteligência artificial está redefinindo setores inteiros em 2024, desde o judiciário até o mundo dos negócios. Mas qual é o impacto real dessa transformação?

No Brasil, o Judiciário lançou 98 novos projetos de IA, um sinal claro de que a tecnologia está se tornando uma aliada essencial na eficiência dos processos judiciais. Isso demonstra um compromisso contínuo com a inovação, mesmo com uma ligeira queda em relação ao ano anterior.

No Reino Unido, a IA não é apenas uma ferramenta tecnológica, mas um motor econômico vital. Estudos recentes destacam a importância de entender a escala e o perfil do setor para guiar políticas e investimentos futuros, garantindo que o potencial econômico da IA seja plenamente explorado.

A automação de processos empresariais por meio da IA está revolucionando operações, desde o atendimento ao cliente até a gestão de inventários. Essa transformação permite decisões mais rápidas e precisas, reduzindo custos e aumentando a eficiência. Modelos de fundação, por exemplo, são sistemas de larga escala que trazem flexibilidade e eficiência, aplicando conhecimentos de um contexto para outro.

Com o avanço dos modelos de IA e a crescente competição em hardware, é crucial um monitoramento robusto e colaboração para mitigar vulnerabilidades. A IA não é apenas uma tendência; é uma força motriz que está redefinindo como vivemos e trabalhamos.

Qual foi o maior desafio que você enfrentou ao implementar IA em sua empresa? Compartilhe suas experiências!

#InteligenciaArtificial #Inovação #Automação #Tecnologia #IA2024 #FuturoDigital
```

### Perguntas da seção D

**Escala linear 0–10:**

1. **Qualidade geral** — Nota holística: valor do conteúdo, escrita e capacidade de prender a atenção.
2. **Gancho** — As 1–2 primeiras linhas (antes do "ver mais"). Te fez parar o scroll?
3. **Originalidade** — Traz perspectiva autêntica/profunda, ou parece texto genérico de IA / clichê de "coach corporativo"?
4. **Escaneabilidade** — Dá pra "escanear" com os olhos (espaçamento, quebras, listas) antes de decidir ler?
5. **Qualidade do CTA** — A chamada para ação na última linha é específica e convida a um comentário real (vs. "o que você acha?" genérico)?

**Sim / Não:**

6. **Tem engagement bait?** — Usa táticas artificiais de "mendigagem de engajamento" ("curta se concorda", "marque 3 amigos", pedido de interação sem âncora no conteúdo)? *(Sim = ruim)*
7. **Tem link externo no corpo?** — Há link (YouTube, Medium, etc.) **dentro** do texto do post? *(Sim = penalizado pelo algoritmo)*

*(Nomes das colunas no CSV exportado: `D_overall`, `D_hook`, `D_originality`, `D_scannability`, `D_cta`, `D_bait`, `D_link`)*

---

## Seção E — Post E

> Cole no item de descrição da seção:

```
Quer alcançar 1.000 seguidores rapidamente no Instagram? Aqui está o caminho.

Primeiro, defina metas claras e mensuráveis. Estabelecer um objetivo, como ganhar 1.000 seguidores em três meses, ajuda a manter o foco e a alinhar seus esforços com as prioridades do seu negócio. Isso garante que cada ação contribua para o sucesso geral.

Em seguida, utilize ferramentas de gerenciamento de redes sociais para otimizar seu planejamento e engajamento. Essas ferramentas permitem que você promova seu perfil de forma eficiente em outros canais, aumentando sua visibilidade de maneira orgânica. 

A interação com o público é essencial. Compreender o comportamento e os interesses do seu público-alvo ajuda a criar conteúdo que ressoe com eles, aumentando as chances de compartilhamento e alcance. Lembre-se, quanto mais seu conteúdo for compartilhado, mais o algoritmo do Instagram trabalhará a seu favor.

Por fim, equilibre conteúdo orgânico e pago. O conteúdo orgânico constrói confiança e engajamento autêntico, enquanto o pago pode acelerar seu alcance e visibilidade. Combine essas estratégias com buscas direcionadas para capturar tráfego de alta intenção.

Qual estratégia você acha mais eficaz para aumentar seus seguidores? Compartilhe nos comentários!

#InstagramGrowth #SocialMediaStrategy #Engajamento #ConteúdoOrgânico #MarketingDigital
```

### Perguntas da seção E

**Escala linear 0–10:**

1. **Qualidade geral** — Nota holística: valor do conteúdo, escrita e capacidade de prender a atenção.
2. **Gancho** — As 1–2 primeiras linhas (antes do "ver mais"). Te fez parar o scroll?
3. **Originalidade** — Traz perspectiva autêntica/profunda, ou parece texto genérico de IA / clichê de "coach corporativo"?
4. **Escaneabilidade** — Dá pra "escanear" com os olhos (espaçamento, quebras, listas) antes de decidir ler?
5. **Qualidade do CTA** — A chamada para ação na última linha é específica e convida a um comentário real (vs. "o que você acha?" genérico)?

**Sim / Não:**

6. **Tem engagement bait?** — Usa táticas artificiais de "mendigagem de engajamento" ("curta se concorda", "marque 3 amigos", pedido de interação sem âncora no conteúdo)? *(Sim = ruim)*
7. **Tem link externo no corpo?** — Há link (YouTube, Medium, etc.) **dentro** do texto do post? *(Sim = penalizado pelo algoritmo)*

*(Nomes das colunas no CSV exportado: `E_overall`, `E_hook`, `E_originality`, `E_scannability`, `E_cta`, `E_bait`, `E_link`)*

---

## Seção F — Post F

> Cole no item de descrição da seção:

```
Você sabia que 60% dos usuários de redes sociais seguem uma nova conta após verem conteúdo relevante? Se você está buscando conquistar 1000 seguidores rapidamente, aqui estão algumas estratégias que podem ajudar.

No Instagram, consistência é a chave. Postar regularmente conteúdo de alta qualidade que ressoe com seu público-alvo é essencial. Isso significa entender o que eles valorizam e oferecer exatamente isso. Engajar-se genuinamente com outros usuários do mesmo nicho e utilizar hashtags relevantes pode aumentar sua visibilidade e atrair novos seguidores.

No TikTok, a abordagem é um pouco diferente. Incluir chamadas para ação no meio dos vídeos pode fazer toda a diferença. Muitos usuários não assistem até o final, então um incentivo para seguir logo no início ou no meio do vídeo pode aumentar significativamente o engajamento.

Outra estratégia valiosa é promover seu perfil em outros canais. Isso pode ser feito através de colaborações com influenciadores ou simplesmente compartilhando seu conteúdo em outras redes sociais e blogs. Essa exposição cruzada pode trazer novos seguidores de forma rápida e eficaz.

Por fim, não subestime o poder das ferramentas de análise de dados. Elas podem oferecer insights valiosos sobre seu público e ajudar a identificar oportunidades de crescimento que você talvez não tenha percebido.

Qual foi a estratégia mais eficaz que você já usou para ganhar seguidores rapidamente? Compartilhe sua experiência!

#RedesSociais #CrescimentoDigital #Instagram #TikTok #Engajamento #Seguidores
```

### Perguntas da seção F

**Escala linear 0–10:**

1. **Qualidade geral** — Nota holística: valor do conteúdo, escrita e capacidade de prender a atenção.
2. **Gancho** — As 1–2 primeiras linhas (antes do "ver mais"). Te fez parar o scroll?
3. **Originalidade** — Traz perspectiva autêntica/profunda, ou parece texto genérico de IA / clichê de "coach corporativo"?
4. **Escaneabilidade** — Dá pra "escanear" com os olhos (espaçamento, quebras, listas) antes de decidir ler?
5. **Qualidade do CTA** — A chamada para ação na última linha é específica e convida a um comentário real (vs. "o que você acha?" genérico)?

**Sim / Não:**

6. **Tem engagement bait?** — Usa táticas artificiais de "mendigagem de engajamento" ("curta se concorda", "marque 3 amigos", pedido de interação sem âncora no conteúdo)? *(Sim = ruim)*
7. **Tem link externo no corpo?** — Há link (YouTube, Medium, etc.) **dentro** do texto do post? *(Sim = penalizado pelo algoritmo)*

*(Nomes das colunas no CSV exportado: `F_overall`, `F_hook`, `F_originality`, `F_scannability`, `F_cta`, `F_bait`, `F_link`)*


---

# PARTE 2 — Chave do experimento (NÃO mostrar aos avaliadores)

Isto é o `mapping.csv` em forma legível. Guarde fora do formulário.

| Post | Condição | Tópico | score do Judge | bait (Judge) | chars |
|---|---|---|---|---|---|
| A | sem judge | Hoje vou falar sobre inteligência artificial | 5 | sim | 1378 |
| B | sem judge | Ainda vale apena aprender UI Design em 2026? | 6 | sim | 1643 |
| C | **com** judge | Ainda vale apena aprender UI Design em 2026? | 7 | não | 1631 |
| D | **com** judge | Hoje vou falar sobre inteligência artificial | 7 | não | 1575 |
| E | sem judge | Como conseguir 1000 seguidores rapido? | 5 | sim | 1344 |
| F | **com** judge | Como conseguir 1000 seguidores rapido? | 7 | não | 1536 |

Pares por tópico (é assim que o RQ2 compara):

- **Hoje vou falar sobre inteligência artificial** → Post D (com) vs Post A (sem)
- **Ainda vale apena aprender UI Design em 2026?** → Post C (com) vs Post B (sem)
- **Como conseguir 1000 seguidores rapido?** → Post F (com) vs Post E (sem)

---

# PARTE 3 — Cabeçalho esperado do CSV de respostas

Depois de exportar do Forms (Forms → Sheets → baixar .csv), renomeie as colunas para
exatamente isto e salve como `study/data/form-responses.csv`:

```
rater_id,A_overall,A_hook,A_originality,A_scannability,A_cta,A_bait,A_link,B_overall,B_hook,B_originality,B_scannability,B_cta,B_bait,B_link,C_overall,C_hook,C_originality,C_scannability,C_cta,C_bait,C_link,D_overall,D_hook,D_originality,D_scannability,D_cta,D_bait,D_link,E_overall,E_hook,E_originality,E_scannability,E_cta,E_bait,E_link,F_overall,F_hook,F_originality,F_scannability,F_cta,F_bait,F_link
```

As colunas `*_bait` e `*_link` saem como "Sim"/"Não" — o script converte para 1/0.

---

# Notas para o pesquisador (não vão para o form)

- **A ordem já está embaralhada** e não é com/sem alternado. Não reordene as seções:
  as letras vêm de `selectStudySample` e são a chave do cruzamento.
- **Não revele o critério de separação** na descrição do form. Se um avaliador
  perceber que há dois grupos, ele passa a comparar em vez de avaliar.
- **Cada avaliador precisa responder os 6 posts.** Respostas parciais são descartadas
  no pareamento por avaliador — que é a análise com potência de verdade (a por tópico
  tem n=3 e não desce de p=0.25 nem no cenário perfeito).
- **Ordem fixa para todos é uma limitação conhecida**: introduz efeito de ordem
  (fadiga, calibração progressiva). Com um único form não dá para contrabalançar;
  declare isso nas limitações do artigo, ou monte 2 versões do form com ordens
  diferentes e junte os CSVs.
- **O que esperar destes posts:** os 6 têm CTA na última linha e nenhum tem link no
  corpo, então `*_link` deve dar concordância trivial (kappa indefinido, concordância
  100%) — é esperado, não é bug. A variação real vai estar em `*_bait` e nas notas
  de originalidade/gancho.
- **O contraste entre as condições é limpo:** os 3 posts sem judge têm
  `hasEngagementBait=true` pelo Judge; os 3 com judge, `false`. Ou seja, o loop
  removeu a isca de engajamento em 3/3 casos. Se os humanos concordarem com isso,
  é o achado mais forte do RQ2.
- **⚠️ O Judge não obedece ao próprio cap nas flags.** O rubric manda
  `hasEngagementBait=true → score ≤ 4`, mas os posts A, B e E têm bait=true com
  score 5, 6 e 5. Ele detecta a isca, escreve o issue obrigatório e ignora o teto —
  3 violações em 3 oportunidades. (O cap de relevância da regra #1 ele respeitou: o
  post A recebeu exatamente 5.) Duas consequências:
  1. **Para o artigo:** é um resultado publicável sobre LLM-as-judge — restrição
     dura declarada em prompt não é obedecida de forma confiável, mesmo com o
     modelo acertando a detecção que dispara a restrição.
  2. **Para o gate:** o corte `score ≥ 7` continua funcionando (5 e 6 reprovam),
     então o roteamento não quebrou. Mas se o cap fosse aplicado no código (clamp
     determinístico pós-parse em `scoreDraft`), as notas do agente na condição
     "sem judge" cairiam de 5–6 para ≤ 4, mudando os números do RQ1.
  **Decisão pendente:** corrigir agora invalida a comparabilidade com a amostra já
  coletada. Recomendação: **não mexer** antes de fechar esta coleta, e reportar a
  violação como achado + limitação.
