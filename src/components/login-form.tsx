"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup } from "@/components/ui/field";
import { cn } from "@/lib/utils";

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-md bg-[var(--accent-purple)]">
            <svg width="16" height="16" viewBox="0 0 90 90" fill="none">
              <path
                d="M58 22C58 22 30 22 28 22C18 22 14 30 14 37C14 46 21 51 30 52L50 55C58 56 62 60 62 67C62 74 56 70 50 70L22 70"
                stroke="white"
                strokeWidth="14"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="flex flex-col text-left leading-tight">
            <span className="text-sm font-bold text-[var(--text-primary)]">
              Solera
            </span>
            <span className="font-mono text-[10px] text-[var(--text-muted)]">
              multi-agent
            </span>
          </div>
        </div>
      </div>

      <Card className="border-[var(--border-subtle)] bg-[var(--bg-card)] ring-0">
        <CardHeader className="border-b border-[var(--border-subtle)] pb-4 text-center">
          <CardTitle className="text-lg font-semibold text-[var(--text-primary)]">
            Bem-vindo de volta
          </CardTitle>
          <CardDescription className="text-[var(--text-secondary)]">
            Entre com sua conta do LinkedIn
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <form>
            <FieldGroup>
              <Field>
                <a href="/api/auth/linkedin">
                  <Button
                    size="lg"
                    type="button"
                    className="w-full bg-[var(--accent-purple)] text-white hover:brightness-110 cursor-pointer"
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
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <FieldDescription className="px-4 text-center text-xs text-[var(--text-muted)]">
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
      </FieldDescription>
    </div>
  );
}
