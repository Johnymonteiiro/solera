// ─────────────────────────────────────────────────────────────────────────────
// Catálogo dos campos de configuração.
//
// Módulo FOLHA (sem `server-only`, sem banco): a tela e a rota precisam do mesmo
// vocabulário — quais chaves existem, quais são segredo, em que aba cada uma
// aparece. Duas listas divergiriam na primeira credencial nova.
//
// `secret: true` decide DUAS coisas de uma vez: o valor nunca volta num GET, e o
// campo mora na aba "API Key". O resto é variável de workspace.
// ─────────────────────────────────────────────────────────────────────────────

export type FieldGroup = "modelos" | "linkedin" | "workspace";

export interface SettingField {
  key: string;
  hint: string;
  group: FieldGroup;
  secret: boolean;
  placeholder: string;
  /** Nome no .env quando difere da chave (fallback quando não há override). */
  envVar?: string;
}

export const SETTING_FIELDS: SettingField[] = [
  // ─── Segredos (aba API Key) ───────────────────────────────────────────────
  {
    key: "OPENAI_API_KEY",
    hint: "LLM principal dos agentes",
    group: "modelos",
    secret: true,
    placeholder: "sk-…  preencha para sobrepor o .env",
  },
  {
    key: "TAVILY_API_KEY",
    hint: "Busca web da ferramenta research",
    group: "modelos",
    secret: true,
    placeholder: "tvly-…  preencha para sobrepor o .env",
  },
  {
    key: "BRAVE_API_KEY",
    hint: "Busca alternativa / fallback",
    group: "modelos",
    secret: true,
    placeholder: "BSA…  preencha para sobrepor o .env",
  },
  {
    key: "LINKEDIN_CLIENT_SECRET",
    hint: "Segredo do app OAuth",
    group: "linkedin",
    secret: true,
    placeholder: "preencha para sobrepor o .env",
  },

  // ─── Variáveis (aba Variáveis) ────────────────────────────────────────────
  {
    key: "LLM_MODEL",
    hint: "Modelo padrão dos agentes",
    group: "workspace",
    secret: false,
    placeholder: "gpt-4o",
  },
  {
    key: "BRAVE_URL",
    hint: "Endpoint da API Brave",
    group: "workspace",
    secret: false,
    placeholder: "https://api.search.brave.com/res/v1/web/search?",
  },
  {
    key: "LINKEDIN_CLIENT_ID",
    hint: "ID público do app OAuth",
    group: "workspace",
    secret: false,
    placeholder: "86xxxxxxxxxxxx",
  },
  {
    key: "LINKEDIN_REDIRECT_URI",
    hint: "Callback após o login",
    group: "workspace",
    secret: false,
    placeholder: "http://localhost:3000/api/auth/callback",
  },
  {
    key: "SEARCH_PROVIDER",
    hint: "Provider de busca: tavily ou brave",
    group: "workspace",
    secret: false,
    placeholder: "tavily",
    envVar: "DEFAULT_NAVIGATOR",
  },
  {
    key: "SEARCH_MAX_RESULTS",
    hint: "Resultados por busca (1–20)",
    group: "workspace",
    secret: false,
    placeholder: "10",
  },
  {
    key: "STUDY_FORM_URL",
    hint: "Google Form da avaliação humana",
    group: "workspace",
    secret: false,
    placeholder: "https://forms.gle/…",
  },
];

export const SETTING_KEYS = SETTING_FIELDS.map((f) => f.key);

export function fieldByKey(key: string): SettingField | undefined {
  return SETTING_FIELDS.find((f) => f.key === key);
}

export const SECRET_FIELDS = SETTING_FIELDS.filter((f) => f.secret);
export const WORKSPACE_FIELDS = SETTING_FIELDS.filter((f) => !f.secret);

export const GROUP_META: Record<
  Exclude<FieldGroup, "workspace">,
  { title: string; desc: string }
> = {
  modelos: {
    title: "Modelos e busca",
    desc: "Credenciais usadas pelos agentes em runtime.",
  },
  linkedin: {
    title: "LinkedIn",
    desc: "OAuth de login e publicação de posts.",
  },
};

/** Estado de um campo como a rota devolve. `value` só vem se não for segredo. */
export interface FieldState {
  /** Há override gravado no banco? */
  set: boolean;
  /** Só para segredos: "…a1b2". Vazio nos demais. */
  masked: string;
  /** Valor real — ausente nos segredos, por construção. */
  value?: string;
  /** O .env tem fallback para esta chave? */
  env: boolean;
}
