import { createContext, type ReactNode } from 'react';

export type ModalFooterRegistration = (footer: ReactNode | null) => void;

export const ModalFooterContext = createContext<ModalFooterRegistration | null>(null);
