"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Label } from "@/components/Label";

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
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    if (!token) {
      router.replace("/login");
    }
  }, [router, token]);

  const websitesQuery = trpc.website.list.useQuery(undefined, {
    enabled: !!token,
    retry: false,
  });

  useEffect(() => {
    if (websitesQuery.error) {
      toast.error("Failed to load websites", {
        description: getErrorMessage(websitesQuery.error),
      });
    }
  }, [websitesQuery.error]);

  const registerWebsite = trpc.website.register.useMutation({
    onSuccess: async () => {
      toast.success("Website added", {
        description: "We’ll start monitoring it shortly.",
      });
      setUrl("");
      setName("");
      await utils.website.list.invalidate();
    },
    onError: (err) => {
      toast.error("Couldn’t add website", {
        description: getErrorMessage(err),
      });
    },
  });

  const isSubmitting = registerWebsite.isPending;
  const websites = websitesQuery.data?.websites ?? [];

  const dashboardTitle = useMemo(() => {
    if (websitesQuery.isLoading) return "Dashboard";
    return `Dashboard (${websites.length})`;
  }, [websites.length, websitesQuery.isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    registerWebsite.mutate({
      url: url.trim(),
      name: name.trim() ? name.trim() : undefined,
    });
  };

  // While we decide if the user is authed, keep UI minimal to avoid a flash.
  if (!token) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 pt-28 pb-16">
        <div className="rounded-2xl border border-border bg-card p-6 text-card-foreground">
          <div className="text-sm text-muted-foreground">
            Redirecting to{" "}
            <Link href="/login" className="underline underline-offset-4">
              login
            </Link>
            …
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-28 pb-16">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {dashboardTitle}
          </h1>
          <p className="text-sm text-muted-foreground">
            Add the sites you want to monitor.
          </p>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-border bg-card p-6 text-card-foreground">
        <h2 className="text-lg font-semibold">Add a website</h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="website-name">Name (optional)</Label>
              <Input
                id="website-name"
                placeholder="My landing page"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={255}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website-url">URL</Label>
              <Input
                id="website-url"
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                inputMode="url"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Must start with http:// or https://
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push("/status")}
            >
              Check status
            </Button>
            <Button
              type="submit"
              isLoading={isSubmitting}
              loadingText="Adding…"
            >
              Add website
            </Button>
          </div>
        </form>
      </div>

      <div className="mt-8 rounded-2xl border border-border bg-card text-card-foreground">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Your websites</h2>
        </div>

        <div className="px-6 py-4">
          {websitesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : websites.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No websites yet. Add your first one above.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {websites.map((w) => (
                <li key={w.id} className="flex flex-col gap-1 py-4 sm:flex-row">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {w.name || w.url}
                    </div>
                    <a
                      href={w.url}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-sm text-muted-foreground underline underline-offset-4"
                    >
                      {w.url}
                    </a>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {w.isActive ? "Active" : "Paused"}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
