import type { toolIcons } from "./icons";

export type Tool = {
  name: string;
  /** The shorter name in the header menu. */
  navName: string;
  description: string;
  href: string;
  /** The heading the home page files the tool under. */
  group: "Vision" | "Cognitive";
  icon: keyof typeof toolIcons;
};

export const groups: Tool["group"][] = ["Vision", "Cognitive"];

// The one list of tools: the header menu and the home page both read it. Only built tools are listed.
export const tools: Tool[] = [
  {
    name: "Eye test worksheets",
    navName: "Eye test",
    href: "/eye-test",
    group: "Vision",
    icon: "eye",
    description:
      "Printable letter-tracking worksheets for concussion rehabilitation, following the Michigan saccades eye test.",
  },
];
