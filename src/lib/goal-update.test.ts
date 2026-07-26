import { describe, expect, it } from "vitest";
import { goalPatchSchema } from "@shared/schemas";
import { buildGoalUpdatePayload } from "./goal-update";

describe("buildGoalUpdatePayload", () => {
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
