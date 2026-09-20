/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, type Dispatch, type ReactNode } from 'react';

export type ConfigSidebarNavigationItem = {
  id: string;
  title: string;
  description: string;
  /** Group heading rendered before the first item of each consecutive group. */
  group?: string;
  icon: ReactNode;
  errorCount?: number;
  onSelect: () => void;
};

export type ConfigSidebarNavigationState = {
  activeId: string;
  items: ConfigSidebarNavigationItem[];
} | null;

const ConfigSidebarNavigationContext = createContext<Dispatch<ConfigSidebarNavigationState> | null>(
  null
);

export const ConfigSidebarNavigationProvider = ConfigSidebarNavigationContext.Provider;

export function useRegisterConfigSidebarNavigation(state: ConfigSidebarNavigationState): boolean {
  const setConfigSidebarNavigation = useContext(ConfigSidebarNavigationContext);

  useEffect(() => {
    if (!setConfigSidebarNavigation) return undefined;
    setConfigSidebarNavigation(state);
  }, [setConfigSidebarNavigation, state]);

  useEffect(() => {
    if (!setConfigSidebarNavigation) return undefined;
    return () => setConfigSidebarNavigation(null);
  }, [setConfigSidebarNavigation]);

  return Boolean(setConfigSidebarNavigation);
}
