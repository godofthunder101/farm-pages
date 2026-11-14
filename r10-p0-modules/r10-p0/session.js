/**
 * R10-P0: browser-local LIVE farm -> dungeon -> farm session.
 * Reuses unchanged R09-P0 reducer; unlike R09-P2, does not pre-apply
 * farm harvesting, market order or parcel purchase commands.
 * Actor grant and numeric economy/stamina values are fixture-only.
 */
import { VERSION, createRuntime, applyCommand, inspect, renderSvg } from "../r09-p0/core.js";
const allowed = new Set([
    "farm.plot.harvest", "market.order.fulfil", "farm.parcel.purchase",
    "dungeon.enter", "dungeon.move.forward", "dungeon.move.backward",
    "dungeon.turn.left", "dungeon.turn.right", "dungeon.chest.open",
    "dungeon.card.use", "dungeon.attack.basic", "farm.return", "farm.recover"
]);
export function createSession(fixture) {
    const runtime = createRuntime(fixture), state = inspect(runtime, "owner-a");
    if (runtime.revision !== 0 || state.mode !== "farm" || state.farm.revision !== 0 ||
        state.farm.parcels.some(p => p.id === "parcel-east" && p.owned) ||
        state.farm.availableEntrances.length !== 0 ||
        !state.farm.plots.some(p => p.id === "plot-one" && p.cropStatus === "ready")) {
        throw new Error("R10_EXPECTED_CLEAN_START_FARM");
    }
    return { runtime, nextCommand: 1, history: [], lastUI: null, fixture: "r10-p0/local-only" };
}
export function snapshot(s) { return inspect(s.runtime, "owner-a"); }
export function step(s, action, cardId) {
    if (!allowed.has(action))
        throw new Error("R10_INVALID_ACTION");
    const state = snapshot(s);
    const command = {
        schemaVersion: VERSION, commandId: "r10-" + String(s.nextCommand).padStart(4, "0"),
        actorId: "owner-a", farmInstanceId: "farm-a", expectedRevision: s.runtime.revision, action
    };
    if (action === "farm.plot.harvest")
        command.plotId = "plot-one";
    if (action === "market.order.fulfil")
        command.orderId = "order-one";
    if (action === "farm.parcel.purchase")
        command.parcelId = "parcel-east";
    if (action === "dungeon.enter")
        command.entranceId = "entrance-one";
    if (action === "dungeon.chest.open")
        command.chestId = state.dungeon?.chest.id ?? "chest-one";
    if (action === "dungeon.card.use")
        command.cardId = cardId ?? state.player.hand[0] ?? "card.spark";
    const result = applyCommand(s.runtime, command);
    const d = result.decision;
    const entry = {
        index: s.nextCommand, commandId: d.commandId ?? "invalid", action,
        outcome: d.outcome, reasonCode: d.reasonCode, revision: d.revision,
        events: d.events.map(e => e.kind)
    };
    const session = {
        runtime: result.runtime, nextCommand: s.nextCommand + 1, lastUI: d,
        history: [...s.history, entry].slice(-48), fixture: "r10-p0/local-only"
    };
    return { session, decision: d };
}
export function diagnostic(s) {
    const state = snapshot(s), p = state.player, f = state.farm;
    return [
        "Farm Test R10-P0 LIVE INTEGRATED FARM-DUNGEON REPORT",
        "Source: deterministic browser-local fixture; no server authority or persistence",
        "World revision: " + state.revision,
        "Farm revision: " + f.revision, "Mode: " + state.mode,
        "Actor: " + p.actorId,
        "Gold: " + f.gold, "Lucerne inventory: " + (f.inventory.lucerne ?? 0),
        "Plot: " + (f.plots.find(x => x.id === "plot-one")?.cropStatus ?? "missing"),
        "Market order: " + (f.orders.find(x => x.id === "order-one")?.status ?? "missing"),
        "Owned parcels: " + f.parcels.filter(x => x.owned).map(x => x.id).join(", "),
        "Discovered entrances: " + f.availableEntrances.map(x => x.id).join(", "),
        "Stamina: " + p.stamina + "/" + p.maxStamina,
        "Dungeon: " + (state.dungeon?.instanceId ?? "none"),
        "Facing: " + (p.facing ?? "none"),
        "Hand: " + p.hand.join(", "), "Deck: " + p.deck.join(", "),
        "Discard: " + p.discard.join(", "),
        "Last action: " + (s.lastUI?.action ?? "none"),
        "Last outcome: " + (s.lastUI?.outcome ?? "none"),
        "Last reason: " + (s.lastUI?.reasonCode ?? "none"),
        "Commands submitted: " + (s.nextCommand - 1),
        "No WebGL renderer owns or modifies the game rules",
        "", "ACTION.HISTORY", JSON.stringify(s.history, null, 2),
        "", "INSPECT.JSON", JSON.stringify(state, null, 2),
        "", "INSPECT.SVG", renderSvg(state)
    ].join("\n");
}
