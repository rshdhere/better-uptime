import { Navigation } from "@/components/ui/Navbar";
import Footer from "@/components/ui/Footer";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Navigation />
      <main className="min-h-screen bg-background">{children}</main>
      <Footer />
    </>
  );
}
