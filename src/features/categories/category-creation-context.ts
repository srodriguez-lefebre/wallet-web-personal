import { createContext } from "react";

import type { MovementCategoryKind } from "@shared/categories";

export const CategoryCreationContext = createContext<
  | ((
      name: string,
      onCreated: (id: string) => void,
      returnFocus: () => void,
      kind?: MovementCategoryKind,
    ) => void)
  | undefined
>(undefined);
