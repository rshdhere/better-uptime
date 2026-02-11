export default function HeartbeatsPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="bg-[var(--coral-accent)]/10 p-4 rounded-full mb-4">
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
          className="size-8 text-[var(--coral-accent)]"
        >
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
        </svg>
      </div>
      <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[var(--coral-accent)] to-orange-600">
        Heartbeats Coming Soon
      </h1>
      <p className="max-w-[420px] text-muted-foreground mt-2">
        Monitor your cron jobs and background tasks with Heartbeats. Ensure your
        recurring jobs are running as expected.
      </p>
    </div>
  );
}
