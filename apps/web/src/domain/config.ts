/**
 * The single home of every number the site reasons with (architecture rule AD-4).
 * Weights, scales, thresholds and grid edges live here and nowhere else.
 */

export const KPA_PER_PSI = 6.894757;

/**
 * Inverse flames (ACME Flame Design, CFI-G) feed the oxidizer through the burner into a fuel-filled
 * chamber, so their ambient oxygen is null. The oxidizer's O2 mole fraction stays verbatim in the
 * row's raw cells; these are the source columns it is read from.
 */
export const BURNER_OXIDIZER = {
  flameTypeColumn: "Flame Type",
  inverseValue: "Inverse",
  o2FractionColumn: "XO2",
} as const;

/** Weights of the ranking score components. They sum to 1. */
export const RANK_WEIGHTS = {
  o2: 0.25,
  fuel: 0.2,
  pressure: 0.15,
  pillar: 0.15,
  flow: 0.1,
  data: 0.1,
  gravity: 0.05,
} as const;

/** Distance at which a condition's score has dropped to exp(-1), in the unit of that condition. */
export const DISTANCE_SCALES = {
  o2Pct: 8,
  pressureKpa: 25,
  flowCmS: 15,
} as const;

/**
 * Score given to a component whose value is not reported in the data: no evidence, no points.
 * A neutral 0.5 put investigations whose tables report no conditions at the top (docs/decisions.md).
 */
export const UNKNOWN_COMPONENT_SCORE = 0;

/**
 * Closeness assumed for a condition a single row does not report, when choosing an
 * investigation's closest rows. It only orders rows inside one investigation, so a
 * row with a gap is neither favoured nor ruled out; it never changes the score.
 */
export const UNKNOWN_ROW_CONDITION_SCORE = 0.5;

/** Airflow speed used for an environment with no forced airflow, in cm/s. */
export const NO_FORCED_FLOW_CM_S = 0;

/** Fuel component: same fuel state, a recognised stand-in for it, or neither. */
export const FUEL_SCORES = {
  match: 1,
  analog: 0.5,
  none: 0,
} as const;

/** Pillar component: the investigation's main pillar, one of its secondary pillars, or neither. */
export const PILLAR_SCORES = {
  primary: 1,
  secondary: 0.6,
  other: 0.2,
} as const;

/**
 * Gravity classes of an environment, by its gravity in g.
 * At or below `microMaxG` it is microgravity; at or above `normalMinG` it is Earth gravity;
 * in between it is partial gravity (Moon 0.165 g, Mars 0.38 g).
 */
export const GRAVITY_CLASS_LIMITS = {
  microMaxG: 0.01,
  normalMinG: 0.9,
} as const;

/**
 * Gravity component: environment class, then the gravity level of the data.
 * PSI has no test at real partial gravity. "partial-simulated" scores below 1
 * because the partial gravity was imitated, for example with an electric field.
 */
export const GRAVITY_SCORES = {
  micro: { micro: 1, "partial-simulated": 0.7, normal: 0.5 },
  partial: { "partial-simulated": 0.9, micro: 0.7, normal: 0.5 },
  normal: { normal: 1, "partial-simulated": 0.7, micro: 0.5 },
} as const;

/**
 * Data-volume component: three parts that add up to 1.
 * Rows count on a logarithmic scale and reach full credit at `rowsForFullCredit`.
 */
export const DATA_SCORE = {
  rowsShare: 0.6,
  tableShare: 0.2,
  publicationsShare: 0.2,
  rowsForFullCredit: 300,
  publicationsForFullCredit: 5,
} as const;

/** Accepted values for a custom environment. A value outside these is ignored, never guessed. */
export const SCENARIO_LIMITS = {
  o2Pct: { min: 0, max: 100 },
  pressureKpa: { min: 0.1, max: 1000 },
  gravityG: { min: 0, max: 10 },
  flowCmS: { min: 0, max: 10000 },
} as const;

/** Gravity levels offered as shortcuts in the environment form, in g. */
export const GRAVITY_SHORTCUTS = [
  { label: "Microgravity", gravityG: 0 },
  { label: "Moon", gravityG: 0.165 },
  { label: "Mars", gravityG: 0.38 },
  { label: "Earth", gravityG: 1 },
] as const;

/**
 * How the pipeline starts the sentence of a row's notes that quotes what a language model read
 * from an operator's free-text note (pipeline/normalize/engine.py). The data contract has no field
 * for it yet, so this text is the only way to count such rows; a structured field is proposed
 * to the contract owner (docs/decisions.md).
 */
export const SI_NOTE_MARKER = "Read by SI (";

/** Rows per page the Tests table offers, and the one it starts with. */
export const PAGE_SIZES = [25, 50, 100, 200] as const;
export const DEFAULT_PAGE_SIZE = 50;

/** How many page numbers the pager shows on each side of the current page. */
export const PAGER_SIBLINGS = 1;

/** How many of an investigation's closest rows a ranked result lists. */
export const NEAREST_ROWS_LIMIT = 3;

/** The preset every screen falls back to when the address names none. */
export const DEFAULT_SCENARIO_ID = "lunar-habitat";

/**
 * "Lunar-habitat-like" atmosphere, from the challenge page: at least 30 % O2
 * at no more than 10.2 psi. 10.2 psi is 70.33 kPa. A team convention, not a NASA standard.
 * Both numbers are also edges of the coverage grid below, so that a grid cell,
 * a filter and the headline count always agree (architecture rule AD-11).
 */
export const EXPLORATION_ATMOSPHERE = {
  minO2Pct: 30,
  maxPressureKpa: 70.33,
} as const;

/** Earth sea-level reference. */
export const EARTH_ATMOSPHERE = {
  o2Pct: 21,
  pressureKpa: 101.3,
} as const;

/**
 * Axes of the coverage grid.
 *
 * `closed: "left"` means a cell is [lo, hi): the oxygen threshold reads "at least 30 %".
 * `closed: "right"` means a cell is (lo, hi]: the pressure threshold reads "at most 70.33 kPa".
 * The outermost cell also includes its outer edge, so every value inside the axis has exactly one cell.
 */
export const COVERAGE_AXES = {
  o2Pct: { edges: [0, 15, 20, 25, 30, 35, 40, 50, 60, 80, 100], closed: "left" },
  pressureKpa: { edges: [0, 30, 50, 70.33, 90, 110, 160, 400], closed: "right" },
  flowCmS: { edges: [0, 5, 10, 20, 40, 80, 1000], closed: "left" },
} as const;

export type CoverageAxis = keyof typeof COVERAGE_AXES;

/** How close a test must be to the chosen environment to count as "near it". */
export const NEAR_SCENARIO = {
  o2Pct: 5,
  pressureKpa: 15,
} as const;

/**
 * Spread below which a measured condition counts as held constant across an investigation's
 * tests, in the unit of that condition: readings of one setting differ by a little noise.
 */
export const CONSTANT_TOLERANCE = {
  o2Pct: 0.5,
  pressureKpa: 5,
  flowCmS: 0.5,
  thicknessMm: 0.01,
} as const;
