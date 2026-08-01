import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AppShell } from "@/components/shared/AppShell";
import { ThemeScript } from "@/components/shared/ThemeScript";
import { AppProviders } from "@/providers/app-providers";
import { AnalyticsFiltersProvider } from "@/hooks/useAnalyticsFilters";
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
      <body className="h-full overflow-hidden" suppressHydrationWarning>
        <AppProviders>
          <GlobalFiltersProvider>
            <AnalyticsFiltersProvider>
              <AppShell>{children}</AppShell>
            </AnalyticsFiltersProvider>
          </GlobalFiltersProvider>
        </AppProviders>
      </body>
    </html>
  );
}
