import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AppShell } from "@/components/shared/AppShell";
import { ThemeScript } from "@/components/shared/ThemeScript";
import { AppProviders } from "@/providers/app-providers";
import { GlobalFiltersProvider } from "@/hooks/useGlobalFilters";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "SpentX",
  description: "Personal finance dashboard for income, expenses, and settings.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${inter.className}`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full">
        <AppProviders>
          <GlobalFiltersProvider>
            <AppShell>{children}</AppShell>
          </GlobalFiltersProvider>
        </AppProviders>
      </body>
    </html>
  );
}
