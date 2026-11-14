/**
 * R08-P0 isolated farm economy and parcel expansion.
 * Reuses R07-P0's validated farm snapshots, harvest reducer, and plot inspection.
 * Fixture grants are NOT authentication. All currency and coordinates are test-only.
 */
import { VERSION as FOUNDATION_VERSION, createRuntime as createBase, applyCommand as applyBase, inspectFarm as inspectBase } from "../r07-p0/core.js";
export const VERSION = "r08-p0/v1";
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const id = (v) => typeof v === "string" && /^[a-zA-Z][a-zA-Z0-9._-]{0,63}$/.test(v);
const int = (v) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
function must(v, msg) { if (!v)
    throw new TypeError("R08_INVALID_FIXTURE: " + msg); }
const unique = (values, what) => must(new Set(values).size === values.length, "unique " + what);
export function createRuntime(fixture) {
    must(isObj(fixture) && fixture.schemaVersion === VERSION, "top-level version");
    must(Array.isArray(fixture.farms) && Array.isArray(fixture.grants) && Array.isArray(fixture.economies), "arrays");
    const base = createBase({ schemaVersion: FOUNDATION_VERSION, farms: fixture.farms, grants: fixture.grants });
    must(fixture.economies.length === base.farms.length, "one economy per farm");
    const econIds = [];
    for (const e of fixture.economies) {
        must(isObj(e) && id(e.instanceId) && base.farms.some(f => f.instanceId === e.instanceId), "economy identity");
        econIds.push(e.instanceId);
        must(int(e.gold), "gold");
        must(Array.isArray(e.parcels) && e.parcels.length > 0 && e.parcels.length <= 64, "parcel array");
        must(Array.isArray(e.orders) && e.orders.length <= 32, "order array");
        const parcelIds = [], parcelCoords = [], featureIds = [], orderIds = [];
        let ownedCount = 0;
        for (const p of e.parcels) {
            must(isObj(p) && id(p.id) && id(p.biomeId), "parcel IDs");
            parcelIds.push(p.id);
            must(int(p.x) && p.x <= 12 && int(p.y) && p.y <= 12, "parcel coordinates");
            parcelCoords.push(p.x + "," + p.y);
            must(typeof p.owned === "boolean", "owned flag");
            if (p.owned)
                ownedCount++;
            must(p.purchasePrice === null || (int(p.purchasePrice) && p.purchasePrice > 0), "purchase price");
            if (p.owned)
                must(p.purchasePrice === null || int(p.purchasePrice), "owned price");
            else
                must(p.purchasePrice !== null, "unowned parcel price");
            must(Array.isArray(p.features) && p.features.length <= 8, "features array");
            for (const f of p.features) {
                must(isObj(f) && id(f.id) && f.kind === "dungeon-entrance" && id(f.dungeonDefinitionId), "feature");
                featureIds.push(f.id);
            }
        }
        must(ownedCount > 0, "one owned parcel minimum");
        unique(parcelIds, "parcel ids");
        unique(parcelCoords, "parcel coordinates");
        unique(featureIds, "feature ids");
        for (const o of e.orders) {
            must(isObj(o) && id(o.id) && id(o.productId) && int(o.quantity) && o.quantity > 0, "order ids/quantity");
            must(int(o.rewardGold) && o.rewardGold > 0, "order reward");
            must(o.status === "open" || o.status === "fulfilled", "order status");
            orderIds.push(o.id);
        }
        unique(orderIds, "order ids");
        const f = base.farms.find(x => x.instanceId === e.instanceId);
        for (const plot of f.plots) {
            must(e.parcels.some((p) => p.id === plot.parcelId && p.owned), "crop plot on owned parcel");
        }
    }
    unique(econIds, "economy ids");
    return { schemaVersion: VERSION, base, economies: structuredClone(fixture.economies),
        audit: [], dedup: [], auditSequence: 0 };
}
function parse(input) {
    if (!isObj(input))
        return null;
    const common = ["schemaVersion", "commandId", "actorId", "instanceId", "expectedRevision", "action"];
    const actions = { "farm.plot.harvest": "plotId", "market.order.fulfil": "orderId", "farm.parcel.purchase": "parcelId" };
    if (typeof input.action !== "string" || !Object.hasOwn(actions, input.action))
        return null;
    const target = actions[input.action];
    if (Object.keys(input).length !== common.length + 1 || Object.keys(input).some(k => !common.includes(k) && k !== target))
        return null;
    if (input.schemaVersion !== VERSION || !id(input.commandId) || !id(input.actorId) || !id(input.instanceId) ||
        !int(input.expectedRevision) || !id(input[target]))
        return null;
    return input;
}
function fingerprint(c) {
    return JSON.stringify([c.action, c.expectedRevision, c.plotId ?? null, c.orderId ?? null, c.parcelId ?? null]);
}
function neighbours(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}
export function applyCommand(runtime, input) {
    const command = parse(input);
    if (command) {
        const key = [command.instanceId, command.actorId, command.commandId].join(":");
        const existing = runtime.dedup.find(d => d.key === key);
        if (existing && existing.fingerprint === fingerprint(command)) {
            return { runtime, decision: structuredClone(existing.decision), duplicate: true };
        }
    }
    const next = structuredClone(runtime);
    const farm = command ? next.base.farms.find(f => f.instanceId === command.instanceId) : undefined;
    const economy = command ? next.economies.find(e => e.instanceId === command.instanceId) : undefined;
    const prior = farm?.revision ?? null;
    let reason = null;
    let events = [];
    if (!command)
        reason = "INVALID_COMMAND";
    else if (runtime.dedup.some(d => d.key === [command.instanceId, command.actorId, command.commandId].join(":")))
        reason = "COMMAND_ID_REUSE";
    else if (!farm || !economy)
        reason = "NOT_FOUND_OR_FORBIDDEN";
    else {
        const grant = next.base.grants.find(g => g.actorId === command.actorId && g.instanceId === command.instanceId);
        if (!grant)
            reason = "NOT_FOUND_OR_FORBIDDEN";
        else if (command.expectedRevision !== farm.revision)
            reason = "STALE_REVISION";
        else if (command.action !== "farm.plot.harvest" && grant.role !== "owner")
            reason = "ACTION_NOT_PERMITTED"; // test-only permission choice
        else if (command.action === "farm.plot.harvest") {
            const original = applyBase(next.base, {
                schemaVersion: FOUNDATION_VERSION, commandId: command.commandId, actorId: command.actorId,
                instanceId: command.instanceId, expectedRevision: command.expectedRevision,
                action: "farm.plot.harvest", plotId: command.plotId
            });
            next.base = original.runtime;
            if (original.decision.outcome === "accepted")
                events = original.decision.events;
            else
                reason = original.decision.reasonCode ?? "FOUNDATION_REJECTED";
        }
        else if (command.action === "market.order.fulfil") {
            const order = economy.orders.find(o => o.id === command.orderId);
            if (!order)
                reason = "ORDER_NOT_FOUND";
            else if (order.status !== "open")
                reason = "ORDER_ALREADY_FULFILLED";
            else if ((farm.inventory[order.productId] ?? 0) < order.quantity)
                reason = "INSUFFICIENT_INVENTORY";
            else if (!Number.isSafeInteger(economy.gold + order.rewardGold))
                reason = "GOLD_OVERFLOW";
            else {
                farm.inventory[order.productId] -= order.quantity;
                economy.gold += order.rewardGold;
                order.status = "fulfilled";
                farm.revision++;
                events = [
                    { kind: "market.order.fulfilled", orderId: order.id, productId: order.productId, quantity: order.quantity, rewardGold: order.rewardGold },
                    { kind: "farm.gold.changed", delta: order.rewardGold, newGold: economy.gold }
                ];
            }
        }
        else if (command.action === "farm.parcel.purchase") {
            const parcel = economy.parcels.find(p => p.id === command.parcelId);
            if (!parcel)
                reason = "PARCEL_NOT_FOUND";
            else if (parcel.owned)
                reason = "PARCEL_ALREADY_OWNED";
            else if (!economy.parcels.some(p => p.owned && neighbours(p, parcel)))
                reason = "NOT_ADJACENT";
            else if (parcel.purchasePrice === null)
                reason = "NOT_PURCHASABLE";
            else if (economy.gold < parcel.purchasePrice)
                reason = "INSUFFICIENT_GOLD";
            else {
                economy.gold -= parcel.purchasePrice;
                parcel.owned = true;
                farm.revision++;
                events = [
                    { kind: "farm.parcel.purchased", parcelId: parcel.id, costGold: parcel.purchasePrice },
                    { kind: "farm.gold.changed", delta: -parcel.purchasePrice, newGold: economy.gold },
                    ...parcel.features.map(f => ({
                        kind: "farm.feature.discovered", parcelId: parcel.id, featureId: f.id, featureKind: f.kind
                    }))
                ];
            }
        }
    }
    next.auditSequence++;
    const decision = {
        schemaVersion: VERSION, commandId: command?.commandId ?? null,
        actorId: command?.actorId ?? null, instanceId: command?.instanceId ?? null,
        action: command?.action ?? null, outcome: reason === null ? "accepted" : "rejected",
        previousRevision: prior, revision: command ? (next.base.farms.find(f => f.instanceId === command.instanceId)?.revision ?? null) : null,
        auditSequence: next.auditSequence, reasonCode: reason, events
    };
    next.audit.push(decision);
    if (command) {
        const key = [command.instanceId, command.actorId, command.commandId].join(":");
        if (!next.dedup.some(d => d.key === key)) {
            next.dedup.push({ key, fingerprint: fingerprint(command), decision: structuredClone(decision) });
        }
    }
    return { runtime: next, decision, duplicate: false };
}
/** "actorId" is only a fixture-policy selector. Not a verified logged-in identity. */
export function inspectFarm(runtime, instanceId, actorId) {
    const base = inspectBase(runtime.base, instanceId, actorId);
    const econ = runtime.economies.find(e => e.instanceId === instanceId);
    if (!econ)
        throw Error("NOT_FOUND_OR_FORBIDDEN");
    const parcels = econ.parcels.map(p => ({
        id: p.id, x: p.x, y: p.y, biomeId: p.biomeId, owned: p.owned, purchasePrice: p.purchasePrice,
        features: p.owned ? structuredClone(p.features) : [] // unowned entrance remains undiscovered
    })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const availableEntrances = parcels.filter(p => p.owned).flatMap(p => p.features).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const orders = structuredClone(econ.orders).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const latest = [...runtime.audit].reverse().find(a => a.instanceId === instanceId) ?? null;
    return {
        schemaVersion: VERSION, source: "deterministic-fixture", instanceId, revision: base.revision,
        worldMode: "farm", gold: econ.gold, plots: base.plots, inventory: base.inventory,
        parcels, orders, availableEntrances, lastDecision: latest ? structuredClone(latest) : null
    };
}
const esc = (s) => s.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[ch]));
/** SVG contains semantic parcel, plot and discovered-entrance IDs, no scripts or external assets. */
export function renderSvg(model) {
    const cell = 170, pad = 24, header = 100;
    const maxX = Math.max(...model.parcels.map(p => p.x)), maxY = Math.max(...model.parcels.map(p => p.y));
    const width = pad * 2 + (maxX + 1) * cell, height = header + pad + (maxY + 1) * cell;
    const shapes = model.parcels.map(p => {
        const x = pad + p.x * cell, y = header + p.y * cell;
        const owned = p.owned ? "owned" : "unowned";
        const colour = p.owned ? "#dceecf" : "#e8e8e8";
        const lines = [
            '<g id="parcel-' + esc(p.id) + '" data-kind="land-parcel" data-owned="' + owned + '">',
            '<title>' + esc(p.id) + ' ' + owned + '</title>',
            '<rect x="' + x + '" y="' + y + '" width="' + (cell - 4) + '" height="' + (cell - 4) + '" fill="' + colour + '" stroke="#333"/>',
            '<text x="' + (x + 8) + '" y="' + (y + 20) + '" font-size="14">' + esc(p.id) + '</text>',
            '<text x="' + (x + 8) + '" y="' + (y + 38) + '" font-size="12">' + owned + ' (' + p.x + ',' + p.y + ')</text>'
        ];
        for (const pl of model.plots.filter(pl => pl.parcelId === p.id)) {
            lines.push('<g id="plot-' + esc(pl.id) + '" data-kind="crop-plot" data-status="' + pl.cropStatus + '">');
            lines.push('<title>' + esc(pl.label) + '</title>');
            lines.push('<circle cx="' + (x + 26) + '" cy="' + (y + 77) + '" r="10" fill="' + (pl.cropStatus === "ready" ? "#3d8c3d" : "#777") + '"/>');
            lines.push('<text x="' + (x + 43) + '" y="' + (y + 81) + '" font-size="12">' + esc(pl.id) + ' ' + esc(pl.cropStatus) + '</text></g>');
        }
        for (const f of p.features) {
            lines.push('<g id="entrance-' + esc(f.id) + '" data-kind="dungeon-entrance">');
            lines.push('<title>' + esc(f.dungeonDefinitionId) + '</title>');
            lines.push('<rect x="' + (x + 10) + '" y="' + (y + 109) + '" width="17" height="18" fill="#54406b"/>');
            lines.push('<text x="' + (x + 34) + '" y="' + (y + 123) + '" font-size="11">Dungeon: ' + esc(f.id) + '</text></g>');
        }
        lines.push('</g>');
        return lines.join("\n");
    }).join("\n");
    return [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '" role="img">',
        '<title>R08 farm ' + esc(model.instanceId) + '</title>',
        '<desc>Semantic land parcels at revision ' + model.revision + '; owned parcels reveal dungeon entrances</desc>',
        '<rect width="100%" height="100%" fill="#fff"/>',
        '<text x="18" y="27" font-size="18">Farm ' + esc(model.instanceId) + '</text>',
        '<text x="18" y="49" font-size="14">Revision ' + model.revision + ' | Gold ' + model.gold + ' | Lucerne ' + (model.inventory.lucerne ?? 0) + '</text>',
        '<text x="18" y="69" font-size="12">Owned parcels: ' + model.parcels.filter(p => p.owned).length + ' | Entrances: ' + model.availableEntrances.length + '</text>',
        '<g id="farm-parcels">' + shapes + '</g>',
        '</svg>', ''
    ].join("\n");
}
export function replay(fixture, commands) {
    let runtime = createRuntime(fixture);
    const decisions = [];
    for (const c of commands) {
        const res = applyCommand(runtime, c);
        runtime = res.runtime;
        decisions.push(res.decision);
    }
    return { runtime, decisions };
}
