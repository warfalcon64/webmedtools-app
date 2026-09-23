// A port of the legacy generator (ADR 0002): Generator.generate, WordMaker and WordArranger in the legacy app.
// Word and sentence lengths are the legacy values; the fillers between targets follow the published worksheets,
// and the legacy line breaks are gone, since the text wraps to the page. Change a rule only through a brainstorm.

export const alphabet = "abcdefghijklmnopqrstuvwxyz".split("");

export type Word = {
  text: string;
  /** The letter this word hides, when it is a target; fillers have none. */
  target?: string;
  /** A period follows this word. */
  sentenceEnd?: boolean;
};

/** An exercise is one paragraph of words, wrapped to the page width. */
export type Exercise = Word[];

type Random = () => number;

// A whole number from min to max, inclusive.
const between = (random: Random, min: number, max: number) => min + Math.floor(random() * (max - min + 1));

function randomWord(random: Random, accept: (word: string) => boolean): string {
  for (;;) {
    const length = between(random, 3, 5);
    let word = "";
    for (let i = 0; i < length; i++) word += alphabet[Math.floor(random() * alphabet.length)];
    if (accept(word)) return word;
  }
}

export function generateExercise(random: Random = Math.random): Exercise {
  // The words: a target for each letter in order, holding it exactly once, then 0 to 4 fillers that never hold the
  // next target. So any five words in a row hold a target, and every printed line has one.
  const words: Exercise = [];
  alphabet.forEach((letter, i) => {
    words.push({ text: randomWord(random, (w) => w.split(letter).length === 2), target: letter });
    const next = alphabet[i + 1];
    if (!next) return;
    const fillers = between(random, 0, 4);
    for (let n = 0; n < fillers; n++) words.push({ text: randomWord(random, (w) => !w.includes(next)) });
  });

  // Sentences of 15 to 20 words (the legacy sentencer), each starting with a capital; the last ends the exercise.
  let sentenceLength = between(random, 15, 20);
  let inSentence = 0;
  return words.map((word, i) => {
    const text = inSentence === 0 ? word.text[0].toUpperCase() + word.text.slice(1) : word.text;
    const sentenceEnd = ++inSentence === sentenceLength || i === words.length - 1;
    if (sentenceEnd) {
      inSentence = 0;
      sentenceLength = between(random, 15, 20);
    }
    return { ...word, text, ...(sentenceEnd && { sentenceEnd }) };
  });
}

export const exerciseText = (exercise: Exercise) =>
  exercise.map((w) => w.text + (w.sentenceEnd ? "." : "")).join(" ");
