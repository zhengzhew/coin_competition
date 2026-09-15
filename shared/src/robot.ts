import { DIRECTIONS, type GameState, type Command, type StepResult, type DomainEvent, type RobotAction, type Direction } from './types.js';

export const ROBOT_ACTIONS: RobotAction[] = ['forward','backward','turn_left','turn_right','grab','release','wait'];
const headings: Direction[] = ['up','right','down','left'];

/** Shared authoritative robot rules. Camera pose never participates in movement. */
export function stepRobot(state: GameState, command: Command, maxCommands: number): StepResult {
  const robot = state.robot!;
  const next: GameState = {...state, robot: {...robot, cargo: {...robot.cargo},...(robot.automation?{automation:{...robot.automation}}:{})}, collected: [...state.collected], trace: [...state.trace]};
  const r = next.robot!;
  let type: DomainEvent['type'] = 'action_empty';
  const action = command.direction;
  if (state.status === 'running') {
    next.consumed_commands++;
    const [dx,dy] = DIRECTIONS[r.facing];
    const front: [number,number] = [state.x+dx,state.y+dy];
    const same = (a: [number,number], b: [number,number]) => a[0]===b[0] && a[1]===b[1];
    const occupied = (p: [number,number]) => Object.values(r.cargo).some(c=>same(c,p));
    const machine=r.config.automation;
    if(machine && r.automation && same(front,machine.switch) && (action==='grab'||action==='release')) {
      if(action==='release') {r.closed=false;r.automation.last_result='reset';type='released';}
      else if(r.closed) {r.automation.last_result='latched';}
      else {
        r.closed=true;
        const id=Object.entries(r.cargo).find(([,p])=>same(p,machine.loading))?.[0];
        const cart=machine.cart_path[r.automation.tick%machine.cart_path.length];
        if(id&&same(cart,machine.dock)) {
          delete r.cargo[id];next.collected.push(id);r.automation.cart_cargo=id;r.automation.last_result='loaded';type='delivered';
        } else r.automation.last_result='missed';
      }
    } else if(action==='wait' && machine) {type='waited';}
    else if (action==='turn_left' || action==='turn_right') {
      r.facing=headings[(headings.indexOf(r.facing)+(action==='turn_left'?3:1))%4];type='turned';
    } else if (action==='forward' || action==='backward') {
      const sign=action==='forward'?1:-1;
      const p: [number,number]=[state.x+dx*sign,state.y+dy*sign];
      if (!r.config.cells.some(c=>same([c[0],c[1]],p)) || state.walls.has(p.join(',')) || occupied(p)) {
        next.collisions++;type='collision';
      } else { next.x=p[0];next.y=p[1];next.steps++;next.trace.push(p);type='move_success'; }
    } else if (action==='grab') {
      r.closed=true;
      if (!r.holding) {
        const found=Object.entries(r.cargo).find(([,p])=>same(p,front));
        if(found) {r.holding=found[0];delete r.cargo[found[0]];type='grabbed';}
      }
    } else if(action==='release') {
      if(!r.holding) {r.closed=false;type='released';}
      else if(r.config.cells.some(c=>same([c[0],c[1]],front)) && !state.walls.has(front.join(',')) && !occupied(front)) {
        const id=r.holding;r.holding=null;r.closed=false;
        if(same(r.config.deliveries[id],front)) {next.collected.push(id);next.collected_mask|=1<<Object.keys(r.config.deliveries).indexOf(id);type='delivered';}
        else {r.cargo[id]=front;type='released';}
      }
    }
    if(machine&&r.automation) {
      // One accepted action advances one beat, identically in keyboard, code and replay.
      for(const [id,p] of Object.entries(r.cargo)) {
        const index=machine.belt.findIndex(cell=>same(cell,p));
        if(index>=0)r.cargo[id]=machine.belt[(index+1)%machine.belt.length];
      }
      r.automation.tick++;
    }
    const targetIds = [...Object.keys(r.config.deliveries), ...Object.keys(r.checkpoints ?? {})];
    if (type === 'move_success') {
      const expected=r.config.checkpoint_order?.find(id=>!next.collected.includes(id));
      const checkpoint = Object.entries(r.checkpoints ?? {}).find(([id,p])=>same(p,[next.x,next.y]) && !next.collected.includes(id) && (!r.config.checkpoint_order || expected===id));
      if (checkpoint) {next.collected.push(checkpoint[0]);type='coin_collected';}
    }
    next.collected_mask = next.collected.reduce((mask,id)=>mask | (1 << targetIds.indexOf(id)),0);
    if(targetIds.length > 0 && targetIds.every(id=>next.collected.includes(id))) {next.status='success';type='all_collected';}
    else if(next.consumed_commands>=maxCommands) next.status='command_limit';
  }
  return {state:next,event:{type,command_index:command.command_index,direction:action,position:[next.x,next.y],steps:next.steps,collected_order:next.collected}};
}
