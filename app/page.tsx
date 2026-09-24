import Link from "next/link";
import { toolIcons } from "./icons";
import { groups, tools } from "./tools";

export default function Home() {
  return (
    <>
      <section className="mt-2 rounded-[28px] bg-linear-135 from-hero-from via-hero-via to-hero-to px-6 py-10 sm:px-14 sm:py-14">
        <p className="inline-block rounded-full bg-surface px-3.5 py-1 text-sm font-bold text-second">
          Free · No sign-up · Nothing to install
        </p>
        <h1 className="mt-5 max-w-2xl text-4xl leading-tight font-bold sm:text-5xl">
          Rehabilitation exercises, ready to print.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          Worksheets for concussion rehabilitation, for patients practising at home and the clinicians who set the work.
        </p>
      </section>

      {groups.map((group) => {
        const inGroup = tools.filter((tool) => tool.group === group);
        if (inGroup.length === 0) return null;
        return (
          <section key={group} className="mt-10">
            <h2 className="text-2xl font-bold">{group}</h2>
            <ul className="mt-4 grid gap-5 sm:grid-cols-2">
              {inGroup.map((tool) => {
                const Icon = toolIcons[tool.icon];
                return (
                  <li key={tool.href}>
                    <Link
                      href={tool.href}
                      className="flex h-full flex-col gap-3 rounded-[22px] border border-line bg-surface p-6 shadow-[0_10px_30px_-12px] shadow-accent/25 hover:border-accent"
                    >
                      <span className="grid size-13 place-items-center rounded-2xl bg-accent-soft text-accent">
                        <Icon className="size-7" />
                      </span>
                      <span className="text-xl font-bold">{tool.name}</span>
                      <span className="text-muted">{tool.description}</span>
                      <span className="mt-auto self-start rounded-full bg-button px-4.5 py-2 text-sm font-bold text-white">
                        Open {tool.navName.toLowerCase()} →
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </>
  );
}
