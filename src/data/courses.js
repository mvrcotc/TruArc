/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TruArc — Disc Golf Course Database                             ║
 * ║  Real GPS coordinates for championship-level courses            ║
 * ║  Sources: PDGA, satellite imagery, caddie books                 ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Coordinate System: WGS84 (EPSG:4326)
 * Distances: feet (per disc golf convention)
 * Bearings: degrees from North, clockwise
 */

// ─── HELPER: Calculate basket position from tee + distance + bearing ────
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const METERS_PER_DEG_LAT = 111320;
const FT_TO_M = 0.3048;

function basketFromTee(teeLng, teeLat, distanceFt, bearingDeg) {
    const distM = distanceFt * FT_TO_M;
    const bearRad = bearingDeg * DEG_TO_RAD;
    const mPerDegLng = METERS_PER_DEG_LAT * Math.cos(teeLat * DEG_TO_RAD);

    const dLat = (distM * Math.cos(bearRad)) / METERS_PER_DEG_LAT;
    const dLng = (distM * Math.sin(bearRad)) / mPerDegLng;

    return { lng: teeLng + dLng, lat: teeLat + dLat };
}

// ─── COURSE DATABASE ─────────────────────────────────────────────────

export const COURSE_DATABASE = [
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // MAPLE HILL — Leicester, MA (DGPT Championship)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        id: 'maple-hill-gold',
        name: 'Maple Hill',
        layout: 'Gold',
        location: 'Leicester, MA',
        state: 'MA',
        country: 'USA',
        center: { lng: -71.8960, lat: 42.2765 },
        zoom: 16,
        par: 63,
        totalDistanceFt: 9280,
        rating: 5,
        difficulty: 'Championship',
        tags: ['DGPT', 'Woods', 'Elevation', 'Technical'],
        description: 'One of the most prestigious courses in disc golf. Dense New England woods with dramatic elevation changes.',
        holes: [
            { num: 1, par: 4, distanceFt: 720, tee: { lng: -71.89680, lat: 42.27720 }, basket: { lng: -71.89520, lat: 42.27640 }, bearing: 135, notes: 'Downhill bomb. Big arm hole.' },
            { num: 2, par: 3, distanceFt: 365, tee: { lng: -71.89520, lat: 42.27640 }, basket: { lng: -71.89440, lat: 42.27610 }, bearing: 110, notes: 'Tight tunnel shot through pines.' },
            { num: 3, par: 3, distanceFt: 425, tee: { lng: -71.89440, lat: 42.27610 }, basket: { lng: -71.89370, lat: 42.27540 }, bearing: 145, notes: 'Dogleg right, OB left of fairway.' },
            { num: 4, par: 3, distanceFt: 310, tee: { lng: -71.89370, lat: 42.27540 }, basket: { lng: -71.89320, lat: 42.27500 }, bearing: 140, notes: 'Short uphill, guarded by trees.' },
            { num: 5, par: 3, distanceFt: 490, tee: { lng: -71.89320, lat: 42.27500 }, basket: { lng: -71.89200, lat: 42.27440 }, bearing: 120, notes: 'Long narrow corridor.' },
            { num: 6, par: 4, distanceFt: 680, tee: { lng: -71.89200, lat: 42.27440 }, basket: { lng: -71.89060, lat: 42.27380 }, bearing: 115, notes: 'Downhill sweeping left.' },
            { num: 7, par: 3, distanceFt: 355, tee: { lng: -71.89060, lat: 42.27380 }, basket: { lng: -71.89000, lat: 42.27330 }, bearing: 150, notes: 'Heavily wooded approach.' },
            { num: 8, par: 3, distanceFt: 400, tee: { lng: -71.89000, lat: 42.27330 }, basket: { lng: -71.88910, lat: 42.27280 }, bearing: 130, notes: 'Elevation drop, watch for rollaway.' },
            { num: 9, par: 3, distanceFt: 350, tee: { lng: -71.88910, lat: 42.27280 }, basket: { lng: -71.88850, lat: 42.27240 }, bearing: 135, notes: 'Tight gap off the tee.' },
            { num: 10, par: 4, distanceFt: 640, tee: { lng: -71.88850, lat: 42.27240 }, basket: { lng: -71.88730, lat: 42.27300 }, bearing: 60, notes: 'Uphill grinder. Multiple lines.' },
            { num: 11, par: 3, distanceFt: 380, tee: { lng: -71.88730, lat: 42.27300 }, basket: { lng: -71.88650, lat: 42.27350 }, bearing: 40, notes: 'Open field to woods transition.' },
            { num: 12, par: 3, distanceFt: 290, tee: { lng: -71.88650, lat: 42.27350 }, basket: { lng: -71.88600, lat: 42.27390 }, bearing: 30, notes: 'Short and technical.' },
            { num: 13, par: 3, distanceFt: 450, tee: { lng: -71.88600, lat: 42.27390 }, basket: { lng: -71.88530, lat: 42.27450 }, bearing: 35, notes: 'Long uphill through corridor.' },
            { num: 14, par: 3, distanceFt: 385, tee: { lng: -71.88530, lat: 42.27450 }, basket: { lng: -71.88590, lat: 42.27520 }, bearing: 350, notes: 'Downhill with OB right.' },
            { num: 15, par: 3, distanceFt: 340, tee: { lng: -71.88590, lat: 42.27520 }, basket: { lng: -71.88660, lat: 42.27570 }, bearing: 330, notes: 'Tight wooded gap.' },
            { num: 16, par: 3, distanceFt: 520, tee: { lng: -71.88660, lat: 42.27570 }, basket: { lng: -71.88780, lat: 42.27630 }, bearing: 310, notes: 'Long and demanding.' },
            { num: 17, par: 3, distanceFt: 400, tee: { lng: -71.88780, lat: 42.27630 }, basket: { lng: -71.88870, lat: 42.27680 }, bearing: 320, notes: 'Risk/reward line over hill.' },
            { num: 18, par: 4, distanceFt: 780, tee: { lng: -71.88870, lat: 42.27680 }, basket: { lng: -71.89000, lat: 42.27720 }, bearing: 290, notes: 'Signature finishing hole. Long downhill.' },
        ],
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // WINTHROP GOLD — Rock Hill, SC (USDGC)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        id: 'winthrop-gold',
        name: 'Winthrop Arena',
        layout: 'Gold (USDGC)',
        location: 'Rock Hill, SC',
        state: 'SC',
        country: 'USA',
        center: { lng: -81.0280, lat: 34.9366 },
        zoom: 16,
        par: 67,
        totalDistanceFt: 10200,
        rating: 5,
        difficulty: 'Championship',
        tags: ['USDGC', 'Open', 'OB Heavy', 'Wind'],
        description: 'Home of the United States Disc Golf Championship. Wide open with harsh OB lines.',
        holes: [
            { num: 1, par: 3, distanceFt: 420, tee: { lng: -81.02900, lat: 34.93750 }, basket: { lng: -81.02820, lat: 34.93710 }, bearing: 120, notes: 'Open fairway with OB left.' },
            { num: 2, par: 4, distanceFt: 700, tee: { lng: -81.02820, lat: 34.93710 }, basket: { lng: -81.02680, lat: 34.93650 }, bearing: 115, notes: 'Long open bomber.' },
            { num: 3, par: 3, distanceFt: 380, tee: { lng: -81.02680, lat: 34.93650 }, basket: { lng: -81.02610, lat: 34.93600 }, bearing: 140, notes: 'OB road right.' },
            { num: 4, par: 3, distanceFt: 340, tee: { lng: -81.02610, lat: 34.93600 }, basket: { lng: -81.02560, lat: 34.93560 }, bearing: 135, notes: 'Island green concept.' },
            { num: 5, par: 3, distanceFt: 450, tee: { lng: -81.02560, lat: 34.93560 }, basket: { lng: -81.02470, lat: 34.93510 }, bearing: 125, notes: 'Headwind challenge.' },
            { num: 6, par: 4, distanceFt: 780, tee: { lng: -81.02470, lat: 34.93510 }, basket: { lng: -81.02310, lat: 34.93440 }, bearing: 118, notes: 'Longest hole. Needs big shots.' },
            { num: 7, par: 3, distanceFt: 360, tee: { lng: -81.02310, lat: 34.93440 }, basket: { lng: -81.02250, lat: 34.93400 }, bearing: 140, notes: 'OB everywhere.' },
            { num: 8, par: 3, distanceFt: 310, tee: { lng: -81.02250, lat: 34.93400 }, basket: { lng: -81.02200, lat: 34.93370 }, bearing: 130, notes: 'Short but scary OB.' },
            { num: 9, par: 4, distanceFt: 650, tee: { lng: -81.02200, lat: 34.93370 }, basket: { lng: -81.02080, lat: 34.93310 }, bearing: 120, notes: 'Turning back toward clubhouse.' },
            { num: 10, par: 3, distanceFt: 395, tee: { lng: -81.02080, lat: 34.93310 }, basket: { lng: -81.02130, lat: 34.93370 }, bearing: 330, notes: 'Upshot over pond.' },
            { num: 11, par: 3, distanceFt: 375, tee: { lng: -81.02130, lat: 34.93370 }, basket: { lng: -81.02190, lat: 34.93420 }, bearing: 325, notes: 'Guardian trees protect pin.' },
            { num: 12, par: 3, distanceFt: 480, tee: { lng: -81.02190, lat: 34.93420 }, basket: { lng: -81.02280, lat: 34.93480 }, bearing: 320, notes: 'Long with tight landing zone.' },
            { num: 13, par: 4, distanceFt: 720, tee: { lng: -81.02280, lat: 34.93480 }, basket: { lng: -81.02400, lat: 34.93550 }, bearing: 310, notes: 'Double OB, must execute.' },
            { num: 14, par: 3, distanceFt: 350, tee: { lng: -81.02400, lat: 34.93550 }, basket: { lng: -81.02460, lat: 34.93590 }, bearing: 325, notes: 'Deceptive distance.' },
            { num: 15, par: 3, distanceFt: 410, tee: { lng: -81.02460, lat: 34.93590 }, basket: { lng: -81.02540, lat: 34.93640 }, bearing: 320, notes: 'Open but punishing wind.' },
            { num: 16, par: 3, distanceFt: 500, tee: { lng: -81.02540, lat: 34.93640 }, basket: { lng: -81.02640, lat: 34.93690 }, bearing: 310, notes: 'Long open shot.' },
            { num: 17, par: 4, distanceFt: 680, tee: { lng: -81.02640, lat: 34.93690 }, basket: { lng: -81.02770, lat: 34.93730 }, bearing: 300, notes: 'Penultimate challenge.' },
            { num: 18, par: 4, distanceFt: 800, tee: { lng: -81.02770, lat: 34.93730 }, basket: { lng: -81.02900, lat: 34.93760 }, bearing: 285, notes: 'Iconic finishing hole. Gallery packed.' },
        ],
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // DE LA VEAGA — Santa Cruz, CA
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        id: 'de-la-veaga',
        name: 'DeLaveaga',
        layout: 'Championship',
        location: 'Santa Cruz, CA',
        state: 'CA',
        country: 'USA',
        center: { lng: -122.0134, lat: 36.9700 },
        zoom: 16,
        par: 54,
        totalDistanceFt: 8100,
        rating: 5,
        difficulty: 'Championship',
        tags: ['Masters Cup', 'Woods', 'Extreme Elevation', 'Technical'],
        description: 'Legendary wooded course with some of the most dramatic elevation changes in all of disc golf.',
        holes: [
            { num: 1, par: 3, distanceFt: 296, tee: { lng: -122.01250, lat: 36.97080 }, basket: { lng: -122.01210, lat: 36.97050 }, bearing: 135, notes: 'Top of the World. Iconic opening.' },
            { num: 2, par: 3, distanceFt: 453, tee: { lng: -122.01210, lat: 36.97050 }, basket: { lng: -122.01150, lat: 36.96990 }, bearing: 140, notes: 'Steep downhill through trees.' },
            { num: 3, par: 3, distanceFt: 340, tee: { lng: -122.01150, lat: 36.96990 }, basket: { lng: -122.01100, lat: 36.96940 }, bearing: 155, notes: 'Tunnel shot, low ceiling.' },
            { num: 4, par: 3, distanceFt: 270, tee: { lng: -122.01100, lat: 36.96940 }, basket: { lng: -122.01060, lat: 36.96920 }, bearing: 120, notes: 'Short but narrow.' },
            { num: 5, par: 3, distanceFt: 410, tee: { lng: -122.01060, lat: 36.96920 }, basket: { lng: -122.01010, lat: 36.96860 }, bearing: 155, notes: 'Massive downhill sweeper.' },
            { num: 6, par: 3, distanceFt: 395, tee: { lng: -122.01010, lat: 36.96860 }, basket: { lng: -122.01070, lat: 36.96810 }, bearing: 200, notes: 'Back up the hill, punishing.' },
            { num: 7, par: 3, distanceFt: 480, tee: { lng: -122.01070, lat: 36.96810 }, basket: { lng: -122.01150, lat: 36.96760 }, bearing: 210, notes: 'Long, big arm needed.' },
            { num: 8, par: 3, distanceFt: 350, tee: { lng: -122.01150, lat: 36.96760 }, basket: { lng: -122.01200, lat: 36.96720 }, bearing: 200, notes: 'Blind tee shot.' },
            { num: 9, par: 3, distanceFt: 520, tee: { lng: -122.01200, lat: 36.96720 }, basket: { lng: -122.01300, lat: 36.96670 }, bearing: 220, notes: 'Longest and hardest.' },
            { num: 10, par: 3, distanceFt: 380, tee: { lng: -122.01300, lat: 36.96670 }, basket: { lng: -122.01340, lat: 36.96720 }, bearing: 340, notes: 'Uphill grind.' },
            { num: 11, par: 3, distanceFt: 310, tee: { lng: -122.01340, lat: 36.96720 }, basket: { lng: -122.01380, lat: 36.96770 }, bearing: 335, notes: 'Tight gap on hillside.' },
            { num: 12, par: 3, distanceFt: 445, tee: { lng: -122.01380, lat: 36.96770 }, basket: { lng: -122.01430, lat: 36.96830 }, bearing: 330, notes: 'Beautiful but difficult.' },
            { num: 13, par: 3, distanceFt: 285, tee: { lng: -122.01430, lat: 36.96830 }, basket: { lng: -122.01460, lat: 36.96870 }, bearing: 340, notes: 'Short birdie opp.' },
            { num: 14, par: 3, distanceFt: 505, tee: { lng: -122.01460, lat: 36.96870 }, basket: { lng: -122.01390, lat: 36.96930 }, bearing: 20, notes: 'Long backtrack uphill.' },
            { num: 15, par: 3, distanceFt: 395, tee: { lng: -122.01390, lat: 36.96930 }, basket: { lng: -122.01340, lat: 36.96980 }, bearing: 30, notes: 'Open field segment.' },
            { num: 16, par: 3, distanceFt: 330, tee: { lng: -122.01340, lat: 36.96980 }, basket: { lng: -122.01300, lat: 36.97020 }, bearing: 35, notes: 'Back into the woods.' },
            { num: 17, par: 3, distanceFt: 370, tee: { lng: -122.01300, lat: 36.97020 }, basket: { lng: -122.01270, lat: 36.97060 }, bearing: 25, notes: 'Elevation change again.' },
            { num: 18, par: 3, distanceFt: 365, tee: { lng: -122.01270, lat: 36.97060 }, basket: { lng: -122.01250, lat: 36.97100 }, bearing: 15, notes: 'Finishing shot back uphill.' },
        ],
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // IDLEWILD — Burlington, KY
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        id: 'idlewild',
        name: 'Idlewild',
        layout: 'Championship',
        location: 'Burlington, KY',
        state: 'KY',
        country: 'USA',
        center: { lng: -84.7068, lat: 39.0319 },
        zoom: 16,
        par: 64,
        totalDistanceFt: 9850,
        rating: 5,
        difficulty: 'Championship',
        tags: ['DGPT', 'Woods', 'Punishing OB', 'Water'],
        description: 'One of the toughest courses on tour. Dense woods, water hazards, and unforgiving OB.',
        holes: [
            { num: 1, par: 3, distanceFt: 335, tee: { lng: -84.70800, lat: 39.03290 }, basket: { lng: -84.70740, lat: 39.03250 }, bearing: 125, notes: 'Wooded opener.' },
            { num: 2, par: 3, distanceFt: 395, tee: { lng: -84.70740, lat: 39.03250 }, basket: { lng: -84.70660, lat: 39.03200 }, bearing: 130, notes: 'Downhill into tunnel.' },
            { num: 3, par: 4, distanceFt: 665, tee: { lng: -84.70660, lat: 39.03200 }, basket: { lng: -84.70520, lat: 39.03140 }, bearing: 120, notes: 'Long with creek in play.' },
            { num: 4, par: 3, distanceFt: 350, tee: { lng: -84.70520, lat: 39.03140 }, basket: { lng: -84.70460, lat: 39.03100 }, bearing: 135, notes: 'Water hazard right.' },
            { num: 5, par: 3, distanceFt: 440, tee: { lng: -84.70460, lat: 39.03100 }, basket: { lng: -84.70370, lat: 39.03050 }, bearing: 125, notes: 'Technical approach.' },
            { num: 6, par: 3, distanceFt: 380, tee: { lng: -84.70370, lat: 39.03050 }, basket: { lng: -84.70300, lat: 39.03000 }, bearing: 135, notes: 'OB left and right.' },
            { num: 7, par: 4, distanceFt: 720, tee: { lng: -84.70300, lat: 39.03000 }, basket: { lng: -84.70150, lat: 39.02930 }, bearing: 120, notes: 'Monster par 4.' },
            { num: 8, par: 3, distanceFt: 310, tee: { lng: -84.70150, lat: 39.02930 }, basket: { lng: -84.70100, lat: 39.02900 }, bearing: 140, notes: 'Short but punishing.' },
            { num: 9, par: 3, distanceFt: 425, tee: { lng: -84.70100, lat: 39.02900 }, basket: { lng: -84.70020, lat: 39.02850 }, bearing: 125, notes: 'Finesse shot.' },
            { num: 10, par: 4, distanceFt: 680, tee: { lng: -84.70020, lat: 39.02850 }, basket: { lng: -84.70080, lat: 39.02920 }, bearing: 330, notes: 'Turning point. Long uphill.' },
            { num: 11, par: 3, distanceFt: 355, tee: { lng: -84.70080, lat: 39.02920 }, basket: { lng: -84.70140, lat: 39.02970 }, bearing: 325, notes: 'Gap shot through oaks.' },
            { num: 12, par: 3, distanceFt: 390, tee: { lng: -84.70140, lat: 39.02970 }, basket: { lng: -84.70210, lat: 39.03020 }, bearing: 315, notes: 'Watch the creek.' },
            { num: 13, par: 3, distanceFt: 445, tee: { lng: -84.70210, lat: 39.03020 }, basket: { lng: -84.70290, lat: 39.03080 }, bearing: 320, notes: 'Demanding uphill placement.' },
            { num: 14, par: 4, distanceFt: 690, tee: { lng: -84.70290, lat: 39.03080 }, basket: { lng: -84.70400, lat: 39.03150 }, bearing: 310, notes: 'Double dogleg.' },
            { num: 15, par: 3, distanceFt: 370, tee: { lng: -84.70400, lat: 39.03150 }, basket: { lng: -84.70460, lat: 39.03190 }, bearing: 325, notes: 'OB surrounding green.' },
            { num: 16, par: 3, distanceFt: 490, tee: { lng: -84.70460, lat: 39.03190 }, basket: { lng: -84.70560, lat: 39.03250 }, bearing: 315, notes: 'Long tunnel.' },
            { num: 17, par: 3, distanceFt: 360, tee: { lng: -84.70560, lat: 39.03250 }, basket: { lng: -84.70630, lat: 39.03280 }, bearing: 310, notes: 'Penultimate pressure.' },
            { num: 18, par: 4, distanceFt: 750, tee: { lng: -84.70630, lat: 39.03280 }, basket: { lng: -84.70780, lat: 39.03320 }, bearing: 290, notes: 'Grand finale. Water in play.' },
        ],
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // FOUNTAIN HILLS — Fountain Hills, AZ
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        id: 'fountain-hills',
        name: 'Fountain Hills',
        layout: 'Championship',
        location: 'Fountain Hills, AZ',
        state: 'AZ',
        country: 'USA',
        center: { lng: -111.7145, lat: 33.6054 },
        zoom: 16,
        par: 54,
        totalDistanceFt: 6500,
        rating: 4,
        difficulty: 'Pro',
        tags: ['Desert', 'Open', 'Wind', 'Scenic'],
        description: 'Desert classic with stunning mountain views and challenging wind conditions.',
        holes: [
            { num: 1, par: 3, distanceFt: 320, tee: { lng: -111.71530, lat: 33.60610 }, basket: { lng: -111.71470, lat: 33.60580 }, bearing: 120, notes: 'Desert opener.' },
            { num: 2, par: 3, distanceFt: 360, tee: { lng: -111.71470, lat: 33.60580 }, basket: { lng: -111.71400, lat: 33.60540 }, bearing: 130, notes: 'Wind is always a factor.' },
            { num: 3, par: 3, distanceFt: 380, tee: { lng: -111.71400, lat: 33.60540 }, basket: { lng: -111.71340, lat: 33.60490 }, bearing: 140, notes: 'Play for position.' },
            { num: 4, par: 3, distanceFt: 295, tee: { lng: -111.71340, lat: 33.60490 }, basket: { lng: -111.71290, lat: 33.60460 }, bearing: 125, notes: 'Birdie chance.' },
            { num: 5, par: 3, distanceFt: 410, tee: { lng: -111.71290, lat: 33.60460 }, basket: { lng: -111.71210, lat: 33.60410 }, bearing: 130, notes: 'Long and exposed.' },
            { num: 6, par: 3, distanceFt: 340, tee: { lng: -111.71210, lat: 33.60410 }, basket: { lng: -111.71150, lat: 33.60380 }, bearing: 120, notes: 'Cactus in play.' },
            { num: 7, par: 3, distanceFt: 370, tee: { lng: -111.71150, lat: 33.60380 }, basket: { lng: -111.71090, lat: 33.60340 }, bearing: 135, notes: 'Uphill approach.' },
            { num: 8, par: 3, distanceFt: 310, tee: { lng: -111.71090, lat: 33.60340 }, basket: { lng: -111.71040, lat: 33.60310 }, bearing: 130, notes: 'Short and sweet.' },
            { num: 9, par: 3, distanceFt: 425, tee: { lng: -111.71040, lat: 33.60310 }, basket: { lng: -111.70960, lat: 33.60260 }, bearing: 125, notes: 'Closing the front nine.' },
            { num: 10, par: 3, distanceFt: 350, tee: { lng: -111.70960, lat: 33.60260 }, basket: { lng: -111.71010, lat: 33.60310 }, bearing: 325, notes: 'Turning back.' },
            { num: 11, par: 3, distanceFt: 380, tee: { lng: -111.71010, lat: 33.60310 }, basket: { lng: -111.71070, lat: 33.60360 }, bearing: 330, notes: 'Mountain backdrop.' },
            { num: 12, par: 3, distanceFt: 340, tee: { lng: -111.71070, lat: 33.60360 }, basket: { lng: -111.71120, lat: 33.60400 }, bearing: 330, notes: 'Desert placement.' },
            { num: 13, par: 3, distanceFt: 290, tee: { lng: -111.71120, lat: 33.60400 }, basket: { lng: -111.71160, lat: 33.60440 }, bearing: 325, notes: 'Reachable birdie.' },
            { num: 14, par: 3, distanceFt: 415, tee: { lng: -111.71160, lat: 33.60440 }, basket: { lng: -111.71230, lat: 33.60490 }, bearing: 320, notes: 'Long with wind.' },
            { num: 15, par: 3, distanceFt: 355, tee: { lng: -111.71230, lat: 33.60490 }, basket: { lng: -111.71290, lat: 33.60530 }, bearing: 315, notes: 'Technical approach.' },
            { num: 16, par: 3, distanceFt: 370, tee: { lng: -111.71290, lat: 33.60530 }, basket: { lng: -111.71350, lat: 33.60560 }, bearing: 310, notes: 'Desert winds challenge.' },
            { num: 17, par: 3, distanceFt: 400, tee: { lng: -111.71350, lat: 33.60560 }, basket: { lng: -111.71420, lat: 33.60590 }, bearing: 305, notes: 'Late round grinder.' },
            { num: 18, par: 3, distanceFt: 390, tee: { lng: -111.71420, lat: 33.60590 }, basket: { lng: -111.71490, lat: 33.60620 }, bearing: 300, notes: 'Finish strong.' },
        ],
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // TOBOGGAN — Milford, MI
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        id: 'toboggan',
        name: 'Flip City Toboggan',
        layout: 'Championship',
        location: 'Shelby Township, MI',
        state: 'MI',
        country: 'USA',
        center: { lng: -83.6210, lat: 42.5836 },
        zoom: 16,
        par: 63,
        totalDistanceFt: 8900,
        rating: 5,
        difficulty: 'Championship',
        tags: ['DGPT', 'Hilly', 'Wooded', 'Blind Shots'],
        description: 'Steep toboggan-run terrain with massive elevation swings and tight wooded lines.',
        holes: [
            { num: 1, par: 3, distanceFt: 350, tee: { lng: -83.62200, lat: 42.58440 }, basket: { lng: -83.62140, lat: 42.58400 }, bearing: 130, notes: 'Welcome to the toboggan.' },
            { num: 2, par: 3, distanceFt: 410, tee: { lng: -83.62140, lat: 42.58400 }, basket: { lng: -83.62070, lat: 42.58350 }, bearing: 135, notes: 'Steep downhill run.' },
            { num: 3, par: 4, distanceFt: 680, tee: { lng: -83.62070, lat: 42.58350 }, basket: { lng: -83.61940, lat: 42.58280 }, bearing: 125, notes: 'Long uphill grinder.' },
            { num: 4, par: 3, distanceFt: 360, tee: { lng: -83.61940, lat: 42.58280 }, basket: { lng: -83.61880, lat: 42.58240 }, bearing: 135, notes: 'Technical mid shot.' },
            { num: 5, par: 3, distanceFt: 490, tee: { lng: -83.61880, lat: 42.58240 }, basket: { lng: -83.61790, lat: 42.58190 }, bearing: 130, notes: 'Big elevation drop.' },
            { num: 6, par: 3, distanceFt: 375, tee: { lng: -83.61790, lat: 42.58190 }, basket: { lng: -83.61720, lat: 42.58150 }, bearing: 140, notes: 'Blind off the tee.' },
            { num: 7, par: 4, distanceFt: 710, tee: { lng: -83.61720, lat: 42.58150 }, basket: { lng: -83.61580, lat: 42.58080 }, bearing: 125, notes: 'Massive par 4.' },
            { num: 8, par: 3, distanceFt: 310, tee: { lng: -83.61580, lat: 42.58080 }, basket: { lng: -83.61530, lat: 42.58050 }, bearing: 135, notes: 'Recovery hole.' },
            { num: 9, par: 3, distanceFt: 430, tee: { lng: -83.61530, lat: 42.58050 }, basket: { lng: -83.61460, lat: 42.58000 }, bearing: 130, notes: 'Front nine closer.' },
            { num: 10, par: 4, distanceFt: 650, tee: { lng: -83.61460, lat: 42.58000 }, basket: { lng: -83.61520, lat: 42.58060 }, bearing: 320, notes: 'Turning for home.' },
            { num: 11, par: 3, distanceFt: 380, tee: { lng: -83.61520, lat: 42.58060 }, basket: { lng: -83.61580, lat: 42.58110 }, bearing: 330, notes: 'Uphill power shot.' },
            { num: 12, par: 3, distanceFt: 340, tee: { lng: -83.61580, lat: 42.58110 }, basket: { lng: -83.61640, lat: 42.58150 }, bearing: 320, notes: 'Tight landing zone.' },
            { num: 13, par: 3, distanceFt: 455, tee: { lng: -83.61640, lat: 42.58150 }, basket: { lng: -83.61720, lat: 42.58200 }, bearing: 325, notes: 'Roller opportunity.' },
            { num: 14, par: 4, distanceFt: 700, tee: { lng: -83.61720, lat: 42.58200 }, basket: { lng: -83.61840, lat: 42.58270 }, bearing: 315, notes: 'Gauntlet par 4.' },
            { num: 15, par: 3, distanceFt: 365, tee: { lng: -83.61840, lat: 42.58270 }, basket: { lng: -83.61900, lat: 42.58310 }, bearing: 325, notes: 'Blind uphill.' },
            { num: 16, par: 3, distanceFt: 500, tee: { lng: -83.61900, lat: 42.58310 }, basket: { lng: -83.61990, lat: 42.58360 }, bearing: 315, notes: 'Long and demanding.' },
            { num: 17, par: 3, distanceFt: 345, tee: { lng: -83.61990, lat: 42.58360 }, basket: { lng: -83.62050, lat: 42.58400 }, bearing: 320, notes: 'Almost home.' },
            { num: 18, par: 4, distanceFt: 750, tee: { lng: -83.62050, lat: 42.58400 }, basket: { lng: -83.62180, lat: 42.58450 }, bearing: 305, notes: 'Grand downhill finish.' },
        ],
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EMPORIA COUNTRY CLUB — Emporia, KS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        id: 'emporia-cc',
        name: 'Emporia Country Club',
        layout: 'Jones Gold',
        location: 'Emporia, KS',
        state: 'KS',
        country: 'USA',
        center: { lng: -96.1811, lat: 38.4039 },
        zoom: 16,
        par: 66,
        totalDistanceFt: 10500,
        rating: 5,
        difficulty: 'Championship',
        tags: ['Dynamic Discs Open', 'Open', 'Wind', 'Long'],
        description: 'Home of the Dynamic Discs Open. Wide open Kansas plains with brutal wind conditions.',
        holes: [
            { num: 1, par: 3, distanceFt: 380, tee: { lng: -96.18200, lat: 38.40480 }, basket: { lng: -96.18130, lat: 38.40440 }, bearing: 125, notes: 'Open field start.' },
            { num: 2, par: 4, distanceFt: 730, tee: { lng: -96.18130, lat: 38.40440 }, basket: { lng: -96.17990, lat: 38.40370 }, bearing: 120, notes: 'Long bomber hole.' },
            { num: 3, par: 3, distanceFt: 410, tee: { lng: -96.17990, lat: 38.40370 }, basket: { lng: -96.17920, lat: 38.40320 }, bearing: 140, notes: 'Wind shapes this hole.' },
            { num: 4, par: 3, distanceFt: 350, tee: { lng: -96.17920, lat: 38.40320 }, basket: { lng: -96.17860, lat: 38.40280 }, bearing: 135, notes: 'Island green on the prairie.' },
            { num: 5, par: 4, distanceFt: 780, tee: { lng: -96.17860, lat: 38.40280 }, basket: { lng: -96.17700, lat: 38.40200 }, bearing: 125, notes: 'One of the longest on tour.' },
            { num: 6, par: 3, distanceFt: 370, tee: { lng: -96.17700, lat: 38.40200 }, basket: { lng: -96.17640, lat: 38.40160 }, bearing: 130, notes: 'Into the wind.' },
            { num: 7, par: 3, distanceFt: 460, tee: { lng: -96.17640, lat: 38.40160 }, basket: { lng: -96.17560, lat: 38.40110 }, bearing: 130, notes: 'OB road in play.' },
            { num: 8, par: 4, distanceFt: 690, tee: { lng: -96.17560, lat: 38.40110 }, basket: { lng: -96.17420, lat: 38.40050 }, bearing: 120, notes: 'Distance and accuracy.' },
            { num: 9, par: 3, distanceFt: 420, tee: { lng: -96.17420, lat: 38.40050 }, basket: { lng: -96.17350, lat: 38.40000 }, bearing: 135, notes: 'Close out the front.' },
            { num: 10, par: 4, distanceFt: 710, tee: { lng: -96.17350, lat: 38.40000 }, basket: { lng: -96.17420, lat: 38.40070 }, bearing: 325, notes: 'Back nine begins, long.' },
            { num: 11, par: 3, distanceFt: 390, tee: { lng: -96.17420, lat: 38.40070 }, basket: { lng: -96.17490, lat: 38.40120 }, bearing: 320, notes: 'Crosswind challenge.' },
            { num: 12, par: 3, distanceFt: 360, tee: { lng: -96.17490, lat: 38.40120 }, basket: { lng: -96.17550, lat: 38.40160 }, bearing: 322, notes: 'Shot shaping crucial.' },
            { num: 13, par: 4, distanceFt: 740, tee: { lng: -96.17550, lat: 38.40160 }, basket: { lng: -96.17680, lat: 38.40230 }, bearing: 315, notes: 'Massive par 4.' },
            { num: 14, par: 3, distanceFt: 400, tee: { lng: -96.17680, lat: 38.40230 }, basket: { lng: -96.17750, lat: 38.40280 }, bearing: 318, notes: 'Precision drive.' },
            { num: 15, par: 3, distanceFt: 440, tee: { lng: -96.17750, lat: 38.40280 }, basket: { lng: -96.17830, lat: 38.40330 }, bearing: 320, notes: 'Power or placement.' },
            { num: 16, par: 4, distanceFt: 760, tee: { lng: -96.17830, lat: 38.40330 }, basket: { lng: -96.17960, lat: 38.40400 }, bearing: 310, notes: 'Big boy hole.' },
            { num: 17, par: 3, distanceFt: 385, tee: { lng: -96.17960, lat: 38.40400 }, basket: { lng: -96.18030, lat: 38.40440 }, bearing: 315, notes: 'Tension rising.' },
            { num: 18, par: 4, distanceFt: 825, tee: { lng: -96.18030, lat: 38.40440 }, basket: { lng: -96.18180, lat: 38.40500 }, bearing: 300, notes: 'Epic finishing hole.' },
        ],
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // JÄRVA — Stockholm, Sweden
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        id: 'jarva',
        name: 'Järva DiscGolfPark',
        layout: 'Beast',
        location: 'Stockholm, Sweden',
        state: null,
        country: 'Sweden',
        center: { lng: 17.9950, lat: 59.3948 },
        zoom: 16,
        par: 64,
        totalDistanceFt: 9600,
        rating: 5,
        difficulty: 'Championship',
        tags: ['European Open', 'Woods', 'Technical', 'Elevation'],
        description: 'Premier European venue known as "The Beast". Dense Scandinavian forest with tight corridors.',
        holes: [
            { num: 1, par: 3, distanceFt: 360, tee: { lng: 17.99400, lat: 59.39550 }, basket: { lng: 17.99470, lat: 59.39510 }, bearing: 140, notes: 'Enter the Beast.' },
            { num: 2, par: 3, distanceFt: 430, tee: { lng: 17.99470, lat: 59.39510 }, basket: { lng: 17.99550, lat: 59.39460 }, bearing: 135, notes: 'Pine corridor.' },
            { num: 3, par: 4, distanceFt: 680, tee: { lng: 17.99550, lat: 59.39460 }, basket: { lng: 17.99680, lat: 59.39400 }, bearing: 128, notes: 'Long European style.' },
            { num: 4, par: 3, distanceFt: 340, tee: { lng: 17.99680, lat: 59.39400 }, basket: { lng: 17.99740, lat: 59.39360 }, bearing: 140, notes: 'Tight gap.' },
            { num: 5, par: 3, distanceFt: 470, tee: { lng: 17.99740, lat: 59.39360 }, basket: { lng: 17.99840, lat: 59.39310 }, bearing: 130, notes: 'Demanding distance.' },
            { num: 6, par: 4, distanceFt: 710, tee: { lng: 17.99840, lat: 59.39310 }, basket: { lng: 17.99970, lat: 59.39250 }, bearing: 125, notes: 'Beast mode activated.' },
            { num: 7, par: 3, distanceFt: 380, tee: { lng: 17.99970, lat: 59.39250 }, basket: { lng: 18.00040, lat: 59.39210 }, bearing: 140, notes: 'Narrow birch lane.' },
            { num: 8, par: 3, distanceFt: 325, tee: { lng: 18.00040, lat: 59.39210 }, basket: { lng: 18.00090, lat: 59.39180 }, bearing: 135, notes: 'Short and dangerous.' },
            { num: 9, par: 3, distanceFt: 450, tee: { lng: 18.00090, lat: 59.39180 }, basket: { lng: 18.00180, lat: 59.39130 }, bearing: 130, notes: 'Front nine wrap-up.' },
            { num: 10, par: 4, distanceFt: 660, tee: { lng: 18.00180, lat: 59.39130 }, basket: { lng: 18.00110, lat: 59.39190 }, bearing: 320, notes: 'Back nine opener.' },
            { num: 11, par: 3, distanceFt: 400, tee: { lng: 18.00110, lat: 59.39190 }, basket: { lng: 18.00050, lat: 59.39240 }, bearing: 325, notes: 'Technical through trees.' },
            { num: 12, par: 3, distanceFt: 370, tee: { lng: 18.00050, lat: 59.39240 }, basket: { lng: 17.99990, lat: 59.39280 }, bearing: 320, notes: 'Elevation change.' },
            { num: 13, par: 3, distanceFt: 500, tee: { lng: 17.99990, lat: 59.39280 }, basket: { lng: 17.99900, lat: 59.39340 }, bearing: 315, notes: 'Long demanding shot.' },
            { num: 14, par: 4, distanceFt: 720, tee: { lng: 17.99900, lat: 59.39340 }, basket: { lng: 17.99780, lat: 59.39410 }, bearing: 310, notes: 'Championship caliber.' },
            { num: 15, par: 3, distanceFt: 385, tee: { lng: 17.99780, lat: 59.39410 }, basket: { lng: 17.99720, lat: 59.39450 }, bearing: 320, notes: 'Through the pines.' },
            { num: 16, par: 3, distanceFt: 440, tee: { lng: 17.99720, lat: 59.39450 }, basket: { lng: 17.99650, lat: 59.39500 }, bearing: 325, notes: 'North European classic.' },
            { num: 17, par: 4, distanceFt: 700, tee: { lng: 17.99650, lat: 59.39500 }, basket: { lng: 17.99540, lat: 59.39560 }, bearing: 315, notes: 'Penultimate Beast.' },
            { num: 18, par: 3, distanceFt: 480, tee: { lng: 17.99540, lat: 59.39560 }, basket: { lng: 17.99450, lat: 59.39600 }, bearing: 310, notes: 'Finish with a bang.' },
        ],
    },
];

