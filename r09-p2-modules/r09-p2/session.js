/**
 * R09-P2: live browser-local command session over the UNCHANGED R09-P0 reducer.
 * All actor grants and numeric rules are synthetic fixture values, not auth.
 */
import { VERSION, createRuntime, applyCommand, inspect, renderSvg } from "../r09-p0/core.js";
const validActions = new Set([
    "dungeon.enter", "dungeon.move.forward", "dungeon.move.backward",
    "dungeon.turn.left", "dungeon.turn.right", "dungeon.chest.open",
    "dungeon.card.use", "dungeon.attack.basic", "farm.return", "farm.recover"
]);
export function createSession(fixture) {
    if (!fixture || typeof fixture !== "object" ||
        !Array.isArray(fixture.commands)) {
        throw new Error("R09_P2_FIXTURE_COMMANDS_MISSING");
    }
    const commands = fixture.commands;
    if (commands.length !== 17)
        throw new Error("R09_P2_EXPECTED_ORIGINAL_FIXTURE");
    let runtime = createRuntime(fixture);
    for (const cmd of commands.slice(0, 3)) {
        const result = applyCommand(runtime, cmd);
        if (result.decision.outcome !== "accepted") {
            throw new Error("R09_P2_PREP_REJECTED:" + result.decision.reasonCode);
        }
        runtime = result.runtime;
    }
    const view = inspect(runtime, "owner-a");
    if (runtime.revision !== 3 || view.mode !== "farm" ||
        view.farm.availableEntrances.map(e => e.id).join(",") !== "entrance-one") {
        throw new Error("R09_P2_FARM_PREP_MISMATCH");
    }
    return { runtime, nextCommand: 1, lastUI: null, history: [], fixtureName: "r09-p2/fixture-only" };
}
export function snapshot(s) { return inspect(s.runtime, "owner-a"); }
export function step(s, action, cardId) {
    if (!validActions.has(action))
        throw new Error("R09_P2_UNKNOWN_ACTION");
    const view = snapshot(s);
    const input = {
        schemaVersion: VERSION,
        commandId: "p2-" + String(s.nextCommand).padStart(4, "0"),
        actorId: "owner-a", farmInstanceId: "farm-a",
        expectedRevision: s.runtime.revision, action
    };
    if (action === "dungeon.enter")
        input.entranceId = "entrance-one";
    if (action === "dungeon.chest.open")
        input.chestId = view.dungeon?.chest.id ?? "chest-one";
    if (action === "dungeon.card.use")
        input.cardId = cardId ?? view.player.hand[0] ?? "card.spark";
    const result = applyCommand(s.runtime, input);
    const decision = result.decision;
    const entry = {
        index: s.nextCommand, commandId: decision.commandId ?? "invalid",
        action, outcome: decision.outcome, reasonCode: decision.reasonCode,
        revision: decision.revision, events: decision.events.map(e => e.kind)
    };
    return {
        session: { runtime: result.runtime, nextCommand: s.nextCommand + 1, lastUI: decision,
            history: [...s.history, entry].slice(-36), fixtureName: "r09-p2/fixture-only" },
        decision
    };
}
/** Live in-memory reducer state; never a pre-generated Pages fixture report. */
export function diagnostic(s) {
    const state = snapshot(s), p = state.player, last = s.lastUI;
    const position = p.position ? "(" + p.position.x + "," + p.position.y + ")" : "farm";
    return [
        "Farm Test R09-P2 INTERACTIVE LOCAL DUNGEON REPORT",
        "Source: interactive-browser-fixture; not authenticated or server-persisted",
        "World revision: " + state.revision,
        "Farm revision: " + state.farm.revision,
        "Mode: " + state.mode, "Actor: " + p.actorId,
        "Dungeon: " + (state.dungeon?.instanceId ?? "none"),
        "Position: " + position, "Facing: " + (p.facing ?? "none"),
        "Stamina: " + p.stamina + "/" + p.maxStamina,
        "Hand: " + p.hand.join(", "),
        "Deck: " + p.deck.join(", "), "Discard: " + p.discard.join(", "),
        "Enemy HP: " + (state.dungeon?.enemy.health ?? "n/a"),
        "Engaged: " + (state.dungeon?.engaged ?? "n/a"),
        "Last action: " + (last?.action ?? "none"),
        "Last outcome: " + (last?.outcome ?? "none"),
        "Last rejection: " + (last?.reasonCode ?? "none"),
        "Commands submitted this session: " + (s.nextCommand - 1),
        "Page is not connected to Railway or durable storage",
        "", "ACTION.HISTORY", JSON.stringify(s.history, null, 2),
        "", "INSPECT.JSON", JSON.stringify(state, null, 2),
        "", "INSPECT.SVG", renderSvg(state)
    ].join("\n");
}
