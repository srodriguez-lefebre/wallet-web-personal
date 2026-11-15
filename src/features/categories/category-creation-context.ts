import { createContext } from "react";

export const CategoryCreationContext = createContext<
  ((name: string, onCreated: (id: string) => void, returnFocus: () => void) => void) | undefined
>(undefined);
