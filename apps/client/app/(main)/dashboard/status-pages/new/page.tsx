"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Label } from "@/components/Label";
import { trpc } from "@/lib/trpc";

export default function NewStatusPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  // Use status query to get monitors list for selection
  const websitesQuery = trpc.website.status.useQuery(undefined, {
    retry: false,
  });

  const websites = websitesQuery.data?.websites ?? [];
  const [selectedMonitors, setSelectedMonitors] = useState<string[]>([]);

  const toggleMonitor = (id: string) => {
    setSelectedMonitors((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement actual creation
    console.log("Creating status page:", { name, slug, selectedMonitors });
    router.push("/dashboard/status-pages");
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
        <h1 className="text-3xl font-bold tracking-tight text-[var(--foreground)]">
          Create Status Page
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Page Details */}
        <div className="rounded-xl border border-border bg-white p-6 shadow-sm dark:bg-card">
          <h2 className="mb-4 text-lg font-semibold">Page Details</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Basic information about your public status page.
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
              <Label htmlFor="slug">URL Slug</Label>
              <div className="flex rounded-md shadow-sm">
                <span className="inline-flex items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
                  betterstack.com/status/
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
          </div>
        </div>

        {/* Select Monitors */}
        <div className="rounded-xl border border-border bg-white p-6 shadow-sm dark:bg-card">
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

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            Create Status Page
          </Button>
        </div>
      </form>
    </div>
  );
}
