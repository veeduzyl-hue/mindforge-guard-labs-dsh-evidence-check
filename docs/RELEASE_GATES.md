# Guard Labs v0.2 — Release preparation gates (R2, 2026-11-02)

**NO PUBLIC RELEASE.** This is separate from the immutable accepted A-host v0.2 candidate and B-host private migration.

| Gate | Current recorded evidence | Status |
|---|---|---|
| G0 Source separation | Candidate staged separately; accepted source files `src/` and frozen engine SHA-256 identical | PRIVATE_PREP_PASS |
| G1 New input | A-host actual frozen engine and B-host offline A/B; A UNVERIFIED, B SUPPORTED_LIMITED | OWNER_VERIFIED_BOUNDED_PASS |
| G2 Cordis/Agent | A-host rc.2 isolated Profile/dispatch and real Agent A/B, OD-001 | OWNER_ATTESTED_PASS_WITH_RAW_EVENT_LIMIT |
| G3 Clean distribution | Local pack dry-run only; fresh install in independent environment remains | BLOCKED |
| G4 Security/privacy | Code/manifest review and synthetic-only boundaries; no independent runtime interceptor or production audit | PARTIAL |
| G5 License/IP | Owner selected MIT for project-owned release scope; copyright (c) 2026 veeduzyl-hue; finalized LICENSE/NOTICE present. Exact third-party peer artifact license and separate publication gates still pending | OWNER_LICENSE_APPROVED__PEER_REVIEW_PENDING |
| G6 Independent repo | Not created; no public commit or tag | NOT_CREATED |
| G7 Market | No market listing, no published pinned index | NOT_SUBMITTED |
| G8 Feedback | Voluntary text-only synthetic issue template; no automatic collection | DESIGN_ONLY |

Preserve `RAW_TOOL_EVENTS=RECORDED_NOT_INDEPENDENTLY_REVIEWED`, `FORMAL_GUARD_ADMISSION=NOT_PERFORMED`, `D6_GENERALIZED_SEMANTICS=HOLD`, `PAIRED_MATRIX_PROVENANCE=PARTIAL_NOT_CERTIFIED`, and `STAGE3_CORDIS_PLUGIN=NOT_AUTHORIZED`.

**The `npm pack` local contents check, if it passes, does not mean a clean installation passed, nor that publishing is permitted.**
