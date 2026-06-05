import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const PageTitleContext = createContext<{
  label: string | null;
  setLabel: (label: string | null) => void;
}>({ label: null, setLabel: () => {} });

/** Declare the current page's tab-title suffix. Cleared on unmount. */
export function usePageTitle(label: string | null): void {
  const { setLabel } = useContext(PageTitleContext);
  useEffect(() => {
    setLabel(label);
    return () => setLabel(null);
  }, [label, setLabel]);
}

/** Read the current page label (used to compose document.title). */
export function usePageLabel(): string | null {
  return useContext(PageTitleContext).label;
}

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [label, setLabel] = useState<string | null>(null);
  return <PageTitleContext.Provider value={{ label, setLabel }}>{children}</PageTitleContext.Provider>;
}
