// Suit readiness checklist data and state logic. This is a manual inspection record, not a sensor.
// SOURCE: NASA, "Spacewalk Spacesuit Basics" (nasa.gov/centers-and-facilities/johnson/spacewalk-spacesuit-basics/,
// published 2019-10-04, updated 2023-08-30), read on 2026-11-15; see docs/SOURCES.md (independent review pending).
// The page says the flexible parts use up to 16 layers but does not number them, so the checklist names the
// layers and parts the page names, in the order it gives them (skin outwards, then the parts of the suit and
// the life support backpack). The "inspect" lines are generic things to look for, not a NASA procedure.
export const SOURCE_NOTE = 'Items are the layers and parts named on NASA\'s Spacewalk Spacesuit Basics page, which says the flexible parts have up to 16 layers but does not list them all. The inspection hints are generic, not a NASA procedure. Independent review pending.';

export const GROUPS = [
  { id: 'cooling', name: 'Cooling garment (the first three layers, against the skin)', items: [
    { id: 'cooling-garment', name: 'Cooling garment: spandex with water tubes', inspect: 'Fabric wear, kinked or leaking water tubes, vents clear so sweat can be drawn away.' },
  ] },
  { id: 'pressure', name: 'Pressure layers', items: [
    { id: 'bladder', name: 'Bladder layer (holds oxygen and pressure)', inspect: 'Tears, pinholes, damaged seals or fittings.' },
    { id: 'restraint', name: 'Shape-holding layer (keeps the bladder in shape)', inspect: 'Fraying, loose stitching, stretched or bulging areas.' },
    { id: 'ripstop', name: 'Ripstop liner (tear-resistant)', inspect: 'Snags, tears or pulled threads.' },
  ] },
  { id: 'outer', name: 'Insulation and outer layers', items: [
    { id: 'insulation', name: 'Insulation layers (several; NASA gives no count)', inspect: 'Tears, punctures, creases that expose layers, contamination.' },
    { id: 'outer-layer', name: 'White outer layer (reflects heat; three kinds of thread)', inspect: 'Cuts, abrasion, burns, discolouration, loose threads, stripe markings readable.' },
  ] },
  { id: 'parts', name: 'Suit parts', items: [
    { id: 'upper-torso', name: 'Hard upper torso and arm assembly', inspect: 'Cracks or dents, connection to the backpack, arm joints and glove connections.' },
    { id: 'lower-torso', name: 'Lower torso, boots and waist bearing', inspect: 'Waist bearing turns freely, body-seal closure locks, boots and joints undamaged.' },
    { id: 'gloves', name: 'Gloves (heated)', inspect: 'Wear on fingers and palms, finger movement, heating works.' },
    { id: 'helmet', name: 'Helmet: pressure bubble, protective visor, sun visor and shades', inspect: 'Scratches or cracks, visors move and lock, gold coating intact, ventilation clear.' },
    { id: 'audio', name: 'Communications audio (speakers and microphones)', inspect: 'Sound check both ways; radio link to the suit.' },
  ] },
  { id: 'life-support', name: 'Life support system (backpack)', items: [
    { id: 'oxygen', name: 'Oxygen supply and pressure regulator', inspect: 'Oxygen level, regulator holds the correct pressure.' },
    { id: 'fan-co2', name: 'Fan and carbon dioxide removal', inspect: 'Fan circulates oxygen, carbon dioxide removal unit in date and working.' },
    { id: 'power-radio', name: 'Electrical power and two-way radio', inspect: 'Battery charge, radio check, caution lights.' },
    { id: 'cooling-water', name: 'Cooling water, chiller and pump', inspect: 'Water level, chiller and pump run, no leaks at connectors.' },
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
