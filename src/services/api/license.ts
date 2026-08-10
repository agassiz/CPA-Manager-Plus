import { apiClient } from './client';

export type LicenseStatusResponse = {
  super_category_allowed?: boolean;
  license?: {
    valid?: boolean;
  };
};

export const licenseApi = {
  getStatus: () => apiClient.get<LicenseStatusResponse>('/license'),
};