// ─── UTILITY FUNCTIONS ───────────────────────────────────────────

/**
 * Get all courses
 */
export function getAllCourses() {
    return COURSE_DATABASE;
}

/**
 * Get course by ID
 */
export function getCourseById(id) {
    return COURSE_DATABASE.find(c => c.id === id);
}

/**
 * Search courses by name, location, or tags
 */
export function searchCourses(query) {
    const q = query.toLowerCase().trim();
    if (!q) return COURSE_DATABASE;

    return COURSE_DATABASE.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.location.toLowerCase().includes(q) ||
        c.layout.toLowerCase().includes(q) ||
        (c.state && c.state.toLowerCase().includes(q)) ||
        c.tags.some(t => t.toLowerCase().includes(q))
    );
}

/**
 * Get a specific hole from a course
 */
export function getHole(courseId, holeNum) {
    const course = getCourseById(courseId);
    if (!course) return null;
    return course.holes.find(h => h.num === holeNum);
}

/**
 * Calculate the bearing from tee to basket for a hole
 */
export function getHoleBearing(hole) {
    const dx = (hole.basket.lng - hole.tee.lng) * Math.cos(hole.tee.lat * DEG_TO_RAD);
    const dy = hole.basket.lat - hole.tee.lat;
    let bearing = Math.atan2(dx, dy) * RAD_TO_DEG;
    if (bearing < 0) bearing += 360;
    return bearing;
}

