/** P1-T01 in-memory procedural farm. R09-P3 dungeon is reused through a fixed-fixture adapter. */
import { VERSION as R09_VERSION, createRuntime as createR09, applyCommand as applyR09, inspect as inspectR09 } from "../r09-p0/core.js";
import { TRIAL_SEED, GENERATOR_VERSION, PARCEL_PRICE, INITIAL_CAP, hubParcel, generateParcel, frontier, isAdjacent, parseKey } from "./farm-map.js";
export function createTrial() {
    return { tag: "P1-T01-LOCAL-NONAUTHORITATIVE", revision: 0, farmRevision: 0, nextId: 1,
        gold: 0, lucerne: 0, cropReady: true, orderOpen: true,
        parcels: { "0,0": hubParcel() }, firstEntranceKey: null, cap: INITIAL_CAP,
        seed: TRIAL_SEED, generatorVersion: GENERATOR_VERSION, mode: "farm", dungeon: null,
        history: [], dedup: [] };
}
const gameActions = new Set([
    "farm.plot.harvest", "market.order.fulfil", "farm.parcel.purchase",
    "farm.grant-test-gold", "farm.set-test-cap", "dungeon.enter",
    "dungeon.move.forward", "dungeon.move.backward", "dungeon.turn.left", "dungeon.turn.right",
    "dungeon.chest.open", "dungeon.card.use", "dungeon.attack.basic", "farm.return", "farm.recover"
]);
function fingerprint(c) {
    return JSON.stringify([c.action, c.key ?? null, c.biome ?? null, c.cap ?? null, c.cardId ?? null]);
}
const r09Prep = [
    ["farm.plot.harvest", "plotId", "plot-one"],
    ["market.order.fulfil", "orderId", "order-one"],
    ["farm.parcel.purchase", "parcelId", "parcel-east"],
    ["dungeon.enter", "entranceId", "entrance-one"]
];
/** Prepare the *unchanged* tiny R09-P3 fixed dungeon separately from the procedural farm. */
function prepareDungeon(fixture) {
    let rt = createR09(fixture);
    for (let i = 0; i < r09Prep.length; i++) {
        const [action, target, id] = r09Prep[i];
        const cmd = { schemaVersion: R09_VERSION, commandId: "p1-adapter-" + (i + 1),
            actorId: "owner-a", farmInstanceId: "farm-a", expectedRevision: rt.revision, action, [target]: id };
        const result = applyR09(rt, cmd);
        if (result.decision.outcome !== "accepted")
            throw Error("R09_FIXTURE_PREPARATION_FAILED_" + action + "_" + result.decision.reasonCode);
        rt = result.runtime;
    }
    return rt;
}
export function dungeonInspection(s) {
    return s.dungeon ? inspectR09(s.dungeon, "owner-a") : null;
}
function tryAction(s, c, fixture, events) {
    const farmAction = c.action.startsWith("farm.") || c.action === "market.order.fulfil";
    if (s.mode === "dungeon" && farmAction && c.action !== "farm.return")
        return "NOT_IN_FARM";
    switch (c.action) {
        case "farm.plot.harvest":
            if (!s.cropReady)
                return "PLOT_ALREADY_HARVESTED";
            s.cropReady = false;
            s.lucerne += 2;
            s.farmRevision++;
            events.push("farm.plot.harvested");
            return null;
        case "market.order.fulfil":
            if (!s.orderOpen)
                return "ORDER_ALREADY_FULFILLED";
            if (s.lucerne < 2)
                return "INSUFFICIENT_CROP";
            s.lucerne -= 2;
            s.gold += 10;
            s.orderOpen = false;
            s.farmRevision++;
            events.push("market.order.fulfilled");
            return null;
        case "farm.parcel.purchase": {
            const pt = parseKey(c.key);
            if (!pt)
                return "INVALID_COORDINATE";
            if (c.biome !== "grassland" && c.biome !== "marshland")
                return "INVALID_BIOME";
            if (Object.hasOwn(s.parcels, c.key))
                return "PARCEL_ALREADY_OWNED";
            if (!isAdjacent(s.parcels, pt.x, pt.y))
                return "NOT_EDGE_ADJACENT";
            if (Object.keys(s.parcels).length >= s.cap)
                return "PARCEL_CAP_REACHED";
            if (s.gold < PARCEL_PRICE)
                return "INSUFFICIENT_GOLD";
            // Only here may the generator produce a new parcel.
            const first = s.firstEntranceKey === null;
            const parcel = generateParcel(s.seed, pt.x, pt.y, c.biome, first);
            s.gold -= PARCEL_PRICE;
            s.parcels[parcel.key] = parcel;
            if (first)
                s.firstEntranceKey = parcel.key;
            s.farmRevision++;
            events.push("farm.parcel.purchased");
            if (first)
                events.push("farm.dungeon.entrance.unlocked");
            return null;
        }
        case "farm.grant-test-gold":
            if (!s.firstEntranceKey)
                return "FIRST_PURCHASE_MUST_BE_EARNED";
            s.gold += 20;
            s.farmRevision++;
            events.push("dev.fixture.gold.granted");
            return null;
        case "farm.set-test-cap":
            if (!Number.isSafeInteger(c.cap) || c.cap < 2 || c.cap > 32)
                return "INVALID_TEST_CAP";
            s.cap = c.cap;
            s.farmRevision++;
            events.push("dev.fixture.cap.set");
            return null;
        case "dungeon.enter": {
            if (s.mode !== "farm")
                return "NOT_IN_FARM";
            if (!s.firstEntranceKey || c.key !== s.firstEntranceKey)
                return "ENTRANCE_NOT_UNLOCKED";
            if (!s.dungeon) {
                // R09's fixed east-parcel purchase exists ONLY inside this isolated adapter.
                // It does not generate any P1-T01 parcel and cannot debit P1-T01 gold.
                s.dungeon = prepareDungeon(fixture);
            }
            else {
                const prior = applyR09(s.dungeon, { schemaVersion: R09_VERSION,
                    commandId: "p1-bridge-" + c.id, actorId: "owner-a", farmInstanceId: "farm-a",
                    expectedRevision: s.dungeon.revision, action: "dungeon.enter", entranceId: "entrance-one" });
                if (prior.decision.outcome !== "accepted")
                    return prior.decision.reasonCode ?? "DUNGEON_ENTER_DENIED";
                s.dungeon = prior.runtime;
            }
            s.mode = "dungeon";
            events.push("dungeon.entered");
            return null;
        }
        case "dungeon.move.forward":
        case "dungeon.move.backward":
        case "dungeon.turn.left":
        case "dungeon.turn.right":
        case "dungeon.chest.open":
        case "dungeon.card.use":
        case "dungeon.attack.basic":
        case "farm.return":
        case "farm.recover": {
            if (!s.dungeon)
                return "DUNGEON_NOT_STARTED";
            if (c.action === "farm.recover" && s.mode !== "farm")
                return "NOT_IN_FARM";
            if (c.action !== "farm.recover" && s.mode !== "dungeon")
                return "NOT_IN_DUNGEON";
            const params = {};
            if (c.action === "dungeon.chest.open")
                params.chestId = "chest-one";
            if (c.action === "dungeon.card.use") {
                const info = inspectR09(s.dungeon, "owner-a");
                params.cardId = c.cardId ?? info.player.hand[0] ?? "card.spark";
            }
            const outcome = applyR09(s.dungeon, { schemaVersion: R09_VERSION, commandId: "p1-bridge-" + c.id,
                actorId: "owner-a", farmInstanceId: "farm-a", expectedRevision: s.dungeon.revision,
                action: c.action, ...params });
            if (outcome.decision.outcome !== "accepted")
                return outcome.decision.reasonCode ?? "DUNGEON_ACTION_REJECTED";
            s.dungeon = outcome.runtime;
            if (c.action === "farm.return")
                s.mode = "farm";
            events.push(...outcome.decision.events.map(e => e.kind));
            return null;
        }
        default: return "UNKNOWN_ACTION";
    }
}
export function applyCommand(base, c, fixture) {
    const fp = fingerprint(c);
    const existing = base.dedup.find(x => x.id === c.id);
    if (existing && existing.fingerprint === fp)
        return { trial: base, decision: structuredClone(existing.decision), duplicate: true };
    const s = structuredClone(base);
    const prior = base.revision, events = [];
    let reason = null;
    if (!/^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(c.id) || !gameActions.has(c.action) ||
        !Number.isSafeInteger(c.expectedRevision) || c.expectedRevision < 0)
        reason = "INVALID_COMMAND";
    else if (existing)
        reason = "COMMAND_ID_REUSE";
    else if (c.expectedRevision !== prior)
        reason = "STALE_REVISION";
    else {
        // Execute on a candidate clone. A rejected adapter/validation command must never modify world.
        const candidate = structuredClone(s);
        reason = tryAction(candidate, c, fixture, events);
        if (reason === null) {
            s.gold = candidate.gold;
            s.lucerne = candidate.lucerne;
            s.cropReady = candidate.cropReady;
            s.orderOpen = candidate.orderOpen;
            s.parcels = candidate.parcels;
            s.firstEntranceKey = candidate.firstEntranceKey;
            s.farmRevision = candidate.farmRevision;
            s.cap = candidate.cap;
            s.dungeon = candidate.dungeon;
            s.mode = candidate.mode;
            s.revision++;
        }
    }
    const d = { id: c.id, action: c.action,
        outcome: reason === null ? "accepted" : "rejected", reasonCode: reason,
        previousRevision: prior, revision: s.revision, events: reason === null ? events : [] };
    s.history.push(d);
    if (s.history.length > 96)
        s.history.shift();
    if (!existing && reason !== "INVALID_COMMAND" && reason !== "STALE_REVISION")
        s.dedup.push({ id: c.id, fingerprint: fp, decision: structuredClone(d) });
    return { trial: s, decision: d, duplicate: false };
}
export function step(s, action, fixture, params = {}) {
    const id = "p1-" + String(s.nextId).padStart(5, "0");
    const result = applyCommand(s, { id, expectedRevision: s.revision, action, ...params }, fixture);
    if (result.trial === s)
        result.trial = structuredClone(s);
    result.trial.nextId = s.nextId + 1;
    return result;
}
export function availableFrontier(s) { return frontier(s.parcels); }
export function snapshot(s) {
    const d = dungeonInspection(s);
    return {
        schemaVersion: "p1-t01-local/v1", nonAuthoritative: true, revision: s.revision,
        farmRevision: s.farmRevision, mode: s.mode, seed: s.seed, generatorVersion: s.generatorVersion,
        farm: { gold: s.gold, inventory: { lucerne: s.lucerne }, plotStatus: s.cropReady ? "ready" : "harvested",
            orderStatus: s.orderOpen ? "open" : "fulfilled", cap: s.cap, firstEntranceKey: s.firstEntranceKey,
            ownedParcels: Object.values(s.parcels).sort((a, b) => a.y - b.y || a.x - b.x),
            frontier: availableFrontier(s) },
        player: { stamina: d?.player.stamina ?? 8, maxStamina: d?.player.maxStamina ?? 8,
            hand: d?.player.hand ?? [], deck: d?.player.deck ?? [], facing: d?.player.facing ?? null },
        dungeon: s.mode === "dungeon" ? d?.dungeon ?? null : null,
        lastDecision: s.history.at(-1) ?? null
    };
}
