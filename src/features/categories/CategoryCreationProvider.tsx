import { useState, type PropsWithChildren } from "react";
import { categorySchema } from "@shared/schemas";

import { CategoryCreationContext } from "./category-creation-context";
import { CategoryFormDialog } from "./CategoryFormDialog";

import type { MovementCategoryKind } from "@shared/categories";

import { useWalletReferenceQuery } from "@/hooks/wallet-entities";
import { useWalletData } from "@/providers/wallet-query-provider";

export function CategoryCreationProvider({ children }: PropsWithChildren) {
  const { mutations } = useWalletData();
  const reference = useWalletReferenceQuery();
  const [request, setRequest] = useState<{
    name: string;
    onCreated: (id: string) => void;
    returnFocus: () => void;
    kind?: MovementCategoryKind;
  }>();
  return (
    <CategoryCreationContext.Provider
      value={(name, onCreated, returnFocus, kind) =>
        setRequest({ name, onCreated, returnFocus, kind })
      }
    >
      {children}
      {request && (
        <CategoryFormDialog
          categories={reference.data?.categories ?? []}
          initialName={request.name}
          initialKind={request.kind}
          onCreated={request.onCreated}
          returnFocus={request.returnFocus}
          onClose={() => setRequest(undefined)}
          onSave={async (draft) =>
            (await mutations["categories.create"]({ body: categorySchema.parse(draft) })).id
          }
        />
      )}
    </CategoryCreationContext.Provider>
  );
}
