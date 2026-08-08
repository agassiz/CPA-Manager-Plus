import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AuthFileCard } from './AuthFileCard';
import type { AuthFileItem } from '@/types';

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const labels: Record<string, string> = {
        'auth_files.cooldown_active': '冷却中',
        'auth_files.super_category_display': '超级',
        'auth_files.super_category_badge_title': '此 Codex 认证文件已开启超级分类',
        'auth_files.type_codex': 'Codex',
        'auth_files.filter_kiro': 'Kiro',
        'auth_files.health_status_warning': '异常',
        'auth_files.health_status_label': '健康状态',
        'auth_files.file_size': '大小',
        'auth_files.file_modified': '修改时间',
        'auth_files.status_toggle_label': '启用',
        'auth_files.quota_refresh_single': '刷新额度',
        'codex_quota.plan_label': '套餐',
        'codex_quota.plan_pro': 'Pro 20x',
        'codex_quota.plan_prolite': 'Pro 5x',
        'codex_quota.plan_plus': 'Plus',
        'codex_quota.plan_team': 'Team',
        'codex_quota.plan_free': 'Free',
        'kiro_quota.subscription_label': '订阅类型',
        'kiro_quota.idle': '点击此处刷新额度',
        'antigravity_quota.credit_label': '积分',
        'auth_files.models_button': '模型',
        'auth_files.download_button': '下载',
        'auth_files.prefix_proxy_button': '认证文件详情 / 编辑',
        'auth_files.delete_button': '删除',
        'stats.success': '成功',
        'stats.failure': '失败',
      };
      if (key === 'auth_files.cooldown_until') return `冷却至 ${options?.time ?? ''}`;
      if (key === 'antigravity_quota.credit_amount') return `${options?.count ?? ''} 积分`;
      return labels[key] ?? key;
    },
  }),
}));

const renderCard = (file: AuthFileItem, hideErrors = false, compact = true) =>
  renderToStaticMarkup(
    <AuthFileCard
      file={file}
      compact={compact}
      hideErrors={hideErrors}
      selected={false}
      resolvedTheme="light"
      disableControls={false}
      deleting={null}
      statusUpdating={{}}
      statusBarCache={new Map()}
      onShowModels={vi.fn()}
      onDownload={vi.fn()}
      onOpenPrefixProxyEditor={vi.fn()}
      onDelete={vi.fn()}
      onToggleStatus={vi.fn()}
      onToggleSelect={vi.fn()}
    />
  );

describe('AuthFileCard', () => {
  it('显示非 Antigravity 凭证的冷却中状态', () => {
    const html = renderCard({
      name: 'codex-cooling.json',
      type: 'codex',
      cooldown_active: true,
      cooldown_until: Date.now() + 60_000,
    });

    expect(html).toContain('冷却中');
  });

  it('根据 hideErrors 隐藏或显示错误详情', () => {
    const file: AuthFileItem = {
      name: 'codex-error.json',
      type: 'codex',
      statusMessage: 'upstream failed',
    };

    expect(renderCard(file, true)).not.toContain('upstream failed');
    expect(renderCard(file, false)).toContain('upstream failed');
  });

  it('批量选择期间隐藏单项删除按钮', () => {
    const html = renderToStaticMarkup(
      <AuthFileCard
        file={{ name: 'codex-selected.json', type: 'codex' }}
        compact
        selected
        resolvedTheme="light"
        disableControls={false}
        deleting={null}
        statusUpdating={{}}
        statusBarCache={new Map()}
        onShowModels={vi.fn()}
        onDownload={vi.fn()}
        onOpenPrefixProxyEditor={vi.fn()}
        onDelete={vi.fn()}
        showDeleteAction={false}
        onToggleStatus={vi.fn()}
        onToggleSelect={vi.fn()}
      />
    );

    expect(html).not.toContain('title="删除"');
  });

  it('显示接口 error 字段中的运行时错误，并受 hideErrors 控制', () => {
    const file: AuthFileItem = {
      name: 'codex-runtime-error.json',
      type: 'codex',
      statusMessage: 'ok',
      error: 'quota exceeded',
    };

    expect(renderCard(file, true)).not.toContain('quota exceeded');
    expect(renderCard(file, false)).toContain('quota exceeded');
  });

  it('未刷新额度时也显示认证文件里的 Codex 套餐类型', () => {
    const html = renderCard({
      name: 'codex-plus.json',
      type: 'codex',
      plan_type: 'plus',
    });

    expect(html).toContain('套餐');
    expect(html).toContain('Plus');
  });

  it('未刷新额度时也能从 Codex 文件名后缀显示套餐类型', () => {
    const html = renderCard({
      name: 'codex-user@example.com-pro.json',
      type: 'codex',
    });

    expect(html).toContain('套餐');
    expect(html).toContain('Pro 20x');
  });

  it('未刷新额度时也显示 Kiro 认证文件里的订阅类型', () => {
    const html = renderCard(
      {
        name: 'kiro-user.json',
        type: 'kiro',
        subscription_title: 'KIRO PRO',
      },
      false,
      false
    );

    expect(html).toContain('订阅类型');
    expect(html).toContain('KIRO PRO');
  });

  it('在 Kiro 卡片标题区显示订阅短标签', () => {
    const html = renderCard({
      name: 'kiro-user.json',
      type: 'kiro',
      subscription_title: 'KIRO PRO',
    });

    expect(html).toContain('PRO');
  });

  it('在 Kiro 卡片标题区显示账号类型和 ARN 标签', () => {
    const html = renderCard({
      name: 'kiro-social-user.json',
      type: 'kiro',
      kiro_account_type_label: 'Social',
      kiro_profile_badge_label: 'ARN',
    });

    expect(html).toContain('Social');
    expect(html).toContain('ARN');
  });

  it('只在配额区域显示 Antigravity 认证文件里的积分余额', () => {
    const html = renderCard(
      {
        name: 'antigravity-user.json',
        type: 'antigravity',
        credit_balance: 12.5,
      },
      false,
      false
    );

    expect(html).toContain('积分');
    expect(html).toContain('12.5 积分');
    expect(html.match(/12\.5 积分/g)).toHaveLength(1);
  });
});
