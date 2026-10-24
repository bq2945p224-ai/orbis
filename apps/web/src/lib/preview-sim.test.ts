import { describe, expect, it } from "vitest";
import { defaultGuestState, encodeGuest, decodeGuest, jobById } from "./preview-guest";
import { advanceGuestSim, addInv, takeInv, fineForCrimeKind } from "./preview-sim";

describe("advanceGuestSim", () => {
  it("pays salary over sim time", () => {
    expect(jobById("job-settler")?.salaryCentsPerDay).toBe(2500);
    const state = defaultGuestState();
    state.jobId = "job-settler";
    state.jobStartedAt = state.createdAt;
    const start = Date.parse(state.createdAt);
    state.lastSimAt = new Date(start).toISOString();
    // 4 real hours ≈ 1 game day → full daily wage (Settler 25.00 ORB/day)
    advanceGuestSim(state, start + 4 * 60 * 60 * 1000);
    expect(state.simTimeMs).toBe(24 * 60 * 60 * 1000);
    expect(state.ledger.some((e) => e.reason.startsWith("Salary"))).toBe(true);
    // Hourly floor of daily wage: floor(2500/24)*24 = 2496
    expect(state.balanceCents).toBe(12_500 + 2496);
  });

  it("drains hunger and can kill without food", () => {
    const state = defaultGuestState();
    state.inventory = [];
    state.food = 0;
    state.water = 0;
    state.hunger = 5;
    state.thirst = 5;
    const start = Date.parse(state.createdAt);
    state.lastSimAt = new Date(start).toISOString();
    advanceGuestSim(state, start + 12 * 60 * 60 * 1000);
    expect(state.hp).toBeLessThan(100);
  });

  it("maps edible inventory", () => {
    const state = defaultGuestState();
    state.inventory = [];
    addInv(state, "bread", 2);
    expect(takeInv(state, "food", 1)).toBe(true);
    expect(fineForCrimeKind("theft")).toBe(15_000);
  });

  it("keeps cookie under browser 4KB after consequential play", () => {
    const state = defaultGuestState();
    state.jobId = "job-settler";
    state.balanceCents = 0;
    state.crimes.push({
      id: "c1",
      accusedName: "Guest Traveler",
      kind: "theft",
      districtName: "Harbor Ward",
      status: "adjudicated",
      createdAt: new Date().toISOString(),
    });
    state.courts.push({
      id: "ct1",
      crimeKind: "theft",
      accusedName: "Guest Traveler",
      status: "resolved",
      verdict: "paid",
      fineCents: 15_000,
    });
    state.ledger.unshift({
      id: "tx1",
      amountCents: 12_500,
      reason: "Court fine (theft)",
      direction: "debit",
      createdAt: new Date().toISOString(),
    });
    const enc = encodeGuest(state);
    expect(enc.startsWith("z.")).toBe(true);
    expect(enc.length).toBeLessThan(3500);
    expect(decodeGuest(enc)?.balanceCents).toBe(0);
  });
});
