import { assert } from "chai";
import {
  DEFAULT_MAX_TOKEN_THRESHOLD,
  exceedsTokenLimit,
  normalizeMaxTokenThreshold,
} from "../src/utils/tokenEstimator.ts";

describe("tokenEstimator", function () {
  describe("normalizeMaxTokenThreshold", function () {
    it("falls back to the default for invalid thresholds", function () {
      const invalidThresholds = [
        "",
        "not-a-number",
        Number.NaN,
        Number.POSITIVE_INFINITY,
        0,
        -1,
        Number.MAX_SAFE_INTEGER + 1,
      ];

      for (const threshold of invalidThresholds) {
        assert.strictEqual(
          normalizeMaxTokenThreshold(threshold),
          DEFAULT_MAX_TOKEN_THRESHOLD,
        );
      }
    });

    it("keeps a positive safe integer threshold", function () {
      assert.strictEqual(normalizeMaxTokenThreshold(42), 42);
      assert.strictEqual(normalizeMaxTokenThreshold("42"), 42);
    });
  });

  describe("exceedsTokenLimit", function () {
    it("uses the default threshold when the configured value is invalid", function () {
      const overDefaultLimit = "a".repeat(DEFAULT_MAX_TOKEN_THRESHOLD * 4 + 1);

      assert.isTrue(exceedsTokenLimit(overDefaultLimit, Number.NaN));
    });
  });
});
