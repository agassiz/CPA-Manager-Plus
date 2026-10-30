import type { AxiosAdapter } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './client';

const okAdapter = (): AxiosAdapter =>
  vi.fn(async (config) => ({ data: {}, status: 200, statusText: 'OK', headers: {}, config }));

afterEach(() => {
  apiClient.setConfig({ apiBase: '', managementKey: '' });
  vi.unstubAllGlobals();
});

describe('apiClient without management key', () => {
  it('does not send axios requests', async () => {
    apiClient.setConfig({ apiBase: 'http://127.0.0.1:8317', managementKey: '' });
    const adapter = okAdapter();

    await expect(apiClient.get('/config', { adapter })).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    expect(adapter).not.toHaveBeenCalled();
  });

  it('does not send fetchRaw requests', async () => {
    apiClient.setConfig({ apiBase: 'http://127.0.0.1:8317', managementKey: '' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.fetchRaw('/plugins')).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still sends requests that carry an explicit Authorization header', async () => {
    apiClient.setConfig({ apiBase: 'http://127.0.0.1:8317', managementKey: '' });
    const adapter = okAdapter();

    await apiClient.post('/session', undefined, { adapter, headers: { Authorization: 'Bearer secret' } });
    expect(adapter).toHaveBeenCalledTimes(1);
  });

  it('sends requests with the configured key', async () => {
    apiClient.setConfig({ apiBase: 'http://127.0.0.1:8317', managementKey: 'secret' });
    const adapter = okAdapter();

    await apiClient.get('/config', { adapter });
    expect(adapter).toHaveBeenCalledTimes(1);
  });
});
