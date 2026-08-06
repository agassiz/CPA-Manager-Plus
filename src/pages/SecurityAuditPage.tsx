import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  securityAuditApi,
  type SecurityAuditConfig,
  type SecurityAuditEvent,
  type SecurityAuditRule,
} from '@/services/api/securityAudit';
import { useNotificationStore } from '@/stores';
import styles from './SecurityAuditPage.module.scss';

const emptyRule = (): SecurityAuditRule => ({ name: '', pattern: '', enabled: true });

export function SecurityAuditPage() {
  const { i18n } = useTranslation();
  const zh = i18n.language.toLowerCase().startsWith('zh');
  const { showNotification, showConfirmation } = useNotificationStore();
  const [config, setConfig] = useState<SecurityAuditConfig | null>(null);
  const [events, setEvents] = useState<SecurityAuditEvent[]>([]);
  const [databasePath, setDatabasePath] = useState('');
  const [activeTab, setActiveTab] = useState<'config' | 'events'>('config');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [probing, setProbing] = useState(false);
  const [apiKey, setAPIKey] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextConfig, eventResponse] = await Promise.all([
        securityAuditApi.getConfig(),
        securityAuditApi.getEvents(),
      ]);
      setConfig(nextConfig);
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

  const scannerEntries = useMemo(
    () => Object.entries(config?.['scanner-catalog'] ?? {}),
    [config]
  );

  const patch = (value: Partial<SecurityAuditConfig>) =>
    setConfig((current) => (current ? { ...current, ...value } : current));
  const patchGuard = (value: Partial<SecurityAuditConfig['guard']>) =>
    setConfig((current) =>
      current ? { ...current, guard: { ...current.guard, ...value } } : current
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
      };
      const saved = await securityAuditApi.updateConfig(payload);
      setConfig(saved);
      setAPIKey('');
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
      const result = await securityAuditApi.probe({
        ...config.guard,
        'api-key': apiKey.trim(),
      });
      showNotification(
        zh ? `Guard 节点正常，耗时 ${result['latency-ms']} ms` : `Guard is healthy (${result['latency-ms']} ms)`,
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
      message: zh ? '将删除 SQLite 中全部安全审计事件，此操作不可撤销。' : 'All security audit events will be deleted from SQLite.',
      confirmText: zh ? '清空' : 'Clear',
      variant: 'danger',
      onConfirm: async () => {
        await securityAuditApi.clearEvents();
        setEvents([]);
        showNotification(zh ? '审计事件已清空' : 'Audit events cleared', 'success');
      },
    });
  };

  if (loading || !config) return <LoadingSpinner />;

  const modeHint = zh
    ? `${config['blocking-enabled'] ? '同步阻断：命中时在上游请求前拦截，Guard 异常时 fail-closed。' : '异步观察：审计不会阻断请求。'}${config['blocking-latest-turn-only'] ? '仅当尾部最近 2 条会话记录包含用户输入时，检查该输入及其前一条模型回复；纯 assistant/tool 工具续跑直接跳过。' : '检查 system/developer 与最近 10 条历史，未变化内容复用 Hash 缓存。'}`
    : `${config['blocking-enabled'] ? 'Blocking: matches are rejected before upstream dispatch and Guard failures fail closed. ' : 'Observe: auditing never blocks the request. '}${config['blocking-latest-turn-only'] ? 'Only user input found in the final two conversation records and its preceding model reply are inspected; assistant/tool-only continuations are skipped.' : 'System/developer content and the latest 10 history records are inspected, with unchanged content reusing the hash cache.'}`;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>{zh ? '安全审计' : 'Security Audit'}</h1>
          <p>{zh ? '扫描请求中的用户可控内容：正则快速检测 + Qwen3Guard 语义审计；阻断发生在请求发往上游之前。' : 'Scan user-controlled request content with fast regex checks and Qwen3Guard before upstream forwarding.'}</p>
        </div>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => void load()}>{zh ? '刷新' : 'Refresh'}</Button>
          {activeTab === 'config' && <Button loading={saving} onClick={() => void handleSave()}>{zh ? '保存配置' : 'Save'}</Button>}
        </div>
      </div>

      <div className={styles.tabs}>
        <button className={activeTab === 'config' ? styles.active : ''} onClick={() => setActiveTab('config')}>{zh ? '策略配置' : 'Policy'}</button>
        <button className={activeTab === 'events' ? styles.active : ''} onClick={() => { setActiveTab('events'); void refreshEvents(); }}>{zh ? `审计事件 (${events.length})` : `Events (${events.length})`}</button>
      </div>

      {activeTab === 'config' ? (
        <div className={styles.stack}>
          <Card title={zh ? '运行模式' : 'Runtime mode'}>
            <div className={styles.cardBody}>
              <ToggleSwitch checked={config.enabled} onChange={(enabled) => patch({ enabled })} label={zh ? '启用安全审计总开关' : 'Enable security audit'} />
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

          <Card title="Qwen3Guard">
            <div className={styles.cardBody}>
              <ToggleSwitch checked={config.guard.enabled} onChange={(enabled) => patchGuard({ enabled })} disabled={!config.enabled} label={zh ? '启用 Qwen3Guard 语义审计' : 'Enable Qwen3Guard'} />
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
              <div><Button variant="secondary" loading={probing} onClick={() => void handleProbe()}>{zh ? '探测 Guard 节点' : 'Probe Guard'}</Button></div>
            </div>
          </Card>
        </div>
      ) : (
        <Card title={zh ? 'SQLite 审计事件' : 'SQLite audit events'} extra={<div className={styles.actions}><Button size="sm" variant="secondary" onClick={() => void refreshEvents()}>{zh ? '刷新' : 'Refresh'}</Button><Button size="sm" variant="danger" onClick={handleClearEvents}>{zh ? '清空' : 'Clear'}</Button></div>}>
          <div className={styles.cardBody}>
            {databasePath && <div className={styles.databasePath}>{databasePath}</div>}
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>{zh ? '时间' : 'Time'}</th><th>{zh ? '决策' : 'Decision'}</th><th>{zh ? '来源' : 'Source'}</th><th>{zh ? '协议 / 模型' : 'Protocol / Model'}</th><th>{zh ? '命中' : 'Matches'}</th><th>{zh ? '内容预览' : 'Content preview'}</th><th>{zh ? '耗时' : 'Latency'}</th></tr></thead>
                <tbody>
                  {events.map((event) => <tr key={event.id}><td>{new Date(event.created_at).toLocaleString()}</td><td><span className={`${styles.badge} ${styles[event.decision] ?? ''}`}>{event.decision}</span></td><td>{event.source}</td><td>{event.protocol}<br /><span className={styles.muted}>{event.model || '-'}</span></td><td>{[...event.matched_rules, ...event.matched_scanners].join(', ') || '-'}</td><td className={styles.preview}>{event.prompt_preview}</td><td>{event.latency_ms} ms{event.chunk_total > 0 ? <><br /><span className={styles.muted}>{event.chunk_total} {zh ? '分块' : 'chunks'}</span></> : null}</td></tr>)}
                  {events.length === 0 && <tr><td colSpan={7} className={styles.empty}>{zh ? '暂无审计事件' : 'No audit events'}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
