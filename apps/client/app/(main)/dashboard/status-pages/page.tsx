"use client";

import Link from "next/link";
import { toast } from "sonner";
import {
  ExternalLink,
  LayoutTemplate,
  Loader2,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/Button";
import { trpc } from "@/lib/trpc";

function getErrorMessage(error: { message: string }): string {
  try {
    const parsed = JSON.parse(error.message);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].message) {
      return parsed[0].message;
    }
  } catch {
    // Keep original message when payload is not JSON.
  }
  return error.message;
}

export default function StatusPagesPage() {
  const utils = trpc.useUtils();
  const statusPagesQuery = trpc.statusPage.list.useQuery(undefined, {
    retry: false,
  });

  const verifyDomain = trpc.statusDomain.verify.useMutation({
    onSuccess: async (result) => {
      if (result.verificationStatus === "VERIFIED") {
        toast.success("Domain verified", {
          description: `${result.hostname} is now active.`,
        });
      } else {
        toast.error("Verification failed", {
          description: "DNS records are not ready yet. Try again in a minute.",
        });
      }

      await utils.statusPage.list.invalidate();
    },
    onError: (error) => {
      toast.error("Could not verify domain", {
        description: getErrorMessage(error),
      });
    },
  });

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
        {statusPagesQuery.isLoading ? (
          <div className="sm:col-span-2 lg:col-span-3 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            Loading status pages...
          </div>
        ) : statusPagesQuery.isError ? (
          <div className="sm:col-span-2 lg:col-span-3 rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
            {getErrorMessage(statusPagesQuery.error)}
          </div>
        ) : statusPagesQuery.data?.statusPages.length ? (
          statusPagesQuery.data.statusPages.map((page) => (
            <div
              key={page.id}
              className="group relative flex flex-col justify-between rounded-xl border border-border bg-card p-6 shadow-sm transition-all hover:border-primary-action/20 hover:shadow-md"
            >
              <div className="space-y-4">
                <div className="rounded-lg bg-primary-action/10 p-2 text-primary-action w-fit">
                  <LayoutTemplate className="size-6" />
                </div>

                <div>
                  <h3 className="font-semibold text-lg text-foreground">
                    {page.name}
                  </h3>
                  <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {page.slug}
                    </span>
                    <span>•</span>
                    <span>{page.monitorCount} monitors</span>
                  </div>
                </div>

                <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-sm">
                  {page.domain ? (
                    <>
                      <div className="font-medium text-foreground break-all">
                        {page.domain.hostname}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs">
                        <span
                          className={
                            page.domain.verificationStatus === "VERIFIED"
                              ? "text-primary-action"
                              : "text-amber-600 dark:text-amber-400"
                          }
                        >
                          {page.domain.verificationStatus}
                        </span>
                        {page.domain.verificationStatus === "VERIFIED" ? (
                          <ShieldCheck className="size-3 text-primary-action" />
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      No domain configured yet.
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-6 border-t border-border/50 pt-4 space-y-3">
                {page.domain?.verificationStatus === "VERIFIED" ? (
                  <a
                    href={`https://${page.domain.hostname}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center text-sm font-medium text-primary-action hover:underline"
                  >
                    View Public Page
                    <ExternalLink className="ml-1.5 size-3" />
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Verify DNS to activate your public status page.
                  </p>
                )}

                {page.domain &&
                page.domain.verificationStatus !== "VERIFIED" ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    onClick={() =>
                      verifyDomain.mutate({
                        statusPageId: page.id,
                        hostname: page.domain!.hostname,
                      })
                    }
                    disabled={verifyDomain.isPending}
                  >
                    {verifyDomain.isPending ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      "Verify DNS"
                    )}
                  </Button>
                ) : null}
              </div>
            </div>
          ))
        ) : (
          <div className="sm:col-span-2 lg:col-span-3 rounded-xl border border-border bg-card p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No status pages yet. Create your first one to publish monitor
              health.
            </p>
          </div>
        )}

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
