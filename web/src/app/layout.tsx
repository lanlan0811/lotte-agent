import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lotte Agent",
  description: "Lotte AI Agent - Multi-channel Intelligent Agent Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh" className="h-full antialiased">
      <body className="h-full flex flex-col overflow-hidden font-sans">
        {children}
      </body>
    </html>
  );
}
