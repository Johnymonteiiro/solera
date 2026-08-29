"use client";

import {
  FieldState,
  GROUP_META,
  SECRET_FIELDS,
  type SettingField,
} from "@/lib/settings-fields";
import { Eye, EyeOff } from "lucide-react";
import * as React from "react";

// Aba API Key: só os campos secretos.
//
// O valor NUNCA chega do servidor — o que se vê de uma chave salva é o
// `masked` ("…a1b2") no placeholder. Por isso o "Mostrar" só revela o que a
// pessoa está digitando AGORA; não existe botão que traga o segredo de volta.

function ChipOrigem({ estado }: { estado: FieldState }) {
  if (estado.set) {
    return (
      <span className="shrink-0 rounded-md bg-[var(--accent-purple-dim)] px-2 py-1 text-[10.5px] font-medium text-[var(--accent-purple)]">
        sobreposto
      </span>
    );
  }
  if (estado.env) {
    return (
      <span className="shrink-0 rounded-md bg-[var(--accent-green-dim)] px-2 py-1 text-[10.5px] font-medium text-[var(--accent-green)]">
        usando .env
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-md bg-[var(--bg-input)] px-2 py-1 text-[10.5px] font-medium text-[var(--text-muted)]">
      não definido
    </span>
  );
}

export function ConfigChaves({
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
  const [revelado, setRevelado] = React.useState<Record<string, boolean>>({});

  const grupos: ("modelos" | "linkedin")[] = ["modelos", "linkedin"];

  const campo = (f: SettingField) => {
    const estado = state[f.key] ?? { set: false, masked: "", env: false };
    const valor = edits[f.key] ?? "";
    const mostrar = !!revelado[f.key];
    const placeholder = estado.set
      ? `salvo (${estado.masked}) — digite para substituir`
      : f.placeholder;

    return (
      <div
        key={f.key}
        className="grid grid-cols-[250px_1fr] items-center gap-6 border-b border-[var(--border-subtle)] py-3.5 last:border-0 max-[760px]:grid-cols-1 max-[760px]:gap-2"
      >
        <div className="flex flex-col gap-1">
          <label
            htmlFor={f.key}
            className="font-mono text-[12.5px] font-medium text-[var(--text-primary)]"
          >
            {f.key}
          </label>
          <span className="text-[11.5px] text-[var(--text-muted)]">{f.hint}</span>
        </div>

        <div className="flex min-w-0 items-center gap-2.5">
          <input
            id={f.key}
            type={mostrar ? "text" : "password"}
            value={valor}
            autoComplete="off"
            disabled={!canEdit}
            placeholder={placeholder}
            onChange={(e) => onChange(f.key, e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 py-2.5 font-mono text-[12.5px] text-[var(--text-primary)] placeholder:font-sans placeholder:text-[var(--text-muted)] focus:border-[var(--accent-purple)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() =>
              setRevelado((r) => ({ ...r, [f.key]: !r[f.key] }))
            }
            disabled={!valor}
            title={
              valor
                ? mostrar
                  ? "Ocultar"
                  : "Mostrar o que você digitou"
                : "Nada digitado para mostrar"
            }
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-2 text-[11.5px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {mostrar ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
          <ChipOrigem estado={estado} />
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {grupos.map((g) => {
        const campos = SECRET_FIELDS.filter((f) => f.group === g);
        const emUso = campos.filter(
          (f) => state[f.key]?.set || state[f.key]?.env,
        ).length;
        return (
          <section
            key={g}
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)]"
          >
            <div className="flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] p-4">
              <div className="flex flex-col gap-0.5">
                <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">
                  {GROUP_META[g].title}
                </h2>
                <p className="text-[12.5px] text-[var(--text-secondary)]">
                  {GROUP_META[g].desc}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium ${
                  emUso === campos.length
                    ? "border-[var(--accent-green)]/30 bg-[var(--accent-green-dim)] text-[var(--accent-green)]"
                    : "border-[var(--border-subtle)] bg-[var(--bg-input)] text-[var(--text-muted)]"
                }`}
              >
                {emUso} de {campos.length} em uso
              </span>
            </div>
            <div className="px-5 pb-2 pt-1">{campos.map(campo)}</div>
          </section>
        );
      })}

      <p className="text-[12px] leading-relaxed text-[var(--text-muted)]">
        Valores salvos não voltam para a tela — só a presença e os últimos quatro
        caracteres. Deixar um campo em branco e salvar remove o override e faz a
        chave voltar a vir do <code className="font-mono text-[11px]">.env</code>.
      </p>
    </div>
  );
}
