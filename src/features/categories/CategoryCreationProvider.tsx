import { useState, type PropsWithChildren } from "react";
import { categorySchema } from "@shared/schemas";

import { CategoryCreationContext } from "./category-creation-context";
import { CategoryFormDialog } from "./CategoryFormDialog";

import { useWalletReferenceQuery } from "@/hooks/wallet-entities";
import { useWalletData } from "@/providers/wallet-query-provider";

export function CategoryCreationProvider({ children }: PropsWithChildren) {
  const { mutations } = useWalletData();
  const reference = useWalletReferenceQuery();
  const [request, setRequest] = useState<{
    name: string;
    onCreated: (id: string) => void;
    returnFocus: () => void;
  }>();
  return (
    <CategoryCreationContext.Provider
      value={(name, onCreated, returnFocus) => setRequest({ name, onCreated, returnFocus })}
    >
      {children}
      {request && (
        <CategoryFormDialog
          categories={reference.data?.categories ?? []}
          initialName={request.name}
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
