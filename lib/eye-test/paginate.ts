/**
 * Packs exercises onto pages in order, never splitting one: each page takes exercises while their heights, plus a
 * gap between each two, fit in the page height. An exercise taller than a page gets a page of its own.
 * Returns the indexes of the exercises on each page.
 */
export function paginate(heights: number[], pageHeight: number, gap: number): number[][] {
  const pages: number[][] = [];
  let used = 0;
  heights.forEach((height, i) => {
    const page = pages.at(-1);
    if (page && used + gap + height <= pageHeight) {
      page.push(i);
      used += gap + height;
    } else {
      pages.push([i]);
      used = height;
    }
  });
  return pages;
}
