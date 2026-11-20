// Skin context: a level wrapper puts its skin here; views and shared helpers read it.
import { createContext, useContext, type ReactNode } from "react";
import { basicSkin } from "./basic";
import type { Skin } from "./types";

const SkinContext = createContext<Skin>(basicSkin);

export function SkinProvider({ skin, children }: { skin: Skin; children: ReactNode }) {
  const Frame = skin.Frame;
  return <SkinContext.Provider value={skin}>{Frame ? <Frame>{children}</Frame> : children}</SkinContext.Provider>;
}

export function useSkin(): Skin {
  return useContext(SkinContext);
}
