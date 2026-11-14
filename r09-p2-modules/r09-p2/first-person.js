const vectors = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
export function renderFacingSvg(m) {
    const p = m.player, d = m.dungeon;
    if (m.mode !== "dungeon" || !d || !p.position || !p.facing) {
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 290" role="img">' +
            '<title>Farm mode</title><rect width="480" height="290" fill="#244329"/>' +
            '<text x="240" y="130" font-size="22" fill="white" text-anchor="middle">On the farm</text>' +
            '<text x="240" y="160" font-size="14" fill="#f1deb6" text-anchor="middle">' +
            'Enter the unlocked dungeon to explore</text></svg>';
    }
    const dx = vectors[p.facing][0], dy = vectors[p.facing][1];
    const cell = (x, y) => d.walkable.some(t => t.x === x && t.y === y);
    const ahead = Array.from({ length: 3 }, (_, i) => {
        const distance = i + 1;
        return { distance, x: p.position.x + dx * distance, y: p.position.y + dy * distance,
            walkable: cell(p.position.x + dx * distance, p.position.y + dy * distance) };
    });
    const stop = ahead.find(a => !a.walkable)?.distance ?? 4;
    const shapes = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 290" role="img">',
        '<title>R09 P2 facing ' + p.facing + '</title>',
        '<rect width="480" height="290" fill="#171e27"/>',
        '<path d="M0 0 L480 0 L380 92 L100 92 Z" fill="#273646"/>',
        '<path d="M0 290 L480 290 L380 198 L100 198 Z" fill="#5c5143"/>',
        '<path d="M0 0 L100 92 L100 198 L0 290 Z" fill="#394956"/>',
        '<path d="M480 0 L380 92 L380 198 L480 290 Z" fill="#394956"/>',
        '<rect x="100" y="92" width="280" height="106" fill="#1b2730" stroke="#98a7a8" stroke-width="2"/>'
    ];
    for (let distance = 3; distance >= 1; distance--) {
        if (distance > stop)
            continue;
        const inset = distance === 3 ? 170 : distance === 2 ? 123 : 62;
        const y = Math.round(inset * .48), w = 480 - 2 * inset, h = 290 - 2 * y;
        if (distance === stop) {
            shapes.push('<rect x="' + inset + '" y="' + y + '" width="' + w + '" height="' + h +
                '" fill="#69727b" stroke="#a8b1b9" stroke-width="3"/>');
            shapes.push('<path d="M' + inset + ' ' + y + ' l' + w + ' ' + h +
                ' M' + (inset + w) + ' ' + y + ' l-' + w + ' ' + h + '" stroke="#7f8993" stroke-width="2"/>');
            shapes.push('<text x="240" y="' + (y + h / 2 + 5) +
                '" font-size="15" fill="#151e25" text-anchor="middle">WALL</text>');
        }
        else {
            shapes.push('<rect x="' + inset + '" y="' + y + '" width="' + w + '" height="' + h +
                '" fill="none" stroke="#708c95" stroke-width="3"/>');
        }
    }
    for (let dist = Math.min(stop - 1, 3); dist >= 1; dist--) {
        const x = p.position.x + dx * dist, y = p.position.y + dy * dist;
        const scale = dist === 1 ? 1 : dist === 2 ? .63 : .4;
        const radius = 35 * scale;
        if (d.enemy.status === "alive" && d.enemy.position.x === x && d.enemy.position.y === y) {
            shapes.push('<circle cx="240" cy="155" r="' + radius +
                '" fill="#c75553" stroke="#ffb0ab" stroke-width="3"/>');
            shapes.push('<text x="240" y="159" text-anchor="middle" font-size="15" fill="white">ENEMY</text>');
        }
        if (d.chest.position.x === x && d.chest.position.y === y) {
            shapes.push('<rect x="' + (240 - radius) + '" y="' + (155 - radius / 2) + '" width="' + radius * 2 +
                '" height="' + radius + '" fill="' + (d.chest.opened ? "#93886d" : "#bc8b30") +
                '" stroke="#f1d49e"/>');
        }
    }
    // R09 engagement occurs when player reaches the enemy tile, so the
    // facing diagram must still draw an obvious on-tile enemy during combat.
    if (d.engaged && d.enemy.status === "alive" &&
        d.enemy.position.x === p.position.x && d.enemy.position.y === p.position.y) {
        shapes.push('<circle cx="240" cy="151" r="62" fill="#c75553" stroke="#ffcdc4" stroke-width="5"/>');
        shapes.push('<text x="240" y="146" text-anchor="middle" font-size="18" fill="white">ENGAGED</text>');
        shapes.push('<text x="240" y="170" text-anchor="middle" font-size="13" fill="white">Enemy ' + d.enemy.health + ' HP</text>');
    }
    const underChest = d.chest.position.x === p.position.x && d.chest.position.y === p.position.y;
    shapes.push('<rect x="0" y="0" width="480" height="36" fill="#101b25" fill-opacity=".9"/>');
    shapes.push('<text x="14" y="24" font-size="16" fill="#f0ecd2">Facing ' +
        p.facing + ' · Tile (' + p.position.x + ',' + p.position.y + ')</text>');
    shapes.push('<rect x="0" y="254" width="480" height="36" fill="#101b25" fill-opacity=".9"/>');
    shapes.push('<text x="12" y="277" font-size="13" fill="#cfe6e8">Ahead: ' +
        (stop === 1 ? "wall" : stop <= 3 ? "wall in " + stop + " tiles" : "corridor") +
        (underChest ? " · CHEST AT YOUR FEET" : "") + '</text></svg>');
    return shapes.join("\n");
}
