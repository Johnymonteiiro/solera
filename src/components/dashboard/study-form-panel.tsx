"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ExternalLink, Loader2, QrCode, Settings2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import * as React from "react";
import { toast } from "sonner";

// Painel do estudo: QR do Google Form (para os avaliadores escanearem) + config
// (drawer) do link do form, persistido em data/settings.json via /api/mas/study-config.
export function StudyFormPanel() {
  const [formUrl, setFormUrl] = React.useState("");
  const [draft, setDraft] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [qrOpen, setQrOpen] = React.useState(false);
  const [cfgOpen, setCfgOpen] = React.useState(false);
  // Cores do QR resolvidas dos tokens do card (adapta ao tema e mantém contraste
  // no fundo escuro padrão dos cards).
  const [qrColors, setQrColors] = React.useState({ bg: "#141414", fg: "#ededed" });

  React.useEffect(() => {
    if (!qrOpen) return;
    const cs = getComputedStyle(document.documentElement);
    const bg = cs.getPropertyValue("--bg-card").trim();
    const fg = cs.getPropertyValue("--text-primary").trim();
    if (bg && fg) setQrColors({ bg, fg });
  }, [qrOpen]);

  React.useEffect(() => {
    fetch("/api/mas/study-config")
      .then((r) => r.json())
      .then((d: { formUrl?: string }) => {
        setFormUrl(d.formUrl ?? "");
        setDraft(d.formUrl ?? "");
      })
      .catch(() => {});
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/mas/study-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formUrl: draft }),
      });
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const d = (await res.json()) as { formUrl?: string };
      setFormUrl(d.formUrl ?? "");
      toast.success("Link do formulário salvo");
      setCfgOpen(false);
    } catch (err) {
      toast.error("Falha ao salvar", {
        description: err instanceof Error ? err.message : "Erro de rede",
      });
    } finally {
      setSaving(false);
    }
  }

  const hasUrl = formUrl.trim().length > 0;

  return (
    <div className="flex items-center gap-2">
      {/* QR do form */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasUrl}
            title={hasUrl ? "Mostrar QR do formulário" : "Configure o link primeiro"}
          >
            <QrCode size={14} /> QR do form
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-[380px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6">
          {/* Card único: texto → QR → botão */}
          <div className="flex flex-col items-center gap-4 text-center">
            <span className="text-2xl">🙌</span>
            <DialogTitle className="text-[16px] font-semibold text-[var(--text-primary)]">
              Sua avaliação vale muito!
            </DialogTitle>
            <p className="text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
              Leva menos de <strong>5 minutos</strong> e ajuda a validar se a IA
              avalia posts tão bem quanto pessoas. Escaneie e responda — valeu! 🙏
            </p>
            {hasUrl && (
              <QRCodeSVG
                value={formUrl}
                size={200}
                bgColor={qrColors.bg}
                fgColor={qrColors.fg}
              />
            )}
            <Button asChild color="purple" className="w-full">
              <a href={formUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={14} /> Abrir formulário
              </a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Config (drawer) */}
      <Sheet open={cfgOpen} onOpenChange={setCfgOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm">
            <Settings2 size={14} /> Config
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="gap-0">
          <SheetHeader>
            <SheetTitle>Configuração do estudo</SheetTitle>
            <SheetDescription>
              Link do Google Form usado pelos avaliadores. É o que gera o QR code.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-1.5 px-4 py-2">
            <label className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              Google Form (URL)
            </label>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="https://forms.gle/..."
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 py-2 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-purple)] focus:outline-none"
            />
          </div>

          <SheetFooter>
            <Button color="purple" onClick={save} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              Salvar
            </Button>
            <SheetClose asChild>
              <Button variant="ghost">Cancelar</Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
