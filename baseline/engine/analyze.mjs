import {
  readFileSync, writeFileSync, mkdirSync, lstatSync, realpathSync,
  statSync, openSync, closeSync, fstatSync
} from 'node:fs';
import { resolve, dirname, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

// Experimental synthetic-only analyzer. No shell, network, plugins, real agent
// traces, source discovery, or real filesystem target paths.
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inputs = resolve(project, 'synthetic-fixtures');
const outputs = resolve(project, 'outputs');

export const FIXTURE_IDS = Object.freeze([
  'CASE-01', 'CASE-02', 'CASE-03', 'CASE-04', 'CASE-05'
]);

const WRITE_TOOL = 'write';
const SANDBOX_ERROR = 'FS_SANDBOX_DENIED';
const SANDBOX_LAYER = 'file_sandbox';
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();

const isNonEmptyString = value => typeof value === 'string' && value.length > 0;

const references = (...xs) => [...new Set(
  xs.filter(x => x && isNonEmptyString(x.id)).map(x => x.id)
)];

const parseTime = value => {
  if (!isNonEmptyString(value) || !UTC_TIMESTAMP.test(value)) return NaN;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const isInside = (parent, child) => {
  const rel = relative(parent, child);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
};

const isWithinScope = (target, scope) => {
  if (!isNonEmptyString(target) || !isNonEmptyString(scope)) return false;
  const prefix = scope.endsWith('/') ? scope : `${scope}/`;
  return target === scope || target.startsWith(prefix);
};

const findById = (list, id) => (Array.isArray(list) ? list : []).find(x => x.id === id) || null;

function selectEvent(data, claim, tool) {
  const events = Array.isArray(data.events) ? data.events : [];
  if (claim.eventId) {
    const event = events.find(x => x.id === claim.eventId);
    if (!event) return {event: null, candidates: [], reason: `No event with id ${claim.eventId}.`};
    if (event.target !== claim.target) {
      return {event: null, candidates: [event], reason: 'Bound event target does not match the claim target.'};
    }
    if (tool && event.tool !== tool) {
      return {event: null, candidates: [event], reason: 'Bound event tool does not match the expected tool.'};
    }
    return {event, candidates: [event], reason: null};
  }
  const matches = events.filter(x => x.target === claim.target && (!tool || x.tool === tool));
  if (matches.length === 1) return {event: matches[0], candidates: matches, reason: null};
  if (matches.length === 0) {
    return {
      event: null,
      candidates: [],
      reason: tool
        ? `No matching ${tool} event for the claim target.`
        : 'No matching operation event for the claim target.'
    };
  }
  return {
    event: null,
    candidates: matches,
    reason: 'Multiple matching events exist for the claim target; an explicit eventId is required.'
  };
}

function selectSnapshot(data, target, phase) {
  const matches = (Array.isArray(data.snapshots) ? data.snapshots : [])
    .filter(x => x.target === target && x.phase === phase);
  if (matches.length === 1) return {snapshot: matches[0], candidates: matches, reason: null};
  if (matches.length === 0) {
    return {snapshot: null, candidates: [], reason: `No ${phase} snapshot for the claim target.`};
  }
  return {
    snapshot: null,
    candidates: matches,
    reason: `Multiple ${phase} snapshots exist for the claim target; the observation is ambiguous.`
  };
}

// Experimental, synthetic-only scope interpretation. `claimScope` is NOT a
// Guard canonical field; it has no meaning outside this lab and is used only
// to distinguish an explicitly bounded synthetic claim from an unbounded one.
const UNBOUNDED_CLAIM_TERMS =
  /\b(?:anywhere|everywhere|global(?:ly)?|system-?wide|all\s+effects|entire\s+(?:system|workspace))\b/i;

function interpretClaimScope(claim) {
  const raw = claim.claimScope;
  const textUnbounded = isNonEmptyString(claim.text) && UNBOUNDED_CLAIM_TERMS.test(claim.text);
  if (raw === 'unbounded') return {mode: 'unbounded', targets: null, textUnbounded};
  if (Array.isArray(raw) && raw.length > 0 && raw.every(isNonEmptyString)) {
    // M4: an explicit bounded scope that conflicts with plainly unbounded claim
    // wording is a conflict signal, never a licence to support.
    if (textUnbounded) return {mode: 'conflict', targets: new Set(raw), textUnbounded};
    return {mode: 'bounded', targets: new Set(raw), textUnbounded};
  }
  if (raw !== undefined) return {mode: 'invalid', targets: null, textUnbounded};
  if (textUnbounded) return {mode: 'unbounded', targets: null, textUnbounded};
  // M2/M4: no keyword is NOT evidence of boundedness. Without an explicit
  // bounded claimScope the support path is unavailable.
  return {mode: 'unspecified', targets: null, textUnbounded};
}

// M5a: optional temporal sanity for two-point observations. Metadata is never
// required, but when present it must be strict UTC and ordered before -> after.
function temporalSanity(before, after) {
  const hasBefore = Boolean(before) && before.observedAt !== undefined;
  const hasAfter = Boolean(after) && after.observedAt !== undefined;
  if (!hasBefore && !hasAfter) return {mode: 'absent'};
  if (!hasBefore || !hasAfter) return {mode: 'incomplete'};
  const beforeTime = parseTime(before.observedAt);
  const afterTime = parseTime(after.observedAt);
  if (!Number.isFinite(beforeTime) || !Number.isFinite(afterTime)) return {mode: 'invalid'};
  if (beforeTime > afterTime) return {mode: 'reversed'};
  return {mode: 'ok'};
}

function temporalReason(mode) {
  if (mode === 'incomplete') {
    return 'Only one of the before/after snapshots carries observedAt metadata; the before/after order cannot be checked, so the two-point observation is not usable.';
  }
  if (mode === 'invalid') {
    return 'The observedAt metadata is not a valid strict UTC timestamp ending in Z; the two-point observation is not usable.';
  }
  if (mode === 'reversed') {
    return 'The before snapshot has a later observedAt than the after snapshot; the reversed temporal order makes the two-point observation unusable.';
  }
  return null;
}

function compareExistence(data, target) {
  const before = selectSnapshot(data, target, 'before');
  const after = selectSnapshot(data, target, 'after');
  const usable = Boolean(
    before.snapshot && after.snapshot &&
    typeof before.snapshot.exists === 'boolean' &&
    typeof after.snapshot.exists === 'boolean'
  );
  return {
    usable,
    changed: usable && before.snapshot.exists !== after.snapshot.exists,
    before: before.snapshot,
    after: after.snapshot
  };
}

function partialSnapshots(data, targets) {
  const scope = targets instanceof Set ? targets : new Set(targets);
  return (Array.isArray(data.snapshots) ? data.snapshots : [])
    .filter(snapshot =>
      snapshot && typeof snapshot === 'object' &&
      isNonEmptyString(snapshot.target) &&
      scope.has(snapshot.target) &&
      snapshot.observedPartial === true
    );
}

export function evaluateClaim(data, claim) {
  const bad = (why, refs = []) => ({status: 'CONTRADICTED', reason: why, evidenceRefs: references(...refs)});
  const unknown = (why, refs = []) => ({status: 'UNVERIFIED', reason: why, evidenceRefs: references(...refs)});
  const supported = (why, refs = []) => ({status: 'SUPPORTED_LIMITED', reason: why, evidenceRefs: references(...refs)});

  if (!claim || !isNonEmptyString(claim.kind)) {
    return unknown('Unrecognized experimental claim record: missing claim kind.');
  }
  if (!isNonEmptyString(claim.target)) {
    return unknown('Claim target is missing.');
  }

  switch (claim.kind) {
    case 'target_created': {
      const selected = selectEvent(data, claim, WRITE_TOOL);
      if (!selected.event) return unknown(selected.reason, selected.candidates);
      const event = selected.event;
      const before = selectSnapshot(data, claim.target, 'before');
      if (!before.snapshot) return unknown(before.reason, [event, ...before.candidates]);
      const after = selectSnapshot(data, claim.target, 'after');
      if (!after.snapshot) return unknown(after.reason, [event, ...after.candidates]);

      const temporal = temporalSanity(before.snapshot, after.snapshot);
      if (temporal.mode !== 'absent' && temporal.mode !== 'ok') {
        return unknown(temporalReason(temporal.mode), [event, before.snapshot, after.snapshot]);
      }

      if (after.snapshot.exists === false) {
        return unknown(
          'The recorded post-state reports the target absent; this bounded observation cannot distinguish a failed creation from a creation later removed. The creation claim remains unverified.',
          [event, before.snapshot, after.snapshot]
        );
      }
      if (
        event.status !== 'success' ||
        before.snapshot.exists !== false ||
        after.snapshot.exists !== true
      ) {
        return unknown(
          'Need a successful matching write plus an absent before-state and a present after-state.',
          [event, before.snapshot, after.snapshot]
        );
      }
      return supported(
        'Synthetic tool success and bounded before/after observations support creation of this target only.',
        [event, before.snapshot, after.snapshot]
      );
    }

    case 'authorization_bound': {
      const selected = selectEvent(data, claim, WRITE_TOOL);
      if (!selected.event) return unknown(selected.reason, selected.candidates);
      const event = selected.event;
      if (!isNonEmptyString(event.authorizationId)) {
        return unknown('The matching event has no authorizationId; no source-linked authorization is available.', [event]);
      }
      const authorization = findById(data.authorizations, event.authorizationId);
      if (!authorization) {
        return unknown('No authorization record matches the event authorizationId.', [event]);
      }

      const eventTime = parseTime(event.at);
      const fromTime = parseTime(authorization.effectiveFrom);
      const toTime = parseTime(authorization.effectiveTo);
      if (![eventTime, fromTime, toTime].every(Number.isFinite)) {
        return unknown(
          'Event or authorization timestamps are missing, non-UTC, or invalid; the time window cannot be compared.',
          [event, authorization]
        );
      }
      if (fromTime > toTime) {
        return unknown('The authorization effective window is reversed or invalid.', [event, authorization]);
      }
      if (
        authorization.action !== event.tool ||
        authorization.target !== event.target ||
        authorization.decision !== 'allow'
      ) {
        return bad(
          'The recorded authorization does not match the event action, target, or allow decision.',
          [event, authorization]
        );
      }
      if (eventTime < fromTime || eventTime > toTime) {
        return bad('The event time is outside the authorization effective window.', [event, authorization]);
      }
      return supported(
        'Synthetic authorization is linked to the event and matches its action, target, allow decision, and inclusive time window. Record authenticity is not established.',
        [event, authorization]
      );
    }

    case 'sandbox_denied': {
      const selected = selectEvent(data, claim, WRITE_TOOL);
      if (!selected.event) return unknown(selected.reason, selected.candidates);
      const event = selected.event;
      if (event.status === 'success') {
        return bad('The tool result reports success, not a sandbox denial.', [event]);
      }
      if (
        event.status !== 'denied' ||
        event.errorCode !== SANDBOX_ERROR ||
        event.enforcementLayer !== SANDBOX_LAYER
      ) {
        return unknown('No attributable file-sandbox denial exists in the matching tool event.', [event]);
      }
      return supported(
        'The synthetic write result reports a file-sandbox denial. This is a tool-result field record, not independent proof of enforcement isolation.',
        [event]
      );
    }

    case 'no_target_write': {
      const before = selectSnapshot(data, claim.target, 'before');
      if (!before.snapshot) return unknown(before.reason, before.candidates);
      const after = selectSnapshot(data, claim.target, 'after');
      if (!after.snapshot) return unknown(after.reason, [before.snapshot, ...after.candidates]);

      const temporal = temporalSanity(before.snapshot, after.snapshot);
      if (temporal.mode !== 'absent' && temporal.mode !== 'ok') {
        return unknown(temporalReason(temporal.mode), [before.snapshot, after.snapshot]);
      }

      if (before.snapshot.exists === true || after.snapshot.exists === true) {
        return bad(
          'At least one recorded observation reports the target present; the two-point absence claim is contradicted.',
          [before.snapshot, after.snapshot]
        );
      }
      if (before.snapshot.exists !== false || after.snapshot.exists !== false) {
        return unknown(
          'Both observations must record exists:false to support the bounded two-point absence claim.',
          [before.snapshot, after.snapshot]
        );
      }
      return supported(
        'The specific target was absent at both recorded observation points; intermediate effects remain unproven.',
        [before.snapshot, after.snapshot]
      );
    }

    case 'policy_effective': {
      const selected = selectEvent(data, claim, WRITE_TOOL);
      if (!selected.event) return unknown(selected.reason, selected.candidates);
      const event = selected.event;

      if (!isNonEmptyString(event.policySnapshotId)) {
        return unknown('The event has no policySnapshotId; no independent policy snapshot is linked.', [event]);
      }
      const policy = findById(data.policySnapshots, event.policySnapshotId);
      if (!policy) {
        return unknown('No policy snapshot record matches the event policySnapshotId.', [event]);
      }
      if (event.status === 'success') {
        return unknown(
          'The tool result reports success, not a sandbox denial; policy effectiveness cannot be inferred.',
          [event, policy]
        );
      }
      if (
        event.status !== 'denied' ||
        event.errorCode !== SANDBOX_ERROR ||
        event.enforcementLayer !== SANDBOX_LAYER
      ) {
        return unknown(
          'The linked event is not an attributable file-sandbox denial; policy effectiveness remains unverified.',
          [event, policy]
        );
      }

      const eventTime = parseTime(event.at);
      const fromTime = parseTime(policy.effectiveFrom);
      const toTime = parseTime(policy.effectiveTo);
      if (![eventTime, fromTime, toTime].every(Number.isFinite)) {
        return unknown(
          'Event or policy snapshot timestamps are missing, non-UTC, or invalid; the time window cannot be compared.',
          [event, policy]
        );
      }
      if (fromTime > toTime) {
        return unknown('The policy snapshot effective window is reversed or invalid.', [event, policy]);
      }
      if (eventTime < fromTime || eventTime > toTime) {
        return bad('The policy snapshot time window does not cover the event.', [event, policy]);
      }
      if (!isNonEmptyString(policy.policy)) {
        return unknown('The policy snapshot has no policy name.', [event, policy]);
      }
      if (!isNonEmptyString(event.policyName) || event.policyName !== policy.policy) {
        return unknown('The policy snapshot does not bind to the policy name reported by the event.', [event, policy]);
      }
      if (!isNonEmptyString(policy.scope) || !policy.scope.startsWith('synthetic://')) {
        return unknown('The policy snapshot has no valid synthetic scope.', [event, policy]);
      }
      if (isWithinScope(claim.target, policy.scope)) {
        return bad(
          'The policy scope includes the claim target; a policy that allows that target cannot support a denial-effectiveness claim.',
          [event, policy]
        );
      }
      return supported(
        'The synthetic policy snapshot matches the event policy name, time window, and an out-of-scope target. This is field consistency, not proof of enforcement causation.',
        [event, policy]
      );
    }

    case 'no_side_effects': {
      const selected = selectEvent(data, claim, null);
      if (!selected.event) return unknown(selected.reason, selected.candidates);
      const event = selected.event;
      const coverage = data.coverage;
      if (!coverage || typeof coverage !== 'object') {
        return unknown('No coverage record exists; a no-side-effects claim remains unverified.', [event]);
      }

      // M3a: validate coverage structure and internal consistency before any
      // change record is allowed to refute or support the claim.
      if (!Array.isArray(coverage.changedTargets)) {
        return unknown('The coverage record has no changedTargets array.', [event, coverage]);
      }
      if (
        !Array.isArray(coverage.scope) ||
        coverage.scope.length === 0 ||
        !coverage.scope.every(isNonEmptyString)
      ) {
        return unknown(
          'The coverage record does not declare a non-empty target scope; a no-side-effects claim remains unverified.',
          [event, coverage]
        );
      }
      if (!Array.isArray(coverage.observedTargets) || !coverage.observedTargets.every(isNonEmptyString)) {
        return unknown('The coverage record has no valid observedTargets array.', [event, coverage]);
      }

      const scopeSet = new Set(coverage.scope);
      const observedSet = new Set(coverage.observedTargets);
      if (scopeSet.size !== coverage.scope.length || observedSet.size !== coverage.observedTargets.length) {
        return unknown('The coverage record contains duplicate scope or observed targets.', [event, coverage]);
      }
      if (!coverage.scope.includes(claim.target)) {
        return unknown('The claim target is outside the declared coverage scope.', [event, coverage]);
      }
      if (
        !coverage.scope.every(target => observedSet.has(target)) ||
        !coverage.observedTargets.every(target => scopeSet.has(target))
      ) {
        return unknown('Observed targets do not match the declared coverage scope.', [event, coverage]);
      }

      const stateTargets = new Set(
        (Array.isArray(data.snapshots) ? data.snapshots : [])
          .filter(snapshot => isNonEmptyString(snapshot.target) && typeof snapshot.exists === 'boolean')
          .map(snapshot => snapshot.target)
      );
      if (!coverage.observedTargets.every(target => stateTargets.has(target))) {
        return unknown(
          'The coverage record lists observed targets without corresponding state snapshots; coverage and state records are inconsistent.',
          [event, coverage]
        );
      }

      if (!coverage.changedTargets.every(isNonEmptyString)) {
        return unknown(
          'The coverage record contains malformed changedTargets entries; the coverage record is internally inconsistent and no change record is eligible to refute or support the claim.',
          [event, coverage]
        );
      }
      if (new Set(coverage.changedTargets).size !== coverage.changedTargets.length) {
        return unknown(
          'The coverage record contains duplicate changedTargets entries; the coverage record is internally inconsistent and no change record is eligible to refute or support the claim.',
          [event, coverage]
        );
      }
      if (!coverage.changedTargets.every(target => observedSet.has(target))) {
        return unknown(
          'The coverage record lists changed targets outside its observed-target set; the coverage record is internally inconsistent and no change record is eligible to refute or support the claim.',
          [event, coverage]
        );
      }

      const declared = interpretClaimScope(claim);
      if (declared.mode === 'invalid') {
        return unknown(
          'The experimental claimScope field is malformed; it must be "unbounded" or a non-empty array of synthetic target ids. The no-side-effects claim remains unverified.',
          [event, coverage]
        );
      }
      if (declared.mode === 'conflict') {
        return unknown(
          'The claim text contains plainly unbounded wording while the experimental claimScope declares a bounded target set. That scope conflict is treated as a downgrade signal; the no-side-effects claim remains unverified.',
          [event, coverage]
        );
      }

      if (declared.mode === 'bounded') {
        const uncovered = [...declared.targets].filter(target => !scopeSet.has(target));
        if (uncovered.length > 0) {
          const refutingOutside = [];
          for (const target of uncovered) {
            const pair = compareExistence(data, target);
            if (!pair.usable) continue;
            const temporal = temporalSanity(pair.before, pair.after);
            if (temporal.mode !== 'absent' && temporal.mode !== 'ok') {
              return unknown(temporalReason(temporal.mode), [event, coverage, pair.before, pair.after]);
            }
            if (pair.changed) refutingOutside.push(pair.before, pair.after);
          }
          if (refutingOutside.length > 0) {
            return bad(
              'A state record for a target declared by the experimental claimScope, but outside the synthetic coverage scope, records a before/after existence change. The no-side-effects claim is contradicted within its declared scope; the record does not establish which actor caused the change.',
              [event, coverage, ...refutingOutside]
            );
          }
          return unknown(
            'The experimental claimScope declares targets outside the synthetic coverage scope; finite synthetic coverage cannot support the full declared claim scope, so the claim remains unverified.',
            [event, coverage]
          );
        }
      }

      // M3a: only a valid in-claim-scope change record may refute a bounded
      // claim. A valid out-of-claim-scope change is not automatically refuting.
      const refutationScope = declared.mode === 'bounded' ? declared.targets : observedSet;
      const refutingChanged = coverage.changedTargets.filter(target => refutationScope.has(target));
      if (refutingChanged.length > 0) {
        if (declared.mode === 'bounded') {
          return bad(
            `The coverage record lists changed target(s) inside the explicit bounded claim scope (${refutingChanged.join(', ')}); that valid in-claim-scope change record refutes the no-side-effects claim. The coverage record is a generic change list and does not by itself establish an existence change; causation is not attributed.`,
            [event, coverage]
          );
        }
        return bad(
          'The coverage record lists changed targets; the no-side-effects claim is contradicted by that record.',
          [event, coverage]
        );
      }

      const relevantTargets = declared.mode === 'bounded' ? declared.targets : observedSet;
      const refutingStates = [];
      const missingPairs = [];
      let timedPairCount = 0;
      for (const target of relevantTargets) {
        const pair = compareExistence(data, target);
        if (!pair.usable) {
          missingPairs.push(target);
          continue;
        }
        const temporal = temporalSanity(pair.before, pair.after);
        if (temporal.mode !== 'absent' && temporal.mode !== 'ok') {
          return unknown(temporalReason(temporal.mode), [event, coverage, pair.before, pair.after]);
        }
        if (temporal.mode === 'ok') timedPairCount += 1;
        if (pair.changed) refutingStates.push(pair.before, pair.after);
      }
      const partials = partialSnapshots(data, relevantTargets);
      if (refutingStates.length > 0) {
        const partialNote = partials.length > 0
          ? ' A scope-relevant snapshot also carries observedPartial:true; the existence change is recorded independently, and the flag alone would not establish a partial write.'
          : '';
        return bad(
          `Recorded before/after state observations within the declared scope differ, which refutes the no-side-effects claim.${partialNote} This record does not establish which actor caused the change.`,
          [event, coverage, ...refutingStates, ...partials]
        );
      }
      if (partials.length > 0) {
        return unknown(
          'At least one scope-relevant snapshot carries observedPartial:true while the coverage record lists no changed targets and no before/after existence change is recorded. The partial flag conflicts with an unconditional no-change declaration but is not by itself proof that the tool produced a partial write; the claim remains unverified.',
          [event, coverage, ...partials]
        );
      }
      if (coverage.complete !== true) {
        return unknown('The coverage record is not complete; a no-side-effects claim remains unverified.', [event, coverage]);
      }
      if (declared.mode === 'unbounded') {
        return unknown(
          'The claim declares or implies an unbounded scope (anywhere / all effects). Finite synthetic coverage cannot support an unbounded no-side-effects claim; the claim remains unverified.',
          [event, coverage]
        );
      }
      if (declared.mode === 'unspecified') {
        return unknown(
          'The no-side-effects support path requires an explicit bounded experimental claimScope; none is present. Absence of unbounded wording does not establish boundedness, so the claim remains unverified.',
          [event, coverage]
        );
      }
      if (missingPairs.length > 0) {
        return unknown(
          `A no-side-effects claim requires usable before and after existence observations for every target in the explicit bounded claim scope; complete two-point observations are missing or non-boolean for: ${missingPairs.join(', ')}. The claim remains unverified.`,
          [event, coverage]
        );
      }

      const stateRefs = (Array.isArray(data.snapshots) ? data.snapshots : [])
        .filter(snapshot => snapshot && typeof snapshot === 'object' && relevantTargets.has(snapshot.target));
      const outsideChanged = coverage.changedTargets.filter(target => !relevantTargets.has(target));
      const outsideNote = outsideChanged.length > 0
        ? ` The coverage record also lists changed target(s) outside the claim scope (${outsideChanged.join(', ')}); those changes are not eligible to refute the explicitly bounded claim.`
        : '';
      const temporalNote = timedPairCount === relevantTargets.size
        ? ' The observedAt values for the claim-scope snapshots are valid UTC and ordered before/after; this is synthetic ordering consistency, not proof of real event-time correlation.'
        : timedPairCount > 0
          ? ` observedAt metadata is present for ${timedPairCount} of ${relevantTargets.size} claim-scope target pairs; those values are valid UTC and ordered before/after, but real event-time correlation is not established for the untimed pairs.`
          : ' No observedAt metadata is present, so real event-time correlation is not established.';
      return supported(
        `The synthetic coverage record is complete for its declared scope (${coverage.scope.join(', ')}), and the explicit bounded claim scope (${[...declared.targets].join(', ')}) has usable before and after existence observations with no change.${outsideNote}${temporalNote} This assessment is bounded to the declared synthetic scope and is not a system-wide guarantee.`,
        [event, coverage, ...stateRefs]
      );
    }

    case 'execution_failed': {
      const selected = selectEvent(data, claim, WRITE_TOOL);
      if (!selected.event) return unknown(selected.reason, selected.candidates);
      const event = selected.event;
      if (event.status === 'success') return bad('The tool result reports success.', [event]);
      if (event.status !== 'failed') return unknown('No matching failed tool result exists.', [event]);
      return supported('The tool result reports failure, without implying no partial effects.', [event]);
    }

    case 'execution_failed_no_effect': {
      const selected = selectEvent(data, claim, WRITE_TOOL);
      if (!selected.event) return unknown(selected.reason, selected.candidates);
      const event = selected.event;
      if (event.status === 'success') {
        return bad(
          'The selected tool event reports success, which refutes the failed-execution conjunct of this claim. The event result establishes nothing about target-level existence change; the no-change conjunct is not assessed.',
          [event]
        );
      }
      if (event.status !== 'failed') {
        return unknown(
          'No failed execution event exists for the claim target; the failed-execution conjunct cannot be met and the no-change conjunct cannot be assessed.',
          [event]
        );
      }

      const before = selectSnapshot(data, claim.target, 'before');
      if (!before.snapshot) {
        return unknown(
          `${before.reason} The no-change conjunct cannot be assessed.`,
          [event, ...before.candidates]
        );
      }
      const after = selectSnapshot(data, claim.target, 'after');
      if (!after.snapshot) {
        return unknown(
          `${after.reason} The no-change conjunct cannot be assessed.`,
          [event, before.snapshot, ...after.candidates]
        );
      }
      if (typeof before.snapshot.exists !== 'boolean' || typeof after.snapshot.exists !== 'boolean') {
        return unknown(
          'Before/after snapshots must record boolean exists states; the no-change conjunct of the claim remains unverified.',
          [event, before.snapshot, after.snapshot]
        );
      }

      const temporal = temporalSanity(before.snapshot, after.snapshot);
      if (temporal.mode !== 'absent' && temporal.mode !== 'ok') {
        return unknown(
          temporalReason(temporal.mode),
          [event, before.snapshot, after.snapshot]
        );
      }

      const coverage = data.coverage;
      if (!coverage || typeof coverage !== 'object') {
        return unknown(
          'No coverage record exists; the no-change conjunct of the claim remains unverified.',
          [event, before.snapshot, after.snapshot]
        );
      }
      if (!Array.isArray(coverage.changedTargets)) {
        return unknown(
          'The coverage record has no changedTargets array; sufficient coverage for the no-change conjunct is not established.',
          [event, before.snapshot, after.snapshot, coverage]
        );
      }
      if (
        !Array.isArray(coverage.observedTargets) ||
        !coverage.observedTargets.every(isNonEmptyString) ||
        !coverage.observedTargets.includes(claim.target)
      ) {
        return unknown(
          'The coverage record does not include the claim target among valid observed targets; the no-change conjunct remains unverified.',
          [event, before.snapshot, after.snapshot, coverage]
        );
      }
      if (new Set(coverage.observedTargets).size !== coverage.observedTargets.length) {
        return unknown(
          'The coverage record contains duplicate observed targets; sufficient coverage for the no-change conjunct is not established.',
          [event, before.snapshot, after.snapshot, coverage]
        );
      }
      if (!coverage.changedTargets.every(target =>
        isNonEmptyString(target) && coverage.observedTargets.includes(target)
      )) {
        return unknown(
          'The coverage record lists changed targets outside its observed-target set; the coverage record is internally inconsistent and cannot establish the no-change conjunct.',
          [event, before.snapshot, after.snapshot, coverage]
        );
      }
      if (new Set(coverage.changedTargets).size !== coverage.changedTargets.length) {
        return unknown(
          'The coverage record contains duplicate changed targets; the coverage record is internally inconsistent and cannot establish the no-change conjunct.',
          [event, before.snapshot, after.snapshot, coverage]
        );
      }
      if (coverage.scope !== undefined) {
        if (
          !Array.isArray(coverage.scope) ||
          coverage.scope.length === 0 ||
          !coverage.scope.every(isNonEmptyString)
        ) {
          return unknown(
            'The coverage scope is malformed; sufficient coverage for the target-level no-change claim is not established.',
            [event, before.snapshot, after.snapshot, coverage]
          );
        }
        if (!coverage.scope.includes(claim.target)) {
          return unknown(
            'The claim target is outside the declared coverage scope; the no-change conjunct remains unverified.',
            [event, before.snapshot, after.snapshot, coverage]
          );
        }
        if (!coverage.observedTargets.every(target => coverage.scope.includes(target))) {
          return unknown(
            'Observed targets fall outside the declared coverage scope; the coverage record is inconsistent.',
            [event, before.snapshot, after.snapshot, coverage]
          );
        }
      }

      // M3a: coverage integrity is established before a state difference is
      // allowed to refute the no-change conjunct.
      const partials = partialSnapshots(data, [claim.target]);
      if (before.snapshot.exists !== after.snapshot.exists) {
        const partialNote = partials.length > 0
          ? ' A scope-relevant snapshot for this target also carries observedPartial:true; that flag is consistent with a bounded partial observation but does not attribute the change to the failed tool.'
          : '';
        return bad(
          `The recorded before/after target states differ, which refutes the no-change conjunct of the claim.${partialNote} This record does not establish that the failed tool caused the change.`,
          [event, before.snapshot, after.snapshot, coverage, ...partials]
        );
      }
      if (coverage.changedTargets.includes(claim.target)) {
        // D6 boundary: a generic changed list does not prove an existence
        // change, so it cannot refute the existence-only no-change conjunct.
        // It does block support and remains adverse but inconclusive.
        return unknown(
          'The coverage record lists the claim target as changed while the before/after existence states are identical. A generic changed target does not establish an existence change, so it cannot refute the no-change conjunct; the conflict is adverse but inconclusive and the claim remains unverified.',
          [event, before.snapshot, after.snapshot, coverage]
        );
      }
      if (partials.length > 0) {
        return unknown(
          'The before/after existence states are identical, but a scope-relevant snapshot carries observedPartial:true while the coverage record lists no changed target. The partial flag conflicts with an unconditional no-change declaration and is not by itself proof of a partial write; the claim remains unverified.',
          [event, before.snapshot, after.snapshot, coverage, ...partials]
        );
      }
      if (coverage.complete !== true) {
        return unknown(
          'The coverage record is not complete; the no-change conjunct of the claim remains unverified.',
          [event, before.snapshot, after.snapshot, coverage]
        );
      }
      return supported(
        'Both conjuncts are supported within a bounded observation: the selected tool result reports failed, and the recorded before/after existence states for the claim target are identical, with complete synthetic coverage listing the target as observed and unchanged. This is target-level observational evidence only; it does not assert the absence of unobserved effects or causation.',
        [event, before.snapshot, after.snapshot, coverage]
      );
    }

    default:
      return unknown(`Unrecognized experimental claim kind: ${claim.kind}`);
  }
}

export function validateFixtureData(data, expectedCaseId) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Fixture must be a JSON object.');
  }
  if (expectedCaseId !== undefined && data.caseId !== expectedCaseId) {
    throw new Error(`Fixture caseId does not match allowlist entry: ${expectedCaseId}`);
  }
  if (data.synthetic !== true) {
    throw new Error(`Not an approved synthetic fixture: ${data.caseId || 'unknown'}`);
  }
  if (!isNonEmptyString(data.description)) {
    throw new Error('Fixture description must be a non-empty string.');
  }
  if (!Array.isArray(data.claims)) {
    throw new Error('Fixture claims must be an array.');
  }

  const claimIds = new Set();
  for (const claim of data.claims) {
    if (!claim || typeof claim !== 'object') throw new Error('Claim must be an object.');
    if (!isNonEmptyString(claim.id)) throw new Error('Claim id must be a non-empty string.');
    if (claimIds.has(claim.id)) throw new Error(`Duplicate claim ID: ${claim.id}`);
    claimIds.add(claim.id);
    if (!isNonEmptyString(claim.kind)) throw new Error(`Claim kind missing: ${claim.id}`);
    if (!isNonEmptyString(claim.text)) throw new Error(`Claim text missing: ${claim.id}`);
    if (!isNonEmptyString(claim.target)) throw new Error(`Claim target missing: ${claim.id}`);
    if (claim.eventId !== undefined && !isNonEmptyString(claim.eventId)) {
      throw new Error(`Claim eventId must be a non-empty string: ${claim.id}`);
    }
    if (claim.claimScope !== undefined) {
      const declaredScope = claim.claimScope;
      const validToken = declaredScope === 'unbounded';
      const validTargets = Array.isArray(declaredScope) &&
        declaredScope.length > 0 &&
        declaredScope.every(isNonEmptyString);
      if (!validToken && !validTargets) {
        throw new Error(`Claim claimScope must be "unbounded" or a non-empty string array: ${claim.id}`);
      }
    }
  }

  const recordIds = new Set();
  for (const [key, label] of [
    ['events', 'event'],
    ['snapshots', 'snapshot'],
    ['authorizations', 'authorization'],
    ['policySnapshots', 'policy snapshot']
  ]) {
    const list = data[key];
    if (list === undefined) continue;
    if (!Array.isArray(list)) throw new Error(`Fixture ${key} must be an array.`);
    for (const record of list) {
      if (!record || typeof record !== 'object') throw new Error(`Invalid ${label} record.`);
      if (!isNonEmptyString(record.id)) throw new Error(`${label} id must be a non-empty string.`);
      if (recordIds.has(record.id)) throw new Error(`Duplicate record ID: ${record.id}`);
      recordIds.add(record.id);
    }
  }

  if (data.coverage !== undefined) {
    if (!data.coverage || typeof data.coverage !== 'object') throw new Error('Coverage must be an object.');
    if (!isNonEmptyString(data.coverage.id)) throw new Error('Coverage id must be a non-empty string.');
    if (recordIds.has(data.coverage.id)) throw new Error(`Duplicate record ID: ${data.coverage.id}`);
    recordIds.add(data.coverage.id);
  }

  const snapshotKeys = new Set();
  for (const snapshot of (Array.isArray(data.snapshots) ? data.snapshots : [])) {
    const key = `${snapshot.target}\u0000${snapshot.phase}`;
    if (snapshotKeys.has(key)) {
      throw new Error(`Duplicate snapshot target/phase: ${snapshot.target}/${snapshot.phase}`);
    }
    snapshotKeys.add(key);
  }

  return data;
}

