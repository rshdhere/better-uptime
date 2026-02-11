"use client";

import Link from "next/link";
import {
  ExternalLink,
  LayoutTemplate,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import { Button } from "@/components/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/DropdownMenu";

// Mock data for initial UI implementation
const MOCK_STATUS_PAGES = [
  {
    id: "1",
    name: "Acme Inc. Status",
    slug: "acme",
    monitorCount: 3,
    isPublished: true,
  },
];

export default function StatusPagesPage() {
  return (
    <div className="space-y-8 py-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-6">
        <h1 className="text-3xl font-bold tracking-tight text-[var(--foreground)]">
          Status Pages
        </h1>
        <Button
          asChild
          className="bg-[var(--coral-accent)] hover:bg-[var(--coral-accent)]/90 text-white"
        >
          <Link href="/dashboard/status-pages/new">
            <Plus className="mr-2 size-4" />
            New Status Page
          </Link>
        </Button>
      </div>

      {/* Pages Grid */}
      <div className="grid gap-6 px-6 sm:grid-cols-2 lg:grid-cols-3">
        {MOCK_STATUS_PAGES.map((page) => (
          <div
            key={page.id}
            className="group relative flex flex-col justify-between rounded-xl border border-border/50 bg-white p-6 shadow-sm transition-all hover:border-[var(--coral-accent)]/20 hover:shadow-md dark:bg-card"
          >
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div className="rounded-lg bg-[var(--coral-accent)]/10 p-2 text-[var(--coral-accent)]">
                  <LayoutTemplate className="size-6" />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground outline-none">
                      <MoreHorizontal className="size-4" />
                      <span className="sr-only">Actions</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>Edit</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive">
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div>
                <h3 className="font-semibold text-lg text-foreground">
                  {page.name}
                </h3>
                <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="rounded-md bg-stone-100 px-1.5 py-0.5 font-mono text-xs dark:bg-stone-800">
                    /{page.slug}
                  </span>
                  <span>•</span>
                  <span>{page.monitorCount} monitors</span>
                </div>
              </div>
            </div>

            <div className="mt-6 border-t border-border/50 pt-4">
              <Link
                href={`/status/${page.slug}`} // Assuming this route will exist
                className="flex items-center text-sm font-medium text-[var(--coral-accent)] hover:underline"
              >
                View Public Page
                <ExternalLink className="ml-1.5 size-3" />
              </Link>
            </div>
          </div>
        ))}

        {/* Create Card (Alternative to button) */}
        <Link
          href="/dashboard/status-pages/new"
          className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-transparent p-6 text-center text-muted-foreground transition-colors hover:border-[var(--coral-accent)] hover:bg-[var(--coral-accent)]/5 hover:text-[var(--coral-accent)]"
        >
          <div className="rounded-full bg-stone-100 p-3 dark:bg-stone-800 group-hover:bg-[var(--coral-accent)]/10">
            <Plus className="size-6" />
          </div>
          <span className="mt-3 font-medium">Create another status page</span>
        </Link>
      </div>
    </div>
  );
}
