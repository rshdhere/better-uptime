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
        className="mt-2 inline-block bg-gradient-to-br from-foreground to-foreground/80 bg-clip-text py-2 text-4xl font-bold tracking-tighter text-transparent sm:text-6xl md:text-6xl"
      >
        Built by developers, <br /> for developers
      </h2>
      <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
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
            <div className="w-fit rounded-lg p-2 shadow-md ring-1 ring-border bg-card">
              <item.icon
                aria-hidden="true"
                className="size-6 text-primary-action"
              />
            </div>
            <dt className="mt-6 font-semibold text-foreground">{item.name}</dt>
            <dd className="mt-2 leading-7 text-muted-foreground">
              {item.description}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
