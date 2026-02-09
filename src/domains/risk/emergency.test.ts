import { describe, expect, it, vi } from "vitest";

import { checkEmergencyConditions, enterReduceOnlyMode, triggerKillSwitch } from "./emergency";
import type { RiskAssessment, RiskMetrics } from "./types";

/** Create default metrics for testing. */
const createMetrics = (): RiskMetrics => ({
  notionalQuote: 0n,
  leverageBps: 0n,
  marginUtilizationBps: 0n,
  liquidationDistanceBps: 10000n,
  dailyPnlQuote: 0n,
  drawdownBps: 0n,
});

describe("checkEmergencyConditions", () => {
  it("should return KILL_SWITCH for BLOCKED level", () => {
    const assessment: RiskAssessment = {
      level: "BLOCKED",
      action: "BLOCK",
      reasons: ["Position size exceeds maximum"],
      metrics: createMetrics(),
    };

    expect(checkEmergencyConditions(assessment)).toBe("KILL_SWITCH");
  });

  it("should return KILL_SWITCH for DANGER level", () => {
    const assessment: RiskAssessment = {
      level: "DANGER",
      action: "EXIT",
      reasons: ["Daily loss exceeds maximum"],
      metrics: createMetrics(),
    };

    expect(checkEmergencyConditions(assessment)).toBe("KILL_SWITCH");
  });

  it("should return KILL_SWITCH for BLOCK action", () => {
    const assessment: RiskAssessment = {
      level: "BLOCKED",
      action: "BLOCK",
      reasons: ["Leverage exceeds maximum"],
      metrics: createMetrics(),
    };

    expect(checkEmergencyConditions(assessment)).toBe("KILL_SWITCH");
  });

  it("should return KILL_SWITCH for EXIT action", () => {
    const assessment: RiskAssessment = {
      level: "DANGER",
      action: "EXIT",
      reasons: ["Drawdown exceeds maximum"],
      metrics: createMetrics(),
    };

    expect(checkEmergencyConditions(assessment)).toBe("KILL_SWITCH");
  });

  it("should return REDUCE_ONLY for PAUSE action", () => {
    const assessment: RiskAssessment = {
      level: "WARNING",
      action: "PAUSE",
      reasons: ["Margin utilization exceeds maximum"],
      metrics: createMetrics(),
    };

    expect(checkEmergencyConditions(assessment)).toBe("REDUCE_ONLY");
  });

  it("should return null for SAFE level", () => {
    const assessment: RiskAssessment = {
      level: "SAFE",
      action: "ALLOW",
      reasons: [],
      metrics: createMetrics(),
    };

    expect(checkEmergencyConditions(assessment)).toBeNull();
  });

  it("should return null for CAUTION level with ALLOW action", () => {
    const assessment: RiskAssessment = {
      level: "CAUTION",
      action: "ALLOW",
      reasons: ["Position size approaching limit"],
      metrics: createMetrics(),
    };

    expect(checkEmergencyConditions(assessment)).toBeNull();
  });
});

describe("triggerKillSwitch", () => {
  it("should call alert callback with KILL_SWITCH action", async () => {
    const onAlert = vi.fn().mockResolvedValue(undefined);
    const reason = "Daily loss exceeded maximum";

    const result = await triggerKillSwitch(reason, onAlert);

    expect(onAlert).toHaveBeenCalledOnce();
    expect(onAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "KILL_SWITCH",
        reason: "Daily loss exceeded maximum",
      }),
    );
    expect(result.type).toBe("KILL_SWITCH");
    expect(result.reason).toBe(reason);
    expect(result.timestamp).toBeInstanceOf(Date);
  });

  it("should propagate alert callback errors", async () => {
    const onAlert = vi.fn().mockRejectedValue(new Error("Alert failed"));

    await expect(triggerKillSwitch("test", onAlert)).rejects.toThrow("Alert failed");
  });
});

describe("enterReduceOnlyMode", () => {
  it("should call alert callback with REDUCE_ONLY action", async () => {
    const onAlert = vi.fn().mockResolvedValue(undefined);
    const reason = "Margin utilization too high";

    const result = await enterReduceOnlyMode(reason, onAlert);

    expect(onAlert).toHaveBeenCalledOnce();
    expect(onAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "REDUCE_ONLY",
        reason: "Margin utilization too high",
      }),
    );
    expect(result.type).toBe("REDUCE_ONLY");
    expect(result.reason).toBe(reason);
    expect(result.timestamp).toBeInstanceOf(Date);
  });

  it("should propagate alert callback errors", async () => {
    const onAlert = vi.fn().mockRejectedValue(new Error("Alert failed"));

    await expect(enterReduceOnlyMode("test", onAlert)).rejects.toThrow("Alert failed");
  });
});
