'use client';
import { createContext, useContext } from 'react';

export type SiteContact = {
  photoUrl: string;
  phones: string[];
  whatsapp: string;
  instagram: string;
  tiktok: string;
  facebook: string;
};

const SiteConfigContext = createContext<SiteContact | null>(null);

export function SiteConfigProvider({
  children,
  contact,
}: {
  children: React.ReactNode;
  contact: SiteContact;
}) {
  return (
    <SiteConfigContext.Provider value={contact}>
      {children}
    </SiteConfigContext.Provider>
  );
}

export function useSiteConfig(): SiteContact {
  const ctx = useContext(SiteConfigContext);
  if (!ctx) throw new Error('useSiteConfig must be used inside SiteConfigProvider');
  return ctx;
}
