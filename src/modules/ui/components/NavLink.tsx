// src/components/NavLink.tsx
'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export default function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active =
    pathname === href || (href !== "/" && pathname?.startsWith(href));

  return (
    <Link
      href={href}
      className={clsx(
        "px-3 py-2 rounded-md text-sm",
        active
          ? "bg-white/10 text-white"
          : "text-gray-300 hover:text-white hover:bg-white/10"
      )}
    >
      {children}
    </Link>
  );
}

