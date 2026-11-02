# Evidence Check for DeepSeek Harness — Guard Labs v0.2 private release preparation

**Status (2026-11-02): MIT LICENSE SELECTED; NOT PUBLIC.** `private:true` / `license: MIT`. This is a staged, independently reviewable candidate, **not** a published/community-market package.

MindForge Guard Labs supports this independent experimental plugin. It is **not part of MindForge Guard's formal admission, not production assurance, and not a generalized causal correctness guarantee**. The plugin is **synthetic-only**; never submit production logs, customer data, personal information, proprietary code or credentials.

## What the tool does

`review_synthetic_evidence_input` takes one `evidenceJson` string (maximum 32 KiB) containing a user-declared `synthetic:true` structured Claim–Evidence object with a `SYN-*` case ID and synthetic targets. Verdicts, reason and evidence refs are obtained from the exact SHA-256-pinned v0.1.3 deterministic engine `evaluateClaim`, not the model. For unseen inputs, no frozen Golden comparison applies. The only demonstrated new examples are A and B in `examples/`.

The two sample cases intentionally use the same `caseId` but different contents and raw hashes; they are **not** identical inputs. The tool's `inputSha256` hashes the exact JSON *string passed to the tool*; an Agent may serialize semantically equivalent JSON with different byte hashes. Do not claim byte-identical Agent input on that basis.

## B-computer release preparation (offline)

The Owner accepted the original A-host local runtime with limitations in OD-001 on 2026-10-30. The B-host private migration and offline verification also passed (Node 24.12.0, 27/27 unit tests, frozen engine A/B preflight). B-host DSH profile boot and independent clean install **have not been verified**.

Run from this separate staging directory (requires Node.js >=22):

```powershell
node --test .\tests\validate.test.mjs .\tests\reviewer.test.mjs
node .\scripts\verify-engine.mjs
node .\scripts\integration-preflight.mjs
node .\scripts\release-check.mjs  # expected: BLOCKED / nonzero exit
```

The original private B workspace, A-host accepted artifacts and their reports remain unchanged. The original A-host validation did include actual rc.2 DSH Profile/Agent calls, **OWNER_ATTESTED_PASS**, while raw Agent NDJSON streams were recorded but not independently reviewed line by line. Those outcomes must not be restated as B-host or clean-install evidence.

## Privacy and limitations

There is no plugin telemetry, automatic collection, remote upload, runtime filesystem write or model-based verdict. In a DSH conversation, **Harness may send messages/tool arguments to the selected hosted model provider**. `synthetic:true` is user-asserted and not a guarantee of absence of private information. See `docs/PRIVACY.md`, `docs/SECURITY.md`, and `docs/PROVENANCE_AND_ASSURANCE.md`.

## License and publication status

**Owner decision (2026-11-02): MIT License; Copyright (c) 2026 veeduzyl-hue.** The Owner authorizes MIT for the original/ChatGPT-assisted `src/` and the unchanged frozen engine, as well as the project-owned public README, tests, synthetic examples, documentation, scripts and configuration. The finalized license is in [`LICENSE`](LICENSE); the scope and third-party exclusions are in [`docs/LICENSE_SCOPE.md`](docs/LICENSE_SCOPE.md) and [`NOTICE.md`](NOTICE.md).

**Important distinction:** Licensing is decided, but **public release is still BLOCKED**. The npm package remains `private:true`, the separate repository has not been created, the exact peer-package notices need review, and independent clean installation / DSH rc.5 compatibility have not been demonstrated. No npm publication, public GitHub push or DSH market submission has occurred.

## Support and feedback

Proposed community feedback is manually submitted and opt-in, with fictional examples only. No logging/feedback ingestion is activated. A private security advisory channel will be defined after an independent repo exists.