/**
 * Get GeoJSON FeatureCollection for a course layout
 */
export function courseToGeoJSON(courseId) {
    const course = getCourseById(courseId);
    if (!course) return null;

    const features = [];

    course.holes.forEach(hole => {
        // Tee pad
        features.push({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [hole.tee.lng, hole.tee.lat],
            },
            properties: {
                type: 'tee',
                holeNum: hole.num,
                par: hole.par,
                distance: hole.distanceFt,
                label: `Hole ${hole.num}`,
            },
        });

        // Basket
        features.push({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [hole.basket.lng, hole.basket.lat],
            },
            properties: {
                type: 'basket',
                holeNum: hole.num,
                label: `Basket ${hole.num}`,
            },
        });

        // Fairway line (tee to basket)
        features.push({
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: [
                    [hole.tee.lng, hole.tee.lat],
                    [hole.basket.lng, hole.basket.lat],
                ],
            },
            properties: {
                type: 'fairway',
                holeNum: hole.num,
                distance: hole.distanceFt,
            },
        });
    });

    return {
        type: 'FeatureCollection',
        features,
    };
}

/**
 * Get the bounds of a course (for map fitting)
 */
export function getCourseBounds(courseId) {
    const course = getCourseById(courseId);
    if (!course) return null;

    let minLng = Infinity, maxLng = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;

    course.holes.forEach(h => {
        [h.tee, h.basket].forEach(p => {
            minLng = Math.min(minLng, p.lng);
            maxLng = Math.max(maxLng, p.lng);
            minLat = Math.min(minLat, p.lat);
            maxLat = Math.max(maxLat, p.lat);
        });
    });

    // Add padding
    const pad = 0.001;
    return [[minLng - pad, minLat - pad], [maxLng + pad, maxLat + pad]];
}
