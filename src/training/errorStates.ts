/**
 * Training error states (SPEC STEP 8).
 *
 * Enumerates the *demonstrable mistakes* the simulator can surface so a learner sees what "incorrect"
 * looks like. These are surfaced as non-blocking warnings (the app teaches, it does not punish) and
 * map to instructional corrective prompts.
 *
 * SME-REVIEW (TRAINING_LOGIC.md): the catalogue of errors and their corrective text is plausible
 * scaffolding, not validated clinical assessment. Confirm which errors matter and how they are
 * phrased with a clinical educator before instructional use.
 */

/** Identified incorrect-usage conditions the validation layer can raise. */
export const enum TrainingError {
  None = 'none',
  /** Chosen cuff size does not match the (simulated) arm — under/oversized bladder. */
  WrongSize = 'wrong-size',
  /** Artery marker / tubing not aligned with the brachial artery. */
  Misoriented = 'misoriented',
  /** Cuff placed too low (over the elbow crease) or too high. */
  Mispositioned = 'mispositioned',
  /** Cuff too loose — would read falsely high / fail to occlude. */
  TooLoose = 'too-loose',
  /** Cuff too tight — patient discomfort / falsely low. */
  TooTight = 'too-tight',
  /** Deflation too fast to read accurately. */
  DeflatedTooFast = 'deflated-too-fast',
}

/** Severity tier for presentation (color/emphasis). */
export const enum ErrorSeverity {
  Info = 'info',
  Warning = 'warning',
}

export interface ErrorInfo {
  readonly error: TrainingError;
  readonly severity: ErrorSeverity;
  /** Learner-facing corrective guidance. */
  readonly correction: string;
}

/**
 * Corrective guidance per error.
 * SME-REVIEW: wording + the clinical consequence each line implies must be confirmed by an educator.
 */
export const ERROR_INFO: Readonly<Record<TrainingError, ErrorInfo>> = {
  [TrainingError.None]: {
    error: TrainingError.None,
    severity: ErrorSeverity.Info,
    correction: '',
  },
  [TrainingError.WrongSize]: {
    error: TrainingError.WrongSize,
    severity: ErrorSeverity.Warning,
    correction:
      'Cuff size looks mismatched to the arm. A bladder that is too small reads falsely high and too ' +
      'large reads falsely low — pick the size whose range fits the arm circumference.',
  },
  [TrainingError.Misoriented]: {
    error: TrainingError.Misoriented,
    severity: ErrorSeverity.Warning,
    correction:
      'The artery marker is not aligned with the brachial artery. Rotate the cuff so the marker faces ' +
      'the artery and the tubing routes toward the antecubital fossa.',
  },
  [TrainingError.Mispositioned]: {
    error: TrainingError.Mispositioned,
    severity: ErrorSeverity.Warning,
    correction:
      'Reposition the cuff: its lower edge should sit ~2–3 cm above the elbow crease, not over it, at ' +
      'heart level.',
  },
  [TrainingError.TooLoose]: {
    error: TrainingError.TooLoose,
    severity: ErrorSeverity.Warning,
    correction:
      'The cuff is too loose. A loose cuff can read falsely high. Tighten until about one to two ' +
      'fingers fit underneath.',
  },
  [TrainingError.TooTight]: {
    error: TrainingError.TooTight,
    severity: ErrorSeverity.Warning,
    correction:
      'The cuff is too tight, which is uncomfortable and can read falsely low. Loosen slightly to a ' +
      'snug one-to-two-finger fit.',
  },
  [TrainingError.DeflatedTooFast]: {
    error: TrainingError.DeflatedTooFast,
    severity: ErrorSeverity.Warning,
    correction:
      'Deflation is too fast to read reliably. Open the valve only slightly for a slow, controlled ' +
      'descent through the systolic and diastolic points.',
  },
};

/** Look up corrective info for an error. */
export function getErrorInfo(error: TrainingError): ErrorInfo {
  return ERROR_INFO[error];
}
