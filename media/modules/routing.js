(function () {
  'use strict';

  window.PF = window.PF || {};

  const BASE_STATE_W = 160;
  const BASE_STATE_H = 50;
  const EDGE_PAD = 10;

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
    if (gapY >= MIN_GAP)                 return dy >= 0 ? 'S' : 'N';
    if (Math.abs(dx) >= Math.abs(dy))    return dx >= 0 ? 'E' : 'W';
    return dy >= 0 ? 'S' : 'N';
  }

  function pointOnEdge(rect, edge, offset) {
    const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    if (edge === 'E') return { x: rect.x + rect.w, y: cy + offset };
    if (edge === 'W') return { x: rect.x,            y: cy + offset };
    if (edge === 'N') return { x: cx + offset,       y: rect.y };
    return              { x: cx + offset,            y: rect.y + rect.h };
  }

  function findNearestEdge(rect, pt) {
    const dTop    = Math.abs(pt.y - rect.y);
    const dBottom = Math.abs(pt.y - (rect.y + rect.h));
    const dLeft   = Math.abs(pt.x - rect.x);
    const dRight  = Math.abs(pt.x - (rect.x + rect.w));

    const min = Math.min(dTop, dBottom, dLeft, dRight);
    if (min === dTop)    return 'N';
    if (min === dBottom) return 'S';
    if (min === dLeft)   return 'W';
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
      const cur  = points[i];
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

  function computeStubs(p1, p2, startEdge, endEdge) {
    const stub = 18;
    const p1out = { x: p1.x, y: p1.y };
    const p2out = { x: p2.x, y: p2.y };

    if      (startEdge === 'E' && p2.x > p1.x + stub) p1out.x = p1.x + stub;
    else if (startEdge === 'W' && p2.x < p1.x - stub) p1out.x = p1.x - stub;
    else if (startEdge === 'S' && p2.y > p1.y + stub) p1out.y = p1.y + stub;
    else if (startEdge === 'N' && p2.y < p1.y - stub) p1out.y = p1.y - stub;

    if      (endEdge === 'E' && p1.x > p2.x + stub) p2out.x = p2.x + stub;
    else if (endEdge === 'W' && p1.x < p2.x - stub) p2out.x = p2.x - stub;
    else if (endEdge === 'S' && p1.y > p2.y + stub) p2out.y = p2.y + stub;
    else if (endEdge === 'N' && p1.y < p2.y - stub) p2out.y = p2.y - stub;

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

    const LEFT   = minX - margin;
    const RIGHT  = maxX + margin;
    const TOP    = minY - margin;
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
      candidates.push([{ x: p1out.x, y: TOP },    { x: p2out.x, y: TOP }]);
      candidates.push([{ x: p1out.x, y: BOTTOM }, { x: p2out.x, y: BOTTOM }]);
    } else {
      candidates.push([{ x: LEFT,  y: p1out.y }, { x: LEFT,  y: p2out.y }]);
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
    const endHoriz   = (endEdge   === 'E' || endEdge   === 'W');
    const obstacles = (allRects || []).filter(r => r !== aRect && r !== bRect);

    const dy = Math.abs(p1.y - p2.y);
    const dx = Math.abs(p1.x - p2.x);
    const alignedH = startHoriz && endHoriz && dy < 2;
    const alignedV = !startHoriz && !endHoriz && dx < 2;
    const sameRow = Math.abs(aRect.y - bRect.y) < 2;
    const sameCol = Math.abs(aRect.x - bRect.x) < 2;

    if ((alignedH || alignedV) && (sameRow || sameCol) &&
        !segmentBlockedBetween(aRect, bRect, obstacles)) {
      return [ { x: p1.x, y: p1.y }, { x: p2.x, y: p2.y } ];
    }

    const { p1out, p2out } = computeStubs(p1, p2, startEdge, endEdge);

    let middle = buildSimpleOrthoMiddle(p1out, p2out, startHoriz, endHoriz);
    const blocker = findFirstBlocker([p1out, ...middle, p2out], obstacles, aRect, bRect);
    if (blocker) {
      middle = buildDetourMiddle(p1out, p2out, startHoriz, endHoriz, obstacles, aRect, bRect);
    }
    return simplifyOrtho([p1, p1out, ...middle, p2out, p2]);
  }

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
    return {
      x: mx,
      y: my,
      orientation: isHorizontal ? 'h' : 'v'
    };
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
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
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

  function rerouteAll() {
    const graphData = PF.state.graphData;
    if (!graphData) return;

    const states = graphData.states;
    const transitions = graphData.transitions;
    const stateByName = {};
    states.forEach(s => stateByName[s.name] = s);

    const edges = transitions.map(t => {
      const a = stateByName[t.from], b = stateByName[t.to];
      if (!a || !b) return null;
      return {
        startEdge: chooseEdge(a, b),
        endEdge:   chooseEdge(b, a)
      };
    });

    const groups = new Map();
    edges.forEach((e, i) => {
      if (!e) return;
      const t = transitions[i];
      const a = stateByName[t.from];
      const b = stateByName[t.to];
      const kS = t.from + '|' + e.startEdge;
      const kE = t.to   + '|' + e.endEdge;
      if (!groups.has(kS)) groups.set(kS, []);
      if (!groups.has(kE)) groups.set(kE, []);
      groups.get(kS).push({
        idx: i, side: 'start',
        sortKeyY: b.y + b.h / 2,
        sortKeyX: b.x + b.w / 2
      });
      groups.get(kE).push({
        idx: i, side: 'end',
        sortKeyY: a.y + a.h / 2,
        sortKeyX: a.x + a.w / 2
      });
    });

    const startOffsets = new Array(transitions.length).fill(0);
    const endOffsets   = new Array(transitions.length).fill(0);
    for (const [key, list] of groups) {
      const n = list.length;
      const sep = key.indexOf('|');
      const stateName = key.slice(0, sep);
      const axis = key.slice(sep + 1);
      const st = stateByName[stateName];
      const edgeLen = (axis === 'E' || axis === 'W') ? st.h : st.w;
      const range = Math.max(0, edgeLen - 2 * EDGE_PAD);

      const isVerticalEdge = (axis === 'E' || axis === 'W');
      list.sort((p, q) => {
        if (isVerticalEdge) {
          if (p.sortKeyY !== q.sortKeyY) return p.sortKeyY - q.sortKeyY;
        } else {
          if (p.sortKeyX !== q.sortKeyX) return p.sortKeyX - q.sortKeyX;
        }
        return p.idx - q.idx;
      });

      for (let j = 0; j < n; j++) {
        const off = (n === 1) ? 0 : (-range / 2 + j * (range / (n - 1)));
        if (list[j].side === 'start') startOffsets[list[j].idx] = off;
        else                          endOffsets[list[j].idx]   = off;
      }
    }

    const allRects = states.map(s => ({ x: s.x, y: s.y, w: s.w, h: s.h }));
    transitions.forEach((t, i) => {
      if (t.manual && Array.isArray(t.manualWaypoints) && t.manualWaypoints.length >= 2) {
        t.waypoints = t.manualWaypoints.map(p => ({ x: p.x, y: p.y }));
        t.label = labelFromWaypoints(t.waypoints);
        return;
      }
      const a = stateByName[t.from], b = stateByName[t.to];
      const e = edges[i];
      if (!a || !b || !e) { t.waypoints = []; t.label = null; return; }
      const aRect = { x: a.x, y: a.y, w: a.w, h: a.h };
      const bRect = { x: b.x, y: b.y, w: b.w, h: b.h };
      const p1 = pointOnEdge(aRect, e.startEdge, startOffsets[i]);
      const p2 = pointOnEdge(bRect, e.endEdge,   endOffsets[i]);
      t.waypoints = routeBetween(p1, p2, e.startEdge, e.endEdge, aRect, bRect, allRects);
      t.label = labelFromWaypoints(t.waypoints);
    });

    spreadParallelSegments();
    for (const t of transitions) {
      t.label = labelFromWaypoints(t.waypoints);
    }
  }

  function spreadParallelSegments() {
    const graphData = PF.state.graphData;
    if (!graphData) return;

    const transitions = graphData.transitions;
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
          wps[s.i]     = { x: wps[s.i].x,     y: wps[s.i].y     + off };
        } else {
          wps[s.i - 1] = { x: wps[s.i - 1].x + off, y: wps[s.i - 1].y };
          wps[s.i]     = { x: wps[s.i].x     + off, y: wps[s.i].y };
        }
      }
    }
  }

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
    spreadParallelSegments
  };
})();