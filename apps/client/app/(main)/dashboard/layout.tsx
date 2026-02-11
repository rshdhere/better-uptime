import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-cream">
      <DashboardSidebar />
      {/* Add padding-left to account for fixed sidebar on desktop */}
      <main className="flex-1 pl-0 transition-all md:pl-64">
        {/* Container for content */}
        <div className="mx-auto w-full max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
