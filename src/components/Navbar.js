"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/** Small chevron icon, rotates when the dropdown is open. */
function ChevronIcon({ open }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

/** Derives initials from an email for the avatar circle (e.g. awais@... -> "AW"). */
function initialsFromEmail(email) {
  if (!email) return "?";
  const namePart = email.split("@")[0];
  return namePart.slice(0, 2).toUpperCase();
}

export default function Navbar() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState(null);
  const menuRef = useRef(null);

  // Self-contained session fetch — this component no longer depends on
  // a server layout passing `user` down as a prop, so it can be dropped
  // into any page directly.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    supabase.auth.getUser().then(({ data }) => setUser(data?.user ?? null));

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  // Close the dropdown on outside click.
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const displayName = user?.user_metadata?.full_name || user?.email || "Account";

  return (
    <header className="no-print sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-10">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
        >
          Criticpick Solutions — Billing Portal
        </Link>

        <nav className="hidden items-center gap-5 text-sm font-medium text-zinc-500 dark:text-zinc-400 sm:flex">
          <Link href="/" className="transition-colors hover:text-zinc-900 dark:hover:text-zinc-100">
            New Invoice
          </Link>
          <Link
            href="/invoices"
            className="transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            Invoice History
          </Link>
        </nav>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-600 text-xs font-semibold text-white">
              {initialsFromEmail(user?.email)}
            </span>
            <span className="hidden max-w-[160px] truncate text-zinc-700 dark:text-zinc-200 sm:inline">
              {displayName}
            </span>
            <ChevronIcon open={menuOpen} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-48 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
              <div className="border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
                <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  Signed in as
                </p>
                <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {user?.email}
                </p>
              </div>
              <Link
                href="/profile"
                onClick={() => setMenuOpen(false)}
                className="block px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                View Profile
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="block w-full px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
