/**
 * R07-P0 isolated farm command experiment. No network, storage, clock, RNG or renderer dependencies.
 * Fixture grants model policy only: caller identity MUST be verified by a future server adapter.
 */
export const VERSION = "r07-p0/v1";
const ID = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;
const obj = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const id = (value) => typeof value === "string" && ID.test(value);
const int = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
function assert(condition, message) {
    if (!condition)
        throw new TypeError("R07-P0 INVALID_FIXTURE: " + message);
}
function validateFarm(value) {
    assert(obj(value) && value.schemaVersion === VERSION, "farm schemaVersion");
    assert(id(value.instanceId) && int(value.revision), "farm identity/revision");
    assert(int(value.width) && value.width >= 1 && value.width <= 16, "farm width 1..16");
    assert(int(value.height) && value.height >= 1 && value.height <= 16, "farm height 1..16");
    assert(Array.isArray(value.plots) && value.plots.length <= 64, "farm plots");
    assert(obj(value.inventory), "inventory object");
    for (const [item, quantity] of Object.entries(value.inventory)) {
        assert(id(item) && int(quantity), "inventory item/quantity");
    }
    const ids = new Set();
    for (const valuePlot of value.plots) {
        assert(obj(valuePlot), "plot object");
        assert(id(valuePlot.id) && !ids.has(valuePlot.id), "unique plot id");
        ids.add(valuePlot.id);
        assert(id(valuePlot.parcelId) && id(valuePlot.cropId), "plot references");
        assert(int(valuePlot.x) && valuePlot.x < value.width, "plot x");
        assert(int(valuePlot.y) && valuePlot.y < value.height, "plot y");
        assert(typeof valuePlot.label === "string" && valuePlot.label.length <= 120, "plot label");
        assert(valuePlot.cropStatus === "ready" || valuePlot.cropStatus === "harvested", "cropStatus");
        assert(int(valuePlot.yieldQuantity) && valuePlot.yieldQuantity <= 1000, "yieldQuantity");
    }
}
export function createRuntime(fixture) {
    assert(obj(fixture) && fixture.schemaVersion === VERSION, "fixture schemaVersion");
    assert(Array.isArray(fixture.farms) && fixture.farms.length >= 1 && fixture.farms.length <= 8, "farms array");
    assert(Array.isArray(fixture.grants) && fixture.grants.length <= 32, "grants array");
    const farmIds = new Set();
    for (const farm of fixture.farms) {
        validateFarm(farm);
        assert(!farmIds.has(farm.instanceId), "unique farm instance");
        farmIds.add(farm.instanceId);
    }
    const grantKeys = new Set();
    for (const grant of fixture.grants) {
        assert(obj(grant), "grant object");
        assert(id(grant.actorId) && id(grant.instanceId) && farmIds.has(grant.instanceId), "grant target");
        assert(grant.role === "owner" || grant.role === "helper", "grant role");
        const key = grant.instanceId + ":" + grant.actorId;
        assert(!grantKeys.has(key), "unique actor grant");
        grantKeys.add(key);
    }
    return {
        schemaVersion: VERSION,
        farms: structuredClone(fixture.farms),
        grants: structuredClone(fixture.grants),
        audit: [], dedup: [], auditSequence: 0
    };
}
function readCommand(input) {
    if (!obj(input))
        return null;
    const allowed = ["schemaVersion", "commandId", "actorId", "instanceId", "expectedRevision", "action", "plotId"];
    if (Object.keys(input).some(k => !allowed.includes(k)))
        return null;
    if (input.schemaVersion !== VERSION || !id(input.commandId) || !id(input.actorId) ||
        !id(input.instanceId) || !int(input.expectedRevision) ||
        input.action !== "farm.plot.harvest" || !id(input.plotId))
        return null;
    return input;
}
function decision(sequence, command, farm, outcome, reasonCode, events) {
    return {
        schemaVersion: VERSION, commandId: command?.commandId ?? null,
        actorId: command?.actorId ?? null, instanceId: command?.instanceId ?? null,
        outcome, previousRevision: farm?.revision ?? null,
        revision: farm ? farm.revision + (outcome === "accepted" ? 1 : 0) : null,
        auditSequence: sequence, reasonCode, events
    };
}
/** Applying one command never mutates the supplied runtime. Caller serializes commands per instance. */
export function applyCommand(runtime, input) {
    const command = readCommand(input);
    if (command) {
        const key = [command.instanceId, command.actorId, command.commandId].join(":");
        const fingerprint = JSON.stringify([command.expectedRevision, command.action, command.plotId]);
        const old = runtime.dedup.find(x => x.key === key);
        if (old && old.fingerprint === fingerprint) {
            return { runtime, decision: structuredClone(old.decision), duplicate: true };
        }
        if (old) {
            const next = structuredClone(runtime);
            next.auditSequence++;
            const found = next.farms.find(f => f.instanceId === command.instanceId);
            const denied = decision(next.auditSequence, command, found, "rejected", "COMMAND_ID_REUSE", []);
            next.audit.push(denied);
            return { runtime: next, decision: denied, duplicate: false };
        }
    }
    const next = structuredClone(runtime);
    const farm = command ? next.farms.find(f => f.instanceId === command.instanceId) : undefined;
    let reason = null;
    let events = [];
    if (!command)
        reason = "INVALID_COMMAND";
    else if (!farm)
        reason = "NOT_FOUND_OR_FORBIDDEN";
    else if (!next.grants.some(g => g.actorId === command.actorId && g.instanceId === farm.instanceId)) {
        reason = "NOT_FOUND_OR_FORBIDDEN";
    }
    else if (command.expectedRevision !== farm.revision)
        reason = "STALE_REVISION";
    else {
        const plot = farm.plots.find(p => p.id === command.plotId);
        if (!plot)
            reason = "PLOT_NOT_FOUND";
        else if (plot.cropStatus !== "ready")
            reason = "PLOT_NOT_READY";
        else if (!Number.isSafeInteger((farm.inventory[plot.cropId] ?? 0) + plot.yieldQuantity)) {
            reason = "INVENTORY_OVERFLOW";
        }
        else {
            plot.cropStatus = "harvested";
            farm.inventory[plot.cropId] = (farm.inventory[plot.cropId] ?? 0) + plot.yieldQuantity;
            events = [{ kind: "farm.plot.harvested", plotId: plot.id, cropId: plot.cropId, quantity: plot.yieldQuantity }];
        }
    }
    next.auditSequence++;
    const response = decision(next.auditSequence, command, farm, reason === null ? "accepted" : "rejected", reason, events);
    if (reason === null && farm)
        farm.revision++;
    next.audit.push(response);
    if (command) {
        const key = [command.instanceId, command.actorId, command.commandId].join(":");
        const fingerprint = JSON.stringify([command.expectedRevision, command.action, command.plotId]);
        next.dedup.push({ key, fingerprint, decision: structuredClone(response) });
    }
    return { runtime: next, decision: response, duplicate: false };
}
/** The actor identity is assumed verified by the caller; fixture grants are NOT authentication. */
export function inspectFarm(runtime, instanceId, actorId) {
    const farm = runtime.farms.find(f => f.instanceId === instanceId);
    if (!farm || !runtime.grants.some(g => g.instanceId === instanceId && g.actorId === actorId)) {
        throw new Error("NOT_FOUND_OR_FORBIDDEN");
    }
    const lastDecision = [...runtime.audit].reverse().find(d => d.instanceId === instanceId) ?? null;
    return {
        schemaVersion: VERSION, source: "authoritative-fixture",
        worldMode: "farm", instanceId: farm.instanceId, revision: farm.revision,
        width: farm.width, height: farm.height,
        plots: farm.plots.map(p => ({
            id: p.id, parcelId: p.parcelId, x: p.x, y: p.y, label: p.label,
            cropId: p.cropId, cropStatus: p.cropStatus
        })).sort((a, b) => a.id.localeCompare(b.id, "en")),
        inventory: Object.fromEntries(Object.entries(farm.inventory).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)),
        lastDecision: lastDecision ? structuredClone(lastDecision) : null
    };
}
const xml = (value) => value.replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
}[char]));
export function renderSvg(model) {
    const unit = 100, top = 82, left = 35;
    const width = left * 2 + model.width * unit;
    const height = top + model.height * unit + 45;
    const cells = model.plots.map(p => {
        const x = left + p.x * unit, y = top + p.y * unit;
        const status = p.cropStatus === "ready" ? "Ready" : "Harvested";
        const colour = p.cropStatus === "ready" ? "#bbdd99" : "#dddddd";
        return [
            '<g id="plot-' + xml(p.id) + '" data-kind="crop-plot" data-status="' + p.cropStatus + '">',
            "<title>" + xml(p.label) + " at (" + p.x + "," + p.y + ")</title>",
            "<desc>Plot " + xml(p.id) + ", parcel " + xml(p.parcelId) + ", " + xml(p.cropId) + ", " + status + "</desc>",
            '<rect x="' + (x + 3) + '" y="' + (y + 3) + '" width="94" height="94" fill="' + colour + '" stroke="#454545"/>',
            '<text x="' + (x + 8) + '" y="' + (y + 23) + '" font-size="12">' + xml(p.label) + "</text>",
            '<text x="' + (x + 8) + '" y="' + (y + 43) + '" font-size="12">' + xml(p.id) + "</text>",
            '<text x="' + (x + 8) + '" y="' + (y + 63) + '" font-size="12">' + status + "</text>",
            "</g>"
        ].join("\n");
    }).join("\n");
    const grid = Array.from({ length: model.width * model.height }, (_, i) => {
        const x = left + (i % model.width) * unit;
        const y = top + Math.floor(i / model.width) * unit;
        return '<rect x="' + x + '" y="' + y + '" width="100" height="100" fill="#f4f1e9" stroke="#999"/>';
    }).join("\n");
    return [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '" role="img">',
        "<title>R07 P0 inspect farm " + xml(model.instanceId) + "</title>",
        "<desc>Headless schematic of authoritative fixture " + xml(model.instanceId) + " at revision " + model.revision + "</desc>",
        '<rect width="100%" height="100%" fill="#fff"/>',
        '<text x="18" y="28" font-size="17">Farm ' + xml(model.instanceId) + "</text>",
        '<text x="18" y="50" font-size="13">Revision ' + model.revision + " | SVG inspection, not WebGL</text>",
        '<g id="terrain-grid">' + grid + "</g>",
        '<g id="farm-plots">' + cells + "</g>",
        "</svg>", ""
    ].join("\n");
}
export function replay(fixture, commands) {
    let runtime = createRuntime(fixture);
    const decisions = [];
    for (const command of commands) {
        const result = applyCommand(runtime, command);
        runtime = result.runtime;
        decisions.push(result.decision);
    }
    return { runtime, decisions };
}
