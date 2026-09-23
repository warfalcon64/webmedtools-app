import { describe, expect, it } from "vitest";
import { alphabet, exerciseText, generateExercise, type Exercise } from "./generate";

// Randomised rules want many draws; each exercise is checked against every rule in ADR 0002.
const exercises: Exercise[] = Array.from({ length: 500 }, () => generateExercise());

const inRange = (n: number, min: number, max: number) => n >= min && n <= max;

describe("generateExercise", () => {
  it("hides a to z in order, one target per word, each holding its letter exactly once", () => {
    for (const exercise of exercises) {
      const targets = exercise.filter((w) => w.target);
      expect(targets.map((w) => w.target)).toEqual(alphabet);
      for (const w of targets) expect(w.text.toLowerCase().split(w.target!).length).toBe(2);
    }
  });

  it("puts 0 to 4 fillers between two targets, none holding the next target", () => {
    for (const exercise of exercises) {
      expect(exercise[0].target).toBe("a");
      expect(exercise.at(-1)!.target).toBe("z");
      let fillers: string[] = [];
      for (const w of exercise) {
        if (!w.target) {
          fillers.push(w.text.toLowerCase());
          continue;
        }
        if (w.target !== "a") {
          expect(inRange(fillers.length, 0, 4)).toBe(true);
          for (const f of fillers) expect(f).not.toContain(w.target);
        }
        fillers = [];
      }
    }
  });

  it("makes words of 3 to 5 letters", () => {
    for (const w of exercises.flat()) expect(w.text).toMatch(/^[a-zA-Z][a-z]{2,4}$/);
  });

  it("writes sentences of 15 to 20 words, capitalised, the last ending the exercise", () => {
    for (const exercise of exercises) {
      expect(exercise.at(-1)!.sentenceEnd).toBe(true);
      let start = 0;
      exercise.forEach((w, i) => {
        expect(w.text[0] === w.text[0].toUpperCase()).toBe(i === start);
        if (!w.sentenceEnd) return;
        expect(inRange(i - start + 1, i === exercise.length - 1 ? 1 : 15, 20)).toBe(true);
        start = i + 1;
      });
    }
  });
});

describe("exerciseText", () => {
  it("joins words with spaces and puts periods after sentence ends", () => {
    expect(exerciseText([{ text: "Abc" }, { text: "de", sentenceEnd: true }, { text: "Fgh" }])).toBe("Abc de. Fgh");
  });
});
