import { describe, it, expect, beforeEach } from "vitest";
import { Session } from "./session.js";

describe("Session", () => {
  let session: Session;

  beforeEach(() => {
    session = new Session({ maxTurns: 5 });
  });

  it("should create a session with default config", () => {
    expect(session.id).toBeDefined();
    expect(session.id).toMatch(/^sess_/);
    expect(session.state.status).toBe("active");
    expect(session.state.currentTurn).toBe(0);
    expect(session.state.totalTokensUsed).toBe(0);
  });

  it("should create a session with custom config", () => {
    const custom = new Session({
      id: "custom_id",
      model: "gpt-4",
      maxTurns: 10,
      temperature: 0.5,
      toolsEnabled: ["exec"],
      toolsDisabled: ["browser_execute"],
    });
    expect(custom.id).toBe("custom_id");
    expect(custom.config.model).toBe("gpt-4");
    expect(custom.config.maxTurns).toBe(10);
    expect(custom.config.temperature).toBe(0.5);
    expect(custom.config.toolsEnabled).toEqual(["exec"]);
    expect(custom.config.toolsDisabled).toEqual(["browser_execute"]);
  });

  it("should check if active", () => {
    expect(session.isActive()).toBe(true);
    session.pause();
    expect(session.isActive()).toBe(false);
  });

  it("should check if completed", () => {
    expect(session.isCompleted()).toBe(false);
    session.complete();
    expect(session.isCompleted()).toBe(true);
  });

  it("should increment turn", () => {
    expect(session.state.currentTurn).toBe(0);
    session.incrementTurn();
    expect(session.state.currentTurn).toBe(1);
    session.incrementTurn();
    expect(session.state.currentTurn).toBe(2);
  });

  it("should check max turns reached", () => {
    expect(session.hasReachedMaxTurns()).toBe(false);
    for (let i = 0; i < 5; i++) {
      session.incrementTurn();
    }
    expect(session.hasReachedMaxTurns()).toBe(true);
  });

  it("should add tokens used", () => {
    session.addTokensUsed(100);
    expect(session.state.totalTokensUsed).toBe(100);
    session.addTokensUsed(50);
    expect(session.state.totalTokensUsed).toBe(150);
  });

  it("should pause and resume", () => {
    session.pause();
    expect(session.state.status).toBe("paused");
    expect(session.isActive()).toBe(false);

    session.resume();
    expect(session.state.status).toBe("active");
    expect(session.isActive()).toBe(true);
  });

  it("should not pause a non-active session", () => {
    session.complete();
    session.pause();
    expect(session.state.status).toBe("completed");
  });

  it("should not resume a non-paused session", () => {
    session.resume();
    expect(session.state.status).toBe("active");
  });

  it("should complete session", () => {
    session.complete();
    expect(session.state.status).toBe("completed");
    expect(session.isCompleted()).toBe(true);
  });

  it("should set error state", () => {
    session.error();
    expect(session.state.status).toBe("error");
  });

  it("should abort session", () => {
    session.abort();
    expect(session.state.status).toBe("completed");
  });

  it("should provide abort signal", () => {
    const signal = session.getAbortSignal();
    expect(signal).toBeDefined();
    expect(signal.aborted).toBe(false);
    session.abort();
    expect(signal.aborted).toBe(true);
  });

  it("should update timestamps on state changes", () => {
    const initialUpdatedAt = session.state.updatedAt;
    session.incrementTurn();
    expect(session.state.updatedAt).toBeGreaterThanOrEqual(initialUpdatedAt);
  });
});
