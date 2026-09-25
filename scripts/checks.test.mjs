// Run with: node --test scripts/checks.test.mjs (part of npm test). No browser needed: the pure parts only.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listFlag, parseFlags } from "./browsers.mjs";
import { comparePage, paperMatches } from "./print-check.mjs";
import { shotName } from "./shots.mjs";

const sheet = [
  "Exercise 1 a b c d e f g h i j k l m n o p q r s t u v w x y z",
  "Acfyk fzzg bhp hyr",
  "sfvz mhci xxac.",
  "___ Min. ___ Sec.",
].join("\n");

describe("comparePage", () => {
  it("passes when every preview line is on the page, in order", () => {
    assert.equal(comparePage(["Acfyk fzzg bhp hyr", "sfvz mhci xxac."], sheet).ok, true);
  });

  it("ignores spacing differences and the sheet's own furniture, even run together", () => {
    const squashed = sheet.replace("Exercise 1", "Exercise1").replace("fzzg bhp", "fzzg   bhp");
    assert.equal(comparePage(["Acfyk fzzg bhp hyr", "sfvz mhci xxac."], squashed).ok, true);
  });

  it("fails when a line breaks somewhere else", () => {
    const result = comparePage(["Acfyk fzzg bhp", "hyr sfvz mhci xxac."], sheet);
    assert.equal(result.ok, false);
    assert.deepEqual(result.missing, ["Acfyk fzzg bhp", "hyr sfvz mhci xxac."]);
  });

  it("fails when the lines are out of order", () => {
    assert.equal(comparePage(["sfvz mhci xxac.", "Acfyk fzzg bhp hyr"], sheet).ok, false);
  });

  it("fails when lines are printed twice, as if something hidden in print showed up", () => {
    const doubled = sheet.replace("sfvz mhci xxac.", "Acfyk fzzg bhp hyr\nsfvz mhci xxac.\nsfvz mhci xxac.");
    const result = comparePage(["Acfyk fzzg bhp hyr", "sfvz mhci xxac."], doubled);
    assert.equal(result.ok, false);
    assert.deepEqual([result.missing, result.extra], [[], []]);
  });

  it("fails on text the sheet does not hold, such as a browser's header or footer", () => {
    const withHeader = `9/25/26, 10:04 AM\n${sheet}\nlocalhost:8788/eye-test 1/2`;
    const result = comparePage(["Acfyk fzzg bhp hyr", "sfvz mhci xxac."], withHeader);
    assert.equal(result.ok, false);
    assert.deepEqual(result.extra, ["9/25/26, 10:04 AM", "localhost:8788/eye-test 1/2"]);
  });
});

describe("paperMatches", () => {
  it("accepts each browser's rounding of the paper", () => {
    assert.equal(paperMatches("612 x 792 pts (letter)", "letter"), true);
    assert.equal(paperMatches("594.96 x 841.92 pts (A4)", "a4"), true);
    assert.equal(paperMatches("596 x 842 pts (A4)", "a4"), true);
  });

  it("rejects the other paper", () => {
    assert.equal(paperMatches("612 x 792 pts (letter)", "a4"), false);
    assert.equal(paperMatches("596 x 842 pts (A4)", "letter"), false);
  });
});

describe("shotName", () => {
  it("names the home page and nested pages", () => {
    assert.equal(shotName("shot", "/", "light", "desktop"), "shot-home-light-desktop.png");
    assert.equal(shotName("glow", "/eye-test", "dark", "phone"), "glow-eye-test-dark-phone.png");
  });
});

describe("parseFlags", () => {
  it("overrides defaults and rejects unknown or incomplete flags", () => {
    assert.deepEqual(parseFlags(["--themes", "dark"], { themes: "light,dark", url: "u" }), {
      themes: "dark",
      url: "u",
    });
    assert.throws(() => parseFlags(["--colour", "red"], { themes: "" }));
    assert.throws(() => parseFlags(["--themes"], { themes: "" }));
    assert.throws(() => parseFlags(["--themes", "--dark"], { themes: "" }));
  });
});

describe("listFlag", () => {
  it("trims items and rejects any not allowed", () => {
    assert.deepEqual(listFlag("chrome, firefox", ["chrome", "firefox"], "browsers"), ["chrome", "firefox"]);
    assert.throws(() => listFlag("chrome,chromium", ["chrome", "firefox"], "browsers"), /not chromium/);
  });
});
