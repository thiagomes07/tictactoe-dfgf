import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DFGF - Formulário 3x3-B",
  description: "Base do projeto Burocracia S.A."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
