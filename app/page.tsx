import Link from "next/link";
import { tools } from "./tools";

export default function Home() {
  return (
    <>
      <h1 className="text-2xl font-semibold">WebMedTools</h1>
      <p className="mt-2 text-slate-600">Free tools for rehabilitation exercises.</p>
      <ul className="mt-6 space-y-4">
        {tools.map((tool) => (
          <li key={tool.name} className="rounded-lg border border-slate-200 p-4">
            <h2 className="font-medium">
              {tool.href ? <Link href={tool.href}>{tool.name}</Link> : tool.name}
            </h2>
            <p className="mt-1 text-slate-600">{tool.description}</p>
            {!tool.href && <p className="mt-2 text-sm text-slate-500">Coming soon.</p>}
          </li>
        ))}
      </ul>
    </>
  );
}
