import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AlertTriangle, ShieldAlert } from "lucide-react";

// Sem "use client": não há estado nem handler aqui, só um link. O componente
// anterior era client à toa e carregava JS para renderizar um <a>.

/**
 * Os códigos que `api/auth/callback` devolve em `?error=`.
 *
 * `tom: "acesso"` é permissão negada — a pessoa fez tudo certo e mesmo assim
 * não entra, então a saída é falar com o admin, não tentar de novo.
 * `tom: "falha"` é problema técnico, e aí repetir o login costuma resolver.
 */
const ERROS: Record<
  string,
  { titulo: string; detalhe: string; tom: "acesso" | "falha" }
> = {
  not_allowed: {
    titulo: "Esta conta não tem acesso",
    detalhe:
      "O login funcionou, mas este e-mail do LinkedIn não está liberado no Solera.",
    tom: "acesso",
  },
  inactive: {
    titulo: "Conta desativada",
    detalhe:
      "Um administrador desativou este acesso. Os seus dados continuam salvos.",
    tom: "acesso",
  },
  invalid_state: {
    titulo: "A tentativa de login expirou",
    detalhe: "Isso acontece quando a página fica aberta tempo demais. Entre de novo.",
    tom: "falha",
  },
  no_code: {
    titulo: "O LinkedIn não concluiu o login",
    detalhe: "Nenhum código de autorização voltou. Tente novamente.",
    tom: "falha",
  },
  token_failed: {
    titulo: "Não foi possível validar o acesso",
    detalhe: "O LinkedIn recusou a troca do código. Tente novamente.",
    tom: "falha",
  },
  user_store: {
    titulo: "Falha ao registrar o acesso",
    detalhe:
      "O login foi aceito, mas não deu para gravar a sua conta. Tente de novo em instantes.",
    tom: "falha",
  },
};

function AvisoErro({ code }: { code: string }) {
  const erro = ERROS[code] ?? {
    titulo: "Não foi possível entrar",
    detalhe: "Tente novamente. Se continuar, fale com o administrador.",
    tom: "falha" as const,
  };
  const acesso = erro.tom === "acesso";
  const Icon = acesso ? ShieldAlert : AlertTriangle;

  return (
    <div
      role="alert"
      className={cn(
        "flex gap-3 rounded-lg border p-3",
        acesso
          ? "border-[var(--accent-amber)]/40 bg-[var(--accent-amber-dim)]"
          : "border-[var(--accent-red)]/40 bg-[var(--accent-red-dim)]",
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          acesso ? "text-[var(--accent-amber)]" : "text-[var(--accent-red)]",
        )}
      />
      <div className="space-y-0.5">
        <p className="text-sm font-medium text-[var(--text-primary)]">
          {erro.titulo}
        </p>
        <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
          {erro.detalhe}
        </p>
      </div>
    </div>
  );
}

export function LoginForm({
  className,
  error,
  ...props
}: React.ComponentProps<"div"> & { error?: string }) {
  return (
    <div className={cn("flex flex-col gap-5", className)} {...props}>
      <Card className="border-[var(--border-subtle)] bg-[var(--bg-card)] p-8 ring-0">
        <CardHeader className="p-0">
          <CardTitle className="text-2xl font-bold text-[var(--text-primary)]">
            Bem-vindo de volta
          </CardTitle>
          <CardDescription className="text-[var(--text-secondary)]">
            Entre para continuar
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5 p-0 pt-6">
          {error && <AvisoErro code={error} />}

          <a href="/api/auth/linkedin" className="block">
            <Button
              size="lg"
              type="button"
              className="w-full cursor-pointer bg-[var(--accent-purple)] text-white hover:brightness-110"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                className="size-4"
              >
                <path
                  d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"
                  fill="white"
                />
              </svg>
              Entrar com LinkedIn
            </Button>
          </a>

          {/* Não existe tela de cadastro: a conta nasce no primeiro login
              (upsertUserOnLogin). Dizer isso evita a pessoa procurar um
              "criar conta" que nunca vai existir. */}
          <p className="text-center text-xs leading-relaxed text-[var(--text-muted)]">
            É o seu primeiro acesso? Entre pelo mesmo botão — sua conta é criada
            automaticamente.
          </p>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-[var(--text-secondary)]">
        Precisa de acesso?{" "}
        <span className="text-[var(--text-primary)]">
          Fale com o administrador do Solera.
        </span>
      </p>

      <p className="px-4 text-center text-xs leading-relaxed text-[var(--text-muted)]">
        Ao continuar, você concorda com os{" "}
        <a
          href="#"
          className="text-[var(--accent-purple)] underline-offset-4 hover:underline"
        >
          Termos de Uso
        </a>{" "}
        e a{" "}
        <a
          href="#"
          className="text-[var(--accent-purple)] underline-offset-4 hover:underline"
        >
          Política de Privacidade
        </a>
        .
      </p>
    </div>
  );
}
