# Guard Labs — DSH 合成证据核查 v0.2 私有发布准备候选

**状态：已选定 MIT 许可并署名 veeduzyl-hue；但仍未公开，`private:true`；不得直接推送公共仓库或发布 npm。**

这是由 MindForge Guard Labs 品牌支持的独立社区实验插件，不是正式 Guard 组件，不构成真实证据 assurance、因果验证或生产安全认证。

`review_synthetic_evidence_input` 只接受一个 `evidenceJson` 字符串（最大 32KiB），必须是用户自行声明的合成 Claim–Evidence JSON，`synthetic:true`、`SYN-*` 案例编号和 `synthetic://` 目标。由 SHA-256 锁定的冻结 v0.1.3 引擎计算 verdict/reason/evidenceRefs，而不是让大模型重新判定。新案例**不与旧 Golden Report 比对**。

## 当前已验证的事项

- A 电脑：OD-001 于 2026-10-30 限定接受 v0.2 本地运行；rc.2 独立 Profile / Agent A、B 是 Owner 证明的 PASS，原始事件 NDJSON 已记录但未逐行独立审阅。
- B 电脑：私有迁移、27/27 测试、冻结引擎校验和新 A/B 结果通过；**B 电脑 DSH 完整运行时和干净安装尚未验证**。
- 示例 A=`UNVERIFIED`，B=`SUPPORTED_LIMITED`。示例共用 `caseId` 但内容哈希不同；Agent 传入的紧凑 JSON 可以语义等价而非原始文件字节相同。

## B 电脑离线验证

```powershell
node --test .\tests\validate.test.mjs .\tests\reviewer.test.mjs
node .\scripts\verify-engine.mjs
node .\scripts\integration-preflight.mjs
node .\scripts\release-check.mjs  # 预期阻断；退出码非零
```

## IP、隐私及发布

**2026-11-02 Owner 已正式决定：MIT License；Copyright (c) 2026 veeduzyl-hue。** 授权范围包括 `src/`、原始字节不变的冻结引擎，以及拟公开的项目自有 README、测试、合成示例、文档、脚本和配置。正式 `LICENSE` 已放在候选目录，范围与第三方排除项见 `docs/LICENSE_SCOPE.md`、`NOTICE.md`。虽然 License 已确认，`private:true`、Peer 包具体许可复核、B 电脑干净安装、rc.5 兼容性、独立仓库与市场提交等关口仍未关闭；**公开发布继续 BLOCKED**。

插件自身不自动上传、采集、记录真实证据；但在 DSH 聊天中提交给托管模型的文本与工具参数仍可能到达模型提供商。请勿提供真实日志、源码、凭据、客户和个人数据。

`PUBLIC_RELEASE=BLOCKED`；`FORMAL_GUARD_ADMISSION=NOT_PERFORMED`。
