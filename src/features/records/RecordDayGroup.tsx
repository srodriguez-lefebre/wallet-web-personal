import { format, parseISO } from "date-fns";

import { RecordRow, type RecordRowModel } from "./RecordRow";

import type { WalletRecord } from "@shared/types";
import type { RecordIndexes } from "./record-indexes";

export function RecordDayGroup({
  day,
  records,
  model,
  indexes,
}: {
  day: string;
  records: WalletRecord[];
  model: RecordRowModel;
  indexes: RecordIndexes;
}) {
  return (
    <div key={day}>
      <div className="mb-2 flex items-center justify-between text-sm">
        <p className="font-semibold">{format(parseISO(day), "dd/MM/yyyy")}</p>
        <p className="text-muted-foreground">{records.length} records</p>
      </div>
      <div className="space-y-2">
        {records.map((record) => (
          <RecordRow key={record.id} record={record} model={model} indexes={indexes} />
        ))}
      </div>
    </div>
  );
}
