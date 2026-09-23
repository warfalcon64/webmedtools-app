export type Tool = {
  name: string;
  description: string;
  /** The tool's page. Absent until the tool is built, so nothing links to a page that does not exist. */
  href?: string;
};

// The one list of tools: the header menu and the home page both read it.
export const tools: Tool[] = [
  {
    name: "Eye test worksheets",
    description:
      "Printable letter-tracking worksheets for concussion rehabilitation, following the Michigan saccades eye test.",
  },
];
