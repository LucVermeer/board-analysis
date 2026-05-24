import { type ReactNode, useState, useEffect } from 'react';
import { I18nextProvider } from 'react-i18next';
import i18n from '../lib/i18n/config';

type I18nProviderProps = {
  children: ReactNode;
};

export function I18nProvider({ children }: I18nProviderProps) {
  const [isReady, setIsReady] = useState(i18n.isInitialized);

  useEffect(() => {
    if (i18n.isInitialized) {
      return;
    }

    const handleInitialized = () => setIsReady(true);
    i18n.on('initialized', handleInitialized);

    return () => {
      i18n.off('initialized', handleInitialized);
    };
  }, []);

  if (!isReady) {
    return null;
  }

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
