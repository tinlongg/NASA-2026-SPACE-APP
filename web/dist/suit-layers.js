// Shared educational checklist grouped by the NASA Spacewalk Spacesuit Basics article.
// This is not an authoritative EMU construction specification or EVA clearance.
export const SOURCE_NOTE = 'NASA describes flexible suit sections with up to 16 material layers. This checklist groups them by their six functions; cooling includes three layers and insulation includes several. Record only checks supported by the applicable procedure.';
export const SUIT_SOURCE_URL = 'https://www.nasa.gov/centers-and-facilities/johnson/spacewalk-spacesuit-basics/';
export const LAYER_GROUPS=[
 {id:'cooling',name:'Cooling garment · three layers',items:[{id:'nasa-cooling',name:'Cooling garment (three layers)',inspect:'Water circulates through tubing near the skin to remove body heat. Record the approved garment inspection result.'}]},
 {id:'pressure',name:'Pressure bladder',items:[{id:'nasa-bladder',name:'Bladder layer',inspect:'Contains the suit gas and maintains pressure around the body. Record the approved bladder inspection result.'}]},
 {id:'restraint',name:'Restraint layer',items:[{id:'nasa-restraint',name:'Restraint layer',inspect:'Keeps the pressurized bladder in the intended shape. Record the approved restraint inspection result.'}]},
 {id:'liner',name:'Ripstop liner',items:[{id:'nasa-ripstop',name:'Ripstop liner',inspect:'Provides tear resistance. Record the inspection result available under the applicable procedure.'}]},
 {id:'insulation',name:'Thermal insulation · several layers',items:[{id:'nasa-insulation',name:'Insulation layers',inspect:'Reduce heat transfer to help control the temperature inside the suit. Record the approved insulation inspection result.'}]},
 {id:'outer',name:'Outer cover',items:[{id:'nasa-outer',name:'White outer layer',inspect:'Reflects sunlight and combines water-resistant, protective and fire-resistant materials. Record the approved outer-cover inspection result.'}]}
];
export const LAYER_ITEMS=LAYER_GROUPS.flatMap(group=>group.items);
export const SYSTEM_ITEMS=[
 {id:'plss',name:'Life support backpack',inspect:'Record the result of the approved life-support system check.'},
 {id:'rings',name:'Helmet, gloves and sealing rings',inspect:'Record the result of the approved helmet, glove and seal inspection.'},
 {id:'leak',name:'Pressure-system check',inspect:'Record the result of the approved pressure-system procedure; this app does not measure pressure.'}
];
export const GROUPS=[...LAYER_GROUPS,{id:'systems',name:'Separate equipment checks · not garment layers',items:SYSTEM_ITEMS}];
export const ITEMS=GROUPS.flatMap(group=>group.items);
export const LEGACY_ITEM_NAMES={lcvg:'Cooling garment (earlier checklist)',bladder:'Pressure bladder (earlier checklist)',restraint:'Restraint layer (earlier checklist)',insulation:'Insulation group (earlier checklist)',shell:'Outer shell (earlier checklist)'};

/** 'ready' only when every item passes; 'not-ready' if any fails; otherwise 'incomplete'. */
export function overallState(statuses) {
  const list = [...statuses];
  if (list.some(status => status === 'fail')) return 'not-ready';
  return list.length > 0 && list.every(status => status === 'pass') ? 'ready' : 'incomplete';
}
export const STATE_LABEL = { ready: 'All checks passed', 'not-ready': 'Concern recorded', incomplete: 'Incomplete' };
