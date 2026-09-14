import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "../components/ui/tooltip";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Solera",
  description: "Multi-agent content system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable} dark h-full antialiased`}
    >
      {/* Com Cache Components ligado, o Next exige que todo acesso a dado de
          request (cookies/headers/searchParams) esteja sob <Suspense>. Aqui
          TODA rota lê o cookie de sessão — /login inclusive, para mandar quem já
          entrou ao dashboard —, então não existe casca estática para servir.
          A doc trata esse caso: um <Suspense fallback={null}> acima do body faz
          o app inteiro renderizar em request time. É o que este app já era, só
          que agora declarado. Ver getting-started/caching, "Opting out of the
          static shell". */}
      <Suspense fallback={null}>
        <body className="min-h-full flex flex-col" suppressHydrationWarning>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
        </body>
      </Suspense>
    </html>
  );
}
