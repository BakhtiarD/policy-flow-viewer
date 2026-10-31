const { test } = require('node:test');
const assert = require('node:assert/strict');

const core = require('../media/modules/routing-core');

/* ============ chooseEdge ============ */

test('chooseEdge: target right with gap → E', () => {
    const a = { x: 0, y: 0, w: 100, h: 50 };
    const b = { x: 300, y: 0, w: 100, h: 50 };
    assert.equal(core.chooseEdge(a, b), 'E');
});

test('chooseEdge: target left with gap → W', () => {
    const a = { x: 300, y: 0, w: 100, h: 50 };
    const b = { x: 0, y: 0, w: 100, h: 50 };
    assert.equal(core.chooseEdge(a, b), 'W');
});

test('chooseEdge: target below with gap → S', () => {
    const a = { x: 0, y: 0, w: 100, h: 50 };
    const b = { x: 0, y: 300, w: 100, h: 50 };
    assert.equal(core.chooseEdge(a, b), 'S');
});

test('chooseEdge: target above with gap → N', () => {
    const a = { x: 0, y: 300, w: 100, h: 50 };
    const b = { x: 0, y: 0, w: 100, h: 50 };
    assert.equal(core.chooseEdge(a, b), 'N');
});

/* ============ pointOnEdge ============ */

test('pointOnEdge: E offset 0', () => {
    const r = { x: 0, y: 0, w: 100, h: 50 };
    assert.deepEqual(core.pointOnEdge(r, 'E', 0), { x: 100, y: 25 });
});

test('pointOnEdge: E offset 10', () => {
    const r = { x: 0, y: 0, w: 100, h: 50 };
    assert.deepEqual(core.pointOnEdge(r, 'E', 10), { x: 100, y: 35 });
});

test('pointOnEdge: N offset -5', () => {
    const r = { x: 0, y: 0, w: 100, h: 50 };
    assert.deepEqual(core.pointOnEdge(r, 'N', -5), { x: 45, y: 0 });
});

test('pointOnEdge: W offset 0', () => {
    const r = { x: 0, y: 0, w: 100, h: 50 };
    assert.deepEqual(core.pointOnEdge(r, 'W', 0), { x: 0, y: 25 });
});

test('pointOnEdge: S offset 0', () => {
    const r = { x: 0, y: 0, w: 100, h: 50 };
    assert.deepEqual(core.pointOnEdge(r, 'S', 0), { x: 50, y: 50 });
});

test('pointOnEdge: unknown edge → S', () => {
    const r = { x: 0, y: 0, w: 100, h: 50 };
    assert.deepEqual(core.pointOnEdge(r, 'X', 0), { x: 50, y: 50 });
});

/* ============ rectsIntersect ============ */

test('rectsIntersect: overlapping', () => {
    const a = { x: 0, y: 0, w: 100, h: 100 };
    const b = { x: 50, y: 50, w: 100, h: 100 };
    assert.equal(core.rectsIntersect(a, b), true);
});

test('rectsIntersect: apart', () => {
    const a = { x: 0, y: 0, w: 100, h: 100 };
    const b = { x: 200, y: 0, w: 100, h: 100 };
    assert.equal(core.rectsIntersect(a, b), false);
});

test('rectsIntersect: touching edges', () => {
    const a = { x: 0, y: 0, w: 100, h: 100 };
    const b = { x: 100, y: 0, w: 100, h: 100 };
    assert.equal(core.rectsIntersect(a, b), true);
});

/* ============ simplifyOrtho ============ */

test('simplifyOrtho: removes duplicate points', () => {
    const pts = [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 100, y: 0 }
    ];
    assert.deepEqual(core.simplifyOrtho(pts), [{ x: 0, y: 0 }, { x: 100, y: 0 }]);
});

test('simplifyOrtho: removes collinear horizontal middle', () => {
    const pts = [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 0 }
    ];
    assert.deepEqual(core.simplifyOrtho(pts), [{ x: 0, y: 0 }, { x: 100, y: 0 }]);
});

test('simplifyOrtho: keeps corners', () => {
    const pts = [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 50 }
    ];
    assert.deepEqual(core.simplifyOrtho(pts), [
        { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }
    ]);
});

/* ============ buildRoundedPath ============ */

test('buildRoundedPath: two points → straight line', () => {
    const d = core.buildRoundedPath([{ x: 0, y: 0 }, { x: 100, y: 0 }], 10);
    assert.equal(d, 'M 0 0 L 100 0');
});

test('buildRoundedPath: L-shape with corner', () => {
    const d = core.buildRoundedPath([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 }
    ], 10);
    assert.ok(d.startsWith('M 0 0'));
    assert.ok(d.includes(' Q '));
    assert.ok(d.endsWith('100 100'));
});

test('buildRoundedPath: <2 points → empty', () => {
    assert.equal(core.buildRoundedPath([], 10), '');
    assert.equal(core.buildRoundedPath([{ x: 0, y: 0 }], 10), '');
});

/* ============ routeBetween ============ */

