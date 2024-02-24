import { strictEqual } from "assert";
import { describe, test } from "mocha";

describe("test", function () {
  test("should return true", async function () {
    strictEqual("hello", "hello");
  });
});
