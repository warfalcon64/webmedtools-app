import type { Metadata } from "next";
import { Worksheet } from "./Worksheet";

export const metadata: Metadata = {
  title: "Eye test worksheets | WebMedTools",
  description:
    "Free printable letter-tracking worksheets for concussion rehabilitation, following the Michigan saccades eye test.",
};

const steps = [
  {
    title: "Find a, then b after it.",
    text: "Starting at the top, find and circle the a, then the next b after it, and so on to z.",
  },
  { title: "Time it.", text: "Write the minutes and seconds in the blank under the exercise." },
  {
    title: "Print or save a PDF.",
    text: "The preview shows the pages exactly as they will print. For a PDF, choose “Save as PDF” in the print dialog.",
  },
];

export default function EyeTestPage() {
  return (
    <>
      <div className="glow mt-2 rounded-panel bg-surface p-6 sm:p-10 print:hidden">
        <p className="text-sm font-bold text-second">Vision · Printable</p>
        <h1 className="mt-1 text-3xl font-bold sm:text-4xl">Eye test worksheets</h1>
        <p className="mt-3 max-w-2xl text-lg text-muted">
          Each exercise hides the letters a to z, in order, among random words. Choose how many exercises and the paper
          size; every worksheet is new.
        </p>
        <ol className="mt-6 grid gap-5 sm:grid-cols-3">
          {steps.map((step, i) => (
            <li key={step.title} className="flex flex-col gap-1 text-muted">
              <span className="mb-1 grid size-9 place-items-center rounded-full bg-accent-soft font-bold text-accent">
                {i + 1}
              </span>
              <strong className="text-ink">{step.title}</strong>
              {step.text}
            </li>
          ))}
        </ol>
      </div>
      <Worksheet />
    </>
  );
}
