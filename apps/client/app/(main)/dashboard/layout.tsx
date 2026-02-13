import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { DashboardMobileHeader } from "@/components/dashboard/DashboardMobileHeader";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      <DashboardSidebar />
      {/* Mobile: sticky header with user profile; Desktop: main content offset by fixed sidebar */}
      <div className="flex flex-1 flex-col min-w-0 md:ml-64">
        <DashboardMobileHeader />
        <main className="flex-1 transition-all pt-0">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
