export default function IncidentsPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="bg-primary-action/10 p-4 rounded-full mb-4">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-8 text-primary-action"
          aria-hidden={true}
        >
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="M3 9h18" />
          <path d="M9 21V9" />
        </svg>
      </div>
      <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary-action to-chart-3">
        Incidents Coming Soon
      </h1>
      <p className="max-w-[420px] text-muted-foreground mt-2">
        We&apos;re working on a powerful incident management system. You&apos;ll
        be able to track, manage, and resolve incidents directly from this
        dashboard.
      </p>
    </div>
  );
}
