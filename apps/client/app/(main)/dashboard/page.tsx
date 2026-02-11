"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Search, ChevronDown } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Label } from "@/components/Label";
import { MonitorCard } from "@/components/dashboard/MonitorCard";
import { CreateMonitorDropdown } from "@/components/dashboard/CreateMonitorDropdown";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/AlertDialog";

function getErrorMessage(error: { message: string }): string {
  try {
    const parsed = JSON.parse(error.message);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].message) {
      return parsed[0].message;
    }
  } catch {
    // Not JSON, return as-is
  }
  return error.message;
}

export default function DashboardPage() {
  const router = useRouter();
  const utils = trpc.useUtils();

  const [token] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("token");
  });

  // Create Monitor Form State
  const [isCreating, setIsCreating] = useState(false);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [monitorToDelete, setMonitorToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      router.replace("/login");
    }
  }, [router, token]);

  const websitesQuery = trpc.website.status.useQuery(undefined, {
    enabled: !!token,
    retry: false,
    refetchInterval: 60_000,
  });

  const registerWebsite = trpc.website.register.useMutation({
    onSuccess: async () => {
      toast.success("Monitor created", {
        description: "We’ll start monitoring it shortly.",
      });
      setUrl("");
      setName("");
      setIsCreating(false);
      await utils.website.list.invalidate();
    },
    onError: (err) => {
      toast.error("Couldn’t add monitor", {
        description: getErrorMessage(err),
      });
    },
  });

  const deleteWebsite = trpc.website.delete.useMutation({
    onSuccess: async () => {
      toast.success("Monitor deleted");
      setMonitorToDelete(null);
      await Promise.all([
        utils.website.list.invalidate(),
        utils.website.status.invalidate(),
      ]);
    },
    onError: (err) => {
      toast.error("Couldn't delete monitor", {
        description: getErrorMessage(err),
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    registerWebsite.mutate({
      url: url.trim(),
      name: name.trim() ? name.trim() : undefined,
    });
  };

  const websites = websitesQuery.data?.websites ?? [];

  return (
    <div className="space-y-8 py-8">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-6">
        <h1 className="text-3xl font-bold tracking-tight text-[var(--foreground)]">
          Monitors
        </h1>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Search"
              className="pl-9 bg-stone-100/50 border-stone-200 dark:bg-stone-900/50 dark:border-stone-800"
            />
          </div>
          <CreateMonitorDropdown
            onCreateClick={() => setIsCreating(!isCreating)}
          />
        </div>
      </div>

      {/* Creation Form (Inline) */}
      {isCreating && (
        <div className="mx-6 rounded-xl border border-border bg-card p-6 shadow-sm animate-in fade-in slide-in-from-top-4">
          <h2 className="mb-4 text-lg font-semibold">Create new monitor</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="website-url">URL</Label>
                <Input
                  id="website-url"
                  placeholder="https://example.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="website-name">Name (optional)</Label>
                <Input
                  id="website-name"
                  placeholder="My landing page"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsCreating(false)}
              >
                Cancel
              </Button>
              <Button type="submit" isLoading={registerWebsite.isPending}>
                Create Monitor
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Monitors List */}
      <div className="space-y-4 px-6 relative">
        <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground tracking-wider uppercase pl-2">
          <div className="flex items-center gap-2">
            <ChevronDown className="size-3" />
            Monitors
          </div>
          {/* Optional: Add badge count here */}
        </div>

        <div className="space-y-2">
          {websitesQuery.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-16 w-full animate-pulse rounded-xl bg-stone-100 dark:bg-stone-900"
                />
              ))}
            </div>
          ) : websites.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
              No monitors yet. Create one to start monitoring.
            </div>
          ) : (
            websites.map((website) => (
              <MonitorCard
                key={website.websiteId}
                website={website}
                onDelete={(id) => setMonitorToDelete(id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Onboarding Section */}
      <div className="px-6">
        <h3 className="mb-4 text-lg font-semibold text-[var(--foreground)]">
          Get the most out of Better Stack
        </h3>
        <div className="rounded-xl border border-[var(--coral-accent)]/20 bg-[var(--coral-accent)]/5 p-6 dark:bg-[var(--coral-accent)]/10">
          <div className="flex items-start justify-between">
            <div className="flex gap-4">
              <div className="mt-1 flex size-8 items-center justify-center rounded-full border-2 border-[var(--coral-accent)] text-[var(--coral-accent)]">
                <div className="size-2 rounded-full bg-[var(--coral-accent)]" />
              </div>
              <div>
                <h4 className="font-semibold text-[var(--foreground)]">
                  Connect Slack or Microsoft Teams
                </h4>
                <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                  Get alerted about new incidents, and acknowledge and resolve
                  incidents directly from Slack.
                </p>
                <Button
                  variant="secondary"
                  className="mt-4 bg-white dark:bg-black border-border shadow-sm hover:bg-stone-50"
                >
                  Integrations
                </Button>
              </div>
            </div>
            <span className="text-xs font-medium text-muted-foreground">
              5 out of 6 steps left
            </span>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!monitorToDelete}
        onOpenChange={() => setMonitorToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete monitor?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone and all monitoring data will be
              removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                monitorToDelete && deleteWebsite.mutate({ id: monitorToDelete })
              }
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
