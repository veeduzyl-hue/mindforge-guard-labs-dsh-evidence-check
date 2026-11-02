# Privacy and feedback — v0.2 candidate

**Default: no telemetry, no analytics, no background upload, no data collection.** The plugin's runtime path is local and read-only; there is no HTTP/fetch/telemetry client in `src/`. It does not obtain or send files from the machine.

**Important distinction:** DeepSeek Harness may send agent prompts and tool arguments to the configured language model provider. Pasting synthetic JSON into a chat can therefore expose the pasted content to that provider even though this plugin does not perform a network request. We do NOT assert that the complete Host or model interaction is local-only.

`synthetic:true` is a statement by the submitting user, not an automatic proof that the content is safe to share. Do not submit real traces, proprietary code, personal data, API tokens, passwords or secrets through a model conversation.

No identifier, content, verdict, telemetry or event is automatically uploaded to MindForge Guard. No user consent is assumed from installation or use.

Community reporting, if/when a public repository is created, will be voluntary. An issue template will remind reporters to provide a human-reviewed, minimal synthetic reproduction, with sensitive fields removed. Reporters should not attach whole sessions, logs or dumps.

For future opt-in case submissions, a separate explicit action, a visible preview, purpose/retention information and a deletion process must be implemented before any collection is activated. This candidate contains **none** of that infrastructure.

Host session logging and model provider retention are governed by the Host/provider setup, not by this plugin. Users should review their configured provider terms and project policies.
