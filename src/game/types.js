/**
 * @typedef {{x:number, y:number, z:number}} Vec3
 * @typedef {{x:number, z:number}} Vec2XZ
 *
 * @typedef {{
 *   id:number,
 *   x:number,
 *   z:number,
 *   y:number,
 *   vx:number,
 *   vz:number,
 *   heading:number,
 *   moveHeading:number,
 *   speed:number,
 *   health:number,
 *   cash:number,
 *   wanted:number,
 *   wantedTimer:number,
 *   invuln:number,
 *   mode:"onfoot"|"vehicle",
 *   vehicleId:number|null
 * }} PlayerState
 *
 * @typedef {{
 *   id:number,
 *   kind:"civilian"|"police",
 *   ai:"traffic"|"parked"|"player"|"police",
 *   x:number,
 *   y:number,
 *   z:number,
 *   vx:number,
 *   vz:number,
 *   speed:number,
 *   heading:number,
 *   axis:"x"|"z",
 *   dir:1|-1,
 *   lineCoord:number,
 *   roadCenter:number,
 *   targetCoord:number,
 *   health:number,
 *   color:string,
 *   disabled:boolean,
 *   sirenPhase:number,
 *   throttleInput:number,
 *   steerInput:number,
 *   stuckTimer:number,
 *   recoveryCooldown:number
 * }} VehicleState
 *
 * @typedef {{
 *   id:number,
 *   x:number,
 *   z:number,
 *   y:number,
 *   vx:number,
 *   vz:number,
 *   heading:number,
 *   axis:"x"|"z",
 *   line:number,
 *   dir:1|-1,
 *   targetX:number,
 *   targetZ:number,
 *   baseSpeed:number,
 *   panic:number,
 *   panicHeading:number,
 *   alive:boolean,
 *   tone:string,
 *   shirt:string
 * }} PedestrianState
 *
 * @typedef {{id:number, x:number, y:number, z:number, value:number, bob:number}} PickupState
 *
 * @typedef {{
 *   size:number,
 *   roadCenters:number[],
 *   sidewalkGuides:number[],
 *   buildings:Array<{x:number,z:number,w:number,d:number,h:number,color:string}>,
 *   trees:Array<{x:number,z:number,scale:number}>,
 *   lamps:Array<{x:number,z:number}>,
 *   roadWidth:number,
 *   sidewalkWidth:number,
 *   laneOffset:number,
 *   streetEdge:number,
 *   districtName:string,
 *   playerSpawn:{x:number,z:number,heading:number},
 *   vehicleResetSpawn:{axis:"x"|"z",dir:1|-1,roadCenter:number,lineCoord:number,x:number,z:number,targetCoord:number,heading:number}
 * }} WorldState
 */

export {};
