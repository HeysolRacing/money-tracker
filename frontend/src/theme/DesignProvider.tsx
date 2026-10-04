import { MantineProvider } from '@mantine/core';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { backgroundResolver, findDesign, type Design } from './designs';

const STORAGE_KEY = 'mt-design';

interface DesignContextValue {
  design: Design;
  setDesign: (id: string) => void;
}

const DesignContext = createContext<DesignContextValue | null>(null);

function readStoredId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Provides Mantine with the selected design and remembers the choice in this browser. */
export function DesignProvider({ children }: { children: ReactNode }) {
  const [design, setDesignState] = useState(() => findDesign(readStoredId()));

  const value = useMemo<DesignContextValue>(
    () => ({
      design,
      setDesign: (id) => {
        setDesignState(findDesign(id));
        try {
          localStorage.setItem(STORAGE_KEY, id);
        } catch {
          // Storage may be unavailable (private mode); the choice just won't persist.
        }
      },
    }),
    [design],
  );

  const resolver = useMemo(() => backgroundResolver(design), [design]);

  return (
    <DesignContext.Provider value={value}>
      <MantineProvider
        theme={design.theme}
        defaultColorScheme="auto"
        forceColorScheme={design.colorScheme === 'auto' ? undefined : design.colorScheme}
        cssVariablesResolver={resolver}
      >
        {children}
      </MantineProvider>
    </DesignContext.Provider>
  );
}

export function useDesign(): DesignContextValue {
  const ctx = useContext(DesignContext);
  if (!ctx) throw new Error('useDesign must be used inside DesignProvider');
  return ctx;
}
