"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Trash2, Home } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Label } from "@/components/Label";
import { ProfileDropdown } from "@/components/ProfileDropdown";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
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

  const userQuery = trpc.user.me.useQuery(undefined, {
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

  const deleteWebsite = trpc.website.delete.useMutation({
    onSuccess: async () => {
      toast.success("Website deleted", {
        description: "The website has been removed from monitoring.",
      });
      // Invalidate both queries to ensure consistency across pages
      await Promise.all([
        utils.website.list.invalidate(),
        utils.website.status.invalidate(),
      ]);
    },
    onError: (err) => {
      toast.error("Couldn't delete website", {
        description: getErrorMessage(err),
      });
    },
  });

  const isSubmitting = registerWebsite.isPending;
  const isDeleting = deleteWebsite.isPending;
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

  // Build profile data for dropdown
  const profileData = userQuery.data
    ? {
        name: userQuery.data.name || userQuery.data.email || "User",
        email: userQuery.data.email || "",
        avatar: userQuery.data.avatarUrl || undefined,
      }
    : null;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-8 pb-16">
      {/* Breadcrumb Navigation */}
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/" className="flex items-center gap-1.5">
                <Home className="size-4" />
                <span>Home</span>
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Dashboard</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header with Profile Dropdown */}
      <div className="flex items-center justify-between mb-8">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {dashboardTitle}
          </h1>
          <p className="text-sm text-muted-foreground">
            Add the sites you want to monitor.
          </p>
        </div>
        {profileData && <ProfileDropdown data={profileData} />}
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
                <li key={w.id} className="flex items-center gap-4 py-4">
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
                  <div className="flex items-center gap-3">
                    <div className="text-sm text-muted-foreground">
                      {w.isActive ? "Active" : "Paused"}
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          type="button"
                          disabled={isDeleting}
                          className="cursor-pointer rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                          aria-label={`Delete ${w.name || w.url}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete website?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete{" "}
                            <span className="font-medium text-foreground">
                              {w.name || w.url}
                            </span>
                            ? This action cannot be undone and all monitoring
                            data will be removed.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteWebsite.mutate({ id: w.id })}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
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
