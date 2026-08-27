"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

// Wrapper shadcn — concentra defaults do projeto (top-right pra não colidir
// com o ReviewPopup bottom-right, richColors + closeButton). Call sites
// importam daqui e podem sobrescrever via props.
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-right"
      richColors
      closeButton
      {...props}
    />
  );
};

export { Toaster };
