import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isKnownNoiseError, installNoiseSilencer } from "./noise-filters";

// ============================================================================
// isKnownNoiseError — predicate contract
// ============================================================================

describe("isKnownNoiseError — accepts known noise", () => {
  it("matches the chrome extension message-channel error verbatim", () => {
    const message =
      "A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received";
    expect(isKnownNoiseError(new Error(message))).toBe(true);
  });

  it("matches the chrome extension message-channel error as a plain string", () => {
    const message =
      "A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received";
    expect(isKnownNoiseError(message)).toBe(true);
  });

  it("matches case-insensitively", () => {
    const message =
      "a listener indicated an asynchronous response by returning true, but the message channel closed";
    expect(isKnownNoiseError(message)).toBe(true);
  });

  it("matches the recharts width(-1) height(-1) warning", () => {
    const message =
      "The width(-1) and height(-1) of chart should be greater than 0, please check the style of container";
    expect(isKnownNoiseError(message)).toBe(true);
  });

  it("matches recharts width/height variants (different numeric values)", () => {
    // The pattern allows any negative integer, not strictly -1.
    expect(
      isKnownNoiseError(
        "The width(-5) and height(-2) of chart should be greater than 0",
      ),
    ).toBe(true);
  });

  it("matches the React reconciliation 'Node cannot be found' warning", () => {
    expect(isKnownNoiseError("Node cannot be found in the current page")).toBe(
      true,
    );
  });

  it("matches when the noise text is embedded inside a longer error message", () => {
    const message =
      "Wrapper error: A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received — caller frame";
    expect(isKnownNoiseError(message)).toBe(true);
  });
});

// ============================================================================
// isKnownNoiseError — rejects real errors
// ============================================================================

describe("isKnownNoiseError — does NOT match real errors", () => {
  it("returns false for a generic TypeError", () => {
    expect(
      isKnownNoiseError(
        new TypeError("Cannot read properties of undefined (reading 'foo')"),
      ),
    ).toBe(false);
  });

  it("returns false for a network failure", () => {
    expect(isKnownNoiseError(new Error("Failed to fetch"))).toBe(false);
  });

  it("returns false for a Supabase error", () => {
    expect(
      isKnownNoiseError({ message: "JWT expired", code: "PGRST301" }),
    ).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isKnownNoiseError("")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isKnownNoiseError(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isKnownNoiseError(undefined)).toBe(false);
  });

  it("returns false for a number", () => {
    expect(isKnownNoiseError(42)).toBe(false);
  });

  it("returns false for an object without a message field", () => {
    expect(isKnownNoiseError({ stack: "..." })).toBe(false);
  });

  it("returns false for a generic stringifiable object", () => {
    expect(isKnownNoiseError({})).toBe(false);
  });

  // Guard against over-broad regex
  it("does NOT match an unrelated message that happens to contain 'listener'", () => {
    expect(
      isKnownNoiseError("Event listener registration failed"),
    ).toBe(false);
  });

  it("does NOT match an unrelated message containing 'width'", () => {
    expect(isKnownNoiseError("Image width must be positive")).toBe(false);
  });

  it("does NOT match a chunk-load error (those need ErrorBoundary handling, not silencing)", () => {
    expect(
      isKnownNoiseError(
        new Error("Failed to fetch dynamically imported module: /assets/foo.js"),
      ),
    ).toBe(false);
  });
});

// ============================================================================
// installNoiseSilencer — runtime behavior
// ============================================================================

describe("installNoiseSilencer", () => {
  // Track listeners registered so we can clean up between tests.
  let registered: Array<{ type: string; handler: EventListener }>;
  let originalAdd: typeof window.addEventListener;

  beforeEach(() => {
    registered = [];
    originalAdd = window.addEventListener.bind(window);
    vi.spyOn(window, "addEventListener").mockImplementation((type, handler) => {
      registered.push({ type, handler: handler as EventListener });
      originalAdd(type, handler);
    });
  });

  afterEach(() => {
    // Remove every listener installNoiseSilencer added.
    for (const { type, handler } of registered) {
      window.removeEventListener(type, handler);
    }
    vi.restoreAllMocks();
  });

  it("registers an unhandledrejection listener", () => {
    installNoiseSilencer();
    const types = registered.map((r) => r.type);
    expect(types).toContain("unhandledrejection");
  });

  it("calls preventDefault on a known-noise rejection", () => {
    installNoiseSilencer();
    const noiseListener = registered.find((r) => r.type === "unhandledrejection")?.handler;
    expect(noiseListener).toBeDefined();

    // Synthesize a minimal PromiseRejectionEvent — jsdom does not implement
    // it, so we hand-roll an object that matches the shape the handler reads.
    const fakeEvent = {
      reason: new Error(
        "A listener indicated an asynchronous response by returning true, but the message channel closed",
      ),
      preventDefault: vi.fn(),
    };
    // deno-lint-ignore no-explicit-any
    (noiseListener as any)(fakeEvent);
    expect(fakeEvent.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("does NOT call preventDefault on a real error", () => {
    installNoiseSilencer();
    const noiseListener = registered.find((r) => r.type === "unhandledrejection")?.handler;

    const fakeEvent = {
      reason: new Error("Cannot read properties of undefined (reading 'foo')"),
      preventDefault: vi.fn(),
    };
    // deno-lint-ignore no-explicit-any
    (noiseListener as any)(fakeEvent);
    expect(fakeEvent.preventDefault).not.toHaveBeenCalled();
  });

  it("does NOT call preventDefault on an error with no message", () => {
    installNoiseSilencer();
    const noiseListener = registered.find((r) => r.type === "unhandledrejection")?.handler;

    const fakeEvent = { reason: null, preventDefault: vi.fn() };
    // deno-lint-ignore no-explicit-any
    (noiseListener as any)(fakeEvent);
    expect(fakeEvent.preventDefault).not.toHaveBeenCalled();
  });

  it("calls preventDefault on the recharts width warning", () => {
    installNoiseSilencer();
    const noiseListener = registered.find((r) => r.type === "unhandledrejection")?.handler;

    const fakeEvent = {
      reason: "The width(-1) and height(-1) of chart should be greater than 0",
      preventDefault: vi.fn(),
    };
    // deno-lint-ignore no-explicit-any
    (noiseListener as any)(fakeEvent);
    expect(fakeEvent.preventDefault).toHaveBeenCalledTimes(1);
  });
});
