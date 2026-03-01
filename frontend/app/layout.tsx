import type { Metadata } from "next";

import { AppProviders } from "@/app/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "DFGF - Formulario 3x3-B",
  description: "Base do projeto Burocracia S.A."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
