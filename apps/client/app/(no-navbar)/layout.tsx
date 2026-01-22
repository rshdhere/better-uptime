import Footer from "@/components/ui/Footer";

export default function NoNavbarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <main className="relative min-h-screen">
        {/* Stripe borders container - centered with content */}
        <div
          className="pointer-events-none absolute inset-0 hidden justify-center lg:flex"
          aria-hidden="true"
        >
          <div className="flex w-full max-w-5xl">
            {/* Left diagonal stripe border */}
            <div className="diagonal-stripes absolute -left-4 h-full w-3 -translate-x-full" />
            {/* Right diagonal stripe border */}
            <div className="diagonal-stripes absolute -right-4 h-full w-3 translate-x-full" />
          </div>
        </div>
        {children}
      </main>
      <Footer />
    </>
  );
}
