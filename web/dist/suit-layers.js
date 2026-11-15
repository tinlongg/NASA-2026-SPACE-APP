// Suit readiness checklist data and state logic. This is a manual inspection record, not a sensor.
// SOURCE STATUS: grouping below follows candidate NASA sources listed in docs/SOURCES.md (pending
// review). NASA material describes the ISS-era EMU as 14 layers, but the sources disagree on how
// those split, so these are inspection areas, not the final 14-layer list. A reviewer should read the
// primary NASA text and itemise the layers before this is relied on.
export const SOURCE_NOTE = 'Inspection areas follow NASA descriptions of the suit (about 14 layers). The exact layer-by-layer list is pending source review.';

export const GROUPS = [
  { id: 'cooling', name: 'Cooling garment (against the skin)', items: [
    { id: 'lcvg', name: 'Liquid cooling and ventilation garment', inspect: 'Fabric wear, water tubing kinks or leaks, connectors seated and clean.' },
  ] },
  { id: 'pressure', name: 'Pressure garment', items: [
    { id: 'bladder', name: 'Pressure bladder', inspect: 'Tears, pinholes, peeling or sticky coating, seals and fittings.' },
    { id: 'restraint', name: 'Restraint layer', inspect: 'Fraying, loose stitching, stretched or bulging areas.' },
  ] },
  { id: 'tmg', name: 'Thermal and micrometeoroid garment', items: [
    { id: 'insulation', name: 'Insulation layers', inspect: 'Tears, punctures, creases that expose layers, contamination.' },
    { id: 'shell', name: 'Outer shell', inspect: 'Cuts, abrasion, burns, discolouration, loose threads.' },
  ] },
  { id: 'systems', name: 'Life support and interfaces', items: [
    { id: 'plss', name: 'Life support backpack', inspect: 'Battery charge, water and oxygen consumables, connectors, caution lights.' },
    { id: 'rings', name: 'Helmet, gloves and sealing rings', inspect: 'Visor scratches or cracks, glove wear, ring seals and locks.' },
    { id: 'leak', name: 'Pressure leak check', inspect: 'Hold the suit pressure per the procedure and record that it held.' },
  ] },
];
export const ITEMS = GROUPS.flatMap(group => group.items);

/** 'ready' only when every item passes; 'not-ready' if any fails; otherwise 'incomplete'. */
export function overallState(statuses) {
  const list = [...statuses];
  if (list.some(status => status === 'fail')) return 'not-ready';
  return list.length > 0 && list.every(status => status === 'pass') ? 'ready' : 'incomplete';
}
export const STATE_LABEL = { ready: 'Ready', 'not-ready': 'Not ready', incomplete: 'Incomplete' };
