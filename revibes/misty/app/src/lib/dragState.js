// The cropped example section being dragged. HTML5 drag events only expose the
// data's type during dragover, so the crop itself is kept here.
export const DRAG_MIME = "application/x-misty-crop";
let current = null;
export const setDrag = (d) => { current = d; };
export const getDrag = () => current;
