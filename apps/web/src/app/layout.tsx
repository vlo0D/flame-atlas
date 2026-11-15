import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { InlineScript } from "@/components/inline-script";
import { SampleDataBanner } from "@/components/page-parts";
import { SiteNav } from "@/components/site-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { meta } from "@/lib/data";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Flame Atlas",
    template: "%s · Flame Atlas",
  },
  description:
    "How much of NASA's microgravity combustion evidence applies to a given crew atmosphere, and what is missing.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Sets the saved or system theme before the first paint, so there is no flash. */}
        <InlineScript html={THEME_INIT_SCRIPT} />
      </head>
      <body className="flex min-h-full flex-col bg-bg text-fg">
        <SampleDataBanner />
        <header className="border-b border-line bg-surface">
          {/* On a phone the name and the theme switch share the first line and the navigation takes the second. */}
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6">
            <Link href="/" className="mr-auto text-lg font-semibold tracking-tight">
              Flame Atlas
            </Link>
            <div className="order-last w-full sm:order-none sm:w-auto">
              <SiteNav />
            </div>
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">{children}</main>
        <footer className="border-t border-line bg-surface">
          <div className="mx-auto w-full max-w-7xl px-4 py-4 text-xs text-fg-subtle sm:px-6">
            Data:{" "}
            <a href={meta.source.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              {meta.source.name}
            </a>{" "}
            ({meta.source.license}). Data contract {meta.contractVersion}. Built for the NASA Space Apps Challenge 2026.
          </div>
        </footer>
      </body>
    </html>
  );
}
