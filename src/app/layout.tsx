import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";


export const metadata: Metadata = {
  title: "Chief of Staff",
  description: "An AI scheduler for college students that proposes realistic weeks and lets you stay in charge.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">
        <header className="border-b border-line bg-panel">
          <nav className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
            <Link href="/" className="font-semibold tracking-tight">
              Chief<span className="text-accent">.</span>of<span className="text-accent">.</span>Staff
            </Link>
            <Link href="/" className="text-sm text-muted hover:text-ink">Planner</Link>
            <Link href="/lab" className="text-sm text-muted hover:text-ink">Agent Lab</Link>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5">{children}</main>
      </body>
    </html>
  );
}