test('routeBetween: aligned states — straight line', () => {
    const aR = { x: 0, y: 0, w: 100, h: 50 };
    const bR = { x: 200, y: 0, w: 100, h: 50 };
    const p1 = core.pointOnEdge(aR, 'E', 0);
    const p2 = core.pointOnEdge(bR, 'W', 0);
    const wps = core.routeBetween(p1, p2, 'E', 'W', aR, bR, []);
    assert.equal(wps.length, 2);
    assert.deepEqual(wps[0], p1);
    assert.deepEqual(wps[1], p2);
});

test('routeBetween: L-shape between offset states', () => {
    const aR = { x: 0, y: 0, w: 100, h: 50 };
    const bR = { x: 300, y: 200, w: 100, h: 50 };
    const p1 = core.pointOnEdge(aR, 'E', 0);
    const p2 = core.pointOnEdge(bR, 'W', 0);
    const wps = core.routeBetween(p1, p2, 'E', 'W', aR, bR, []);
    assert.ok(wps.length >= 3);
    assert.deepEqual(wps[0], p1);
    assert.deepEqual(wps[wps.length - 1], p2);
});

/* ============ computeStubs ============ */

test('computeStubs: E/W', () => {
    const { p1out, p2out } = core.computeStubs({ x: 0, y: 0 }, { x: 100, y: 0 }, 'E', 'W');
    assert.equal(p1out.x, 18);
    assert.equal(p2out.x, 82);
});

test('computeStubs: N/S', () => {
    const { p1out, p2out } = core.computeStubs({ x: 0, y: 100 }, { x: 0, y: 0 }, 'N', 'S');
    assert.equal(p1out.y, 82);
    assert.equal(p2out.y, 18);
});

/* ============ labelFromWaypoints ============ */

test('labelFromWaypoints: horizontal', () => {
    const lbl = core.labelFromWaypoints([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    assert.equal(lbl.x, 50);
    assert.equal(lbl.y, 0);
    assert.equal(lbl.orientation, 'h');
});

test('labelFromWaypoints: vertical', () => {
    const lbl = core.labelFromWaypoints([{ x: 0, y: 0 }, { x: 0, y: 100 }]);
    assert.equal(lbl.orientation, 'v');
});

test('labelFromWaypoints: <2 points → null', () => {
    assert.equal(core.labelFromWaypoints([{ x: 0, y: 0 }]), null);
    assert.equal(core.labelFromWaypoints([]), null);
});

/* ============ segPerp / distToSegment / findSegmentIndex ============ */

test('segPerp: horizontal segment → (0, 1)', () => {
    const p = core.segPerp({ x: 0, y: 0 }, { x: 100, y: 0 });
    assert.ok(Math.abs(p.x) < 1e-9, 'x ≈ 0, got ' + p.x);
    assert.equal(p.y, 1);
});

test('segPerp: vertical segment → (-1, 0)', () => {
    const p = core.segPerp({ x: 0, y: 0 }, { x: 0, y: 100 });
    assert.equal(p.x, -1);
    assert.ok(Math.abs(p.y) < 1e-9, 'y ≈ 0, got ' + p.y);
});

test('distToSegment: point above middle', () => {
    const d = core.distToSegment({ x: 50, y: 10 }, { x: 0, y: 0 }, { x: 100, y: 0 });
    assert.equal(d, 10);
});

test('distToSegment: point before start', () => {
    const d = core.distToSegment({ x: -10, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 });
    assert.equal(d, 10);
});

test('findSegmentIndex: point near first segment', () => {
    const wps = [
        { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }
    ];
    const idx = core.findSegmentIndex(wps, { x: 50, y: 5 });
    assert.equal(idx, 0);
});

/* ============ findNearestEdge / snapToEdge ============ */

test('findNearestEdge: point right of rect → E', () => {
    const r = { x: 0, y: 0, w: 100, h: 50 };
    assert.equal(core.findNearestEdge(r, { x: 120, y: 25 }), 'E');
});

test('snapToEdge: clamps to PAD from corners', () => {
    const r = { x: 0, y: 0, w: 100, h: 50 };
    const p = core.snapToEdge(r, 'E', { x: 500, y: -100 });
    assert.equal(p.x, 100);
    assert.equal(p.y, 10);
});

/* ============ chooseEdgePair ============ */

test('chooseEdgePair: horizontal dominance → E/N', () => {
    const a = { x: 0, y: 0, w: 100, h: 50 };
    const b = { x: 300, y: 100, w: 100, h: 50 };
    const r = core.chooseEdgePair(a, b);
    assert.equal(r.start, 'E');
    assert.equal(r.end, 'N');
});

test('chooseEdgePair: vertical dominance → S/W', () => {
    const a = { x: 0, y: 0, w: 100, h: 50 };
    const b = { x: 100, y: 300, w: 100, h: 50 };
    const r = core.chooseEdgePair(a, b);
    assert.equal(r.start, 'S');
    assert.equal(r.end, 'W');
});