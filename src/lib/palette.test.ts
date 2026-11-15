import { expect, test } from "vitest";

import { readableForeground } from "./palette";

test.each([
  ["#00ff00", "#000000"],
  ["#ffff00", "#000000"],
  ["#75D4FA", "#000000"],
  ["#ffffff", "#000000"],
  ["#000000", "#FFFFFF"],
  ["#2563EB", "#FFFFFF"],
])("%s uses a foreground with sufficient contrast", (color, expected) => {
  expect(readableForeground(color)).toBe(expected);
});
