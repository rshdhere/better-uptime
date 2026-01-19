import Code from "@/components/Code";
import {
  RiLinksLine,
  RiPlugLine,
  RiShieldKeyholeLine,
  RiStackLine,
} from "@remixicon/react";
import { Badge } from "../Badge";
import CodeExampleTabs from "./CodeExampleTabs";

const code = `CREATE TABLE Services (
    service_id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    region VARCHAR(50),
    status VARCHAR(20) DEFAULT 'healthy'
);

CREATE TABLE Checks (
    check_id SERIAL PRIMARY KEY,
    service_id INT REFERENCES Services(service_id),
    endpoint_url VARCHAR(500),
    check_type VARCHAR(50),
    interval_seconds INT DEFAULT 60
);

CREATE TABLE Incidents (
    incident_id SERIAL PRIMARY KEY,
    check_id INT REFERENCES Checks(check_id),
    started_at TIMESTAMP,
    resolved_at TIMESTAMP,
    severity VARCHAR(20)
);

CREATE TABLE Alert_Rules (
    rule_id SERIAL PRIMARY KEY,
    check_id INT REFERENCES Checks(check_id),
    channel VARCHAR(50),
    threshold_ms INT,
    slo_target DECIMAL(5, 2),
    severity VARCHAR(20),
    enabled BOOLEAN DEFAULT true
);`;

const code2 = `async function configureAlertRules() {
    // Group checks by service and set SLO-based alerting
    const result = await prisma.alert_rules.createMany({
        data: [
            {
                check_id: 1,
                channel: 'slack',
                threshold_ms: 500,
                slo_target: 99.9,
                severity: 'warning',
                enabled: true
            },
            {
                check_id: 1,
                channel: 'pagerduty',
                threshold_ms: 1000,
                slo_target: 99.5,
                severity: 'critical',
                enabled: true
            }
        ]
    });
    
    // Page the right team when SLO is breached
    const incidents = await prisma.incidents.findMany({
        where: {
            check: {
                service: {
                    name: 'API Gateway'
                }
            },
            severity: 'critical',
            resolved_at: null
        },
        include: {
            check: {
                include: {
                    service: true,
                    alert_rules: {
                        where: {
                            enabled: true,
                            severity: 'critical'
                        }
                    }
                }
            }
        }
    });
    
    return { rules: result, activeIncidents: incidents };
}`;

const features = [
  {
    name: "Use Uptiqué",
    description:
      "SDKs and APIs for everything from Next.js to background workers and cron jobs.",
    icon: RiStackLine,
  },
  {
    name: "Plug & play checks",
    description:
      "Start monitoring HTTP endpoints and scheduled tasks in minutes from the dashboard.",
    icon: RiPlugLine,
  },
  {
    name: "Integrations",
    description:
      "Pipe incidents into Slack, PagerDuty, or your existing on-call tooling with a few clicks.",
    icon: RiLinksLine,
  },
  {
    name: "Security & privacy",
    description:
      "All monitoring data is encrypted at rest, with fine-grained access controls for your team.",
    icon: RiShieldKeyholeLine,
  },
];

export default function CodeExample() {
  return (
    <section
      aria-labelledby="code-example-title"
      className="mx-auto mt-28 w-full max-w-6xl px-3"
    >
      <Badge>Developer-first</Badge>
      <h2
        id="code-example-title"
        className="mt-2 inline-block bg-gradient-to-br from-gray-900 to-gray-800 bg-clip-text py-2 text-4xl font-bold tracking-tighter text-transparent sm:text-6xl md:text-6xl dark:from-gray-50 dark:to-gray-300"
      >
        Built by developers, <br /> for developers
      </h2>
      <p className="mt-6 max-w-2xl text-lg text-gray-600 dark:text-gray-400">
        Developer-first monitoring that lets you define checks, SLOs, and alert
        rules in code — tailored to how your services actually work.
      </p>
      <CodeExampleTabs
        tab1={
          <Code code={code} lang="sql" copy={false} className="h-[31rem]" />
        }
        tab2={
          <Code
            code={code2}
            lang="javascript"
            copy={false}
            className="h-[31rem]"
          />
        }
      />
      <dl className="mt-24 grid grid-cols-4 gap-10">
        {features.map((item) => (
          <div
            key={item.name}
            className="col-span-full sm:col-span-2 lg:col-span-1"
          >
            <div className="w-fit rounded-lg p-2 shadow-md shadow-indigo-400/30 ring-1 ring-black/5 dark:shadow-indigo-600/30 dark:ring-white/5">
              <item.icon
                aria-hidden="true"
                className="size-6 text-indigo-600 dark:text-indigo-400"
              />
            </div>
            <dt className="mt-6 font-semibold text-gray-900 dark:text-gray-50">
              {item.name}
            </dt>
            <dd className="mt-2 leading-7 text-gray-600 dark:text-gray-400">
              {item.description}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
