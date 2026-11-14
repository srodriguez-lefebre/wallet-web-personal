import { expect, test } from "vitest";

// Included only by the subprocess regression, never by the normal suite.
test("intentional failure proves the CLI exit status", () => {
  expect("failure").toBe("success");
});
