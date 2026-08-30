import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EChartsCoreOption } from 'echarts/core';
import { EChartsView } from '@/components/charts/EChartsView';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  securityAuditApi,
  type SecurityAuditConfig,
  type SecurityAuditEngine,
  type SecurityAuditEvent,
  type SecurityAuditRule,
  type SecurityAuditUsageGroupBy,
  type SecurityAuditUsageSummary,
} from '@/services/api/securityAudit';
import { useNotificationStore, useThemeStore } from '@/stores';
import { hydrateEngineBlocks, setEngineEnabled } from './securityAuditEngineModel';
import {
  buildAuditUsageTrend,
  formatAuditSuccessRate,
  hasAuditCost,
} from './securityAuditUsageModel';
import styles from './SecurityAuditPage.module.scss';

const emptyRule = (): SecurityAuditRule => ({ name: '', pattern: '', enabled: true });

const ENGINE_LABELS: Record<SecurityAuditEngine, { zh: string; en: string }> = {
  qwen3guard: { zh: 'Qwen3Guard', en: 'Qwen3Guard' },
  openai_moderations: { zh: 'OpenAI Moderations', en: 'OpenAI Moderations' },
};

export function SecurityAuditPage() {
  const { i18n } = useTranslation();
  const zh = i18n.language.toLowerCase().startsWith('zh');
  const { showNotification, showConfirmation } = useNotificationStore();
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const [config, setConfig] = useState<SecurityAuditConfig | null>(null);
  const [events, setEvents] = useState<SecurityAuditEvent[]>([]);
  const [databasePath, setDatabasePath] = useState('');
  const [activeTab, setActiveTab] = useState<'config' | 'events' | 'usage'>('config');
  // engineTab only chooses which engine form is visible. Browsing between the
  // forms never changes the configuration.
  const [engineTab, setEngineTab] = useState<SecurityAuditEngine>('qwen3guard');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [probing, setProbing] = useState(false);
  const [apiKey, setAPIKey] = useState('');
  const [moderationsAPIKey, setModerationsAPIKey] = useState('');
  const [usageGroupBy, setUsageGroupBy] = useState<SecurityAuditUsageGroupBy>('day');
  const [usage, setUsage] = useState<SecurityAuditUsageSummary | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextConfig, eventResponse] = await Promise.all([
        securityAuditApi.getConfig(),
        securityAuditApi.getEvents(),
      ]);
      setConfig(hydrateEngineBlocks(nextConfig));
      setEngineTab(nextConfig.engine);
      setEvents(eventResponse.items ?? []);
      setDatabasePath(eventResponse['database-path'] ?? '');
    } catch (error) {
      showNotification(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadUsage = useCallback(
    async (groupBy: SecurityAuditUsageGroupBy) => {
      setUsageLoading(true);
      try {
        setUsage(await securityAuditApi.getUsage(groupBy));
      } catch (error) {
        showNotification(error instanceof Error ? error.message : String(error), 'error');
      } finally {
        setUsageLoading(false);
      }
    },
    [showNotification]
  );

  useEffect(() => {
    if (activeTab !== 'usage') return;
    void loadUsage(usageGroupBy);
  }, [activeTab, loadUsage, usageGroupBy]);

  const scannerEntries = useMemo(
    () => Object.entries(config?.['scanner-catalog'] ?? {}),
    [config]
  );
  const moderationCategoryEntries = useMemo(
    () => Object.entries(config?.['moderation-category-catalog'] ?? {}),
    [config]
  );
  const engineTabActive =
    engineTab === 'openai_moderations'
      ? Boolean(config?.moderations.enabled)
      : Boolean(config?.guard.enabled);

  const patch = (value: Partial<SecurityAuditConfig>) =>
    setConfig((current) => (current ? { ...current, ...value } : current));
  const patchGuard = (value: Partial<SecurityAuditConfig['guard']>) =>
    setConfig((current) =>
      current ? { ...current, guard: { ...current.guard, ...value } } : current
    );
  const patchModerations = (value: Partial<SecurityAuditConfig['moderations']>) =>
    setConfig((current) =>
      current ? { ...current, moderations: { ...current.moderations, ...value } } : current
    );
  const patchThreshold = (category: string, score: number) =>
    setConfig((current) =>
      current
        ? {
            ...current,
            moderations: {
              ...current.moderations,
              thresholds: { ...current.moderations.thresholds, [category]: score },
            },
          }
        : current
    );

  const updateRule = (index: number, value: Partial<SecurityAuditRule>) => {
    if (!config) return;
    const rules = config.rules.map((rule, ruleIndex) =>
      ruleIndex === index ? { ...rule, ...value } : rule
    );
    patch({ rules });
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const payload: SecurityAuditConfig = {
        ...config,
        guard: { ...config.guard, 'api-key': apiKey.trim() },
        moderations: { ...config.moderations, 'api-key': moderationsAPIKey.trim() },
      };
      const saved = await securityAuditApi.updateConfig(payload);
      setConfig(hydrateEngineBlocks(saved));
      setAPIKey('');
      setModerationsAPIKey('');
      showNotification(zh ? '安全审计配置已保存' : 'Security audit configuration saved', 'success');
    } catch (error) {
      showNotification(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleProbe = async () => {
    if (!config) return;
    setProbing(true);
    try {
      const result = await securityAuditApi.probe(
        engineTab,
        { ...config.guard, 'api-key': apiKey.trim() },
        { ...config.moderations, 'api-key': moderationsAPIKey.trim() }
      );
      const engineName = zh ? ENGINE_LABELS[engineTab].zh : ENGINE_LABELS[engineTab].en;
      showNotification(
        zh
          ? `${engineName} 节点正常，耗时 ${result['latency-ms']} ms`
          : `${engineName} is healthy (${result['latency-ms']} ms)`,
        'success'
      );
    } catch (error) {
      showNotification(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      setProbing(false);
    }
  };

  const refreshEvents = async () => {
    const response = await securityAuditApi.getEvents();
    setEvents(response.items ?? []);
    setDatabasePath(response['database-path'] ?? '');
  };

  const handleClearEvents = () => {
    showConfirmation({
      title: zh ? '清空审计事件' : 'Clear audit events',
      message: zh ? '将删除 SQLite 中全部安全审计事件与审计用量记录，此操作不可撤销。' : 'All security audit events and audit usage records will be deleted from SQLite.',
      confirmText: zh ? '清空' : 'Clear',
      variant: 'danger',
      onConfirm: async () => {
        await securityAuditApi.clearEvents();
        setEvents([]);
        setUsage(null);
        showNotification(zh ? '审计事件与用量记录已清空' : 'Audit events and usage records cleared', 'success');
      },
    });
  };

  if (loading || !config) return <LoadingSpinner />;

  const modeHint = zh
    ? `${config['blocking-enabled'] ? '同步阻断：命中时在上游请求前拦截，Guard 异常时 fail-closed。' : '异步观察：审计不会阻断请求。'}${config['blocking-latest-turn-only'] ? '仅当尾部最近 2 条会话记录包含用户输入时，检查该输入及其前一条模型回复；纯 assistant/tool 工具续跑直接跳过。' : '检查 system/developer 与最近 10 条历史，未变化内容复用 Hash 缓存。'}`
    : `${config['blocking-enabled'] ? 'Blocking: matches are rejected before upstream dispatch and Guard failures fail closed. ' : 'Observe: auditing never blocks the request. '}${config['blocking-latest-turn-only'] ? 'Only user input found in the final two conversation records and its preceding model reply are inspected; assistant/tool-only continuations are skipped.' : 'System/developer content and the latest 10 history records are inspected, with unchanged content reusing the hash cache.'}`;

  const engineTabLabel = zh ? ENGINE_LABELS[engineTab].zh : ENGINE_LABELS[engineTab].en;
  const usageTrend = usage ? buildAuditUsageTrend(usage.buckets) : null;
  const trendOption: EChartsCoreOption | null =
    usageTrend && usageTrend.labels.length > 0
      ? {
          backgroundColor: 'transparent',
          grid: { top: 24, left: 8, right: 8, bottom: 8, containLabel: true },
          tooltip: { trigger: 'axis', confine: true },
          legend: {
            top: 0,
            textStyle: { color: resolvedTheme === 'dark' ? '#a3a3a3' : '#5f6c7b' },
          },
          xAxis: {
            type: 'category',
            data: usageTrend.labels,
            axisLabel: { color: resolvedTheme === 'dark' ? '#a3a3a3' : '#5f6c7b' },
          },
          yAxis: [
            { type: 'value', axisLabel: { color: '#409eff' } },
            { type: 'value', position: 'right', axisLabel: { color: '#14b8a6' } },
          ],
          series: [
            {
              name: zh ? '调用次数' : 'Calls',
              type: 'bar',
              yAxisIndex: 0,
              itemStyle: { color: '#409eff' },
              data: usageTrend.calls,
            },
            {
              name: zh ? '失败次数' : 'Failures',
              type: 'bar',
              yAxisIndex: 0,
              itemStyle: { color: '#f56c6c' },
              data: usageTrend.failedCalls,
            },
            {
              name: zh ? '输入 Token' : 'Input tokens',
              type: 'line',
              yAxisIndex: 1,
              smooth: true,
              itemStyle: { color: '#14b8a6' },
              data: usageTrend.inputTokens,
            },
          ],
        }
      : null;
  const showCost = usage ? hasAuditCost(usage) : false;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>{zh ? '安全审计' : 'Security Audit'}</h1>
          <p>{zh ? '扫描请求中的用户可控内容：正则快速检测 + 单一审计模型语义审计；阻断发生在请求发往上游之前。' : 'Scan user-controlled request content with fast regex checks and a single audit model before upstream forwarding.'}</p>
        </div>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => void load()}>{zh ? '刷新' : 'Refresh'}</Button>
          {activeTab === 'config' && <Button loading={saving} onClick={() => void handleSave()}>{zh ? '保存配置' : 'Save'}</Button>}
        </div>
      </div>

      <div className={styles.tabs}>
        <button className={activeTab === 'config' ? styles.active : ''} onClick={() => setActiveTab('config')}>{zh ? '策略配置' : 'Policy'}</button>
        <button className={activeTab === 'events' ? styles.active : ''} onClick={() => { setActiveTab('events'); void refreshEvents(); }}>{zh ? `审计事件 (${events.length})` : `Events (${events.length})`}</button>
        <button className={activeTab === 'usage' ? styles.active : ''} onClick={() => setActiveTab('usage')}>{zh ? '审计用量' : 'Audit usage'}</button>
      </div>

      {activeTab === 'config' && (
        <div className={styles.stack}>
          <Card title={zh ? '运行模式' : 'Runtime mode'}>
            <div className={styles.cardBody}>
              <ToggleSwitch checked={config.enabled} onChange={(enabled) => patch({ enabled })} label={zh ? '启用安全审计总开关' : 'Enable security audit'} />
              <ToggleSwitch checked={config['audit-third-party']} onChange={(value) => patch({ 'audit-third-party': value })} disabled={!config.enabled} label={zh ? '审计第三方 AI 提供商请求' : 'Audit third-party AI provider requests'} />
              <ToggleSwitch checked={config['blocking-enabled']} onChange={(value) => patch({ 'blocking-enabled': value })} disabled={!config.enabled} label={zh ? '启用同步阻断（Guard 异常时 fail-closed）' : 'Enable blocking (fail closed when Guard is unavailable)'} />
              <ToggleSwitch checked={config['blocking-latest-turn-only']} onChange={(value) => patch({ 'blocking-latest-turn-only': value })} disabled={!config.enabled} label={zh ? '仅检查最新用户轮次 + 上一条模型回复' : 'Inspect only latest user turn + previous model output'} />
              <ToggleSwitch checked={config['store-pass-events']} onChange={(value) => patch({ 'store-pass-events': value })} disabled={!config.enabled} label={zh ? '保存实际推理的通过事件' : 'Store inferred pass events'} />
              <Input type="number" min={1} max={5000} label={zh ? 'SQLite 事件保留数量' : 'SQLite event retention'} value={config['max-events']} onChange={(event) => patch({ 'max-events': Number(event.target.value) })} />
              <div className={styles.modeHint}>{modeHint}</div>
            </div>
          </Card>

          <Card title={zh ? '正则规则' : 'Regex rules'} extra={<Button size="sm" variant="secondary" onClick={() => patch({ rules: [...config.rules, emptyRule()] })}>{zh ? '添加规则' : 'Add rule'}</Button>}>
            <div className={styles.cardBody}>
              {config.rules.length === 0 && <div className={styles.empty}>{zh ? '尚未配置正则规则' : 'No regex rules configured'}</div>}
              {config.rules.map((rule, index) => (
                <div className={styles.ruleRow} key={index}>
                  <ToggleSwitch checked={rule.enabled} onChange={(enabled) => updateRule(index, { enabled })} ariaLabel={zh ? '启用规则' : 'Enable rule'} />
                  <Input placeholder={zh ? '规则名称' : 'Rule name'} value={rule.name} onChange={(event) => updateRule(index, { name: event.target.value })} />
                  <Input className={styles.monospace} placeholder="(?i)逆向|reverse\s+engineering" value={rule.pattern} onChange={(event) => updateRule(index, { pattern: event.target.value })} />
                  <Button variant="danger" size="sm" onClick={() => patch({ rules: config.rules.filter((_, ruleIndex) => ruleIndex !== index) })}>{zh ? '删除' : 'Delete'}</Button>
                </div>
              ))}
            </div>
          </Card>

          <Card title={zh ? '审计模型' : 'Audit model'}>
            <div className={styles.cardBody}>
              <SegmentedTabs
                items={[
                  { id: 'qwen3guard', label: ENGINE_LABELS.qwen3guard.en },
                  { id: 'openai_moderations', label: ENGINE_LABELS.openai_moderations.en },
                ]}
                activeTab={engineTab}
                ariaLabel={zh ? '选择审计模型' : 'Select audit model'}
                onChange={(value) => setEngineTab(value)}
              />
              <div className={styles.modeHint}>{zh ? '同一时刻只能启用一个审计模型：启用其中一个会自动停用另一个。切换标签只是查看配置，不会改动任何设置。审核入口、策略与最终结果保持一致，只有中间调用的模型不同。' : 'Only one audit model can be enabled at a time: enabling one disables the other. Switching tabs only browses the forms and changes nothing. The audit entry point, policy and final outcome stay identical.'}</div>

              {engineTab === 'qwen3guard' ? (
                <>
                  <ToggleSwitch checked={config.guard.enabled} onChange={(enabled) => setConfig((current) => (current ? setEngineEnabled(current, 'qwen3guard', enabled) : current))} disabled={!config.enabled} label={zh ? '启用 Qwen3Guard 语义审计（会停用 OpenAI Moderations）' : 'Enable Qwen3Guard (disables OpenAI Moderations)'} />
                  <div className={styles.grid}>
                    <Input label="Base URL" placeholder="http://127.0.0.1:11434/v1" value={config.guard['base-url']} onChange={(event) => patchGuard({ 'base-url': event.target.value })} />
                    <Input label={zh ? '模型' : 'Model'} value={config.guard.model} onChange={(event) => patchGuard({ model: event.target.value })} />
                    <Input revealable label={`API Key${config['has-api-key'] ? (zh ? '（已配置，留空保持）' : ' (configured; leave blank to keep)') : ''}`} value={apiKey} onChange={(event) => setAPIKey(event.target.value)} />
                    <Input type="number" min={100} max={120000} label={zh ? '超时（毫秒）' : 'Timeout (ms)'} value={config.guard['timeout-ms']} onChange={(event) => patchGuard({ 'timeout-ms': Number(event.target.value) })} />
                    <Input type="number" min={128} max={200000} label={zh ? '单分块上限（字符）' : 'Per-chunk input limit'} value={config.guard['input-limit']} onChange={(event) => patchGuard({ 'input-limit': Number(event.target.value) })} />
                    <Input type="number" min={1} max={64} label={zh ? '最大推理并发' : 'Max inference concurrency'} value={config.guard['max-concurrency']} onChange={(event) => patchGuard({ 'max-concurrency': Number(event.target.value) })} />
                    <Input type="number" min={1} max={10000} label={zh ? '最大等待请求数' : 'Max waiting requests'} value={config.guard['max-waiting']} onChange={(event) => patchGuard({ 'max-waiting': Number(event.target.value) })} />
                  </div>
                  <div className={styles.scanners}>
                    {scannerEntries.map(([id, scanner]) => (
                      <label key={id}><input type="checkbox" checked={config.guard.scanners.includes(id)} onChange={(event) => patchGuard({ scanners: event.target.checked ? [...config.guard.scanners, id] : config.guard.scanners.filter((value) => value !== id) })} /> {zh ? scanner.label_zh : scanner.label}</label>
                    ))}
                  </div>
                  <div className={styles.modeHint}>{zh ? '所有内容都会按原始角色送交 Guard：developer 作为 system、assistant 保持 assistant。任意角色命中已勾选分类都会在请求上游模型前阻断。相同冷缓存内容会合并为一次推理；不同内容受并发与等待上限保护，超出容量时同步模式 fail-closed。' : 'All content is sent to Guard with its original semantics: developer is mapped to system and assistant remains assistant. A selected category blocks any role before the upstream model. Identical cold-cache work is coalesced; unique work is bounded by the inference and waiting limits, and blocking mode fails closed when capacity is exhausted.'}</div>
                </>
              ) : (
                <>
                  <ToggleSwitch checked={config.moderations.enabled} onChange={(enabled) => setConfig((current) => (current ? setEngineEnabled(current, 'openai_moderations', enabled) : current))} disabled={!config.enabled} label={zh ? '启用 OpenAI Moderations 审计（会停用 Qwen3Guard）' : 'Enable OpenAI Moderations (disables Qwen3Guard)'} />
                  <div className={styles.grid}>
                    <Input label="Base URL" placeholder="https://api.openai.com" value={config.moderations['base-url']} onChange={(event) => patchModerations({ 'base-url': event.target.value })} />
                    <Input label={zh ? '模型' : 'Model'} placeholder="omni-moderation-latest" value={config.moderations.model} onChange={(event) => patchModerations({ model: event.target.value })} />
                    <Input revealable label={`API Key${config['has-moderations-api-key'] ? (zh ? '（已配置，留空保持）' : ' (configured; leave blank to keep)') : ''}`} value={moderationsAPIKey} onChange={(event) => setModerationsAPIKey(event.target.value)} />
                    <Input type="number" min={100} max={120000} label={zh ? '超时（毫秒）' : 'Timeout (ms)'} value={config.moderations['timeout-ms']} onChange={(event) => patchModerations({ 'timeout-ms': Number(event.target.value) })} />
                    <Input type="number" min={128} max={200000} label={zh ? '单分块上限（字符）' : 'Per-chunk input limit'} value={config.moderations['input-limit']} onChange={(event) => patchModerations({ 'input-limit': Number(event.target.value) })} />
                    <Input type="number" min={1} max={64} label={zh ? '最大并发' : 'Max concurrency'} value={config.moderations['max-concurrency']} onChange={(event) => patchModerations({ 'max-concurrency': Number(event.target.value) })} />
                    <Input type="number" min={1} max={10000} label={zh ? '最大等待请求数' : 'Max waiting requests'} value={config.moderations['max-waiting']} onChange={(event) => patchModerations({ 'max-waiting': Number(event.target.value) })} />
                    <Input type="number" min={0} step={0.01} label={zh ? '输入单价（每百万 Token，0 表示不计费）' : 'Input price per 1M tokens (0 disables cost)'} value={config.moderations['usage-price-per-million-input-tokens']} onChange={(event) => patchModerations({ 'usage-price-per-million-input-tokens': Number(event.target.value) })} />
                  </div>
                  <div className={styles.thresholds}>
                    {moderationCategoryEntries.map(([id, category]) => (
                      <div className={styles.thresholdRow} key={id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={config.moderations.categories.includes(id)}
                            onChange={(event) => patchModerations({ categories: event.target.checked ? [...config.moderations.categories, id] : config.moderations.categories.filter((value) => value !== id) })}
                          />{' '}
                          {zh ? category.label_zh : category.label}
                        </label>
                        <Input
                          type="number"
                          min={0}
                          max={1}
                          step={0.01}
                          aria-label={`${id} threshold`}
                          value={config.moderations.thresholds[id] ?? 0}
                          onChange={(event) => patchThreshold(id, Number(event.target.value))}
                        />
                      </div>
                    ))}
                  </div>
                  <div className={styles.modeHint}>{zh ? '分数达到或超过阈值且该分类已勾选时阻断；越阈但未勾选只标记，未越阈但上游 flagged 记为争议。上游超时、5xx 或非法响应在同步模式下 fail-closed。' : 'A score at or above its threshold blocks when the category is selected; exceeding an unselected category only flags, and an upstream flagged result below every threshold is recorded as controversial. Timeouts, 5xx responses and malformed payloads fail closed in blocking mode.'}</div>
                </>
              )}
              <div><Button variant="secondary" loading={probing} disabled={!engineTabActive} onClick={() => void handleProbe()}>{zh ? `探测 ${engineTabLabel}` : `Probe ${engineTabLabel}`}</Button></div>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'events' && (
        <Card title={zh ? 'SQLite 审计事件' : 'SQLite audit events'} extra={<div className={styles.actions}><Button size="sm" variant="secondary" onClick={() => void refreshEvents()}>{zh ? '刷新' : 'Refresh'}</Button><Button size="sm" variant="danger" onClick={handleClearEvents}>{zh ? '清空' : 'Clear'}</Button></div>}>
          <div className={styles.cardBody}>
            {databasePath && <div className={styles.databasePath}>{databasePath}</div>}
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>{zh ? '时间' : 'Time'}</th><th>{zh ? '决策' : 'Decision'}</th><th>{zh ? '来源' : 'Source'}</th><th>{zh ? '协议 / 模型' : 'Protocol / Model'}</th><th>{zh ? '命中' : 'Matches'}</th><th>{zh ? '最高分类 / 分数' : 'Top category / score'}</th><th>{zh ? '内容预览' : 'Content preview'}</th><th>{zh ? '耗时' : 'Latency'}</th></tr></thead>
                <tbody>
                  {events.map((event) => <tr key={event.id}><td>{new Date(event.created_at).toLocaleString()}</td><td><span className={`${styles.badge} ${styles[event.decision] ?? ''}`}>{event.decision}</span></td><td>{event.source}</td><td>{event.protocol}<br /><span className={styles.muted}>{event.model || '-'}</span></td><td>{[...event.matched_rules, ...event.matched_scanners].join(', ') || '-'}</td><td>{event.highest_category ? <>{event.highest_category}<br /><span className={styles.muted}>{event.highest_score.toFixed(3)}</span></> : '-'}</td><td className={styles.preview}>{event.prompt_preview}</td><td>{event.latency_ms} ms{event.chunk_total > 0 ? <><br /><span className={styles.muted}>{event.chunk_total} {zh ? '分块' : 'chunks'}</span></> : null}</td></tr>)}
                  {events.length === 0 && <tr><td colSpan={8} className={styles.empty}>{zh ? '暂无审计事件' : 'No audit events'}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}

      {activeTab === 'usage' && (
        <div className={styles.stack}>
          <Card
            title={zh ? '审计用量概览' : 'Audit usage overview'}
            extra={
              <div className={styles.actions}>
                <SegmentedTabs
                  items={[
                    { id: 'day', label: zh ? '按天' : 'By day' },
                    { id: 'engine', label: zh ? '按引擎' : 'By engine' },
                    { id: 'model', label: zh ? '按模型' : 'By model' },
                  ]}
                  activeTab={usageGroupBy}
                  ariaLabel={zh ? '用量分组' : 'Usage grouping'}
                  onChange={(value) => setUsageGroupBy(value)}
                />
                <Button size="sm" variant="secondary" onClick={() => void loadUsage(usageGroupBy)}>{zh ? '刷新' : 'Refresh'}</Button>
              </div>
            }
          >
            <div className={styles.cardBody}>
              <div className={styles.modeHint}>{zh ? '审计模型的调用独立计量，不写入正常大模型调用的用量、费用与仪表盘统计。Token 为 cl100k_base 本地估算。' : 'Audit model calls are measured separately and never enter proxy call records, cost aggregates or dashboards. Tokens are a local cl100k_base estimate.'}</div>
              {usageLoading && !usage ? (
                <LoadingSpinner />
              ) : !usage || usage.total.calls === 0 ? (
                <EmptyState
                  title={zh ? '暂无审计调用记录' : 'No audit model calls yet'}
                  description={zh ? '启用审计模型并产生请求后，这里会显示独立的调用与 Token 统计。' : 'Enable an audit model and send a request to populate independent call and token statistics.'}
                />
              ) : (
                <>
                  <div className={styles.metrics}>
                    <div className={styles.metric}><span>{zh ? '总调用' : 'Total calls'}</span><strong>{usage.total.calls}</strong></div>
                    <div className={styles.metric}><span>{zh ? '成功率' : 'Success rate'}</span><strong>{formatAuditSuccessRate(usage.total)}</strong></div>
                    <div className={styles.metric}><span>{zh ? '输入 Token' : 'Input tokens'}</span><strong>{usage.total.input_tokens}</strong></div>
                    <div className={styles.metric}><span>{zh ? '平均 / P95 延迟' : 'Avg / P95 latency'}</span><strong>{usage.total.avg_latency_ms} / {usage.total.p95_latency_ms} ms</strong></div>
                    {showCost && <div className={styles.metric}><span>{zh ? '估算费用' : 'Estimated cost'}</span><strong>${usage.total.estimated_cost.toFixed(4)}</strong></div>}
                  </div>
                  {usageGroupBy === 'day' && trendOption && (
                    <EChartsView option={trendOption} style={{ height: 260 }} ariaLabel={zh ? '审计用量趋势' : 'Audit usage trend'} />
                  )}
                  <div className={styles.tableWrap}>
                    <table>
                      <thead>
                        <tr>
                          <th>{usageGroupBy === 'day' ? (zh ? '日期' : 'Date') : usageGroupBy === 'engine' ? (zh ? '引擎' : 'Engine') : (zh ? '模型' : 'Model')}</th>
                          <th>{zh ? '调用' : 'Calls'}</th>
                          <th>{zh ? '成功率' : 'Success rate'}</th>
                          <th>{zh ? '输入 Token' : 'Input tokens'}</th>
                          <th>{zh ? '平均 / P95 延迟' : 'Avg / P95 latency'}</th>
                          {showCost && <th>{zh ? '估算费用' : 'Estimated cost'}</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {usage.buckets.map((bucket) => (
                          <tr key={bucket.key}>
                            <td>{bucket.key}</td>
                            <td>{bucket.calls}</td>
                            <td>{formatAuditSuccessRate(bucket)}</td>
                            <td>{bucket.input_tokens}</td>
                            <td>{bucket.avg_latency_ms} / {bucket.p95_latency_ms} ms</td>
                            {showCost && <td>${bucket.estimated_cost.toFixed(4)}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {usage.database_path && <div className={styles.databasePath}>{usage.database_path}</div>}
                </>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
