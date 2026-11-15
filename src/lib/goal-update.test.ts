import { describe, expect, it } from "vitest";
import { goalPatchSchema } from "@shared/schemas";
import { mockWalletData } from "@shared/mock-data";

import { buildGoalUpdatePayload } from "./goal-update";
import { historicalGoalPatches } from "./historical-goals";

describe("buildGoalUpdatePayload", () => {
  it("combines historical associations into one guarded patch per record without dropping earlier goals", () => {
    const record = {
      ...mockWalletData.records[0]!,
      goalIds: ["existing"],
      goalAssociations: [
        {
          goalId: "existing",
          assignmentSource: "manual" as const,
          useReserved: true,
          reserveIncome: true,
        },
      ],
      updatedAt: "2026-11-14T12:00:00.000Z",
    };
    const patches = historicalGoalPatches(
      [record],
      [
        { goalId: "first", recordIds: [record.id] },
        { goalId: "second", recordIds: [record.id] },
      ],
    );
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({
      id: record.id,
      patch: { goalIds: ["existing", "first", "second"], expectedUpdatedAt: record.updatedAt },
    });
    expect(patches[0]!.patch.goalAssociations).toEqual([
      record.goalAssociations[0],
      ...["first", "second"].map((goalId) => ({
        goalId,
        assignmentSource: "date_rule",
        useReserved: false,
        reserveIncome: true,
      })),
    ]);
  });
  it("builds a PATCH-compatible payload without goal tags", () => {
    const payload = buildGoalUpdatePayload(
      {
        name: "Ushuaia",
        targetAmount: "120000",
        currency: "UYU",
        color: "#75D4FA",
        isVisible: true,
        deadline: "",
        status: "active",
        accountId: "11111111-1111-4111-8111-111111111111",
        note: "",
        autoCaptureEnabled: true,
        autoCaptureStart: "2026-07-30",
        autoCaptureEnd: "2026-08-09",
        autoReservationAccountId: "22222222-2222-4222-8222-222222222222",
      },
      "flag",
    );

    expect(payload).toMatchObject({
      name: "Ushuaia",
      targetAmount: 120000,
      autoCaptureEnabled: true,
      autoCaptureStart: "2026-07-30",
      autoCaptureEnd: "2026-08-09",
      deadline: null,
      note: null,
    });
    expect(payload).not.toHaveProperty("tagIds");
    expect(goalPatchSchema.safeParse(payload).success).toBe(true);
  });
});
