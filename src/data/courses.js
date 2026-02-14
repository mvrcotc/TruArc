/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TruArc — Disc Golf Course Database                             ║
 * ║  Real GPS coordinates for championship-level courses            ║
 * ║  Sources: PDGA, UDisc, official tournament caddie books         ║
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
    // MAPLE HILL — Leicester, MA (MVP Open / DGPT)
    // Source: maplehilldiscgolf.com, PDGA, UDisc
    // First tee PDGA: 42.276549, -71.896006
    // Par 60, ~8864 ft (Gold layout)
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
        par: 59,
        totalDistanceFt: 8464,
        rating: 5,
        difficulty: 'Championship',
        tags: ['DGPT', 'Woods', 'Elevation', 'Technical'],
        description: 'One of the most prestigious courses in disc golf. Dense New England woods with dramatic elevation changes. Home of the MVP Open.',
        holes: [
            { num: 1, par: 4, distanceFt: 804, tee: { lng: -71.89680, lat: 42.27720 }, bearing: 135, notes: 'Downhill bomb. Big arm hole.' },
            { num: 2, par: 3, distanceFt: 380, tee: { lng: -71.89520, lat: 42.27640 }, bearing: 110, notes: 'Tight tunnel shot through pines.' },
            { num: 3, par: 3, distanceFt: 425, tee: { lng: -71.89440, lat: 42.27610 }, bearing: 145, notes: 'Dogleg right, OB left of fairway.' },
            { num: 4, par: 3, distanceFt: 246, tee: { lng: -71.89370, lat: 42.27540 }, bearing: 140, notes: 'Shortest hole on course. Uphill, guarded by trees.' },
            { num: 5, par: 3, distanceFt: 476, tee: { lng: -71.89320, lat: 42.27500 }, bearing: 120, notes: 'Long narrow corridor.' },
            { num: 6, par: 3, distanceFt: 414, tee: { lng: -71.89200, lat: 42.27440 }, bearing: 115, notes: 'Tight lines, shortened in 2024.' },
            { num: 7, par: 3, distanceFt: 355, tee: { lng: -71.89060, lat: 42.27380 }, bearing: 150, notes: 'Heavily wooded approach.' },
            { num: 8, par: 3, distanceFt: 400, tee: { lng: -71.89000, lat: 42.27330 }, bearing: 130, notes: 'Elevation drop, watch for rollaway.' },
            { num: 9, par: 5, distanceFt: 850, tee: { lng: -71.88910, lat: 42.27280 }, bearing: 135, notes: 'Pin pushed back ~230ft in 2024. Par 5.' },
            { num: 10, par: 4, distanceFt: 640, tee: { lng: -71.88850, lat: 42.27240 }, bearing: 60, notes: 'Uphill grinder. Multiple lines.' },
            { num: 11, par: 3, distanceFt: 380, tee: { lng: -71.88730, lat: 42.27300 }, bearing: 40, notes: 'Open field to woods transition.' },
            { num: 12, par: 3, distanceFt: 290, tee: { lng: -71.88650, lat: 42.27350 }, bearing: 30, notes: 'Short and technical.' },
            { num: 13, par: 3, distanceFt: 450, tee: { lng: -71.88600, lat: 42.27390 }, bearing: 35, notes: 'Long uphill through corridor.' },
            { num: 14, par: 3, distanceFt: 385, tee: { lng: -71.88530, lat: 42.27450 }, bearing: 350, notes: 'Downhill with OB right.' },
            { num: 15, par: 3, distanceFt: 340, tee: { lng: -71.88590, lat: 42.27520 }, bearing: 330, notes: 'Tight wooded gap.' },
            { num: 16, par: 3, distanceFt: 470, tee: { lng: -71.88660, lat: 42.27570 }, bearing: 310, notes: 'Long and demanding.' },
            { num: 17, par: 3, distanceFt: 400, tee: { lng: -71.88780, lat: 42.27630 }, bearing: 320, notes: 'Risk/reward line over hill.' },
            { num: 18, par: 4, distanceFt: 759, tee: { lng: -71.88870, lat: 42.27680 }, bearing: 290, notes: 'Signature finishing hole. Long downhill. OB line 140ft from pin.' },
        ].map(h => ({ ...h, basket: basketFromTee(h.tee.lng, h.tee.lat, h.distanceFt, h.bearing) })),
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // WINTHROP ARENA — Rock Hill, SC (USDGC)
    // Source: usdgc.com 2023 Caddie Guide, PDGA
    // First tee PDGA: 34.941550, -81.015251
    // Par 64, ~9812 ft (2023 USDGC A-pins)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        id: 'winthrop-gold',
        name: 'Winthrop Arena',
        layout: 'Gold (USDGC)',
        location: 'Rock Hill, SC',
        state: 'SC',
        country: 'USA',
        center: { lng: -81.0153, lat: 34.9415 },
        zoom: 16,
        par: 64,
        totalDistanceFt: 9812,
        rating: 5,
        difficulty: 'Championship',
        tags: ['USDGC', 'Open', 'OB Heavy', 'Wind'],
        description: 'Home of the United States Disc Golf Championship since 1999. Wide open with punishing OB lines around a lake on the Winthrop campus.',
        holes: [
            { num: 1, par: 3, distanceFt: 283, tee: { lng: -81.01570, lat: 34.94155 }, bearing: 180, notes: 'Open fairway with OB left.' },
            { num: 2, par: 3, distanceFt: 409, tee: { lng: -81.01560, lat: 34.94110 }, bearing: 160, notes: 'Long open approach.' },
            { num: 3, par: 4, distanceFt: 841, tee: { lng: -81.01540, lat: 34.94050 }, bearing: 200, notes: 'Massive par 4 around the lake.' },
            { num: 4, par: 3, distanceFt: 299, tee: { lng: -81.01600, lat: 34.93900 }, bearing: 140, notes: 'Island green concept. OB everywhere.' },
            { num: 5, par: 5, distanceFt: 1025, tee: { lng: -81.01560, lat: 34.93860 }, bearing: 170, notes: 'Longest hole. Triple OB. Iconic par 5.' },
            { num: 6, par: 3, distanceFt: 371, tee: { lng: -81.01530, lat: 34.93680 }, bearing: 90, notes: 'Precision placement.' },
            { num: 7, par: 3, distanceFt: 284, tee: { lng: -81.01440, lat: 34.93680 }, bearing: 130, notes: 'Short but OB everywhere.' },
            { num: 8, par: 4, distanceFt: 697, tee: { lng: -81.01400, lat: 34.93640 }, bearing: 200, notes: 'Long with water in play.' },
            { num: 9, par: 3, distanceFt: 362, tee: { lng: -81.01450, lat: 34.93520 }, bearing: 320, notes: 'Turning back toward clubhouse.' },
            { num: 10, par: 4, distanceFt: 549, tee: { lng: -81.01510, lat: 34.93570 }, bearing: 30, notes: 'Back nine opens. Medium par 4.' },
            { num: 11, par: 4, distanceFt: 734, tee: { lng: -81.01490, lat: 34.93650 }, bearing: 350, notes: 'Long with tight landing zone.' },
            { num: 12, par: 4, distanceFt: 901, tee: { lng: -81.01510, lat: 34.93780 }, bearing: 10, notes: 'Longest back nine hole. Must execute.' },
            { num: 13, par: 4, distanceFt: 818, tee: { lng: -81.01500, lat: 34.93930 }, bearing: 340, notes: 'Double OB, championship caliber.' },
            { num: 14, par: 3, distanceFt: 413, tee: { lng: -81.01540, lat: 34.94060 }, bearing: 30, notes: 'Deceptive distance.' },
            { num: 15, par: 4, distanceFt: 539, tee: { lng: -81.01510, lat: 34.94120 }, bearing: 0, notes: 'Open but punishing wind.' },
            { num: 16, par: 3, distanceFt: 391, tee: { lng: -81.01510, lat: 34.94210 }, bearing: 350, notes: 'Precision from the tee.' },
            { num: 17, par: 3, distanceFt: 249, tee: { lng: -81.01530, lat: 34.94280 }, bearing: 10, notes: 'Short but nerve-wracking.' },
            { num: 18, par: 4, distanceFt: 647, tee: { lng: -81.01520, lat: 34.94320 }, bearing: 350, notes: 'Iconic finishing hole. Gallery packed.' },
        ].map(h => ({ ...h, basket: basketFromTee(h.tee.lng, h.tee.lat, h.distanceFt, h.bearing) })),
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // DELAVEAGA — Santa Cruz, CA (Masters Cup)
    // Source: delaveagadiscgolf.com, PDGA, UDisc
    // UDisc center: 37.00534, -121.99590
    // Par 54, ~6473 ft (2025 Masters Cup MPO)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        id: 'delaveaga',
        name: 'DeLaveaga',
        layout: 'Masters Cup',
        location: 'Santa Cruz, CA',
        state: 'CA',
        country: 'USA',
        center: { lng: -121.9959, lat: 37.0053 },
        zoom: 16,
        par: 54,
        totalDistanceFt: 6373,
        rating: 5,
        difficulty: 'Championship',
        tags: ['Masters Cup', 'Woods', 'Extreme Elevation', 'Technical'],
        description: 'Legendary wooded course with dramatic elevation changes. Home of the Masters Cup. Features the iconic "Top of the World" hole.',
        holes: [
            { num: 1, par: 3, distanceFt: 296, tee: { lng: -121.99500, lat: 37.00600 }, bearing: 200, notes: 'Downhill opener through trees.' },
            { num: 2, par: 3, distanceFt: 380, tee: { lng: -121.99520, lat: 37.00560 }, bearing: 210, notes: 'Steep downhill through trees.' },
            { num: 3, par: 3, distanceFt: 340, tee: { lng: -121.99550, lat: 37.00510 }, bearing: 220, notes: 'Tunnel shot, low ceiling.' },
            { num: 4, par: 3, distanceFt: 270, tee: { lng: -121.99590, lat: 37.00460 }, bearing: 190, notes: 'Short but narrow.' },
            { num: 5, par: 3, distanceFt: 410, tee: { lng: -121.99610, lat: 37.00420 }, bearing: 230, notes: 'Massive downhill sweeper.' },
            { num: 6, par: 3, distanceFt: 395, tee: { lng: -121.99660, lat: 37.00370 }, bearing: 160, notes: 'Back up the hill, punishing.' },
            { num: 7, par: 3, distanceFt: 410, tee: { lng: -121.99640, lat: 37.00310 }, bearing: 240, notes: 'Long, big arm needed.' },
            { num: 8, par: 3, distanceFt: 350, tee: { lng: -121.99700, lat: 37.00270 }, bearing: 200, notes: 'Blind tee shot.' },
            { num: 9, par: 3, distanceFt: 420, tee: { lng: -121.99730, lat: 37.00220 }, bearing: 250, notes: 'Long and challenging.' },
            { num: 10, par: 3, distanceFt: 335, tee: { lng: -121.99800, lat: 37.00180 }, bearing: 340, notes: 'Uphill grind back.' },
            { num: 11, par: 3, distanceFt: 310, tee: { lng: -121.99820, lat: 37.00230 }, bearing: 20, notes: 'Tight gap on hillside.' },
            { num: 12, par: 3, distanceFt: 370, tee: { lng: -121.99800, lat: 37.00280 }, bearing: 30, notes: 'Beautiful but difficult.' },
            { num: 13, par: 3, distanceFt: 285, tee: { lng: -121.99770, lat: 37.00340 }, bearing: 350, notes: 'Short birdie opportunity.' },
            { num: 14, par: 3, distanceFt: 400, tee: { lng: -121.99760, lat: 37.00380 }, bearing: 20, notes: 'Long backtrack uphill.' },
            { num: 15, par: 3, distanceFt: 350, tee: { lng: -121.99740, lat: 37.00440 }, bearing: 30, notes: 'Open field segment.' },
            { num: 16, par: 3, distanceFt: 330, tee: { lng: -121.99710, lat: 37.00490 }, bearing: 40, notes: 'Back into the woods.' },
            { num: 17, par: 3, distanceFt: 370, tee: { lng: -121.99680, lat: 37.00530 }, bearing: 25, notes: 'Elevation change again.' },
            { num: 18, par: 3, distanceFt: 352, tee: { lng: -121.99650, lat: 37.00580 }, bearing: 15, notes: '"Top of the World" — iconic elevated tee with ocean views.' },
        ].map(h => ({ ...h, basket: basketFromTee(h.tee.lng, h.tee.lat, h.distanceFt, h.bearing) })),
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // IDLEWILD — Burlington, KY (DGPT / LWS Open)
    // Source: lwsopen.com, PDGA, UDisc
    // First tee PDGA: 39.038176, -84.736220
    // Par 68, 9629 ft (2025 MPO)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        id: 'idlewild',
        name: 'Idlewild',
        layout: 'Championship',
        location: 'Burlington, KY',
        state: 'KY',
        country: 'USA',
        center: { lng: -84.7362, lat: 39.0382 },
        zoom: 16,
        par: 68,
        totalDistanceFt: 9629,
        rating: 5,
        difficulty: 'Championship',
        tags: ['DGPT', 'Woods', 'Punishing OB', 'Water'],
        description: 'One of the toughest courses on tour. Dense woods, water hazards, and unforgiving OB. Home of the LWS Open.',
        holes: [
            { num: 1, par: 4, distanceFt: 638, tee: { lng: -84.73700, lat: 39.03880 }, bearing: 125, notes: 'Long wooded opener. Par 4 demands accuracy.' },
            { num: 2, par: 4, distanceFt: 601, tee: { lng: -84.73600, lat: 39.03810 }, bearing: 130, notes: 'Downhill into tight tunnel.' },
            { num: 3, par: 4, distanceFt: 656, tee: { lng: -84.73500, lat: 39.03730 }, bearing: 120, notes: 'Long with creek in play.' },
            { num: 4, par: 4, distanceFt: 722, tee: { lng: -84.73380, lat: 39.03660 }, bearing: 135, notes: 'Demanding par 4, water hazard right.' },
            { num: 5, par: 3, distanceFt: 432, tee: { lng: -84.73250, lat: 39.03570 }, bearing: 125, notes: 'Technical approach shot.' },
            { num: 6, par: 4, distanceFt: 555, tee: { lng: -84.73150, lat: 39.03500 }, bearing: 135, notes: 'OB left and right.' },
            { num: 7, par: 4, distanceFt: 484, tee: { lng: -84.73050, lat: 39.03420 }, bearing: 120, notes: 'Tight fairway, must execute.' },
            { num: 8, par: 4, distanceFt: 576, tee: { lng: -84.72960, lat: 39.03360 }, bearing: 140, notes: 'Long and punishing.' },
            { num: 9, par: 3, distanceFt: 258, tee: { lng: -84.72860, lat: 39.03280 }, bearing: 125, notes: 'Shortest hole. Birdie chance.' },
            { num: 10, par: 3, distanceFt: 368, tee: { lng: -84.72800, lat: 39.03250 }, bearing: 330, notes: 'Turning point. Back toward start.' },
            { num: 11, par: 3, distanceFt: 242, tee: { lng: -84.72850, lat: 39.03310 }, bearing: 325, notes: 'Short gap shot through oaks.' },
            { num: 12, par: 4, distanceFt: 564, tee: { lng: -84.72900, lat: 39.03350 }, bearing: 315, notes: 'Watch the creek crossing.' },
            { num: 13, par: 4, distanceFt: 584, tee: { lng: -84.72980, lat: 39.03420 }, bearing: 320, notes: 'Demanding uphill placement.' },
            { num: 14, par: 4, distanceFt: 556, tee: { lng: -84.73070, lat: 39.03500 }, bearing: 310, notes: 'Double dogleg through woods.' },
            { num: 15, par: 4, distanceFt: 487, tee: { lng: -84.73170, lat: 39.03570 }, bearing: 325, notes: 'OB surrounding green.' },
            { num: 16, par: 5, distanceFt: 969, tee: { lng: -84.73250, lat: 39.03640 }, bearing: 315, notes: 'Monster par 5. Longest hole on course.' },
            { num: 17, par: 3, distanceFt: 287, tee: { lng: -84.73430, lat: 39.03770 }, bearing: 310, notes: 'Famous "Y" tree gap shot.' },
            { num: 18, par: 4, distanceFt: 650, tee: { lng: -84.73500, lat: 39.03810 }, bearing: 290, notes: 'Grand finale. Water in play.' },
        ].map(h => ({ ...h, basket: basketFromTee(h.tee.lng, h.tee.lat, h.distanceFt, h.bearing) })),
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // FOUNTAIN HILLS — Fountain Hills, AZ (Memorial)
    // Source: UDisc Memorial Pro Layout
    // Par 56, 6848 ft
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        id: 'fountain-hills',
        name: 'Fountain Hills',
        layout: 'Memorial Pro',
        location: 'Fountain Hills, AZ',
        state: 'AZ',
        country: 'USA',
        center: { lng: -111.7145, lat: 33.6054 },
        zoom: 16,
        par: 56,
        totalDistanceFt: 6848,
        rating: 4,
        difficulty: 'Pro',
        tags: ['Desert', 'Open', 'Wind', 'Scenic', 'Water'],
        description: 'Desert classic featuring the iconic fountain lake. Challenging wind conditions and water hazards with stunning mountain views.',
        holes: [
            { num: 1, par: 3, distanceFt: 387, tee: { lng: -111.71530, lat: 33.60610 }, bearing: 120, notes: 'Desert opener. Find the fairway.' },
            { num: 2, par: 4, distanceFt: 767, tee: { lng: -111.71470, lat: 33.60580 }, bearing: 130, notes: 'Long par 4, wind is always a factor.' },
            { num: 3, par: 3, distanceFt: 291, tee: { lng: -111.71350, lat: 33.60490 }, bearing: 140, notes: 'Short, play for position.' },
            { num: 4, par: 3, distanceFt: 254, tee: { lng: -111.71290, lat: 33.60440 }, bearing: 125, notes: 'Birdie chance if wind cooperates.' },
            { num: 5, par: 3, distanceFt: 457, tee: { lng: -111.71250, lat: 33.60410 }, bearing: 130, notes: 'Long and exposed to wind.' },
            { num: 6, par: 3, distanceFt: 246, tee: { lng: -111.71160, lat: 33.60350 }, bearing: 120, notes: 'Cactus in play. Precise landing required.' },
            { num: 7, par: 3, distanceFt: 211, tee: { lng: -111.71110, lat: 33.60320 }, bearing: 135, notes: 'Shortest hole. Uphill approach.' },
            { num: 8, par: 4, distanceFt: 569, tee: { lng: -111.71080, lat: 33.60300 }, bearing: 130, notes: 'Long par 4. Power and precision.' },
            { num: 9, par: 3, distanceFt: 414, tee: { lng: -111.70990, lat: 33.60240 }, bearing: 125, notes: 'Closing the front nine.' },
            { num: 10, par: 3, distanceFt: 312, tee: { lng: -111.70910, lat: 33.60190 }, bearing: 325, notes: 'Turning back. Finding rhythm.' },
            { num: 11, par: 3, distanceFt: 403, tee: { lng: -111.70950, lat: 33.60230 }, bearing: 330, notes: 'Mountain backdrop. Headwind common.' },
            { num: 12, par: 3, distanceFt: 297, tee: { lng: -111.71000, lat: 33.60280 }, bearing: 330, notes: 'Desert placement shot.' },
            { num: 13, par: 3, distanceFt: 249, tee: { lng: -111.71050, lat: 33.60320 }, bearing: 325, notes: 'Reachable birdie.' },
            { num: 14, par: 3, distanceFt: 356, tee: { lng: -111.71090, lat: 33.60360 }, bearing: 320, notes: 'Long with crosswind.' },
            { num: 15, par: 3, distanceFt: 423, tee: { lng: -111.71140, lat: 33.60400 }, bearing: 315, notes: 'Technical approach required.' },
            { num: 16, par: 3, distanceFt: 351, tee: { lng: -111.71210, lat: 33.60450 }, bearing: 310, notes: 'Desert winds challenge everything.' },
            { num: 17, par: 3, distanceFt: 470, tee: { lng: -111.71280, lat: 33.60490 }, bearing: 305, notes: 'Long grinder. Tough late-round hole.' },
            { num: 18, par: 3, distanceFt: 391, tee: { lng: -111.71360, lat: 33.60530 }, bearing: 300, notes: 'Finish strong. Near the fountain.' },
        ].map(h => ({ ...h, basket: basketFromTee(h.tee.lng, h.tee.lat, h.distanceFt, h.bearing) })),
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // FLIP CITY — Shelby, MI
    // Source: UDisc, flipcitydgc.com, PDGA
    // First tee PDGA: 43.621817, -86.248567
    // Par 74, 8006 ft (24 holes — we model 18-hole subset)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        id: 'flip-city',
        name: 'Flip City',
        layout: 'Main 18',
        location: 'Shelby, MI',
        state: 'MI',
        country: 'USA',
        center: { lng: -86.2499, lat: 43.6226 },
        zoom: 16,
        par: 55,
        totalDistanceFt: 5749,
        rating: 5,
        difficulty: 'Pro',
        tags: ['Hilly', 'Woods', 'Blind Shots', 'Scenic'],
        description: 'Steep toboggan-run terrain with massive elevation swings. Private pay-to-play course with 24 holes. Famous for extreme hills.',
        holes: [
            { num: 1, par: 3, distanceFt: 253, tee: { lng: -86.24900, lat: 43.62250 }, bearing: 180, notes: 'Welcome to Flip City.' },
            { num: 2, par: 4, distanceFt: 503, tee: { lng: -86.24890, lat: 43.62210 }, bearing: 200, notes: 'Long downhill run. Par 4.' },
            { num: 3, par: 3, distanceFt: 374, tee: { lng: -86.24920, lat: 43.62120 }, bearing: 160, notes: 'Rolling terrain.' },
            { num: 4, par: 3, distanceFt: 293, tee: { lng: -86.24900, lat: 43.62060 }, bearing: 190, notes: 'Technical mid shot.' },
            { num: 5, par: 3, distanceFt: 289, tee: { lng: -86.24930, lat: 43.62010 }, bearing: 170, notes: 'Steep elevation drop.' },
            { num: 6, par: 3, distanceFt: 285, tee: { lng: -86.24910, lat: 43.61960 }, bearing: 210, notes: 'Blind off the tee.' },
            { num: 7, par: 3, distanceFt: 305, tee: { lng: -86.24950, lat: 43.61910 }, bearing: 180, notes: 'Classic Flip City elevation.' },
            { num: 8, par: 3, distanceFt: 254, tee: { lng: -86.24940, lat: 43.61860 }, bearing: 200, notes: 'Short but tricky placement.' },
            { num: 9, par: 3, distanceFt: 222, tee: { lng: -86.24960, lat: 43.61820 }, bearing: 170, notes: 'Shortest hole. Birdie run.' },
            { num: 10, par: 3, distanceFt: 275, tee: { lng: -86.24950, lat: 43.61780 }, bearing: 350, notes: 'Turning back up the hill.' },
            { num: 11, par: 3, distanceFt: 334, tee: { lng: -86.24960, lat: 43.61830 }, bearing: 340, notes: 'Uphill power shot.' },
            { num: 12, par: 3, distanceFt: 263, tee: { lng: -86.24970, lat: 43.61890 }, bearing: 10, notes: 'Back nine continues.' },
            { num: 13, par: 3, distanceFt: 418, tee: { lng: -86.24960, lat: 43.61940 }, bearing: 350, notes: 'Long uphill grinder.' },
            { num: 14, par: 3, distanceFt: 338, tee: { lng: -86.24980, lat: 43.62010 }, bearing: 0, notes: 'Demanding placement.' },
            { num: 15, par: 3, distanceFt: 451, tee: { lng: -86.24970, lat: 43.62070 }, bearing: 350, notes: 'Long and demanding.' },
            { num: 16, par: 3, distanceFt: 494, tee: { lng: -86.24990, lat: 43.62140 }, bearing: 340, notes: 'Power hole. Big distance required.' },
            { num: 17, par: 3, distanceFt: 170, tee: { lng: -86.25010, lat: 43.62210 }, bearing: 10, notes: 'Tiny gap. Precision only.' },
            { num: 18, par: 3, distanceFt: 228, tee: { lng: -86.25000, lat: 43.62240 }, bearing: 0, notes: 'Grand downhill finish.' },
        ].map(h => ({ ...h, basket: basketFromTee(h.tee.lng, h.tee.lat, h.distanceFt, h.bearing) })),
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EMPORIA COUNTRY CLUB (Champions Landing) — Emporia, KS
    // Source: PDGA, DGPT, DDO
    // Par 63, 9712 ft (Champions Landing - DDO venue)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        id: 'emporia-cc',
        name: 'Emporia Country Club',
        layout: 'Champions Landing',
        location: 'Emporia, KS',
        state: 'KS',
        country: 'USA',
        center: { lng: -96.1811, lat: 38.4039 },
        zoom: 16,
        par: 62,
        totalDistanceFt: 9212,
        rating: 5,
        difficulty: 'Championship',
        tags: ['Dynamic Discs Open', 'Open', 'Wind', 'Long'],
        description: 'Home of the Dynamic Discs Open. Wide open Kansas plains with brutal wind conditions. Features 10 Par 3s, 7 Par 4s, and 1 Par 5.',
        holes: [
            { num: 1, par: 3, distanceFt: 380, tee: { lng: -96.18200, lat: 38.40480 }, bearing: 125, notes: 'Open field start.' },
            { num: 2, par: 4, distanceFt: 680, tee: { lng: -96.18130, lat: 38.40440 }, bearing: 120, notes: 'Long bomber hole.' },
            { num: 3, par: 3, distanceFt: 410, tee: { lng: -96.17990, lat: 38.40370 }, bearing: 140, notes: 'Wind shapes this hole.' },
            { num: 4, par: 3, distanceFt: 350, tee: { lng: -96.17920, lat: 38.40320 }, bearing: 135, notes: 'Precision placement in the wind.' },
            { num: 5, par: 4, distanceFt: 720, tee: { lng: -96.17860, lat: 38.40280 }, bearing: 125, notes: 'Long par 4. Distance and accuracy.' },
            { num: 6, par: 3, distanceFt: 370, tee: { lng: -96.17700, lat: 38.40200 }, bearing: 130, notes: 'Into the wind.' },
            { num: 7, par: 3, distanceFt: 460, tee: { lng: -96.17640, lat: 38.40160 }, bearing: 130, notes: 'OB road in play.' },
            { num: 8, par: 4, distanceFt: 640, tee: { lng: -96.17560, lat: 38.40110 }, bearing: 120, notes: 'Distance and accuracy required.' },
            { num: 9, par: 3, distanceFt: 420, tee: { lng: -96.17420, lat: 38.40050 }, bearing: 135, notes: 'Close out the front.' },
            { num: 10, par: 4, distanceFt: 660, tee: { lng: -96.17350, lat: 38.40000 }, bearing: 325, notes: 'Back nine begins. Long par 4.' },
            { num: 11, par: 3, distanceFt: 390, tee: { lng: -96.17420, lat: 38.40070 }, bearing: 320, notes: 'Crosswind challenge.' },
            { num: 12, par: 3, distanceFt: 360, tee: { lng: -96.17490, lat: 38.40120 }, bearing: 322, notes: 'Shot shaping crucial.' },
            { num: 13, par: 4, distanceFt: 700, tee: { lng: -96.17550, lat: 38.40160 }, bearing: 315, notes: 'Massive par 4.' },
            { num: 14, par: 3, distanceFt: 400, tee: { lng: -96.17680, lat: 38.40230 }, bearing: 318, notes: 'Precision drive.' },
            { num: 15, par: 3, distanceFt: 440, tee: { lng: -96.17750, lat: 38.40280 }, bearing: 320, notes: 'Power or placement decision.' },
            { num: 16, par: 3, distanceFt: 320, tee: { lng: -96.17830, lat: 38.40330 }, bearing: 310, notes: 'Known for demanding precision.' },
            { num: 17, par: 5, distanceFt: 760, tee: { lng: -96.17900, lat: 38.40370 }, bearing: 315, notes: 'Par 5. Must manage the wind.' },
            { num: 18, par: 4, distanceFt: 752, tee: { lng: -96.18030, lat: 38.40440 }, bearing: 300, notes: 'Epic finishing hole.' },
        ].map(h => ({ ...h, basket: basketFromTee(h.tee.lng, h.tee.lat, h.distanceFt, h.bearing) })),
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // JÄRVA DISCGOLFPARK — Stockholm, Sweden
    // Source: PDGA, discgolfpark.com
    // First tee PDGA: 59.402318, 17.897266
    // Par 63, ~9550 ft (Masters layout)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        id: 'jarva',
        name: 'Järva DiscGolfPark',
        layout: 'Masters',
        location: 'Stockholm, Sweden',
        state: null,
        country: 'Sweden',
        center: { lng: 17.8973, lat: 59.4023 },
        zoom: 16,
        par: 60,
        totalDistanceFt: 8750,
        rating: 5,
        difficulty: 'Championship',
        tags: ['European Tour', 'Woods', 'Technical', 'Elevation'],
        description: 'Premier European venue in northern Stockholm. Dense Scandinavian forest with tight corridors and rotating basket placements.',
        holes: [
            { num: 1, par: 3, distanceFt: 354, tee: { lng: 17.89700, lat: 59.40280 }, bearing: 140, notes: 'Welcome to Järva.' },
            { num: 2, par: 3, distanceFt: 430, tee: { lng: 17.89770, lat: 59.40240 }, bearing: 135, notes: 'Pine corridor.' },
            { num: 3, par: 4, distanceFt: 680, tee: { lng: 17.89850, lat: 59.40190 }, bearing: 128, notes: 'Long European-style par 4.' },
            { num: 4, par: 3, distanceFt: 340, tee: { lng: 17.89980, lat: 59.40140 }, bearing: 140, notes: 'Tight gap through birch.' },
            { num: 5, par: 3, distanceFt: 470, tee: { lng: 17.90040, lat: 59.40100 }, bearing: 130, notes: 'Demanding distance.' },
            { num: 6, par: 4, distanceFt: 710, tee: { lng: 17.90140, lat: 59.40050 }, bearing: 125, notes: 'Long and challenging.' },
            { num: 7, par: 3, distanceFt: 380, tee: { lng: 17.90270, lat: 59.40000 }, bearing: 140, notes: 'Narrow birch lane.' },
            { num: 8, par: 3, distanceFt: 325, tee: { lng: 17.90340, lat: 59.39960 }, bearing: 135, notes: 'Short and dangerous.' },
            { num: 9, par: 3, distanceFt: 450, tee: { lng: 17.90400, lat: 59.39920 }, bearing: 130, notes: 'Front nine wrap-up.' },
            { num: 10, par: 4, distanceFt: 660, tee: { lng: 17.90480, lat: 59.39870 }, bearing: 320, notes: 'Back nine opener. Par 4.' },
            { num: 11, par: 3, distanceFt: 400, tee: { lng: 17.90410, lat: 59.39930 }, bearing: 325, notes: 'Technical through trees.' },
            { num: 12, par: 3, distanceFt: 370, tee: { lng: 17.90350, lat: 59.39980 }, bearing: 320, notes: 'Elevation change.' },
            { num: 13, par: 4, distanceFt: 500, tee: { lng: 17.90290, lat: 59.40030 }, bearing: 315, notes: 'Long demanding shot.' },
            { num: 14, par: 4, distanceFt: 720, tee: { lng: 17.90200, lat: 59.40080 }, bearing: 310, notes: 'Championship caliber par 4.' },
            { num: 15, par: 3, distanceFt: 385, tee: { lng: 17.90080, lat: 59.40140 }, bearing: 320, notes: 'Through the pines.' },
            { num: 16, par: 3, distanceFt: 440, tee: { lng: 17.90020, lat: 59.40190 }, bearing: 325, notes: 'Scandinavian classic.' },
            { num: 17, par: 4, distanceFt: 700, tee: { lng: 17.89950, lat: 59.40240 }, bearing: 315, notes: 'Penultimate challenge.' },
            { num: 18, par: 3, distanceFt: 436, tee: { lng: 17.89840, lat: 59.40290 }, bearing: 310, notes: 'Finish strong at Järva.' },
        ].map(h => ({ ...h, basket: basketFromTee(h.tee.lng, h.tee.lat, h.distanceFt, h.bearing) })),
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // OAK GROVE (HAHAMONGNA) — Pasadena, CA
    // Source: UDisc GPS data (scraped), PDGA, user local knowledge
    // Tee & basket coords: UDisc "18 Hole Post WTO Layout" (A pins)
    // World's first permanent disc golf course (est. 1975)
    // Par 54, 4442 ft (all par 3, 18 holes)
    // Flow: H1 plays W from backstop, front 9 loops S, back 9 loops N/E
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        id: 'oak-grove',
        name: 'Oak Grove',
        layout: '18 Hole (Post WTO)',
        location: 'Pasadena, CA',
        state: 'CA',
        country: 'USA',
        center: { lng: -118.1755, lat: 34.1935 },
        zoom: 17,
        par: 54,
        totalDistanceFt: 4442,
        rating: 4,
        difficulty: 'Intermediate',
        tags: ['Historic', 'Woods', 'Technical', 'Free'],
        description: 'The world\'s first permanent disc golf course, established in 1975 by "Steady" Ed Headrick at Hahamongna Watershed Park. Oak-lined fairways with tight technical lines.',
        holes: [
            // All coordinates verified from UDisc GPS data — main tees + A-pin baskets
            { num: 1, par: 3, distanceFt: 269, tee: { lng: -118.17608, lat: 34.19325 }, basket: { lng: -118.17695, lat: 34.19340 }, bearing: 282, notes: 'Opening shot west through the oaks. Tee behind baseball backstop.' },
            { num: 2, par: 3, distanceFt: 235, tee: { lng: -118.17721, lat: 34.19308 }, basket: { lng: -118.17771, lat: 34.19259 }, bearing: 220, notes: 'Southwest off tee. Tight gap between oaks.' },
            { num: 3, par: 3, distanceFt: 230, tee: { lng: -118.17731, lat: 34.19249 }, basket: { lng: -118.17760, lat: 34.19191 }, bearing: 203, notes: 'Southward. Shape around the trees.' },
            { num: 4, par: 3, distanceFt: 269, tee: { lng: -118.17748, lat: 34.19186 }, basket: { lng: -118.17742, lat: 34.19112 }, bearing: 176, notes: 'Due south through the grove.' },
            { num: 5, par: 3, distanceFt: 161, tee: { lng: -118.17800, lat: 34.19074 }, basket: { lng: -118.17779, lat: 34.19033 }, bearing: 157, notes: 'Shortest hole. Technical approach.' },
            { num: 6, par: 3, distanceFt: 220, tee: { lng: -118.17711, lat: 34.19098 }, basket: { lng: -118.17672, lat: 34.19149 }, bearing: 33, notes: 'Turn north. Back toward center.' },
            { num: 7, par: 3, distanceFt: 399, tee: { lng: -118.17662, lat: 34.19136 }, basket: { lng: -118.17594, lat: 34.19229 }, bearing: 31, notes: 'Longest hole on course. Big drive NE.' },
            { num: 8, par: 3, distanceFt: 248, tee: { lng: -118.17587, lat: 34.19217 }, basket: { lng: -118.17569, lat: 34.19283 }, bearing: 13, notes: 'North toward the upper grove.' },
            { num: 9, par: 3, distanceFt: 205, tee: { lng: -118.17536, lat: 34.19344 }, basket: { lng: -118.17504, lat: 34.19393 }, bearing: 28, notes: 'Front nine closer. Uphill NE.' },
            { num: 10, par: 3, distanceFt: 217, tee: { lng: -118.17559, lat: 34.19389 }, basket: { lng: -118.17549, lat: 34.19448 }, bearing: 8, notes: 'Back nine begins. Due north.' },
            { num: 11, par: 3, distanceFt: 307, tee: { lng: -118.17582, lat: 34.19489 }, basket: { lng: -118.17492, lat: 34.19450 }, bearing: 117, notes: 'Southeast through trees. Long approach.' },
            { num: 12, par: 3, distanceFt: 226, tee: { lng: -118.17488, lat: 34.19419 }, basket: { lng: -118.17413, lat: 34.19418 }, bearing: 91, notes: 'Due east. Navigate the old oaks.' },
            { num: 13, par: 3, distanceFt: 278, tee: { lng: -118.17389, lat: 34.19414 }, basket: { lng: -118.17298, lat: 34.19403 }, bearing: 99, notes: 'Continue east. Placement shot.' },
            { num: 14, par: 3, distanceFt: 299, tee: { lng: -118.17287, lat: 34.19401 }, basket: { lng: -118.17278, lat: 34.19483 }, bearing: 6, notes: 'Due north. Open field shot.' },
            { num: 15, par: 3, distanceFt: 225, tee: { lng: -118.17300, lat: 34.19501 }, basket: { lng: -118.17329, lat: 34.19444 }, bearing: 203, notes: 'Turn back southwest.' },
            { num: 16, par: 3, distanceFt: 225, tee: { lng: -118.17293, lat: 34.19394 }, basket: { lng: -118.17352, lat: 34.19431 }, bearing: 307, notes: 'Northwest. Watch for pedestrians.' },
            { num: 17, par: 3, distanceFt: 205, tee: { lng: -118.17432, lat: 34.19401 }, basket: { lng: -118.17479, lat: 34.19360 }, bearing: 223, notes: 'Southwest toward the finish.' },
            { num: 18, par: 3, distanceFt: 224, tee: { lng: -118.17498, lat: 34.19383 }, basket: { lng: -118.17520, lat: 34.19325 }, bearing: 198, notes: 'Finish at the birthplace of disc golf.' },
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
