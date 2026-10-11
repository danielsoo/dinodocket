import type { Metadata, Viewport } from "next";
import Image from "next/image";
import Link from "next/link";
import AuthNav from "@/components/AuthNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "DinoDocket",
  description: "An AI planner that checks whether your week actually fits, plans how to do things, and lets you stay in charge.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#14247a" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="flex min-h-full flex-col font-sans">
        <header className="sticky top-0 z-30 overflow-hidden bg-deep text-white shadow-[0_2px_0_rgba(0,0,0,0.25)]">
          {/* soft cyan glow behind the logo, echoing the badge gradient */}
          <div aria-hidden className="pointer-events-none absolute -left-10 -top-24 h-64 w-64 rounded-full bg-cyan/30 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute right-10 -top-28 h-56 w-80 rounded-full bg-accent/40 blur-3xl" />
          <nav className="relative mx-auto flex max-w-[1400px] items-center gap-1 px-4 py-2 sm:px-6">
            <Link href="/" className="mr-1 flex shrink-0 items-center gap-2 sm:mr-5 sm:gap-2.5">
              <Image src="/logo-160.png" alt="" width={44} height={44} priority className="h-9 w-9 drop-shadow-[0_2px_0_rgba(0,0,0,0.35)] sm:h-11 sm:w-11" />
              <span className="hidden font-display text-xl font-bold tracking-wide min-[440px]:inline">
                Dino<span className="text-cyan">Docket</span>
              </span>
            </Link>
            <Link href="/" className="whitespace-nowrap rounded-full px-2.5 py-1.5 text-sm font-semibold text-white/80 hover:bg-white/10 hover:text-white sm:px-3.5">Planner</Link>
            <Link href="/lab" className="whitespace-nowrap rounded-full px-2.5 py-1.5 text-sm font-semibold text-white/80 hover:bg-white/10 hover:text-white sm:px-3.5">Agent Lab</Link>
            <span className="ml-auto hidden items-center gap-2 text-xs font-semibold text-white/70 md:flex">
              <span className="h-2 w-2 rounded-full bg-claw" aria-hidden />
              Plans that fit your real week
            </span>
            <AuthNav />
          </nav>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6">{children}</main>
        <footer className="mx-auto w-full max-w-[1400px] px-4 pb-6 text-xs text-muted sm:px-6">
          DinoDocket · built at c0mpiled-15, Penn State · AI proposes, you approve.
        </footer>
      </body>
    </html>
  );
}
