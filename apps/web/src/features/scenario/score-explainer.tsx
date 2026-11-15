import {
  DATA_SCORE,
  DISTANCE_SCALES,
  FUEL_SCORES,
  GRAVITY_SCORES,
  NO_FORCED_FLOW_CM_S,
  PILLAR_SCORES,
  RANK_WEIGHTS,
  UNKNOWN_COMPONENT_SCORE,
} from "@/domain/config";
import { formatNumber } from "@/domain/format";
import { closeness } from "@/domain/rank";
import type { RankComponent } from "@/domain/types";
import { COMPONENT_LABELS } from "./labels";

/** Value of a distance-based part at exactly one scale away from the tested range. */
const AT_ONE_SCALE = formatNumber(closeness(1, 1), 2);
const percent = (share: number) => `${formatNumber(share * 100, 1)} %`;

/** How each part is scored, in words. Every number comes from src/domain/config.ts. */
const RULES: Record<RankComponent, string> = {
  o2: `1 when the environment's oxygen is inside the range the investigation tested. Outside it the value falls with the distance: about ${AT_ONE_SCALE} at ${DISTANCE_SCALES.o2Pct} percentage points away.`,
  fuel: `${FUEL_SCORES.match} for the same fuel state, ${FUEL_SCORES.analog} for a recognised stand-in (a gas burner built to emulate solid and liquid fuels), ${FUEL_SCORES.none} otherwise.`,
  pressure: `Scored like oxygen: about ${AT_ONE_SCALE} at ${DISTANCE_SCALES.pressureKpa} kPa away from the tested range.`,
  pillar: `${PILLAR_SCORES.primary} when the focus is the investigation's main pillar, ${PILLAR_SCORES.secondary} for a secondary pillar, ${PILLAR_SCORES.other} otherwise. With "All pillars" every investigation gets ${PILLAR_SCORES.primary}.`,
  flow: `Scored like oxygen, on the gap between the two airflow ranges: about ${AT_ONE_SCALE} at ${DISTANCE_SCALES.flowCmS} cm/s. An environment without forced airflow is compared against ${NO_FORCED_FLOW_CM_S} cm/s.`,
  data: `How much data there is: table rows on a logarithmic scale, full at ${DATA_SCORE.rowsForFullCredit} rows (${percent(DATA_SCORE.rowsShare)} of this part), having a table at all (${percent(DATA_SCORE.tableShare)}), and publications, full at ${DATA_SCORE.publicationsForFullCredit} (${percent(DATA_SCORE.publicationsShare)}). It does not depend on the environment.`,
  gravity: `For the Moon or Mars: simulated partial gravity ${GRAVITY_SCORES.partial["partial-simulated"]}, microgravity ${GRAVITY_SCORES.partial.micro}, normal gravity ${GRAVITY_SCORES.partial.normal}. For microgravity or Earth gravity: ${GRAVITY_SCORES.micro.micro} for the same level, ${GRAVITY_SCORES.micro["partial-simulated"]} for simulated partial gravity, ${GRAVITY_SCORES.micro.normal} for the opposite one.`,
};

const COMPONENTS = Object.keys(RANK_WEIGHTS) as RankComponent[];

export function ScoreExplainer() {
  return (
    <details className="rounded-lg border border-line bg-surface p-4 text-sm">
      <summary className="cursor-pointer font-medium text-fg">How the score is calculated</summary>
      <div className="mt-3 space-y-3 text-fg-muted">
        <p>
          Each investigation gets seven values from 0 to 1. Each is multiplied by its weight and the sum is scaled to
          100. The same code computes every score in the browser; no AI is involved.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left">
            <thead className="text-xs uppercase tracking-wide text-fg-subtle">
              <tr>
                <th scope="col" className="py-1 pr-3 font-medium">Part</th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">Weight</th>
                <th scope="col" className="py-1 font-medium">Rule</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {COMPONENTS.map((name) => (
                <tr key={name} className="align-top">
                  <th scope="row" className="whitespace-nowrap py-1.5 pr-3 font-medium text-fg">
                    {COMPONENT_LABELS[name]}
                  </th>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{percent(RANK_WEIGHTS[name])}</td>
                  <td className="py-1.5">{RULES[name]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          A value the data does not report scores {UNKNOWN_COMPONENT_SCORE}: there is no evidence that the
          investigation tested anything close, so it earns no points. It is drawn as a striped bar and listed under the
          card, and the card says how many of the 100 points could be checked against the data. Most gaps are in the
          NASA tables themselves: many do not record pressure or airflow. When a fire-safety focus is chosen, the
          investigations with that main pillar are listed first, then those with it as a secondary pillar, then the
          rest, each group by score. Equal scores are ordered by investigation number.
        </p>
        <p>
          The weights are a first version and have not been reviewed by a combustion specialist. The score compares
          test conditions; it is not a safety rating.
        </p>
      </div>
    </details>
  );
}
