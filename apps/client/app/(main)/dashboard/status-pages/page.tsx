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
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Status Pages
        </h1>
        <Button asChild variant="primary">
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
            className="group relative flex flex-col justify-between rounded-xl border border-border bg-card p-6 shadow-sm transition-all hover:border-primary-action/20 hover:shadow-md"
          >
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div className="rounded-lg bg-primary-action/10 p-2 text-primary-action">
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
                  <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">
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
                className="flex items-center text-sm font-medium text-primary-action hover:underline"
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
          className="group flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-transparent p-6 text-center text-muted-foreground transition-colors hover:border-primary-action hover:bg-primary-action/5 hover:text-primary-action"
        >
          <div className="rounded-full bg-muted p-3 group-hover:bg-primary-action/10">
            <Plus className="size-6 text-foreground group-hover:text-foreground" />
          </div>
          <span className="mt-3 font-medium">Create another status page</span>
        </Link>
      </div>
    </div>
  );
}
