export const PAGE_ROUTES={"home":"/overview","monitor":"/monitor","alerts":"/events","stations":"/stations","circle":"/circle","dashboard":"/crew","suit":"/suit","mission":"/mission","journal":"/journal"};
export function pageForPath(path){const clean=path.replace(/\/+$/,'')||'/';return Object.keys(PAGE_ROUTES).find(key=>PAGE_ROUTES[key]===clean)||(clean==='/'?'home':null);}
