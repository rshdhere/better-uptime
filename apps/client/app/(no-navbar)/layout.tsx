import Footer from "@/components/ui/Footer";

export default function NoNavbarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Left diagonal stripe border */}
      <div
        className="diagonal-stripes pointer-events-none fixed top-0 left-0 z-10 hidden h-full w-24 lg:block"
        aria-hidden="true"
      />
      {/* Right diagonal stripe border */}
      <div
        className="diagonal-stripes pointer-events-none fixed top-0 right-0 z-10 hidden h-full w-24 lg:block"
        aria-hidden="true"
      />
      <main className="min-h-screen">{children}</main>
      <Footer />
    </>
  );
}
