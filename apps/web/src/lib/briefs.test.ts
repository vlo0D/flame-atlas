import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildBriefFacts, knownInvestigationNames, verifyBrief } from "@/domain/brief";
import { scenarioInputFromPreset } from "@/domain/types";
import { briefFile, dataSource, getBrief, investigations, scenarios, tests } from "@/lib/data";

const names = knownInvestigationNames(investigations);
const factsOf = (id: string) =>
  buildBriefFacts(scenarioInputFromPreset(scenarios.find((item) => item.id === id)!), investigations, tests);

/**
 * `npm run brief-facts` sets BRIEF_FACTS_OUT and this writes the facts of every preset to that file:
 * the only input the language model gets when it writes src/content/briefs.json.
 */
const out = process.env.BRIEF_FACTS_OUT;
it.runIf(Boolean(out))("writes the facts of every preset for the model", () => {
  const all = Object.fromEntries(scenarios.map((item) => [item.id, { name: item.name, facts: factsOf(item.id) }]));
  writeFileSync(out!, JSON.stringify(all, null, 2) + "\n");
});

// The briefs are written for the real PSI data; on the hand-made sample rows the numbers differ by design.
describe.skipIf(dataSource !== "processed")("the SI briefs shipped with the site", () => {
  it("cover every preset environment and nothing else", () => {
    expect(briefFile.briefs.map((brief) => brief.scenarioId).sort()).toEqual(scenarios.map((item) => item.id).sort());
  });

  it.each(scenarios.map((item) => item.id))("%s: every number and name matches the current data", (id) => {
    const brief = getBrief(id);
    expect(brief, `no brief for ${id}`).toBeDefined();
    const check = verifyBrief(brief!, factsOf(id), names);
    const problems = check.sentences.flatMap((sentence, index) =>
      sentence.problems.map((problem) => `sentence ${index + 1}: ${problem}`),
    );
    expect(problems).toEqual([]);
    expect(check.ok).toBe(true);
  });

  it("say which model wrote them", () => {
    expect(briefFile.model).not.toBe("");
    expect(briefFile.promptVersion).not.toBe("");
  });
});
