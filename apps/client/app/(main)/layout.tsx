import { Navigation } from "@/components/ui/Navbar";
import { ConditionalFooter } from "@/components/ui/ConditionalFooter";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Navigation />
      <main className="min-h-screen">{children}</main>
      <ConditionalFooter />
    </>
  );
}
