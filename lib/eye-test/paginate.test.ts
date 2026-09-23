import { describe, expect, it } from "vitest";
import { paginate } from "./paginate";

describe("paginate", () => {
  it("fills a page, counting the gap between exercises", () => {
    expect(paginate([40, 40, 40], 100, 10)).toEqual([[0, 1], [2]]);
    expect(paginate([45, 45, 45], 100, 10)).toEqual([[0, 1], [2]]);
    expect(paginate([46, 45], 100, 10)).toEqual([[0], [1]]);
  });

  it("keeps order and puts every exercise on exactly one page", () => {
    const heights = Array.from({ length: 50 }, (_, i) => 20 + ((i * 37) % 60));
    const pages = paginate(heights, 300, 12);
    expect(pages.flat()).toEqual(heights.map((_, i) => i));
    for (const page of pages) {
      const used = page.reduce((sum, i) => sum + heights[i], 0) + 12 * (page.length - 1);
      expect(used).toBeLessThanOrEqual(300);
    }
  });

  it("gives an exercise taller than a page a page of its own", () => {
    expect(paginate([30, 150, 30], 100, 10)).toEqual([[0], [1], [2]]);
  });

  it("makes no pages for no exercises", () => {
    expect(paginate([], 100, 10)).toEqual([]);
  });
});
