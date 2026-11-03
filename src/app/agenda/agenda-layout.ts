export type AgendaRow = Record<string, any>;
export type CalendarEvent = { row: AgendaRow; start: number; end: number; top: number; height: number; lane: number; lanes: number };
export const DAY_START = 8 * 60;
export const DAY_END = 18 * 60;
export const HALF_HOUR_HEIGHT = 64;

export function timeMinutes(time: unknown): number {
  const value = String(time ?? '');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return NaN;
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}

export function clockTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function appointmentDuration(row: AgendaRow, services: AgendaRow[]): number {
  const saved = Number(row['durationMinutes']);
  if (Number.isFinite(saved) && saved > 0) return saved;
  const ids = (row['serviceIds'] || []) as Array<number | string>;
  const sum = ids.reduce<number>((total, id) => total + Number(services.find(service => String(service['id']) === String(id))?.['durationMinutes'] || 0), 0);
  return sum > 0 ? sum : 60;
}

export function isCancelled(row: AgendaRow): boolean {
  return ['cancelado', 'cancelada'].includes(String(row['status']));
}

/** Keep actual minute positions; conflicting imported records share columns instead of hiding one another. */
export function layoutAppointments(rows: AgendaRow[], services: AgendaRow[]): CalendarEvent[] {
  const events = rows.filter(row => !isCancelled(row)).map(row => {
    const start = timeMinutes(row['time']);
    const end = start + appointmentDuration(row, services);
    return { row, start, end, top: (start - DAY_START) / 30 * HALF_HOUR_HEIGHT, height: (end - start) / 30 * HALF_HOUR_HEIGHT, lane: 0, lanes: 1 };
  }).filter(event => Number.isFinite(event.start) && event.start >= DAY_START && event.end <= DAY_END)
    .sort((a, b) => a.start - b.start || b.end - a.end || Number(a.row['id']) - Number(b.row['id']));
  let cluster: CalendarEvent[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;
  const finishCluster = () => { for (const event of cluster) event.lanes = laneEnds.length; };
  for (const event of events) {
    if (event.start >= clusterEnd) {
      finishCluster(); cluster = []; laneEnds = []; clusterEnd = -Infinity;
    }
    let lane = laneEnds.findIndex(end => end <= event.start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = event.end; event.lane = lane;
    cluster.push(event); clusterEnd = Math.max(clusterEnd, event.end);
  }
  finishCluster();
  return events;
}
