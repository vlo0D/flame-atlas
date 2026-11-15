import { describe, expect, it } from "vitest";
import type { Investigation } from "@/generated/contract";
import { buildBriefFacts, investigationName, knownInvestigationNames, verifyBrief } from "./brief";
import { findGaps } from "./gaps";
import { rankInvestigations } from "./rank";
import { testRow } from "./test-helpers";
import type { Brief, BriefFacts, ScenarioInput } from "./types";

const lunar: ScenarioInput = {
  presetId: "lunar-habitat",
  o2Pct: 34,
  pressureKpa: 56.5,
  gravityG: 0.165,
  flowCmSMin: 5,
  flowCmSMax: 20,
  fuelStates: ["solid"],
  focus: "prevention",
};

function investigation(id: `PSI-${number}`, acronym: string | null, overrides: Partial<Investigation> = {}): Investigation {
  return {
    id,
    acronym,
    title: `Investigation ${id}`,
    doi: null,
    url: "https://example.org",
    kind: "flight",
    platform: null,
    facility: null,
    insert: null,
    yearStart: null,
    yearEnd: null,
    pillarPrimary: "prevention",
    pillarsSecondary: [],
    fuelStates: ["solid"],
    fuels: [],
    conditions: {
      o2PctMin: 21,
      o2PctMax: 22.7,
      pressureKpaMin: 98.3,
      pressureKpaMax: 102.2,
      flowCmSMin: null,
      flowCmSMax: null,
      diluents: [],
      gravity: ["micro"],
    },
    summary: { text: "", citations: [] },
    objectives: [],
    measurements: [],
    fireSafetyRelevance: [],
    testStats: { tableFiles: ["t.csv"], rowCount: 2, granularities: ["test"] },
    publications: [],
    review: { status: "unreviewed", by: null, notes: null },
    ...overrides,
  };
}

const solid = (id: string, investigationId: `PSI-${number}`, o2: number, pressure: number | null) =>
  testRow({
    id,
    label: id,
    investigationId,
    fuelState: "solid",
    o2PctMin: o2,
    o2PctMax: o2,
    pressureKpaMin: pressure,
    pressureKpaMax: pressure,
  });

const investigations = [
  investigation("PSI-26", "BASS"),
  investigation("PSI-25", "BASS-II", { pillarPrimary: "suppression" }),
  investigation("PSI-60", null, { fuelStates: [], testStats: { tableFiles: [], rowCount: 0, granularities: [] } }),
];
const tests = [
  solid("a", "PSI-26", 21, 101.3),
  solid("b", "PSI-26", 22.7, 98.3),
  solid("c", "PSI-25", 21.5, null),
  testRow({ id: "day", investigationId: "PSI-25", granularity: "test-day", fuelState: "solid" }),
];
const names = knownInvestigationNames(investigations);

describe("buildBriefFacts", () => {
  const facts = buildBriefFacts(lunar, investigations, tests);

  it("repeats the numbers the Scenario screen shows, from the same functions", () => {
    const near = findGaps(lunar, tests).find((gap) => gap.kind === "near-scenario")!;
    expect(facts["near.count"]).toBe(near.count);
    expect(facts["near.total"]).toBe(near.total);
    expect(facts["data.tests"]).toBe(3);
    expect(facts["tested.o2Max"]).toBe(22.7);
    expect(facts["tested.pressureReported"]).toBe(2);
    expect(facts["exploration.solidTests"]).toBe(0);
    expect(facts["partial.realTests"]).toBe(0);
  });

  it("describes the top of the ranking in the order the list shows", () => {
    const ranking = rankInvestigations(lunar, investigations, tests);
    expect(facts["rank.1.id"]).toBe(ranking.items[0].investigationId);
    expect(facts["rank.1.score"]).toBe(ranking.items[0].score);
    expect(facts["rank.1.name"]).toBe("BASS");
    expect(facts["rank.1.tests"]).toBe(2);
    expect(facts["rank.total"]).toBe(3);
    expect(facts["rank.focusMain"]).toBe(2);
  });

  it("names the closest test when none is near, and uses the id of an investigation without an acronym", () => {
    expect(facts["near.closest.investigation"]).toBe("BASS");
    expect(facts["near.closest.o2Max"]).toBe(22.7);
    expect(investigationName({ id: "PSI-60", acronym: null })).toBe("PSI-60");
  });

  it("keeps a value the data does not report as null, never zero", () => {
    const empty = buildBriefFacts(lunar, investigations, []);
    expect(empty["tested.o2Max"]).toBeNull();
    expect(empty["near.closest.investigation"]).toBeNull();
    expect(empty["exploration.allInvestigations"]).toBeNull();
  });
});

