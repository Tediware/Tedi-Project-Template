import Link from "next/link"

import { site } from "@/lib/site"

const links = [
  { href: "/", label: "Activity" },
  { href: "/send", label: "Send" },
]

/** Top navigation. Add your own pages to `links`. */
export function AppNav() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-6">
        <Link href="/" className="font-semibold tracking-tight">
          {site.name}
        </Link>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}
