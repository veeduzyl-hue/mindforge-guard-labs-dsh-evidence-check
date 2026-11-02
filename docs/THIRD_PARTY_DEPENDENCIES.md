# Third-party dependencies and license boundaries

This project is MIT-licensed by its Owner and has **no vendored DeepSeek Harness/Cordis source or npm package** in the experimental GitHub beta. It imports `defineTool` from `@deepseek-ai/dsh-tools` as a host peer, declared as `^0.2.1-rc.2`. Node.js `node:*` APIs are platform dependencies.

The upstream DeepSeek Harness project declares MIT and publishes separate third-party notices: https://github.com/deepseek-ai/deepseek-harness . This **does not** independently verify the license files, bundled code or transitives of every concrete `@deepseek-ai/dsh-tools` installation.

Required before any public release:

1. Inspect the exact `@deepseek-ai/dsh-tools` rc.2 and rc.5 distribution `package.json`, LICENSE and relevant notices (and the Host package).
2. Confirm that `npm pack --dry-run` contains **no third-party runtime files** and no private evidence, baseline fixtures, internal mapping, logs or credentials.
3. If third-party code is ever bundled/vendored, retain its required notices in the release according to its actual license obligations.
4. Independently verify compatibility with the exact DSH developer-preview version; MIT license compatibility is not runtime API compatibility.

rc.2/rc.5 Host and dsh-tools reported MIT metadata in clean-install CI; their transitive dependencies and notices are not independently certified.
