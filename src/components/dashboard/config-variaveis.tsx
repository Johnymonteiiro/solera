"use client";

import { FieldState, WORKSPACE_FIELDS } from "@/lib/settings-fields";
import { Info } from "lucide-react";

// Aba Variáveis: a config não-secreta do workspace.
//
// Diferente da aba API Key em uma coisa que importa: aqui o valor VOLTA do
// servidor e aparece no campo, porque nenhum destes é credencial. É o que
// permite ver o modelo em uso sem abrir o banco.

export function ConfigVariaveis({
  state,
  edits,
  canEdit,
  onChange,
}: {
  state: Record<string, FieldState>;
  edits: Record<string, string>;
  canEdit: boolean;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)]">
      <div className="flex flex-col gap-0.5 border-b border-[var(--border-subtle)] p-4">
        <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">
          Variáveis do workspace
        </h2>
        <p className="text-[12.5px] text-[var(--text-secondary)]">
          Configuração não-secreta dos agentes. Vale a partir do próximo run.
        </p>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[620px]">
          <div className="grid grid-cols-[280px_1fr_120px] gap-4 border-b border-[var(--border-subtle)] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            <span>Chave</span>
            <span>Valor</span>
            <span className="text-center">Origem</span>
          </div>

          {WORKSPACE_FIELDS.map((f) => {
            const estado = state[f.key] ?? { set: false, masked: "", env: false };
            // `edits` tem prioridade (rascunho não salvo); senão o valor do
            // banco; senão vazio, e o placeholder mostra o que o .env daria.
            const valor = edits[f.key] ?? estado.value ?? "";
            return (
              <div
                key={f.key}
                className="grid grid-cols-[280px_1fr_120px] items-center gap-4 border-b border-[var(--border-subtle)] px-5 py-3 last:border-0"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <label
                    htmlFor={`var-${f.key}`}
                    className="font-mono text-[12.5px] text-[var(--text-primary)]"
                  >
                    {f.key}
                  </label>
                  <span className="text-[11.5px] text-[var(--text-muted)]">
                    {f.hint}
                  </span>
                </div>

                <input
                  id={`var-${f.key}`}
                  value={valor}
                  disabled={!canEdit}
                  placeholder={f.placeholder}
                  onChange={(e) => onChange(f.key, e.target.value)}
                  className="w-full min-w-0 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 py-2.5 font-mono text-[12.5px] text-[var(--text-primary)] placeholder:font-sans placeholder:text-[var(--text-muted)] focus:border-[var(--accent-purple)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                />

                <div className="flex justify-center">
                  <span
                    className={`rounded-md px-2 py-1 text-[10.5px] font-medium ${
                      estado.set
                        ? "bg-[var(--accent-purple-dim)] text-[var(--accent-purple)]"
                        : estado.env
                          ? "bg-[var(--accent-green-dim)] text-[var(--accent-green)]"
                          : "bg-[var(--bg-input)] text-[var(--text-muted)]"
                    }`}
                  >
                    {estado.set ? "sobreposto" : estado.env ? ".env" : "padrão"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="flex items-start gap-2 p-4 text-[12px] leading-relaxed text-[var(--text-muted)]">
        <Info size={13} className="mt-0.5 shrink-0 text-[var(--accent-purple)]" />
        <span>
          Campo em branco cai no valor do{" "}
          <code className="font-mono text-[11px] text-[var(--text-secondary)]">
            .env
          </code>{" "}
          e, na falta dele, no padrão do código. As alterações entram em vigor no
          próximo run dos agentes — execuções em andamento seguem com o valor
          antigo.
        </span>
      </p>
    </section>
  );
}
