// Checkpoint races: [[x, z], ...] -> reach steps with hoops facing along the course.
// opts: { r, vehicle, water, text, vehicleName, y: (x, z) => y }
export function race(points, opts = {}) {
  return points.map((p, i) => {
    const nx = points[Math.min(points.length - 1, i + 1)], pv = points[Math.max(0, i - 1)];
    const a = i < points.length - 1 ? nx : p, b = i < points.length - 1 ? p : pv;
    const yaw = Math.atan2(a[0] - b[0], a[1] - b[1]);
    const nxt = points[i + 1];
    const last = i === points.length - 1;
    return {
      type: 'reach', at: [p[0], p[1]], r: opts.r ?? 7, style: 'hoop', yaw, water: opts.water, y: p[2],
      vehicle: opts.vehicle, vehicleName: opts.vehicleName, dy: opts.dy ?? 10,
      text: last ? (opts.finish || 'Through the finish!') : `${opts.text || "Checkpoint"} ${i + 1}/${points.length}`,
      next: nxt ? [nxt[0], nxt[1], nxt[2] ?? null, Math.atan2((points[i + 2] || nxt)[0] - (points[i + 2] ? nxt : p)[0], (points[i + 2] || nxt)[1] - (points[i + 2] ? nxt : p)[1])] : null, done: last ? 'Finish!' : 'Go go go!',
    };
  });
}
