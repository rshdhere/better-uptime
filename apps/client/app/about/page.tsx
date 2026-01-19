import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import Benefits from "@/components/ui/Benefits";
import TeamGallery from "@/components/ui/TeamGallery";
import { cx } from "@/lib/utils";
import Balancer from "react-wrap-balancer";

export default function About() {
  return (
    <div className="mt-36 flex flex-col overflow-hidden px-3">
      <section
        aria-labelledby="about-overview"
        className="animate-slide-up-fade"
        style={{
          animationDuration: "600ms",
          animationFillMode: "backwards",
        }}
      >
        <Badge>about uptiqué</Badge>
        <h1
          id="about-overview"
          className="mt-2 inline-block bg-gradient-to-br from-gray-900 to-gray-800 bg-clip-text py-2 text-4xl font-bold tracking-tighter text-transparent sm:text-6xl md:text-6xl dark:from-gray-50 dark:to-gray-300"
        >
          <Balancer>
            We are engineers, building the uptime platform we always wanted
          </Balancer>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-gray-700 dark:text-gray-400">
          Reliable uptime is now a core expectation for every business, not a
          nice-to-have. <br /> Uptiqué is built to keep your services available,
          observable, and trustworthy.
        </p>
      </section>
      <TeamGallery />
      <Benefits />
      <section aria-labelledby="vision-title" className="mx-auto mt-40">
        <h2
          id="vision-title"
          className="inline-block bg-gradient-to-t from-gray-900 to-gray-800 bg-clip-text py-2 text-4xl font-bold tracking-tighter text-transparent md:text-5xl dark:from-gray-50 dark:to-gray-300"
        >
          Our Vision
        </h2>
        <div className="mt-6 max-w-prose space-y-4 text-gray-600 dark:text-gray-400">
          <p className="text-lg leading-8">
            We envision a world where monitoring and incident response are no
            longer a complex challenge but a powerful advantage. By combining
            great developer experience with smart alerting, we help teams catch
            issues before users do.
          </p>
          <p className="text-lg leading-8">
            We believe in removing the barriers of data complexity and
            scalability, enabling teams to focus on insights and innovations
            rather than maintenance and management. Our goal is to equip every
            organization with the tools they need to harness the full potential
            of their data, driving growth and excellence in every interaction.
          </p>
          <p
            className={cx(
              "w-fit rotate-3 font-handwriting text-3xl text-indigo-600 dark:text-indigo-400",
            )}
          >
            – Alex and Robin
          </p>
        </div>
        <Button className="mt-32 h-10 w-full shadow-xl shadow-indigo-500/20">
          View Open Roles
        </Button>
      </section>
    </div>
  );
}
