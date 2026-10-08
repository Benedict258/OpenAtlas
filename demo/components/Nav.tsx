"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const LINKS = [
  { href: "/chat", label: "Chat" },
  { href: "/transcribe", label: "Transcribe" },
  { href: "/speak", label: "Speak" },
  { href: "/voice", label: "Voice" },
  { href: "/prompt-builder", label: "Prompt builder" },
  { href: "/text-cleaner", label: "Text cleaner" },
  { href: "/report-issue", label: "Report issue" },
];

export default function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="btn ghost small nav-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Close" : "Menu"}
      </button>
      <nav className={`nav${open ? " open" : ""}`} aria-label="Pages">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={pathname === l.href ? "active" : undefined}
            onClick={() => setOpen(false)}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
