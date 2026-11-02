# Provenance, confidence limits and review boundaries

Date: 2026-11-02. Independent MindForge Guard Labs experiment; **no Guard formal admission**.

## Technical lineage and identity

- Owner attests that the plugin `src/` and exact accepted `baseline/engine/analyze.mjs` are original/ChatGPT-assisted work under their control, with no copied restricted third-party code or contractual impediments. This is an Owner rights assertion, not an independent code provenance investigation or patent clearance.
- Accepted engine SHA-256: `3B735DE3C994D4369D84843E285B1FF5120C808761EAE7ACC31D86B236574FCC`.
- Corrected plugin entry SHA-256: `502B85B4D2B1EC07159C5B3950C9F83BB3A87EF3D0691AD5ECDBD6224F2B5A49`.
- A-host OD-001: rc.2 isolated Profile load and registry dispatch OWNER_ATTESTED_PASS; real Agent A/B OWNER_ATTESTED_PASS. Raw NDJSON streams were recorded and hashed but **not independently reviewed line by line**.
- Identity: the Profile dispatch used exact A/B file bytes. Real Agent calls used semantically equivalent compact JSON strings with **different** raw SHA-256; do not equate them as byte-identical.
- B-host: Windows Node v24.12.0, 27/27 tests, nine frozen baseline files verified in the private transfer, A `UNVERIFIED`, B `SUPPORTED_LIMITED` preflight. B-host DSH runtime has **not** been demonstrated.

## Scope and semantic boundaries

- `SYNTHETIC_ONLY=true`, `D6_GENERALIZED_SEMANTICS=HOLD`, `PAIRED_MATRIX_PROVENANCE=PARTIAL_NOT_CERTIFIED`.
- This release-prep candidate contains the engine source (one frozen, byte-identical file), not the original nine-file private frozen reference pack or original 31-side mapping docs. The five private Golden cases and outputs are deliberately excluded.
- No generalized causal correctness, effect-boundary enforcement, formal Guard assurance, protected canonical schema acceptance or third-party security certification is claimed.
- MIT license selected by Owner (copyright veeduzyl-hue); exact peer-package notices, B clean install, rc.5, independent repo and marketplace remain separate gates.
