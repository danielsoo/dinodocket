import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";


export const metadata: Metadata = {
  title: "DinoDocket",
  description: "An AI scheduler for college students that proposes realistic weeks and lets you stay in charge.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">
        <header className="sticky top-0 z-30 border-b border-line bg-panel/85 backdrop-blur">
          <nav className="mx-auto flex max-w-[1400px] items-center gap-1 px-4 py-2.5 sm:px-6">
            <Link href="/" className="mr-4 flex items-center gap-2 font-semibold tracking-tight">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent/15 text-base" aria-hidden>🦕</span>
              <span>Dino<span className="text-accent">Docket</span></span>
            </Link>
            <Link href="/" className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-fixed hover:text-ink">Planner</Link>
            <Link href="/lab" className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-fixed hover:text-ink">Agent Lab</Link>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
