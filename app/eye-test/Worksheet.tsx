"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { alphabet, exerciseText, generateExercise, type Exercise } from "@/lib/eye-test/generate";
import { paginate } from "@/lib/eye-test/paginate";

// Sizes in CSS pixels (96 per inch), the unit both the screen and the printer use. The preview draws these very
// sheets, and printing prints them, so what is seen is what prints.
const INCH = 96;
const MM = INCH / 25.4;
const papers = {
  letter: { label: "US Letter", css: "letter", width: 8.5 * INCH, height: 11 * INCH },
  a4: { label: "A4", css: "A4", width: 210 * MM, height: 297 * MM },
} as const;
type Paper = keyof typeof papers;

const MARGIN = 0.75 * INCH;
const GAP = 0.5 * INCH; // between two exercises on a page, with the dividing line in its middle
// A sheet a hair shorter than the paper, so rounding in the printer never spills it onto a second page.
const SLACK = 2;
const MAX_EXERCISES = 100;
const SHEET_SPACING = 24; // below each sheet on screen, the mb-6 on <section>

// The alphabet for the patient to refer to, the words, and a blank for the time taken, as on the published sheets.
function ExerciseBlock({ exercise, number }: { exercise: Exercise; number: number }) {
  return (
    <div className="font-['Times_New_Roman',Times,serif]">
      <div className="flex items-baseline justify-between">
        <p className="font-sans text-[10pt] text-slate-500">Exercise {number}</p>
        <p className="text-[13pt] [word-spacing:0.25em]">{alphabet.join(" ")}</p>
      </div>
      <p className="mt-[0.08in] text-[16pt] leading-[1.6] [word-spacing:0.15em]">{exerciseText(exercise)}</p>
      <p className="mt-[0.08in] text-right text-[12pt]">___ Min. ___ Sec.</p>
    </div>
  );
}

export function Worksheet() {
  const [count, setCount] = useState("4");
  const [paper, setPaper] = useState<Paper>("letter");
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [pages, setPages] = useState<number[][]>([]);
  const [scale, setScale] = useState(1);
  const measureRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const size = papers[paper];
  const contentWidth = size.width - 2 * MARGIN;
  const contentHeight = size.height - SLACK - 2 * MARGIN;

  const generate = () => {
    const n = Math.min(MAX_EXERCISES, Math.max(1, Math.floor(Number(count)) || 1));
    setCount(String(n));
    setExercises(Array.from({ length: n }, () => generateExercise()));
    setPages([]); // the old pages point at the old exercises until the new ones are measured
  };

  // A worksheet is random, so it is made in the browser once the page loads, never at build time.
  useEffect(generate, []);

  // Measure every exercise at the page's text width, off screen and unscaled, then pack them onto pages.
  useLayoutEffect(() => {
    const blocks = Array.from(measureRef.current?.children ?? []);
    setPages(paginate(blocks.map((b) => b.getBoundingClientRect().height), contentHeight, GAP));
  }, [exercises, contentWidth, contentHeight]);

  // Shrink the sheets to fit a narrow screen, without re-wrapping them.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(() => setScale(Math.min(1, frame.clientWidth / size.width)));
    observer.observe(frame);
    return () => observer.disconnect();
  }, [size.width]);

  const sheetHeight = size.height - SLACK;
  const scaledHeight = pages.length * (sheetHeight + SHEET_SPACING) * scale;

  return (
    <>
      {/* Printing uses this paper size, with no margin of its own: the sheets carry their margins. */}
      <style>{`@page { size: ${size.css}; margin: 0; }`}</style>

      <div className="mt-6 flex flex-wrap items-end gap-4 print:hidden">
        <label className="flex flex-col text-sm text-slate-600">
          Exercises
          <input
            type="number"
            min={1}
            max={MAX_EXERCISES}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            className="mt-1 w-24 rounded border border-slate-300 px-2 py-1 text-slate-900"
          />
        </label>
        <label className="flex flex-col text-sm text-slate-600">
          Paper
          <select
            value={paper}
            onChange={(e) => setPaper(e.target.value as Paper)}
            className="mt-1 rounded border border-slate-300 px-2 py-1 text-slate-900"
          >
            {Object.entries(papers).map(([key, p]) => (
              <option key={key} value={key}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <button onClick={generate} className="rounded bg-slate-900 px-4 py-1.5 text-white hover:bg-slate-700">
          Generate
        </button>
        <button
          onClick={() => window.print()}
          disabled={pages.length === 0}
          className="rounded border border-slate-300 px-4 py-1.5 hover:bg-slate-50 disabled:opacity-50"
        >
          Print
        </button>
        <p className="text-sm text-slate-500">
          {pages.length} {pages.length === 1 ? "page" : "pages"}
        </p>
      </div>

      <div
        aria-hidden
        ref={measureRef}
        className="invisible absolute left-[-10000px] top-0 print:hidden"
        style={{ width: contentWidth }}
      >
        {exercises.map((exercise, i) => (
          <ExerciseBlock key={i} exercise={exercise} number={i + 1} />
        ))}
      </div>

      <div
        ref={frameRef}
        className="mt-6 overflow-hidden print:mt-0 print:h-auto! print:overflow-visible"
        style={{ height: scaledHeight }}
      >
        <div
          className="origin-top-left print:transform-none!"
          style={{ width: size.width, transform: `scale(${scale})` }}
        >
          {pages.map((page, p) => (
            // Exact colours: without them Chrome darkens light text when printing, and the page would not match.
            <section
              key={p}
              className="mb-6 overflow-hidden bg-white shadow-md ring-1 ring-slate-200 [print-color-adjust:exact] break-after-page last:break-after-auto print:mb-0 print:shadow-none print:ring-0"
              style={{ width: size.width, height: sheetHeight, padding: MARGIN }}
            >
              {page.map((i, n) => (
                <div key={i}>
                  {n > 0 && (
                    <div className="flex items-center" style={{ height: GAP }}>
                      <div className="w-full border-t border-slate-400" />
                    </div>
                  )}
                  <ExerciseBlock exercise={exercises[i]} number={i + 1} />
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
