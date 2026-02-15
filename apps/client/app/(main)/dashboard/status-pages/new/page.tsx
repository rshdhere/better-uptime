"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Label } from "@/components/Label";
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

export default function NewStatusPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [hostname, setHostname] = useState("");
  const [createdStatusPageId, setCreatedStatusPageId] = useState<string | null>(
    null,
  );
  const [dnsInstructions, setDnsInstructions] = useState<{
    statusPageId: string;
    hostname: string;
    verificationStatus: "PENDING" | "VERIFIED" | "FAILED";
    cnameRecordName: string;
    cnameRecordValue: string;
    txtRecordName: string;
    txtRecordValue: string;
  } | null>(null);

  // Use monitor status query to get monitor list for selection.
  const websitesQuery = trpc.website.status.useQuery(undefined, {
    retry: false,
  });

  const createStatusPage = trpc.statusPage.create.useMutation();
  const requestVerification =
    trpc.statusDomain.requestVerification.useMutation();
  const verifyDomain = trpc.statusDomain.verify.useMutation({
    onSuccess: async (result) => {
      if (result.verificationStatus === "VERIFIED") {
        toast.success("Domain verified", {
          description: `${result.hostname} is now active.`,
        });
        await utils.statusPage.list.invalidate();
      } else {
        toast.error("Verification failed", {
          description: "DNS records are not ready yet. Try again in a minute.",
        });
      }
    },
    onError: (error) => {
      toast.error("Could not verify domain", {
        description: getErrorMessage(error),
      });
    },
  });

  const websites = websitesQuery.data?.websites ?? [];
  const [selectedMonitors, setSelectedMonitors] = useState<string[]>([]);

  const toggleMonitor = (id: string) => {
    setSelectedMonitors((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedMonitors.length === 0) {
      toast.error("Select at least one monitor");
      return;
    }

    try {
      const statusPage = await createStatusPage.mutateAsync({
        name,
        slug,
        monitorIds: selectedMonitors,
        isPublished: true,
      });
      setCreatedStatusPageId(statusPage.id);

      const verification = await requestVerification.mutateAsync({
        statusPageId: statusPage.id,
        hostname,
      });
      setDnsInstructions(verification);

      toast.success("Status page created", {
        description: "Add the DNS records below, then run verification.",
      });
      await utils.statusPage.list.invalidate();
    } catch (error) {
      toast.error("Could not create status page", {
        description: getErrorMessage(error as { message: string }),
      });
    }
  };

  return (
    <div className="max-w-2xl px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/dashboard/status-pages"
          className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 size-4" />
          Back to Status Pages
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Create Status Page
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Page Details */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Page Details</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Configure your public status page and custom hostname.
          </p>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="e.g. Acme Inc. Status"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">Internal Slug</Label>
              <div className="flex rounded-md shadow-sm">
                <span className="inline-flex items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
                  status-page/
                </span>
                <Input
                  id="slug"
                  className="rounded-l-none"
                  placeholder="acme-inc"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="hostname">Public Hostname</Label>
              <Input
                id="hostname"
                placeholder="status.startup.com"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Use a hostname like <code>status.your-domain.com</code>.
              </p>
            </div>
          </div>
        </div>

        {/* Select Monitors */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Select Monitors</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Choose which monitors to display on this status page.
          </p>

          <div className="space-y-2">
            {websitesQuery.isLoading ? (
              <div className="text-sm text-muted-foreground">
                Loading monitors...
              </div>
            ) : websites.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No monitors available.
              </div>
            ) : (
              websites.map((site) => (
                <div
                  key={site.websiteId}
                  className={`flex items-center gap-3 rounded-lg border p-3 transition-colors cursor-pointer ${
                    selectedMonitors.includes(site.websiteId)
                      ? "border-primary-action bg-primary-action/5"
                      : "border-border hover:bg-muted"
                  }`}
                  onClick={() => toggleMonitor(site.websiteId)}
                >
                  <input
                    type="checkbox"
                    checked={selectedMonitors.includes(site.websiteId)}
                    onChange={() => {}} // Handled by div click
                    className="size-4 rounded border-border text-primary-action focus:ring-2 focus:ring-ring"
                  />
                  <div className="flex-1">
                    <div className="font-medium">
                      {site.websiteName || site.websiteUrl}
                    </div>
                    {site.currentStatus?.status && (
                      <div className="text-xs text-muted-foreground">
                        Status: {site.currentStatus.status}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground text-right">
            {selectedMonitors.length} selected
          </p>
        </div>

        {/* DNS Instructions */}
        {dnsInstructions ? (
          <div className="rounded-xl border border-primary-action/30 bg-primary-action/5 p-6">
            <h2 className="mb-2 text-lg font-semibold text-foreground">
              DNS Verification
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Add the records below in your DNS provider, wait for propagation,
              then verify.
            </p>

            <div className="space-y-4 text-sm">
              <div className="rounded-md border border-border bg-background p-3">
                <p className="font-medium">CNAME record</p>
                <p className="mt-1 text-muted-foreground break-all">
                  <span className="font-medium text-foreground">Name:</span>{" "}
                  {dnsInstructions.cnameRecordName}
                </p>
                <p className="text-muted-foreground break-all">
                  <span className="font-medium text-foreground">Value:</span>{" "}
                  {dnsInstructions.cnameRecordValue}
                </p>
              </div>

              <div className="rounded-md border border-border bg-background p-3">
                <p className="font-medium">TXT record</p>
                <p className="mt-1 text-muted-foreground break-all">
                  <span className="font-medium text-foreground">Name:</span>{" "}
                  {dnsInstructions.txtRecordName}
                </p>
                <p className="text-muted-foreground break-all">
                  <span className="font-medium text-foreground">Value:</span>{" "}
                  {dnsInstructions.txtRecordValue}
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                type="button"
                variant="primary"
                onClick={() =>
                  verifyDomain.mutate({
                    statusPageId: dnsInstructions.statusPageId,
                    hostname: dnsInstructions.hostname,
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

              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push("/dashboard/status-pages")}
              >
                Go to Status Pages
              </Button>
            </div>

            {verifyDomain.data?.verificationStatus === "VERIFIED" ? (
              <div className="mt-4 inline-flex items-center gap-2 rounded-md border border-primary-action/30 bg-primary-action/10 px-3 py-2 text-sm text-primary-action">
                <ShieldCheck className="size-4" />
                Domain verified successfully.
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={
              createStatusPage.isPending || requestVerification.isPending
            }
            disabled={Boolean(createdStatusPageId)}
          >
            Create Status Page
          </Button>
        </div>
      </form>
    </div>
  );
}
