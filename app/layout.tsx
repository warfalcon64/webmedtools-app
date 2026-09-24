import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Next } from "next/font/google";
import Link from "next/link";
import { MarkIcon } from "./icons";
import { NavLink } from "./NavLink";
import { themeScript } from "./theme";
import { ThemeToggle } from "./ThemeToggle";
import { tools } from "./tools";
import "./globals.css";

// Made for low-vision readers. next/font downloads it at build time, so the site serves it itself.
const atkinson = Atkinson_Hyperlegible_Next({ subsets: ["latin"], variable: "--font-atkinson" });

export const metadata: Metadata = {
  title: "WebMedTools",
  description: "Free tools for rehabilitation exercises, starting with printable eye test worksheets.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme script sets data-theme on <html> before React loads, so React must not treat it as a mismatch.
    <html lang="en" className={atkinson.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-screen flex-col bg-canvas font-sans text-ink antialiased print:block print:bg-white">
        <header className="print:hidden">
          <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-2 gap-y-2 px-4 py-4 sm:px-6">
            <Link href="/" className="mr-auto flex items-center gap-2.5 text-xl font-bold">
              <MarkIcon className="size-8 text-accent" />
              WebMedTools
            </Link>
            {tools.map((tool) => (
              <NavLink key={tool.href} href={tool.href}>
                {tool.navName}
              </NavLink>
            ))}
            <ThemeToggle />
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 sm:px-6 print:max-w-none print:p-0">
          {children}
        </main>
        <footer className="bg-stage print:hidden">
          <p className="mx-auto max-w-5xl px-4 py-8 text-muted sm:px-6">
            <strong className="text-ink">Not medical advice.</strong> These tools support exercises a clinician has
            recommended. Stop and talk to your clinician if symptoms get worse.
          </p>
        </footer>
      </body>
    </html>
  );
}
