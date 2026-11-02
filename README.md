# Evidence Check for DeepSeek Harness

**See what the evidence supports—not just what an AI agent says happened.**

Evidence Check is a developer-focused, evidence-aware review tool from **MindForge Guard Labs**. It examines structured **synthetic** Claim–Evidence records and produces traceable, bounded findings using a deterministic evaluation engine.

[中文说明](README.zh-CN.md) · [Examples](examples/) · [Privacy](docs/PRIVACY.md) · [Security](docs/SECURITY.md)

## Why Evidence Check?

Agent workflows can report a successful action while the available records tell a narrower story. A tool response, a before/after snapshot and a coverage claim do not necessarily prove the same thing.

Evidence Check helps developers explore those gaps before relying on an agent's narrative:

- **Evidence-linked conclusions.** Each claim gets a verdict, a written reason and references to the supporting or conflicting records.
- **Bounded judgments.** Distinguish `SUPPORTED_LIMITED`, `UNVERIFIED` and `CONTRADICTED` instead of collapsing uncertainty into a pass/fail label.
- **Deterministic review.** A pinned rules engine evaluates the evidence; a language model does not invent the verdict.
- **Local tool execution.** The plugin itself has no telemetry, automatic uploads or runtime filesystem writes.
- **Built for experimentation.** Use structured fictional cases to test how agent claims relate to recorded observations.

## How it works

```text
Synthetic claims + events + snapshots + coverage
                      |
                      v
        review_synthetic_evidence_input
                      |
                      v
            Pinned evaluation engine
                      |
                      v
     Verdict + reason + evidence references
```

The DeepSeek Harness tool accepts an `evidenceJson` string (maximum **32 KiB**) containing a declared `synthetic:true` case, a `SYN-*` case ID and synthetic targets. The engine returns bounded conclusions without rewriting the underlying evidence. See [example A](examples/unseen-before-after-A.json) and [example B](examples/unseen-before-after-B.json).

**Example outcomes:** an absent post-state can leave a file-creation claim `UNVERIFIED`; a successful synthetic tool event together with bounded before/after observations can support `SUPPORTED_LIMITED`. These are example-specific findings, not universal guarantees.

## Explore the project

From a source checkout with Node.js 22+:

```bash
npm test
node scripts/verify-engine.mjs
node scripts/integration-preflight.mjs
```

The project includes a DSH tool integration and an npm package layout. Compatibility testing has exercised npm-installed DSH rc.2 and rc.5 tool interfaces on Windows and Linux. **End-user DSH Profile installation and full Agent lifecycle are separate integration checks; no general-availability claim is made here.**

## Where it fits

Evidence Check is useful for synthetic agent-workflow experiments, developer education, claim–evidence regression tests and conversations about verifiability. It is **not** an authorization engine, execution gate, production log auditor or independent assurance certification.

### Privacy and trust boundaries

- **Synthetic inputs only.** Do not submit real Agent traces, customer data, proprietary source code, personal information or secrets.
- The plugin performs local deterministic evaluation, but **DeepSeek Harness may send chat messages and tool arguments to your configured model provider**.
- A `synthetic:true` declaration is supplied by the user; the plugin cannot independently certify that an input contains no sensitive content.
- Verdicts are bounded by available evidence and do not establish real-world causation, complete effect coverage or formal MindForge Guard admission.

Read [provenance and assurance boundaries](docs/PROVENANCE_AND_ASSURANCE.md) and [privacy guidance](docs/PRIVACY.md).

## Ecosystem and license

Evidence Check is an **independent MindForge Guard Labs community experiment** built for DeepSeek Harness. It is not a component of the formal MindForge Guard governance product.

**MIT License** · Copyright © 2026 veeduzyl-hue. See [LICENSE](LICENSE) and [third-party dependencies](docs/THIRD_PARTY_DEPENDENCIES.md).

For feedback, use a minimal, human-reviewed **fictional** reproduction; never attach raw sessions or secrets. [Synthetic feedback template](.github/ISSUE_TEMPLATE/synthetic-feedback.yml).
