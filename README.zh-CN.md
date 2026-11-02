# Evidence Check for DeepSeek Harness

**让智能体的结论回到证据：看清记录实际支持什么，而不只是听它声称做了什么。**

**Evidence Check** 是 **MindForge Guard Labs** 面向开发者的证据审阅实验工具。它分析结构化的**合成 Claim–Evidence（主张—证据）记录**，通过确定性评估引擎输出可追溯、有限定条件的判断。

[English](README.md) · [合成示例](examples/) · [隐私说明](docs/PRIVACY.md) · [安全说明](docs/SECURITY.md)

## 为什么需要 Evidence Check？

智能体可能报告“任务成功”，但工具响应、执行前后快照及覆盖范围记录所能证明的事实并不总是一致。**执行记录不等于结果证据，结果证据也不自动等于完整授权或因果证明。**

Evidence Check 帮助开发者在合成场景中检验这些差异：

- **结论关联证据。** 每项主张返回判定、理由及相应的证据引用。
- **不确定性可见。** 区分 `SUPPORTED_LIMITED`（有限支持）、`UNVERIFIED`（未能核实）与 `CONTRADICTED`（证据矛盾）。
- **确定性判断。** 由受 SHA-256 固定的规则引擎计算结论，而不是由大模型自由生成。
- **本地工具逻辑。** 插件自身不包含遥测、自动上传或运行时文件写入。
- **开发者可实验。** 使用虚构的工具事件、快照和覆盖信息，分析智能体主张与记录的关系。

## 工作方式

```text
合成主张 + 工具事件 + 状态快照 + 覆盖记录
                      ↓
       review_synthetic_evidence_input
                      ↓
               确定性评估引擎
                      ↓
            判定 + 理由 + 证据引用
```

DeepSeek Harness 工具接受一个 `evidenceJson` 字符串（最大 **32 KiB**），要求声明 `synthetic:true`、使用 `SYN-*` 案例编号和合成目标。可查看[示例 A](examples/unseen-before-after-A.json)与[示例 B](examples/unseen-before-after-B.json)。

**示例：** 如果执行后记录显示目标不存在，文件创建主张可能保持 `UNVERIFIED`；如果合成工具成功事件及有限的前后观察相互支持，可能得到 `SUPPORTED_LIMITED`。这些是针对特定证据的结论，不代表所有场景都能正确识别。

## 安装社区实验 Beta

请使用独立的、不含真实凭据的 DSH 测试 Profile；建议 Node.js 24、DSH rc.5 和 pnpm。下载 [GitHub Beta Release](https://github.com/veeduzyl-hue/mindforge-guard-labs-dsh-evidence-check/releases/tag/v0.2.0-beta.1) 的 `.tgz` 和 `.tgz.sha256`，核验文件后执行：

```sh
dsh plugin --profile web add ./dsh-guard-labs-evidence-check-0.2.0-beta.1.tgz
dsh --profile web --dump-config
```

重启测试 Profile，使用 `review_synthetic_evidence_input`，仅提交**合成 JSON**。Windows/Linux 的 rc.5 官方安装与配置已验证；真实模型 rc.5 Agent 端到端和生产 assurance 尚未建立。GitHub Beta 是首个分发渠道，npm 和社区收录单独推进。


### 通过 DSH 自定义插件索引发现

在 DSH 实验插件中启用 **Custom plugin indexes**，进入 **Discover → Add index source**，输入：

`https://raw.githubusercontent.com/veeduzyl-hue/mindforge-guard-labs-dsh-evidence-check/main/plugin-index.json`

安装前核对 Git 固定提交。本索引由项目自行维护，**不代表第三方市场审核或官方推荐**。

## 快速探索

从项目源码目录运行（Node.js 22+）：

```bash
npm test
node scripts/verify-engine.mjs
node scripts/integration-preflight.mjs
```

项目提供 DeepSeek Harness 工具集成与 npm 打包结构。Windows/Linux 已验证 rc.2/rc.5 npm 包工具调用和 rc.5 官方 Profile CLI 安装配置；真实模型 Agent 生命周期仍未验收。

## 适合哪些场景？

适用于合成 Agent 工作流实验、开发者培训、Claim–Evidence 回归测试、证据可核查性研究等。

本工具**不是**执行授权系统、运行时拦截器、生产日志审计系统，也不提供正式的独立 assurance 认证。

### 隐私及信任边界

- **仅支持合成数据。** 请勿提交真实 Agent 日志、客户数据、专有源码、个人信息或凭据。
- 插件在本地执行确定性分析，但 **DeepSeek Harness 可能将聊天消息及工具参数发送给配置的模型提供商**。
- `synthetic:true` 是用户声明，不能独立证明数据不含敏感内容。
- 结论受实际记录范围限制，不证明真实世界的因果关系、完整副作用覆盖或 MindForge Guard 正式准入。

进一步阅读：[证据来源与保证边界](docs/PROVENANCE_AND_ASSURANCE.md)、[隐私说明](docs/PRIVACY.md)。

## 项目生态与许可

Evidence Check 是由 **MindForge Guard Labs** 支持、面向 DeepSeek Harness 的**独立社区实验项目**，不属于 MindForge Guard 正式治理产品的组件。

**MIT License** · Copyright © 2026 veeduzyl-hue。详见 [LICENSE](LICENSE) 和[第三方依赖说明](docs/THIRD_PARTY_DEPENDENCIES.md)。

反馈请使用经过人工审核的最小**虚构**复现案例，不要附加原始会话或密钥。[合成反馈模板](.github/ISSUE_TEMPLATE/synthetic-feedback.yml)。
