export default function SettingsPage() {
  return (
    <div className="max-w-4xl px-6 py-8">
      <h1 className="text-3xl font-bold mb-8">Settings</h1>

      <div className="space-y-6">
        <div className="rounded-xl border border-border bg-white p-6 shadow-sm dark:bg-card">
          <h2 className="text-lg font-semibold mb-2">General</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Manage your general account settings.
          </p>
          <div className="h-8 w-1/3 bg-stone-100 rounded animate-pulse dark:bg-stone-800" />
        </div>

        <div className="rounded-xl border border-border bg-white p-6 shadow-sm dark:bg-card">
          <h2 className="text-lg font-semibold mb-2">Team Members</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Invite and manage team members.
          </p>
          <div className="space-y-3">
            <div className="h-8 w-full bg-stone-100 rounded animate-pulse dark:bg-stone-800" />
            <div className="h-8 w-full bg-stone-100 rounded animate-pulse dark:bg-stone-800" />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-white p-6 shadow-sm dark:bg-card">
          <h2 className="text-lg font-semibold mb-2">Billing</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Manage your subscription and billing details.
          </p>
          <div className="h-24 w-full bg-stone-100 rounded animate-pulse dark:bg-stone-800" />
        </div>
      </div>
    </div>
  );
}