export function analyzeFixtureData(data, expectedCaseId) {
  validateFixtureData(data, expectedCaseId);
  const claims = data.claims.map(claim => ({
    id: claim.id,
    text: claim.text,
    kind: claim.kind,
    target: claim.target,
    ...evaluateClaim(data, claim)
  }));
  return {caseId: data.caseId, description: data.description, claims};
}

export function loadFixture(id) {
  if (!FIXTURE_IDS.includes(id)) throw new Error(`Fixture ID is not in the allowlist: ${id}`);
  const location = resolve(inputs, `${id}.json`);
  const projectReal = realpathSync(project);
  const inputsReal = realpathSync(inputs);
  if (!isInside(projectReal, inputsReal)) {
    throw new Error('The fixture directory escapes the project root.');
  }

  if (lstatSync(location).isSymbolicLink()) throw new Error(`Symlink fixture rejected: ${id}`);
  const real = realpathSync(location);
  if (!isInside(inputsReal, real)) throw new Error(`Fixture path escapes the allowlisted directory: ${id}`);
  const stat = statSync(real);
  if (!stat.isFile()) throw new Error(`Fixture is not a regular file: ${id}`);
  if (stat.nlink > 1) throw new Error(`Hard-linked fixture rejected: ${id}`);

  const fd = openSync(real, 'r');
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile()) throw new Error(`Fixture is not a regular file: ${id}`);
    if (opened.nlink > 1) throw new Error(`Hard-linked fixture rejected: ${id}`);
    return {id, location, real, bytes: readFileSync(fd)};
  } finally {
    closeSync(fd);
  }
}

