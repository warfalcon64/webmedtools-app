import type { Metadata } from "next";
import Link from "next/link";
import { tools } from "./tools";
import "./globals.css";

export const metadata: Metadata = {
  title: "WebMedTools",
  description: "Free tools for rehabilitation exercises, starting with printable eye test worksheets.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-slate-900 antialiased">
        <header className="border-b border-slate-200 print:hidden">
          <nav className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="font-semibold">
              WebMedTools
            </Link>
            {tools
              .filter((tool) => tool.href)
              .map((tool) => (
                <Link key={tool.name} href={tool.href!} className="text-slate-600 hover:text-slate-900">
                  {tool.name}
                </Link>
              ))}
          </nav>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-8 print:max-w-none print:p-0">{children}</main>
      </body>
    </html>
  );
}
