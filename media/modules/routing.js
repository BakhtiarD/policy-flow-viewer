(function () {
    'use strict';

    window.PF = window.PF || {};

    const BASE_STATE_W = 160;
    const BASE_STATE_H = 50;
    const EDGE_PAD = 10;

    /* ============================================================
     * ГЕОМЕТРИЯ
     * ============================================================ */

    function rectsIntersect(a, b) {
        return !(a.x + a.w < b.x || b.x + b.w < a.x ||
            a.y + a.h < b.y || b.y + b.h < a.y);
    }

    function chooseEdge(fromRect, toRect) {
        const fcx = fromRect.x + fromRect.w / 2;
        const fcy = fromRect.y + fromRect.h / 2;
        const tcx = toRect.x + toRect.w / 2;
        const tcy = toRect.y + toRect.h / 2;
        const dx = tcx - fcx, dy = tcy - fcy;

        const gapX = (dx >= 0)
            ? toRect.x - (fromRect.x + fromRect.w)
            : fromRect.x - (toRect.x + toRect.w);
        const gapY = (dy >= 0)
            ? toRect.y - (fromRect.y + fromRect.h)
            : fromRect.y - (toRect.y + toRect.h);

        const MIN_GAP = 30;

        if (gapX >= MIN_GAP && gapX >= gapY) return dx >= 0 ? 'E' : 'W';
        if (gapY >= MIN_GAP) return dy >= 0 ? 'S' : 'N';
        if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'E' : 'W';
        return dy >= 0 ? 'S' : 'N';
    }

    function pointOnEdge(rect, edge, offset) {
        const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
        if (edge === 'E') return { x: rect.x + rect.w, y: cy + offset };
        if (edge === 'W') return { x: rect.x, y: cy + offset };
        if (edge === 'N') return { x: cx + offset, y: rect.y };
        return { x: cx + offset, y: rect.y + rect.h };
    }

    function findNearestEdge(rect, pt) {
        const dTop = Math.abs(pt.y - rect.y);
        const dBottom = Math.abs(pt.y - (rect.y + rect.h));
        const dLeft = Math.abs(pt.x - rect.x);
        const dRight = Math.abs(pt.x - (rect.x + rect.w));
        const min = Math.min(dTop, dBottom, dLeft, dRight);
        if (min === dTop) return 'N';
        if (min === dBottom) return 'S';
        if (min === dLeft) return 'W';
        return 'E';
    }

    function snapToEdge(rect, edge, pt) {
        const PAD = 10;
        if (edge === 'N') {
            return {
                x: Math.min(Math.max(pt.x, rect.x + PAD), rect.x + rect.w - PAD),
                y: rect.y
            };
        }
        if (edge === 'S') {
            return {
                x: Math.min(Math.max(pt.x, rect.x + PAD), rect.x + rect.w - PAD),
                y: rect.y + rect.h
            };
        }
        if (edge === 'W') {
            return {
                x: rect.x,
                y: Math.min(Math.max(pt.y, rect.y + PAD), rect.y + rect.h - PAD)
            };
        }
        return {
            x: rect.x + rect.w,
            y: Math.min(Math.max(pt.y, rect.y + PAD), rect.y + rect.h - PAD)
        };
    }

    function simplifyOrtho(pts) {
        const out = [];
        for (const p of pts) {
            const last = out[out.length - 1];
            if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
            out.push({ x: p.x, y: p.y });
        }
        const res = [];
        for (let i = 0; i < out.length; i++) {
            if (i > 0 && i < out.length - 1) {
                const a = out[i - 1], b = out[i], c = out[i + 1];
                if ((Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - c.x) < 0.01) ||
                    (Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01)) continue;
            }
            res.push(out[i]);
        }
        return res;
    }

    function buildRoundedPath(points, radius) {
        if (!points || points.length < 2) return '';
        const R = Math.max(2, radius || 10);
        let d = 'M ' + points[0].x + ' ' + points[0].y;

        for (let i = 1; i < points.length - 1; i++) {
            const prev = points[i - 1];
            const cur = points[i];
            const next = points[i + 1];

            const d1 = Math.hypot(cur.x - prev.x, cur.y - prev.y);
            const d2 = Math.hypot(next.x - cur.x, next.y - cur.y);
            if (d1 < 0.5 || d2 < 0.5) continue;

            const rr = Math.min(R, d1 / 2, d2 / 2);
            const start = {
                x: cur.x - (cur.x - prev.x) * (rr / d1),
                y: cur.y - (cur.y - prev.y) * (rr / d1)
            };
            const end = {
                x: cur.x + (next.x - cur.x) * (rr / d2),
                y: cur.y + (next.y - cur.y) * (rr / d2)
            };
            d += ' L ' + start.x + ' ' + start.y;
            d += ' Q ' + cur.x + ' ' + cur.y + ' ' + end.x + ' ' + end.y;
        }

        const last = points[points.length - 1];
        d += ' L ' + last.x + ' ' + last.y;
        return d;
    }

    /* ============================================================
     * МАРШРУТИЗАЦИЯ
     * ============================================================ */

    function computeStubs(p1, p2, startEdge, endEdge) {
        const stub = 18;
        const p1out = { x: p1.x, y: p1.y };
        const p2out = { x: p2.x, y: p2.y };

        if (startEdge === 'E') p1out.x = p1.x + stub;
        else if (startEdge === 'W') p1out.x = p1.x - stub;
        else if (startEdge === 'S') p1out.y = p1.y + stub;
        else if (startEdge === 'N') p1out.y = p1.y - stub;

        if (endEdge === 'E') p2out.x = p2.x + stub;
        else if (endEdge === 'W') p2out.x = p2.x - stub;
        else if (endEdge === 'S') p2out.y = p2.y + stub;
        else if (endEdge === 'N') p2out.y = p2.y - stub;

        return { p1out, p2out };
    }

    function buildSimpleOrthoMiddle(p1out, p2out, startHoriz, endHoriz) {
        if (startHoriz && endHoriz) {
            const mx = (p1out.x + p2out.x) / 2;
            return [{ x: mx, y: p1out.y }, { x: mx, y: p2out.y }];
        }
        if (!startHoriz && !endHoriz) {
            const my = (p1out.y + p2out.y) / 2;
            return [{ x: p1out.x, y: my }, { x: p2out.x, y: my }];
        }
        if (startHoriz && !endHoriz) {
            return [{ x: p2out.x, y: p1out.y }];
        }
        return [{ x: p1out.x, y: p2out.y }];
    }

    function segmentHitsRect(a, b, r) {
        const pad = 4;
        const x1 = r.x - pad, y1 = r.y - pad;
        const x2 = r.x + r.w + pad, y2 = r.y + r.h + pad;

        if (Math.abs(a.y - b.y) < 0.5) {
            const y = a.y;
            if (y < y1 || y > y2) return false;
            const xmin = Math.min(a.x, b.x), xmax = Math.max(a.x, b.x);
            return !(xmax < x1 || xmin > x2);
        }
        if (Math.abs(a.x - b.x) < 0.5) {
            const x = a.x;
            if (x < x1 || x > x2) return false;
            const ymin = Math.min(a.y, b.y), ymax = Math.max(a.y, b.y);
            return !(ymax < y1 || ymin > y2);
        }
        return false;
    }

    function findFirstBlocker(points, obstacles, aRect, bRect) {
        for (let i = 1; i < points.length; i++) {
            const a = points[i - 1], b = points[i];
            for (const o of obstacles) {
                if (segmentHitsRect(a, b, o)) return o;
            }
            if (i > 1 && aRect && segmentHitsRect(a, b, aRect)) return aRect;
            if (i < points.length - 1 && bRect && segmentHitsRect(a, b, bRect)) return bRect;
        }
        return null;
    }

    function corridorHit(p1out, p2out, o) {
        const pad = 10;
        const minX = Math.min(p1out.x, p2out.x) - pad;
        const maxX = Math.max(p1out.x, p2out.x) + pad;
        const minY = Math.min(p1out.y, p2out.y) - pad;
        const maxY = Math.max(p1out.y, p2out.y) + pad;
        return !(o.x + o.w < minX || o.x > maxX || o.y + o.h < minY || o.y > maxY);
    }

    function buildDetourMiddle(p1out, p2out, startHoriz, endHoriz, obstacles, aRect, bRect) {
        const relevant = obstacles.filter(o => corridorHit(p1out, p2out, o));
        const rects = relevant.length ? relevant : obstacles;
        const margin = 24;
        const dx = p2out.x - p1out.x;
        const dy = p2out.y - p1out.y;
        const horizontal = Math.abs(dx) >= Math.abs(dy);

        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        for (const o of rects) {
            if (o.x < minX) minX = o.x;
            if (o.x + o.w > maxX) maxX = o.x + o.w;
            if (o.y < minY) minY = o.y;
            if (o.y + o.h > maxY) maxY = o.y + o.h;
        }

        const LEFT = minX - margin;
        const RIGHT = maxX + margin;
        const TOP = minY - margin;
        const BOTTOM = maxY + margin;

        function segHitsRectStrict(a, b, r) {
            if (!r) return false;
            const pad = 1;
            const x1 = r.x + pad, y1 = r.y + pad;
            const x2 = r.x + r.w - pad, y2 = r.y + r.h - pad;
            if (x1 >= x2 || y1 >= y2) return false;

            if (Math.abs(a.y - b.y) < 0.5) {
                const y = a.y;
                if (y < y1 || y > y2) return false;
                const xmin = Math.min(a.x, b.x), xmax = Math.max(a.x, b.x);
                return !(xmax < x1 || xmin > x2);
            }
            if (Math.abs(a.x - b.x) < 0.5) {
                const x = a.x;
                if (x < x1 || x > x2) return false;
                const ymin = Math.min(a.y, b.y), ymax = Math.max(a.y, b.y);
                return !(ymax < y1 || ymin > y2);
            }
            return false;
        }

        function pathCuts(pts) {
            for (let i = 0; i < pts.length - 1; i++) {
                const a = pts[i], b = pts[i + 1];
                if (i > 0 && segHitsRectStrict(a, b, aRect)) return true;
                if (i < pts.length - 2 && segHitsRectStrict(a, b, bRect)) return true;
            }
            return false;
        }

        const candidates = [];
        if (horizontal) {
            candidates.push([{ x: p1out.x, y: TOP }, { x: p2out.x, y: TOP }]);
            candidates.push([{ x: p1out.x, y: BOTTOM }, { x: p2out.x, y: BOTTOM }]);
        } else {
            candidates.push([{ x: LEFT, y: p1out.y }, { x: LEFT, y: p2out.y }]);
            candidates.push([{ x: RIGHT, y: p1out.y }, { x: RIGHT, y: p2out.y }]);
        }

        for (const mid of candidates) {
            if (!pathCuts([p1out, ...mid, p2out])) return mid;
        }

        const cost = (mid) => {
            const full = [p1out, ...mid, p2out];
            let c = 0;
            for (let i = 0; i < full.length - 1; i++) {
                c += Math.abs(full[i].x - full[i + 1].x) + Math.abs(full[i].y - full[i + 1].y);
            }
            return c;
        };
        candidates.sort((m1, m2) => cost(m1) - cost(m2));
        return candidates[0];
    }

    function segmentBlockedBetween(a, b, obstacles) {
        const minX = Math.min(a.x + a.w, b.x) - 2;
        const maxX = Math.max(a.x, b.x + b.w) + 2;
        const minY = Math.min(a.y + a.h, b.y) - 2;
        const maxY = Math.max(a.y, b.y + b.h) + 2;
        for (const o of obstacles) {
            if (o === a || o === b) continue;
            if (!(o.x + o.w < minX || o.x > maxX || o.y + o.h < minY || o.y > maxY)) {
                return true;
            }
        }
        return false;
    }

    function routeBetween(p1, p2, startEdge, endEdge, aRect, bRect, allRects) {
        const startHoriz = (startEdge === 'E' || startEdge === 'W');
        const endHoriz = (endEdge === 'E' || endEdge === 'W');
        const obstacles = (allRects || []).filter(r => r !== aRect && r !== bRect);

        const dy = Math.abs(p1.y - p2.y);
        const dx = Math.abs(p1.x - p2.x);
        const alignedH = startHoriz && endHoriz && dy < 2;
        const alignedV = !startHoriz && !endHoriz && dx < 2;
        const sameRow = Math.abs(aRect.y - bRect.y) < 2;
        const sameCol = Math.abs(aRect.x - bRect.x) < 2;

        if ((alignedH || alignedV) && (sameRow || sameCol) &&
            !segmentBlockedBetween(aRect, bRect, obstacles)) {
            return [{ x: p1.x, y: p1.y }, { x: p2.x, y: p2.y }];
        }

        const { p1out, p2out } = computeStubs(p1, p2, startEdge, endEdge);

        let middle = buildSimpleOrthoMiddle(p1out, p2out, startHoriz, endHoriz);
        const blocker = findFirstBlocker([p1out, ...middle, p2out], obstacles, aRect, bRect);
        if (blocker) {
            middle = buildDetourMiddle(p1out, p2out, startHoriz, endHoriz, obstacles, aRect, bRect);
        }
        return simplifyOrtho([p1, p1out, ...middle, p2out, p2]);
    }

    /* ============================================================
     * МЕТКИ И РАБОТА С СЕГМЕНТАМИ
     * ============================================================ */

    function labelFromWaypoints(waypoints) {
        if (!waypoints || waypoints.length < 2) return null;
        let best = 0, bestIdx = 0;
        for (let i = 1; i < waypoints.length; i++) {
            const a = waypoints[i - 1], b = waypoints[i];
            const d = Math.hypot(b.x - a.x, b.y - a.y);
            if (d > best) { best = d; bestIdx = i - 1; }
        }
        const a = waypoints[bestIdx], b = waypoints[bestIdx + 1];
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const isHorizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
        return { x: mx, y: my, orientation: isHorizontal ? 'h' : 'v' };
    }

    function segPerp(a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        return { x: -dy / len, y: dx / len };
    }

    function findSegmentIndex(waypoints, pt) {
        if (!waypoints || waypoints.length < 2) return -1;
        let best = -1, bestDist = Infinity;
        for (let i = 0; i < waypoints.length - 1; i++) {
            const a = waypoints[i], b = waypoints[i + 1];
            const d = distToSegment(pt, a, b);
            if (d < bestDist) { bestDist = d; best = i; }
        }
        return best;
    }

    function distToSegment(p, a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len2 = dx * dx + dy * dy;
        if (len2 < 0.0001) return Math.hypot(p.x - a.x, p.y - a.y);
        let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    }

    /* ============================================================
     * ГЛАВНЫЙ ПЕРЕСЧЁТ
     * ============================================================ */


    // Выбор граней для перехода из пары A↔B: делаем путь L-образным
    // (один перегиб) — выходим по доминирующей оси, входим по ортогональной.
    function chooseEdgePair(aRect, bRect) {
        const acx = aRect.x + aRect.w / 2;
        const acy = aRect.y + aRect.h / 2;
        const bcx = bRect.x + bRect.w / 2;
        const bcy = bRect.y + bRect.h / 2;
        const dx = bcx - acx;
        const dy = bcy - acy;

        if (Math.abs(dx) >= Math.abs(dy)) {
            return {
                start: dx >= 0 ? 'E' : 'W',
                end: dy >= 0 ? 'N' : 'S'
            };
        }
        return {
            start: dy >= 0 ? 'S' : 'N',
            end: dx >= 0 ? 'W' : 'E'
        };
    }

    function rerouteAll() {
        const gd = PF.state.graphData;
        if (!gd) return;
        const states = gd.states;
        const transitions = gd.transitions;
        const byName = {};
        states.forEach(s => byName[s.name] = s);
        const allRects = states.map(s => ({ x: s.x, y: s.y, w: s.w, h: s.h }));

        // 1. Базовые грани для каждого перехода
        // Определяем, кто в паре A↔B.
        const inPair = new Set();
        {
            const byPair = new Map();
            for (let i = 0; i < transitions.length; i++) {
                const t = transitions[i];
                if (t.manual) continue;
                const key = [t.from, t.to].sort().join('|');
                if (!byPair.has(key)) byPair.set(key, []);
                byPair.get(key).push(i);
            }
            for (const [, idxs] of byPair) {
                if (idxs.length !== 2) continue;
                inPair.add(idxs[0]);
                inPair.add(idxs[1]);
            }
        }

        const edges = transitions.map((t, i) => {
            const a = byName[t.from], b = byName[t.to];
            if (!a || !b) return null;
            if (inPair.has(i)) {
                return chooseEdgePair(a, b);
            }
            return { start: chooseEdge(a, b), end: chooseEdge(b, a) };
        });

        // 2. Группируем точки по (состояние + грань).
        //    В каждой группе распределяем смещения вдоль грани.
        //    Так две встречные линии (A→B и B→A) получают разные точки
        //    даже если используют одну и ту же грань.
        const groups = new Map();
        for (let i = 0; i < transitions.length; i++) {
            const t = transitions[i];
            const e = edges[i];
            if (!e || t.manual) continue;
            const a = byName[t.from], b = byName[t.to];

            const kS = t.from + '|' + e.start;
            if (!groups.has(kS)) groups.set(kS, []);
            groups.get(kS).push({
                idx: i, side: 'start',
                towardY: b.y + b.h / 2,
                towardX: b.x + b.w / 2
            });

            const kE = t.to + '|' + e.end;
            if (!groups.has(kE)) groups.set(kE, []);
            groups.get(kE).push({
                idx: i, side: 'end',
                towardY: a.y + a.h / 2,
                towardX: a.x + a.w / 2
            });
        }

        const startOff = new Array(transitions.length).fill(0);
        const endOff = new Array(transitions.length).fill(0);

        for (const [key, list] of groups) {
            if (list.length < 2) continue;
            const sep = key.indexOf('|');
            const stateName = key.slice(0, sep);
            const axis = key.slice(sep + 1);
            const st = byName[stateName];
            if (!st) continue;
            const isVert = (axis === 'E' || axis === 'W');
            const len = isVert ? st.h : st.w;
            const range = Math.max(0, len - 2 * EDGE_PAD);

            list.sort((p, q) => {
                if (isVert) {
                    if (p.towardY !== q.towardY) return p.towardY - q.towardY;
                } else {
                    if (p.towardX !== q.towardX) return p.towardX - q.towardX;
                }
                return p.idx - q.idx;
            });

            const n = list.length;
            for (let j = 0; j < n; j++) {
                const off = (n === 1) ? 0 : (-range / 2 + j * (range / (n - 1)));
                if (list[j].side === 'start') startOff[list[j].idx] = off;
                else endOff[list[j].idx] = off;
            }
        }

        // 3. Строим маршруты
        for (let i = 0; i < transitions.length; i++) {
            const t = transitions[i];

            if (t.manual && Array.isArray(t.manualWaypoints) && t.manualWaypoints.length >= 2) {
                const wps = t.manualWaypoints.map(p => ({ x: p.x, y: p.y }));
                const a = byName[t.from], b = byName[t.to];
                if (a) {
                    const r = { x: a.x, y: a.y, w: a.w, h: a.h };
                    const e = findNearestEdge(r, wps[0]);
                    wps[0] = snapToEdge(r, e, wps[0]);
                }
                if (b) {
                    const r = { x: b.x, y: b.y, w: b.w, h: b.h };
                    const e = findNearestEdge(r, wps[wps.length - 1]);
                    wps[wps.length - 1] = snapToEdge(r, e, wps[wps.length - 1]);
                }
                t.waypoints = wps;
                t.label = labelFromWaypoints(wps);
                continue;
            }

            const e = edges[i];
            const a = byName[t.from], b = byName[t.to];
            if (!e || !a || !b) { t.waypoints = []; t.label = null; continue; }

            const aR = { x: a.x, y: a.y, w: a.w, h: a.h };
            const bR = { x: b.x, y: b.y, w: b.w, h: b.h };
            const p1 = pointOnEdge(aR, e.start, startOff[i]);
            const p2 = pointOnEdge(bR, e.end, endOff[i]);

            t.waypoints = routeBetween(p1, p2, e.start, e.end, aR, bR, allRects);
            t.label = labelFromWaypoints(t.waypoints);
        }

        console.log('[wp after routeBetween]',
            transitions.map((t, i) => {
                if (!inPair.has(i)) return null;
                const w = t.waypoints || [];
                return t.name + '=' +
                    w.map(p => '(' + Math.round(p.x) + ',' + Math.round(p.y) + ')').join('->');
            }).filter(Boolean).join('   '));

        // Пары A↔B: если линии легли на одну ось (общий X или Y),
        // сдвигаем средние сегменты в разные стороны, чтобы не сливались.
        {
            const pairs = new Map();
            for (let i = 0; i < transitions.length; i++) {
                const t = transitions[i];
                if (t.manual) continue;
                if (!edges[i]) continue;
                const key = [t.from, t.to].sort().join('|');
                if (!pairs.has(key)) pairs.set(key, []);
                pairs.get(key).push(i);
            }

            const SHIFT = 25;

            for (const [, idxs] of pairs) {
                if (idxs.length !== 2) continue;
                const [i1, i2] = idxs;
                const w1 = transitions[i1].waypoints;
                const w2 = transitions[i2].waypoints;
                if (!w1 || !w2 || w1.length < 3 || w2.length < 3) continue;

                // Ищем общий средний сегмент: горизонтальный на одном Y
                // или вертикальный на одном X.
                let commonAxis = null;
                for (let k = 1; k < w1.length - 1; k++) {
                    const h1 = Math.abs(w1[k].y - w1[k - 1].y) < 1 &&
                        Math.abs(w1[k + 1].y - w1[k].y) < 1;
                    const v1 = Math.abs(w1[k].x - w1[k - 1].x) < 1 &&
                        Math.abs(w1[k + 1].x - w1[k].x) < 1;
                    if (!h1 && !v1) continue;
                    for (let m = 1; m < w2.length - 1; m++) {
                        const h2 = Math.abs(w2[m].y - w2[m - 1].y) < 1 &&
                            Math.abs(w2[m + 1].y - w2[m].y) < 1;
                        const v2 = Math.abs(w2[m].x - w2[m - 1].x) < 1 &&
                            Math.abs(w2[m + 1].x - w2[m].x) < 1;
                        if (h1 && h2 && Math.abs(w1[k].y - w2[m].y) < 1) {
                            commonAxis = 'H'; break;
                        }
                        if (v1 && v2 && Math.abs(w1[k].x - w2[m].x) < 1) {
                            commonAxis = 'V'; break;
                        }
                    }
                    if (commonAxis) break;
                }
                if (!commonAxis) continue;

                // Сдвигаем средние сегменты в противоположные стороны.
                for (const [i, sign] of [[i1, -1], [i2, 1]]) {
                    const t = transitions[i];
                    const wps = t.waypoints;
                    if (commonAxis === 'H') {
                        // Горизонтальный общий сегмент → сдвигаем по Y.
                        for (let k = 1; k < wps.length - 1; k++) {
                            wps[k] = { x: wps[k].x, y: wps[k].y + SHIFT * sign };
                        }
                    } else {
                        // Вертикальный общий сегмент → сдвигаем по X.
                        for (let k = 1; k < wps.length - 1; k++) {
                            wps[k] = { x: wps[k].x + SHIFT * sign, y: wps[k].y };
                        }
                    }
                }
            }
        }


        console.log('[reroute]',
            transitions.map((t, i) => {
                const e = edges[i];
                const pairKey = [t.from, t.to].sort().join('|');
                const isPair = (() => {
                    let n = 0;
                    for (let k = 0; k < transitions.length; k++) {
                        if ([transitions[k].from, transitions[k].to].sort().join('|') === pairKey) n++;
                    }
                    return n === 2;
                })();
                return t.name + '=' +
                    (e ? e.start + '/' + e.end : '?') +
                    (isPair ? '(p)' : '') +
                    (t.manual ? '(m)' : '');
            }).join('  '));

        spreadParallelSegments();
        for (const t of transitions) {
            t.label = labelFromWaypoints(t.waypoints);
        }
    }

    /* ============================================================
     * ВЫРАВНИВАНИЕ
     * ============================================================ */

    function alignTransitions() {
        const gd = PF.state.graphData;
        if (!gd) return;
        const TOL_DEG = 20;
        const transitions = gd.transitions || [];
        const states = gd.states || [];

        function pointInside(nx, ny) {
            for (const s of states) {
                if (nx > s.x + 1 && nx < s.x + s.w - 1 &&
                    ny > s.y + 1 && ny < s.y + s.h - 1) return true;
            }
            return false;
        }

        for (const t of transitions) {
            if (!Array.isArray(t.waypoints) || t.waypoints.length < 2) continue;
            const wps = t.waypoints.map(p => ({ x: p.x, y: p.y }));

            for (let i = 0; i < wps.length - 1; i++) {
                const a = wps[i], b = wps[i + 1];
                const dx = b.x - a.x, dy = b.y - a.y;
                const adx = Math.abs(dx), ady = Math.abs(dy);
                const len = Math.hypot(dx, dy);
                if (len < 0.01) continue;

                const angleFromH = Math.atan2(ady, adx) * 180 / Math.PI;
                const angleFromV = 90 - angleFromH;

                if (angleFromH < TOL_DEG) {
                    const ny = a.y;
                    if (!pointInside(b.x, ny)) b.y = ny;
                } else if (angleFromV < TOL_DEG) {
                    const nx = a.x;
                    if (!pointInside(nx, b.y)) b.x = nx;
                }
            }

            const out = [wps[0]];
            for (let i = 1; i < wps.length - 1; i++) {
                const prev = out[out.length - 1];
                const cur = wps[i];
                const next = wps[i + 1];
                const colH = Math.abs(prev.y - cur.y) < 1 && Math.abs(cur.y - next.y) < 1;
                const colV = Math.abs(prev.x - cur.x) < 1 && Math.abs(cur.x - next.x) < 1;
                if (colH || colV) continue;
                out.push(cur);
            }
            out.push(wps[wps.length - 1]);

            // Убираем «почти-коллинеарные» узлы: если средний узел
            // лежит в пределах TOL_CLEAN от отрезка соседей — он
            // визуально не нужен, спрямляем.
            const TOL_CLEAN = 7;
            let changed = true;
            while (changed) {
                changed = false;
                const cleaned = [out[0]];
                for (let i = 1; i < out.length - 1; i++) {
                    const prev = cleaned[cleaned.length - 1];
                    const cur = out[i];
                    const next = out[i + 1];
                    const d = distToSegment(cur, prev, next);
                    if (d < TOL_CLEAN) { changed = true; continue; }
                    cleaned.push(cur);
                }
                cleaned.push(out[out.length - 1]);
                out.length = 0;
                for (const p of cleaned) out.push(p);
            }

            t.waypoints = out;
            t.manual = true;
            t.manualWaypoints = out.map(p => ({ x: p.x, y: p.y }));
            t.label = labelFromWaypoints(out);
        }

        PF.render.renderGraph();
        PF.layout.applyViewBox();
    }

    /* ============================================================
     * ОПТИМИЗАЦИЯ ПЕРЕХОДОВ (минимум пересечений)
     * ============================================================ */

    function optimizeTransitions() {
        const gd = PF.state.graphData;
        if (!gd) return;
        const transitions = gd.transitions || [];
        const states = gd.states || [];
        const byName = {};
        states.forEach(s => byName[s.name] = s);
        const allRects = states.map(s => ({ x: s.x, y: s.y, w: s.w, h: s.h }));

        const inPair = new Set();
        {
            const byPair = new Map();
            for (let i = 0; i < transitions.length; i++) {
                const t = transitions[i];
                if (t.manual) continue;
                const key = [t.from, t.to].sort().join('|');
                if (!byPair.has(key)) byPair.set(key, []);
                byPair.get(key).push(i);
            }
            for (const [, idxs] of byPair) {
                if (idxs.length !== 2) continue;
                inPair.add(idxs[0]);
                inPair.add(idxs[1]);
            }
        }

        function segCross(a1, a2, b1, b2) {
            const aH = Math.abs(a1.y - a2.y) < 0.5;
            const bH = Math.abs(b1.y - b2.y) < 0.5;
            if (aH === bH) return false;
            let H, V;
            if (aH) {
                H = { x1: Math.min(a1.x, a2.x), x2: Math.max(a1.x, a2.x), y: a1.y };
                V = { y1: Math.min(b1.y, b2.y), y2: Math.max(b1.y, b2.y), x: b1.x };
            } else {
                H = { x1: Math.min(b1.x, b2.x), x2: Math.max(b1.x, b2.x), y: b1.y };
                V = { y1: Math.min(a1.y, a2.y), y2: Math.max(a1.y, a2.y), x: a1.x };
            }
            if (V.x <= H.x1 || V.x >= H.x2) return false;
            if (H.y <= V.y1 || H.y >= V.y2) return false;
            return true;
        }

        function pathLen(wps) {
            let L = 0;
            for (let i = 1; i < wps.length; i++) {
                L += Math.abs(wps[i].x - wps[i - 1].x) + Math.abs(wps[i].y - wps[i - 1].y);
            }
            return L;
        }

        function countCrossings(wps, other) {
            if (!other || other.length < 2) return 0;
            let c = 0;
            for (let i = 0; i < wps.length - 1; i++) {
                for (let j = 0; j < other.length - 1; j++) {
                    if (segCross(wps[i], wps[i + 1], other[j], other[j + 1])) c++;
                }
            }
            return c;
        }

        // Коллинеарное перекрытие: оба сегмента горизонтальны (или
        // вертикальны) и их диапазоны пересекаются больше чем на 1px.
        // segCross такой случай не ловит, а визуально это самое плохое —
        // линии слипаются в одну.
        function segOverlap(a1, a2, b1, b2) {
            const aH = Math.abs(a1.y - a2.y) < 0.5;
            const bH = Math.abs(b1.y - b2.y) < 0.5;
            const aV = Math.abs(a1.x - a2.x) < 0.5;
            const bV = Math.abs(b1.x - b2.x) < 0.5;

            if (aH && bH && Math.abs(a1.y - b1.y) < 1.5) {
                const ax1 = Math.min(a1.x, a2.x), ax2 = Math.max(a1.x, a2.x);
                const bx1 = Math.min(b1.x, b2.x), bx2 = Math.max(b1.x, b2.x);
                return (Math.min(ax2, bx2) - Math.max(ax1, bx1)) > 1;
            }
            if (aV && bV && Math.abs(a1.x - b1.x) < 1.5) {
                const ay1 = Math.min(a1.y, a2.y), ay2 = Math.max(a1.y, a2.y);
                const by1 = Math.min(b1.y, b2.y), by2 = Math.max(b1.y, b2.y);
                return (Math.min(ay2, by2) - Math.max(ay1, by1)) > 1;
            }
            return false;
        }

        function countOverlaps(wps, other) {
            if (!other || other.length < 2) return 0;
            let c = 0;
            for (let i = 0; i < wps.length - 1; i++) {
                for (let j = 0; j < other.length - 1; j++) {
                    if (segOverlap(wps[i], wps[i + 1], other[j], other[j + 1])) c++;
                }
            }
            return c;
        }

        const EDGES = ['E', 'W', 'N', 'S'];

        for (let iter = 0; iter < 3; iter++) {
            for (let i = 0; i < transitions.length; i++) {
                const t = transitions[i];
                if (t.manual) continue;
                if (inPair.has(i)) continue;
                const a = byName[t.from], b = byName[t.to];
                if (!a || !b) continue;
                const aR = { x: a.x, y: a.y, w: a.w, h: a.h };
                const bR = { x: b.x, y: b.y, w: b.w, h: b.h };

                // Смещения вдоль грани: если центр занят, ищем свободное
                // место рядом на той же грани, а не уходим на другую.
                const OFFS = [-15, 0, 15];
                const maxVa = aR.h / 2 - EDGE_PAD;
                const maxHa = aR.w / 2 - EDGE_PAD;
                const maxVb = bR.h / 2 - EDGE_PAD;
                const maxHb = bR.w / 2 - EDGE_PAD;

                let best = null, bestScore = Infinity;
                for (const se of EDGES) {
                    for (const ee of EDGES) {
                        for (const off1 of OFFS) {
                            for (const off2 of OFFS) {
                                let o1 = off1;
                                if (se === 'E' || se === 'W') o1 = Math.max(-maxVa, Math.min(maxVa, o1));
                                else o1 = Math.max(-maxHa, Math.min(maxHa, o1));

                                let o2 = off2;
                                if (ee === 'E' || ee === 'W') o2 = Math.max(-maxVb, Math.min(maxVb, o2));
                                else o2 = Math.max(-maxHb, Math.min(maxHb, o2));

                                const p1 = pointOnEdge(aR, se, o1);
                                const p2 = pointOnEdge(bR, ee, o2);
                                let wps;
                                try { wps = routeBetween(p1, p2, se, ee, aR, bR, allRects); }
                                catch (e) { continue; }
                                if (!wps || wps.length < 2) continue;

                                let crossings = 0;
                                for (let j = 0; j < transitions.length; j++) {
                                    if (j === i) continue;
                                    const other = transitions[j].waypoints;
                                    if (!other) continue;
                                    crossings += countCrossings(wps, other);
                                    crossings += countOverlaps(wps, other);
                                }
                                const score = pathLen(wps) + crossings * 2000
                                    + (Math.abs(o1) + Math.abs(o2)) * 0.5;
                                if (score < bestScore) { bestScore = score; best = wps; }
                            }
                        }
                    }
                }

                if (best) {
                    t.waypoints = best;
                    t.label = labelFromWaypoints(best);
                }
            }

            // --- парный проход: грани для каждой стороны независимы ---
            const pairMap = new Map();
            for (const i of inPair) {
                const t = transitions[i];
                const key = [t.from, t.to].sort().join('|');
                if (!pairMap.has(key)) pairMap.set(key, []);
                pairMap.get(key).push(i);
            }

            for (const [, idxs] of pairMap) {
                if (idxs.length !== 2) continue;
                const [i1, i2] = idxs;
                const t1 = transitions[i1], t2 = transitions[i2];
                const a1 = byName[t1.from], b1 = byName[t1.to];
                const a2 = byName[t2.from], b2 = byName[t2.to];
                if (!a1 || !b1 || !a2 || !b2) continue;
                const a1R = { x: a1.x, y: a1.y, w: a1.w, h: a1.h };
                const b1R = { x: b1.x, y: b1.y, w: b1.w, h: b1.h };
                const a2R = { x: a2.x, y: a2.y, w: a2.w, h: a2.h };
                const b2R = { x: b2.x, y: b2.y, w: b2.w, h: b2.h };

                // Несколько значений смещения вдоль грани. Оптимизатор
                // выберет то, где пара не пересекается с третьими линиями.
                const OFFS = [-15, -9, -3, 3, 9, 15];
                let bestPair = null, bestPairScore = Infinity;

                for (const se1 of EDGES) for (const ee1 of EDGES)
                    for (const se2 of EDGES) for (const ee2 of EDGES)
                        for (const off1 of OFFS) for (const off2 of OFFS) {
                            const p1a = pointOnEdge(a1R, se1, off1);
                            const p1b = pointOnEdge(b1R, ee1, -off1);
                            const p2a = pointOnEdge(a2R, se2, off2);
                            const p2b = pointOnEdge(b2R, ee2, -off2);

                            let w1, w2;
                            try {
                                w1 = routeBetween(p1a, p1b, se1, ee1, a1R, b1R, allRects);
                                w2 = routeBetween(p2a, p2b, se2, ee2, a2R, b2R, allRects);
                            } catch (e) { continue; }
                            if (!w1 || !w2 || w1.length < 2 || w2.length < 2) continue;

                            if (countOverlaps(w1, w2) > 0) continue;

                            let crossings = 0;
                            for (let j = 0; j < transitions.length; j++) {
                                if (j === i1 || j === i2) continue;
                                const other = transitions[j].waypoints;
                                if (!other) continue;
                                crossings += countCrossings(w1, other);
                                crossings += countCrossings(w2, other);
                                crossings += countOverlaps(w1, other);
                                crossings += countOverlaps(w2, other);
                            }
                            const selfCross = countCrossings(w1, w2);
                            const score = pathLen(w1) + pathLen(w2)
                                + crossings * 2000
                                + selfCross * 100000
                                + (Math.abs(off1) + Math.abs(off2)) * 0.5;
                            if (score < bestPairScore) {
                                bestPairScore = score;
                                bestPair = { w1, w2 };
                            }
                        }

                if (bestPair) {
                    t1.waypoints = bestPair.w1;
                    t1.label = labelFromWaypoints(bestPair.w1);
                    t2.waypoints = bestPair.w2;
                    t2.label = labelFromWaypoints(bestPair.w2);
                }
            }
        }

        spreadParallelSegments();

        console.log('[wp after optimize]',
            transitions.map((t, i) => {
                if (!inPair.has(i)) return null;
                const w = t.waypoints || [];
                return t.name + '=' +
                    w.map(p => '(' + Math.round(p.x) + ',' + Math.round(p.y) + ')').join('->');
            }).filter(Boolean).join('   '));
        PF.render.renderGraph();
        PF.layout.applyViewBox();
    }

    /* ============================================================
     * РАЗВЕДЕНИЕ ПАРАЛЛЕЛЬНЫХ СЕГМЕНТОВ
     * ============================================================ */

    function spreadParallelSegments() {
        const gd = PF.state.graphData;
        if (!gd) return;

        const transitions = gd.transitions;
        const LANE_STEP = 6;

        const segs = [];
        transitions.forEach((t, idx) => {
            if (t.manual) return;
            const wps = t.waypoints || [];
            if (wps.length < 4) return;
            for (let i = 1; i < wps.length; i++) {
                if (i === 1 || i === wps.length - 1) continue;
                const a = wps[i - 1], b = wps[i];
                const len = Math.hypot(b.x - a.x, b.y - a.y);
                if (len < 25) continue;
                const isH = Math.abs(a.y - b.y) < 0.5;
                const isV = Math.abs(a.x - b.x) < 0.5;
                if (!isH && !isV) continue;
                segs.push({ idx, i, isH, isV, a, b, len });
            }
        });

        const groups = new Map();
        for (const s of segs) {
            const key = s.isH
                ? 'H|' + Math.round(s.a.y / 2)
                : 'V|' + Math.round(s.a.x / 2);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(s);
        }

        for (const [key, list] of groups) {
            if (list.length < 2) continue;
            const isH = key.startsWith('H');

            let hasOverlap = false;
            for (let i = 0; i < list.length && !hasOverlap; i++) {
                for (let j = i + 1; j < list.length && !hasOverlap; j++) {
                    const a = list[i], b = list[j];
                    const rA = isH
                        ? [Math.min(a.a.x, a.b.x), Math.max(a.a.x, a.b.x)]
                        : [Math.min(a.a.y, a.b.y), Math.max(a.a.y, a.b.y)];
                    const rB = isH
                        ? [Math.min(b.a.x, b.b.x), Math.max(b.a.x, b.b.x)]
                        : [Math.min(b.a.y, b.b.y), Math.max(b.a.y, b.b.y)];
                    const overlap = Math.min(rA[1], rB[1]) - Math.max(rA[0], rB[0]);
                    if (overlap > 5) hasOverlap = true;
                }
            }
            if (!hasOverlap) continue;

            const n = list.length;
            for (let j = 0; j < n; j++) {
                const off = (j - (n - 1) / 2) * LANE_STEP;
                if (Math.abs(off) < 0.5) continue;
                const s = list[j];
                const t = transitions[s.idx];
                const wps = t.waypoints;
                if (isH) {
                    wps[s.i - 1] = { x: wps[s.i - 1].x, y: wps[s.i - 1].y + off };
                    wps[s.i] = { x: wps[s.i].x, y: wps[s.i].y + off };
                } else {
                    wps[s.i - 1] = { x: wps[s.i - 1].x + off, y: wps[s.i - 1].y };
                    wps[s.i] = { x: wps[s.i].x + off, y: wps[s.i].y };
                }
            }
        }
    }

    /* ============================================================
     * ЭКСПОРТ
     * ============================================================ */

    PF.routing = {
        BASE_STATE_W, BASE_STATE_H, EDGE_PAD,
        rectsIntersect,
        chooseEdge,
        pointOnEdge,
        findNearestEdge,
        snapToEdge,
        simplifyOrtho,
        buildRoundedPath,
        computeStubs,
        buildSimpleOrthoMiddle,
        segmentHitsRect,
        findFirstBlocker,
        corridorHit,
        buildDetourMiddle,
        segmentBlockedBetween,
        routeBetween,
        labelFromWaypoints,
        segPerp,
        findSegmentIndex,
        distToSegment,
        rerouteAll,
        spreadParallelSegments,
        alignTransitions,
        optimizeTransitions
    };
})();