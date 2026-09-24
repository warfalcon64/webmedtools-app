"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** A header link, shown as a filled pill while its page is open. */
export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const active = usePathname() === href;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full px-4 py-2 font-semibold ${
        active ? "bg-accent-soft text-accent" : "text-muted hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}
