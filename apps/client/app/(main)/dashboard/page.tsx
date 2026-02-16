"use client";

import { Instrument_Serif } from "next/font/google";
import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Home, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Label } from "@/components/Label";
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
import { StatusOverview } from "@/components/status/StatusOverview";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

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

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
});

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

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    registerWebsite.mutate({
      url: url.trim(),
      name: name.trim() ? name.trim() : undefined,
    });
  };

  return (
    <div className="space-y-8 py-8">
      {/* Page Header + Breadcrumbs */}
      <div className="space-y-2 px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1
            className={`${instrumentSerif.className} text-4xl font-bold tracking-tight text-foreground`}
          >
            Monitors
          </h1>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-2.5 top-2.5 size-5 text-muted-foreground" />
              <Input
                placeholder="Search"
                className="pl-9 bg-muted/10 border-border"
              />
            </div>
            <CreateMonitorDropdown
              onCreateClick={() => setIsCreating(!isCreating)}
            />
          </div>
        </div>

        <Breadcrumb>
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
              <BreadcrumbLink asChild>
                <Link href="/dashboard">Dashboard</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Monitor</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {/* Creation Form (Inline) */}
      {isCreating && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm animate-in fade-in slide-in-from-top-4">
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

      {/* Status Overview (embedded) */}
      <div className="relative min-h-[70vh]">
        <StatusOverview embedded />
      </div>

      {/* Onboarding Section */}
      <div className="px-6">
        <h3 className="mb-4 text-lg font-semibold text-foreground">
          Get the most out of Better Stack
        </h3>
        <div className="rounded-xl border border-primary-action/20 bg-primary-action/5 p-6 dark:bg-primary-action/10">
          <div className="flex items-start justify-between">
            <div className="flex gap-4">
              <div className="mt-1 flex size-8 items-center justify-center rounded-full border-2 border-primary-action text-primary-action">
                <div className="size-2 rounded-full bg-primary-action" />
              </div>
              <div>
                <h4 className="font-semibold text-foreground">
                  Connect Slack or Microsoft Teams
                </h4>
                <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                  Get alerted about new incidents, and acknowledge and resolve
                  incidents directly from Slack.
                </p>
                <Button
                  variant="secondary"
                  className="mt-4 bg-background border-border shadow-sm hover:bg-accent"
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
