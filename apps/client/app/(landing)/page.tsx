import dynamic from "next/dynamic";
import Hero from "@/components/ui/Hero";

const LogoCloud = dynamic(() => import("@/components/ui/LogoCloud"));

const GlobalUptime = dynamic(
  () => import("@/components/ui/GlobalDatabase").then((m) => m.GlobalUptime),
  {
    loading: () => (
      <section
        aria-label="Global uptime loading"
        className="mx-auto mt-28 flex w-full max-w-6xl items-center justify-center px-3"
      >
        <div className="h-80 w-full max-w-4xl rounded-3xl bg-gradient-to-br from-gray-100 to-gray-50 shadow-inner dark:from-gray-900 dark:to-gray-950" />
      </section>
    ),
  },
);

const CodeExample = dynamic(() => import("@/components/ui/CodeExample"));

const Features = dynamic(() => import("@/components/ui/Features"));

const Cta = dynamic(() => import("@/components/ui/Cta"));

export default function Home() {
  return (
    <main className="flex flex-col overflow-hidden">
      <Hero />
      <LogoCloud />
      <GlobalUptime />
      <CodeExample />
      <Features />
      <Cta />
    </main>
  );
}
