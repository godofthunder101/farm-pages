/**
 * R09-P0 dungeon simulation proof.
 * Pure JSON state transitions. Reuses the accepted R08-P0 farm economy and entrance
 * discovery; does not modify the deployed application or implement real authentication.
 * ALL numeric combat, stamina, hand and recovery values are fixture-only proposals.
 */
import { VERSION as FARM_VERSION, createRuntime as createFarm, applyCommand as applyFarm, inspectFarm as inspectFarmR08, renderSvg as renderFarmSvg } from "../r08-p0/core.js";
export const VERSION = "r09-p0/v1";
export const RULES = Object.freeze({
    moveCost: 1, turnCost: 0, chestCost: 1, cardCost: 1,
    basicStrikeCost: 0, basicStrikeDamage: 1, testCardDamage: 2,
    farmRecovery: 3
});
const obj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const id = (v) => typeof v === "string" && /^[a-zA-Z][a-zA-Z0-9._-]{0,63}$/.test(v);
const uint = (v) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const card = (v) => v === "card.spark" || v === "card.echo";
const face = (v) => v === "N" || v === "E" || v === "S" || v === "W";
function requireFixture(v, label) {
    if (!v)
        throw new TypeError("R09_INVALID_FIXTURE: " + label);
}
const at = (a, b) => a.x === b.x && a.y === b.y;
function validPoint(p, w, h) {
    return obj(p) && uint(p.x) && uint(p.y) && p.x < w && p.y < h;
}
function unique(items, label) {
    requireFixture(new Set(items).size === items.length, "unique " + label);
}
export function createRuntime(fixture) {
    requireFixture(obj(fixture) && fixture.schemaVersion === VERSION, "schemaVersion");
    requireFixture(obj(fixture.farmFixture), "farmFixture");
    const farm = createFarm(fixture.farmFixture);
    requireFixture(Array.isArray(fixture.players) && fixture.players.length >= 1 && fixture.players.length <= 8, "players");
    requireFixture(Array.isArray(fixture.dungeons) && fixture.dungeons.length >= 1 && fixture.dungeons.length <= 8, "dungeons");
    const playerIds = [];
    for (const p of fixture.players) {
        requireFixture(obj(p) && id(p.actorId) && id(p.farmInstanceId) &&
            id(p.farmerClassId) && id(p.fighterClassId), "player identity/classes");
        playerIds.push(p.actorId);
        requireFixture(farm.base.grants.some(g => g.actorId === p.actorId && g.instanceId === p.farmInstanceId && g.role === "owner"), "owner-only dungeon fixture grant");
        requireFixture(p.mode === "farm" && p.activeDungeonId === null && p.position === null && p.facing === null, "initial farm mode");
        requireFixture(uint(p.stamina) && uint(p.maxStamina) && p.maxStamina > 0 && p.maxStamina <= 100 && p.stamina <= p.maxStamina, "stamina bounds");
        requireFixture(uint(p.handLimit) && p.handLimit > 0 && p.handLimit <= 8, "hand cap");
        for (const group of ["deck", "hand", "discard"]) {
            requireFixture(Array.isArray(p[group]) && p[group].length <= 16 && p[group].every(card), "card pool " + group);
        }
        const hand = p.hand;
        requireFixture(Array.isArray(hand) && hand.length <= p.handLimit, "hand capacity");
    }
    unique(playerIds, "players");
    const ids = [];
    for (const d of fixture.dungeons) {
        requireFixture(obj(d) && id(d.instanceId) && id(d.definitionId) && id(d.farmInstanceId) &&
            id(d.entranceId) && typeof d.seed === "string" && d.seed.length > 0 && d.seed.length <= 80, "dungeon ids and template seed");
        ids.push(d.instanceId);
        requireFixture(uint(d.width) && d.width >= 2 && d.width <= 16 && uint(d.height) && d.height >= 2 && d.height <= 16, "dungeon dimensions");
        const width = d.width, height = d.height;
        requireFixture(Array.isArray(d.walkable) && d.walkable.length >= 4 && d.walkable.length <= 128 &&
            d.walkable.every((p) => validPoint(p, width, height)), "walkable cells");
        const walkable = d.walkable;
        unique(walkable.map(p => p.x + "," + p.y), "walkable coordinates");
        requireFixture(validPoint(d.start, width, height), "start coordinates");
        const start = d.start;
        requireFixture(walkable.some(p => at(p, start)), "start traversable");
        requireFixture(face(d.startFacing), "start facing");
        requireFixture(obj(d.enemy), "enemy object");
        const enemy = d.enemy;
        requireFixture(id(enemy.id) && validPoint(enemy.position, width, height), "enemy identity/position");
        const enemyPosition = enemy.position;
        requireFixture(walkable.some(p => at(p, enemyPosition)) && uint(enemy.health) && enemy.health > 0 &&
            enemy.health <= 30 && enemy.maxHealth === enemy.health && enemy.status === "alive", "enemy fixture");
        requireFixture(!at(start, enemyPosition), "enemy away from spawn");
        requireFixture(obj(d.chest), "chest object");
        const chest = d.chest;
        requireFixture(id(chest.id) && validPoint(chest.position, width, height), "chest identity/position");
        const chestPosition = chest.position;
        requireFixture(walkable.some(p => at(p, chestPosition)) && chest.opened === false && card(chest.lootCard), "chest fixture");
        requireFixture(!at(start, chestPosition), "chest away from spawn");
        requireFixture(d.engaged === false && d.revision === 0, "initial dungeon revision/engagement");
        const economy = farm.economies.find(e => e.instanceId === d.farmInstanceId);
        requireFixture(!!economy && economy.parcels.some(p => p.features.some(f => f.id === d.entranceId && f.dungeonDefinitionId === d.definitionId)), "dungeon entrance definition link");
    }
    unique(ids, "dungeon instance IDs");
    for (const p of fixture.players) {
        requireFixture(fixture.dungeons.some((d) => d.farmInstanceId === p.farmInstanceId), "owner has dungeon");
    }
    return {
        schemaVersion: VERSION, revision: 0, farm, players: structuredClone(fixture.players),
        dungeons: structuredClone(fixture.dungeons), audit: [], dedup: [], auditSequence: 0
    };
}
const actions = {
    "farm.plot.harvest": "plotId", "market.order.fulfil": "orderId", "farm.parcel.purchase": "parcelId",
    "dungeon.enter": "entranceId", "dungeon.move.forward": null, "dungeon.move.backward": null,
    "dungeon.turn.left": null, "dungeon.turn.right": null, "dungeon.chest.open": "chestId",
    "dungeon.card.use": "cardId", "dungeon.attack.basic": null, "farm.return": null, "farm.recover": null
};
function parse(input) {
    if (!obj(input) || typeof input.action !== "string" || !Object.hasOwn(actions, input.action))
        return null;
    const action = input.action;
    const required = ["schemaVersion", "commandId", "actorId", "farmInstanceId", "expectedRevision", "action"];
    const target = actions[action];
    if (Object.keys(input).length !== required.length + (target ? 1 : 0) ||
        Object.keys(input).some(k => !required.includes(k) && k !== target))
        return null;
    if (input.schemaVersion !== VERSION || !id(input.commandId) || !id(input.actorId) || !id(input.farmInstanceId) ||
        !uint(input.expectedRevision))
        return null;
    if (target && !id(input[target]))
        return null;
    if (target === "cardId" && !card(input[target]))
        return null;
    return input;
}
function fingerprint(c) {
    return JSON.stringify([c.action, c.expectedRevision, c.plotId ?? null, c.orderId ?? null,
        c.parcelId ?? null, c.entranceId ?? null, c.chestId ?? null, c.cardId ?? null]);
}
const order = ["N", "E", "S", "W"];
function movePosition(pos, facing, forward) {
    const v = { N: { x: 0, y: -1 }, E: { x: 1, y: 0 }, S: { x: 0, y: 1 }, W: { x: -1, y: 0 } };
    const sign = forward ? 1 : -1;
    return { x: pos.x + v[facing].x * sign, y: pos.y + v[facing].y * sign };
}
function activeDungeon(rt, player) {
    return rt.dungeons.find(d => d.instanceId === player.activeDungeonId && d.farmInstanceId === player.farmInstanceId);
}
function visibleEntrances(rt, actorId, farmId) {
    const model = inspectFarmR08(rt.farm, farmId, actorId);
    return model.availableEntrances.map(f => f.id);
}
function damageEnemy(d, amount, events) {
    d.enemy.health = Math.max(0, d.enemy.health - amount);
    events.push({ kind: "dungeon.enemy.damaged", enemyId: d.enemy.id, amount, remainingHealth: d.enemy.health });
    if (d.enemy.health === 0) {
        d.enemy.status = "defeated";
        d.engaged = false;
        events.push({ kind: "dungeon.enemy.defeated", enemyId: d.enemy.id });
        events.push({ kind: "dungeon.engagement.cleared", dungeonInstanceId: d.instanceId });
    }
}
export function applyCommand(runtime, input) {
    const c = parse(input);
    if (c) {
        const key = [c.farmInstanceId, c.actorId, c.commandId].join(":");
        const existing = runtime.dedup.find(x => x.key === key);
        if (existing && existing.fingerprint === fingerprint(c)) {
            return { runtime, decision: structuredClone(existing.decision), duplicate: true };
        }
    }
    const next = structuredClone(runtime);
    const prior = next.revision;
    const player = c ? next.players.find(p => p.actorId === c.actorId && p.farmInstanceId === c.farmInstanceId) : undefined;
    let reason = null;
    let events = [];
    if (!c)
        reason = "INVALID_COMMAND";
    else if (!next.farm.base.farms.some(f => f.instanceId === c.farmInstanceId) ||
        !next.farm.base.grants.some(g => g.instanceId === c.farmInstanceId && g.actorId === c.actorId)) {
        reason = "NOT_FOUND_OR_FORBIDDEN";
    }
    else if (runtime.dedup.some(x => x.key === [c.farmInstanceId, c.actorId, c.commandId].join(":"))) {
        reason = "COMMAND_ID_REUSE";
    }
    else if (c.expectedRevision !== next.revision)
        reason = "STALE_REVISION";
    else if (c.action === "farm.plot.harvest" || c.action === "market.order.fulfil" || c.action === "farm.parcel.purchase") {
        if (player?.mode === "dungeon")
            reason = "NOT_IN_FARM";
        else {
            const farm = next.farm.base.farms.find(f => f.instanceId === c.farmInstanceId);
            const r = applyFarm(next.farm, {
                schemaVersion: FARM_VERSION, commandId: c.commandId, actorId: c.actorId,
                instanceId: c.farmInstanceId, expectedRevision: farm.revision, action: c.action,
                ...(c.plotId ? { plotId: c.plotId } : {}), ...(c.orderId ? { orderId: c.orderId } : {}),
                ...(c.parcelId ? { parcelId: c.parcelId } : {})
            });
            next.farm = r.runtime;
            if (r.decision.outcome === "accepted")
                events = r.decision.events.map(e => ({ ...e }));
            else
                reason = r.decision.reasonCode ?? "FARM_REJECTED";
        }
    }
    else if (!player)
        reason = "NOT_FOUND_OR_FORBIDDEN";
    else if (c.action === "dungeon.enter") {
        if (player.mode !== "farm")
            reason = "NOT_IN_FARM";
        else if (player.stamina === 0)
            reason = "STAMINA_EXHAUSTED";
        else if (!visibleEntrances(next, c.actorId, c.farmInstanceId).includes(c.entranceId))
            reason = "ENTRANCE_LOCKED";
        else {
            const found = next.dungeons.find(d => d.entranceId === c.entranceId && d.farmInstanceId === c.farmInstanceId);
            if (!found)
                reason = "ENTRANCE_NOT_LINKED";
            else {
                player.mode = "dungeon";
                player.activeDungeonId = found.instanceId;
                player.position = structuredClone(found.start);
                player.facing = found.startFacing;
                found.revision++;
                events = [{ kind: "dungeon.entered", dungeonInstanceId: found.instanceId, entranceId: found.entranceId }];
            }
        }
    }
    else if (c.action === "farm.recover") {
        if (player.mode !== "farm")
            reason = "NOT_IN_FARM";
        else if (player.stamina === player.maxStamina)
            reason = "STAMINA_FULL";
        else {
            const before = player.stamina;
            player.stamina = Math.min(player.maxStamina, before + RULES.farmRecovery);
            events = [{ kind: "farm.stamina.recovered", before, after: player.stamina, amount: player.stamina - before }];
        }
    }
    else if (c.action === "farm.return") {
        if (player.mode !== "dungeon")
            reason = "NOT_IN_DUNGEON";
        else {
            const d = activeDungeon(next, player);
            if (!d)
                reason = "DUNGEON_NOT_FOUND";
            else {
                player.mode = "farm";
                player.activeDungeonId = null;
                player.position = null;
                player.facing = null;
                d.revision++;
                events = [{ kind: "dungeon.returned", dungeonInstanceId: d.instanceId, remainingStamina: player.stamina }];
            }
        }
    }
    else if (player.mode !== "dungeon")
        reason = "NOT_IN_DUNGEON";
    else {
        const d = activeDungeon(next, player);
        if (!d || !player.position || !player.facing)
            reason = "DUNGEON_NOT_FOUND";
        else if (c.action === "dungeon.move.forward" || c.action === "dungeon.move.backward") {
            if (d.engaged)
                reason = "ENGAGED_TRAVERSAL_BLOCKED";
            else if (player.stamina < RULES.moveCost)
                reason = "STAMINA_EXHAUSTED";
            else {
                const forward = c.action === "dungeon.move.forward";
                const target = movePosition(player.position, player.facing, forward);
                if (!d.walkable.some(p => at(p, target)))
                    reason = "BLOCKED_TILE";
                else {
                    player.position = target;
                    player.stamina -= RULES.moveCost;
                    events.push({ kind: "dungeon.player.moved", direction: forward ? "forward" : "backward",
                        x: target.x, y: target.y, remainingStamina: player.stamina });
                    // Only a successful forward step can draw. Full hand/empty deck leaves deck unchanged.
                    if (forward && player.hand.length < player.handLimit && player.deck.length > 0) {
                        const nextCard = player.deck.shift();
                        player.hand.push(nextCard);
                        events.push({ kind: "dungeon.card.drawn", cardId: nextCard });
                    }
                    if (d.enemy.status === "alive" && at(target, d.enemy.position)) {
                        d.engaged = true;
                        events.push({ kind: "dungeon.enemy.engaged", enemyId: d.enemy.id });
                    }
                    d.revision++;
                }
            }
        }
        else if (c.action === "dungeon.turn.left" || c.action === "dungeon.turn.right") {
            // Turns are allowed even when engaged, but this is an explicitly test-only choice.
            const ix = order.indexOf(player.facing);
            const clockwise = c.action === "dungeon.turn.right";
            player.facing = order[(ix + (clockwise ? 1 : 3)) % 4];
            d.revision++;
            events = [{ kind: "dungeon.player.turned", facing: player.facing, remainingStamina: player.stamina }];
        }
        else if (c.action === "dungeon.chest.open") {
            if (d.engaged)
                reason = "ENGAGED_INTERACTION_BLOCKED";
            else if (c.chestId !== d.chest.id)
                reason = "CHEST_NOT_FOUND";
            else if (d.chest.opened)
                reason = "CHEST_ALREADY_OPEN";
            else if (!at(player.position, d.chest.position))
                reason = "CHEST_OUT_OF_REACH";
            else if (player.stamina < RULES.chestCost)
                reason = "STAMINA_EXHAUSTED";
            else if (player.deck.length >= 16)
                reason = "DECK_FULL";
            else {
                d.chest.opened = true;
                player.stamina -= RULES.chestCost;
                player.deck.push(d.chest.lootCard);
                d.revision++;
                events = [{ kind: "dungeon.chest.opened", chestId: d.chest.id },
                    { kind: "dungeon.loot.card-acquired", cardId: d.chest.lootCard, remainingStamina: player.stamina }];
            }
        }
        else if (c.action === "dungeon.card.use") {
            if (!d.engaged)
                reason = "NOT_ENGAGED";
            else if (!player.hand.includes(c.cardId))
                reason = "CARD_NOT_IN_HAND";
            else if (player.stamina < RULES.cardCost)
                reason = "STAMINA_EXHAUSTED";
            else {
                player.hand.splice(player.hand.indexOf(c.cardId), 1);
                player.discard.push(c.cardId);
                player.stamina -= RULES.cardCost;
                events = [{ kind: "dungeon.card.used", cardId: c.cardId, remainingStamina: player.stamina }];
                damageEnemy(d, RULES.testCardDamage, events);
                d.revision++;
            }
        }
        else if (c.action === "dungeon.attack.basic") {
            if (!d.engaged)
                reason = "NOT_ENGAGED";
            else {
                // Guaranteed action when hand is empty or stamina zero: proposed fixture safeguard.
                events = [{ kind: "dungeon.attack.basic", remainingStamina: player.stamina }];
                damageEnemy(d, RULES.basicStrikeDamage, events);
                d.revision++;
            }
        }
    }
    next.auditSequence++;
    if (reason === null)
        next.revision++;
    const decision = {
        schemaVersion: VERSION, commandId: c?.commandId ?? null, actorId: c?.actorId ?? null,
        farmInstanceId: c?.farmInstanceId ?? null, action: c?.action ?? null,
        outcome: reason === null ? "accepted" : "rejected", previousRevision: c ? prior : null,
        revision: c ? next.revision : null, auditSequence: next.auditSequence,
        reasonCode: reason, events
    };
    next.audit.push(decision);
    if (c) {
        const key = [c.farmInstanceId, c.actorId, c.commandId].join(":");
        if (!next.dedup.some(d => d.key === key)) {
            next.dedup.push({ key, fingerprint: fingerprint(c), decision: structuredClone(decision) });
        }
    }
    return { runtime: next, decision, duplicate: false };
}
export function inspect(runtime, actorId) {
    const player = runtime.players.find(p => p.actorId === actorId);
    if (!player || !runtime.farm.base.grants.some(g => g.actorId === actorId && g.instanceId === player.farmInstanceId)) {
        throw new Error("NOT_FOUND_OR_FORBIDDEN");
    }
    const farm = inspectFarmR08(runtime.farm, player.farmInstanceId, actorId);
    const dungeon = player.mode === "dungeon" ? activeDungeon(runtime, player) : undefined;
    if (player.mode === "dungeon" && !dungeon)
        throw Error("DUNGEON_NOT_FOUND");
    return {
        schemaVersion: VERSION, source: "deterministic-fixture", revision: runtime.revision,
        farmInstanceId: player.farmInstanceId, mode: player.mode, player: structuredClone(player),
        farm, dungeon: dungeon ? structuredClone(dungeon) : null,
        lastDecision: structuredClone([...runtime.audit].reverse().find(a => a.actorId === actorId) ?? null)
    };
}
const xml = (v) => v.replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
}[ch]));
export function renderSvg(model) {
    if (model.mode === "farm" || !model.dungeon || !model.player.position || !model.player.facing) {
        return renderFarmSvg(model.farm)
            .replace("Semantic land parcels at revision " + model.farm.revision + ";", "World revision " + model.revision + "; farm revision " + model.farm.revision + ";")
            .replace("Revision " + model.farm.revision + " | Gold", "World Revision " + model.revision + " | Farm Revision " + model.farm.revision + " | Gold");
    }
    const d = model.dungeon, p = model.player;
    const position = p.position, facing = p.facing;
    if (!position || !facing)
        throw new Error("INVALID_DUNGEON_INSPECTION_POSE");
    const unit = 82, left = 26, top = 115;
    const width = left * 2 + unit * d.width, height = top + unit * d.height + 28;
    const points = d.walkable.map(v => v.x + "," + v.y);
    const cells = Array.from({ length: d.height * d.width }, (_, i) => {
        const x = i % d.width, y = Math.floor(i / d.width), open = points.includes(x + "," + y);
        return '<rect id="cell-' + x + '-' + y + '" data-kind="' + (open ? "floor" : "wall") +
            '" x="' + (left + x * unit) + '" y="' + (top + y * unit) + '" width="' + unit +
            '" height="' + unit + '" fill="' + (open ? "#e3e9d9" : "#424a53") + '" stroke="#888"/>';
    }).join("\n");
    const enemy = d.enemy, chest = d.chest;
    const ex = left + (enemy.position.x + .5) * unit, ey = top + (enemy.position.y + .5) * unit;
    const cx = left + (chest.position.x + .5) * unit, cy = top + (chest.position.y + .5) * unit;
    const px = left + (position.x + .5) * unit, py = top + (position.y + .5) * unit;
    const arrows = { N: "↑", E: "→", S: "↓", W: "←" };
    return [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '" role="img">',
        '<title>R09 dungeon ' + xml(d.instanceId) + '</title>',
        '<desc>Revision ' + model.revision + '; first-person grid inspection represented top-down</desc>',
        '<rect width="100%" height="100%" fill="white"/>',
        '<text x="18" y="25" font-size="17">Dungeon ' + xml(d.instanceId) + ' | revision ' + model.revision + '</text>',
        '<text x="18" y="49" font-size="13">Stamina ' + p.stamina + '/' + p.maxStamina +
            ' | Hand ' + p.hand.length + '/' + p.handLimit + ' | Facing ' + p.facing + '</text>',
        '<text x="18" y="70" font-size="13">Encounter ' + (d.engaged ? "ACTIVE" : "clear") +
            ' | Enemy ' + enemy.health + ' HP | Chest ' + (chest.opened ? "opened" : "closed") + '</text>',
        '<text x="18" y="90" font-size="12">Deck ' + p.deck.length + ' | Discard ' + p.discard.length + '</text>',
        '<g id="dungeon-grid">' + cells + '</g>',
        '<g id="chest-' + xml(chest.id) + '" data-kind="loot-chest" data-status="' + (chest.opened ? "opened" : "closed") + '">',
        '<title>Chest ' + xml(chest.id) + '</title>',
        '<rect x="' + (cx - 14) + '" y="' + (cy - 14) + '" width="28" height="28" fill="' + (chest.opened ? "#aa9c7d" : "#bc8730") + '"/></g>',
        '<g id="enemy-' + xml(enemy.id) + '" data-kind="enemy" data-status="' + enemy.status + '">',
        '<title>Enemy ' + xml(enemy.id) + ' ' + enemy.health + ' HP</title>',
        '<circle cx="' + ex + '" cy="' + ey + '" r="17" fill="' + (enemy.status === "alive" ? "#bf5555" : "#aaa") + '" /></g>',
        '<g id="player-' + xml(p.actorId) + '" data-kind="player" data-facing="' + p.facing + '">',
        '<title>Player ' + xml(p.actorId) + ' facing ' + p.facing + '</title>',
        '<text x="' + (px - 17) + '" y="' + (py + 10) + '" font-size="30" fill="#16509e">' + arrows[facing] + '</text></g>',
        '</svg>', ""
    ].join("\n");
}
export function replay(fixture, commands) {
    let runtime = createRuntime(fixture);
    const decisions = [];
    for (const c of commands) {
        const r = applyCommand(runtime, c);
        runtime = r.runtime;
        decisions.push(r.decision);
    }
    return { runtime, decisions };
}