describe("verifyBrief", () => {
  const facts: BriefFacts = {
    "near.count": 0,
    "near.total": 371,
    "tested.o2Max": 22.72,
    "scenario.pressurePsi": 8.1947,
    "data.tests": 1872,
    "rank.1.name": "BASS-II",
    "rank.1.score": 61.3,
    "rank.2.name": "BASS",
    "exploration.allInvestigations": "ACME CFI-G; FLEX-2",
  };
  const all = ["BASS", "BASS-II", "FLEX-2", "ACME CFI-G", "PSI-25", "PSI-26", "SAME"];
  const check = (text: string, cited: string[]) =>
    verifyBrief({ scenarioId: "x", sentences: [{ text, facts: cited }] }, facts, all).sentences[0];

  it("accepts a number that is the cited fact rounded to the precision it is written with", () => {
    expect(check("The highest oxygen tested is 22.7 %, at 8.2 psi.", ["tested.o2Max", "scenario.pressurePsi"])).toMatchObject({
      ok: true,
      numbers: 2,
    });
    expect(check("About 61 points.", ["rank.1.score"]).ok).toBe(true);
    expect(check("Out of 1,872 tests.", ["data.tests"])).toMatchObject({ ok: true, numbers: 1 });
  });

  it("rejects a number that is not the cited fact", () => {
    const result = check("The highest oxygen tested is 30 %.", ["tested.o2Max"]);
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toContain("30");
  });

  it("rejects a number that matches a fact the sentence does not cite", () => {
    expect(check("There are 371 tests.", ["tested.o2Max"]).ok).toBe(false);
  });

  it("does not read the digits of an investigation name as a number", () => {
    expect(check("BASS-II leads with 61.3 points.", ["rank.1.name", "rank.1.score"])).toMatchObject({
      ok: true,
      numbers: 1,
      names: 1,
    });
  });

  it("rejects an investigation the sentence names without citing it", () => {
    expect(check("BASS leads.", ["rank.1.name"]).ok).toBe(false);
    expect(check("BASS leads.", ["rank.2.name"]).ok).toBe(true);
    expect(check("SAME is close.", ["rank.1.name"]).problems[0]).toContain("SAME");
  });

  it("finds a name inside a cited list of names", () => {
    expect(check("Only ACME CFI-G and FLEX-2 reach it.", ["exploration.allInvestigations"])).toMatchObject({
      ok: true,
      names: 2,
    });
  });

  it("lets a sentence claim an absence only when a cited fact is zero or not reported", () => {
    expect(check("No test was run near this environment.", ["near.count"]).ok).toBe(true);
    expect(check("No test was run near this environment.", ["near.total"]).ok).toBe(false);
  });

  it("rejects a sentence that cites an unknown fact or no fact at all", () => {
    expect(check("Something.", ["made.up"]).ok).toBe(false);
    expect(check("Something.", []).ok).toBe(false);
  });

  it("passes a brief only when every sentence passes, and counts what it checked", () => {
    const brief: Brief = {
      scenarioId: "x",
      sentences: [
        { text: "None of the 371 tests is near.", facts: ["near.count", "near.total"] },
        { text: "BASS-II scores 61.3.", facts: ["rank.1.name", "rank.1.score"] },
      ],
    };
    expect(verifyBrief(brief, facts, all)).toMatchObject({ ok: true, numbersChecked: 2, namesChecked: 1 });
    brief.sentences.push({ text: "It scores 99.", facts: ["rank.1.score"] });
    expect(verifyBrief(brief, facts, all).ok).toBe(false);
    expect(verifyBrief({ scenarioId: "x", sentences: [] }, facts, all).ok).toBe(false);
  });
});

describe("knownInvestigationNames", () => {
  it("lists every id and every acronym once", () => {
    expect(names).toEqual(["PSI-26", "BASS", "PSI-25", "BASS-II", "PSI-60"]);
  });
});
