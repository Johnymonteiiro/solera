"use client";

import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

// Dispara um refresh global: os widgets client escutam "mas:refresh" (mesmo
// padrão do "mas:thread-created") e router.refresh() recarrega os server components.
export function RefreshButton() {
  const router = useRouter();
  const [spinning, setSpinning] = React.useState(false);

  function handleRefresh() {
    setSpinning(true);
    window.dispatchEvent(new Event("mas:refresh"));
    router.refresh();
    setTimeout(() => setSpinning(false), 600);
  }

  return (
    <Button variant="outline" size="sm" onClick={handleRefresh}>
      <RefreshCw size={13} className={spinning ? "animate-spin" : undefined} />
      Atualizar
    </Button>
  );
}
