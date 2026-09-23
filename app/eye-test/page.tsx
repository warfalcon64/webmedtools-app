import type { Metadata } from "next";
import { Worksheet } from "./Worksheet";

export const metadata: Metadata = {
  title: "Eye test worksheets | WebMedTools",
  description:
    "Free printable letter-tracking worksheets for concussion rehabilitation, following the Michigan saccades eye test.",
};

export default function EyeTestPage() {
  return (
    <>
      <div className="print:hidden">
        <h1 className="text-2xl font-semibold">Eye test worksheets</h1>
        <p className="mt-2 text-slate-600">
          Each exercise hides the letters a to z, in order, among random words. Starting at the top, find and circle
          the a, then the next b after it, and so on to z.
        </p>
        <p className="mt-2 text-slate-600">
          Choose how many exercises and the paper size, then print. The preview shows the pages exactly as they will
          print; to save a PDF, choose &ldquo;Save as PDF&rdquo; in the print dialog.
        </p>
      </div>
      <Worksheet />
    </>
  );
}