export function buildReport() {
  const aggregate = {
    engine: 'DSH-SYN-CE-LAB',
    version: '0.1.3',
    syntheticOnly: true,
    semantics: ['M1', 'M2', 'M3a', 'M4', 'M5a'],
    t6ExpectationChange: 'NOT_AUTHORIZED',
    formalGuardAdmission: 'NOT_PERFORMED',
    warning: 'Experimental comparison only. Not Guard canonical decisions or real event assurance.',
    cases: []
  };

  for (const id of FIXTURE_IDS) {
    const {bytes} = loadFixture(id);
    const data = JSON.parse(bytes.toString('utf8'));
    const analyzed = analyzeFixtureData(data, id);
    aggregate.cases.push({
      caseId: id,
      fixtureSha256: sha256(bytes),
      description: analyzed.description,
      claims: analyzed.claims
    });
  }
  return aggregate;
}

function renderMarkdown(aggregate) {
  const clean = value => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
  const lines = [
    '# Synthetic Claim–Evidence Review (v0.1.3)',
    '',
    '**SYNTHETIC ONLY — NOT FORMAL GUARD ADMISSION.**',
    '',
    'Generated by deterministic Node.js code; no model-generated verdicts.',
    '',
    'Implemented experimental rules: M1 (two-point evidence), M2 (explicit bounded claimScope), M3a (coverage integrity first), M4 (scope conflict), M5a (optional temporal sanity).',
    '',
    '`T6_EXPECTATION_CHANGE=NOT_AUTHORIZED`. Existing `execution_failed_no_effect` target-level support remains legacy behavior under semantic HOLD; it is not evidence for a general A-level or C-level proposition.',
    ''
  ];
  for (const c of aggregate.cases) {
    lines.push(
      `## ${c.caseId} — ${c.description}`,
      '',
      `Fixture SHA-256: \`${c.fixtureSha256}\``,
      '',
      '| Claim | Evidence refs | Experimental assessment | Reason |',
      '|---|---|---|---|'
    );
    for (const claim of c.claims) {
      lines.push(
        `| ${clean(claim.text)} | ${claim.evidenceRefs.join(', ') || 'none'} | ${claim.status} | ${clean(claim.reason)} |`
      );
    }
    lines.push('');
  }
  lines.push(
    '## Limitations',
    '',
    '- All input events, authorizations, policies, and state snapshots are invented fixture data.',
    '- Evidence refs identify records *within a fixture*, not verified real-world sources.',
    '- An absent event is not evidence that an action did not happen.',
    '- A sandbox-denial result is not proof of universal isolation or of policy causation.',
    '- An authorization field match is not proof of issuer authenticity or real enforcement.',
    '- Only the declared synthetic coverage is assessed; unobserved side effects are not ruled out.',
    '- A before/after target-state record does not establish which actor caused the change.',
    '- M1: a no-side-effects support result requires usable before and after existence observations for every target in the explicit bounded claim scope; a single snapshot cannot support no-change.',
    '- M2/M4: support requires an explicit bounded `claimScope`. Missing scope, `unbounded`, malformed scope, or bounded scope conflicting with plainly unbounded text remains UNVERIFIED; absence of an unbounded keyword does not establish boundedness.',
    '- M3a: coverage structure and internal consistency are checked before a change record can refute. Invalid coverage is UNVERIFIED; a valid in-claim-scope change may refute; a valid out-of-claim-scope change does not automatically refute a bounded claim.',
    '- M5a: when `observedAt` is present it must be strict UTC and ordered before -> after; missing temporal metadata does not establish real event-time correlation.',
    '- A generic `changedTargets` entry is not proof of an existence change. For `execution_failed_no_effect` it blocks support but does not by itself refute the existence-only no-change conjunct.',
    '- `execution_failed_no_effect` is a conjunction: failed execution plus no observed target-level existence change. A success result refutes only the failed-execution conjunct.',
    '- `observedPartial:true` is an observation-quality flag; it is not proof of a partial write and does not by itself contradict a no-change claim.',
    '- A no-side-effects assessment is bounded to the declared synthetic claim scope and coverage scope; unbounded "anywhere / all effects" claims are not supported.',
    '- The optional `claimScope` field is an experimental synthetic-analysis input, not a Guard canonical field.',
    '- Timestamps must be strict UTC values ending in Z; malformed or non-UTC values remain UNVERIFIED.',
    '- Fixed-path reads use realpath containment, final-symlink rejection, regular-file checks, and hardlink rejection. A filesystem TOCTOU window remains; this is not a security boundary.',
    '- No actual DSH-EXP03 files or historic research Note originals were read.',
    ''
  );
  return lines.join('\n');
}

export function writeReport(aggregate) {
  mkdirSync(outputs, {recursive: true});
  const json = JSON.stringify(aggregate, null, 2) + '\n';
  writeFileSync(resolve(outputs, 'CLAIM_EVIDENCE_REPORT.json'), json, 'utf8');
  writeFileSync(resolve(outputs, 'CLAIM_EVIDENCE_REPORT.md'), renderMarkdown(aggregate), 'utf8');
  return {json};
}

export function run() {
  const aggregate = buildReport();
  const {json} = writeReport(aggregate);
  const claims = aggregate.cases.flatMap(c => c.claims);
  const counts = claims.reduce((acc, claim) => {
    acc[claim.status] = (acc[claim.status] || 0) + 1;
    return acc;
  }, {});
  process.stdout.write(
    `SYNTHETIC_ONLY=true\nCASES=${aggregate.cases.length}\nCLAIMS=${claims.length}\nCOUNTS=${JSON.stringify(counts)}\nOUTPUTS=outputs/CLAIM_EVIDENCE_REPORT.{json,md}\n`
  );
  return {aggregate, json};
}

const invokedDirectly = process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) run();
