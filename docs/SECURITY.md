# Security boundary — experimental candidate

- Scope: synthetic JSON text, 32 KiB maximum. No arbitrary file paths, URLs or command strings in the tool contract.
- Input is user-declared synthetic; false declarations, hidden secrets and malicious prose cannot be fully detected by this code.
- Validates top-level fields, distinct record IDs, claim kinds, synthetic URI targets, limits, and dangerous object keys. Schema/semantic errors are fail-closed.
- Uses the exact SHA-256-pinned **v0.1.3 deterministic engine** when the approved baseline has been copied. On a hash mismatch the tool refuses to process data.
- New input is NOT compared to the frozen five-case Golden Report. That benchmark cannot validate novel case semantics.
- Outputs verdicts verbatim from the evaluator, with reason and in-fixture evidenceRefs. No LLM adjudication.
- Tool code has no network, subprocesses, telemetry client, or write calls. This does not prevent the DSH Host from writing its own session metadata.
- An in-process plugin shares privileges with its Host. SHA-256 checks detect known file substitution; they do not constitute host sandboxing or prevent TOCTOU.
- Original A-host rc.2 isolated DSH Profile and Agent A/B were OWNER_ATTESTED_PASS in OD-001; raw events remain RECORDED_NOT_INDEPENDENTLY_REVIEWED. A separate B-host clean installation and rc.5 check are still required before beta release.
- No raw logs, Guard canonical schemas, EAK verification, production access, independent assurance, or Guard admission.
- `D6_GENERALIZED_SEMANTICS=HOLD`, `T6_EXPECTATION_CHANGE=NOT_AUTHORIZED`, `PAIRED_MATRIX_PROVENANCE=PARTIAL_NOT_CERTIFIED`.

Security reports: use the eventual repository's private security advisory mechanism when available; do not publish secrets or exploitable cases in a public issue. A dedicated reporting channel is pending repository creation.
