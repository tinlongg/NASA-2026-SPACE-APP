export const PAGE_ROUTES={"home":"/overview","monitor":"/monitor","alerts":"/events","stations":"/stations","circle":"/circle","dashboard":"/crew","suit":"/suit","mission":"/mission","journal":"/journal"};
export const MISSION_ROUTES={care:'/mission/daily-care',games:'/mission/flight-deck',garden:'/mission/space-garden',shop:'/mission/outfitters',board:'/mission/crew-rankings'};
export function missionSectionForPath(path){const clean=path.replace(/\/+$/,'')||'/';return Object.keys(MISSION_ROUTES).find(key=>MISSION_ROUTES[key]===clean)||null;}
export function pageForPath(path){const clean=path.replace(/\/+$/,'')||'/';return Object.keys(PAGE_ROUTES).find(key=>PAGE_ROUTES[key]===clean)||(missionSectionForPath(clean)?'mission':clean==='/'?'home':null);}
