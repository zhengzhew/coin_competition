// Validation fixtures, not imported by the student application.
import type {TemplateRow} from './python-template.js';
let serial=0;
const action=(direction:string,count=1):TemplateRow=>({row_id:`ref-${++serial}`,direction,count:String(count)});
const repeat=(count:number,children:TemplateRow[]):TemplateRow=>({...action('repeat',count),children});
export function curriculumReferencePrograms():TemplateRow[][] {
  return [
    [repeat(4,[action('forward',4),action('turn_right')])],
    [repeat(4,[action('forward',3),action('backward',3),action('turn_right')])],
    [repeat(4,[action('forward'),action('backward'),action('turn_left'),action('forward',4)])],
    [repeat(3,[action('forward',4),action('grab'),action('turn_left'),action('release'),action('turn_right'),action('turn_right')])],
    [repeat(3,[action('turn_left'),action('forward',2),action('backward',4),action('forward',2),action('turn_right'),action('forward',4)])],
    [repeat(3,[action('forward',3),action('grab'),action('turn_right'),action('backward'),action('forward'),action('release'),action('turn_left')])],
  ];
}
