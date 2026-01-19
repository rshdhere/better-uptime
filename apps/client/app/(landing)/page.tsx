import CodeExample from "@/components/ui/CodeExample";
import Cta from "@/components/ui/Cta";
import Features from "@/components/ui/Features";
import { GlobalUptime } from "@/components/ui/GlobalDatabase";
import Hero from "@/components/ui/Hero";
import LogoCloud from "@/components/ui/LogoCloud";

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
