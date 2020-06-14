export const sum = array => array.reduce((a, b) => a + b, 0);

export const getScrollbarWidth = $el => $el.offsetWidth - $el.clientWidth;

// Return array of active modifiers in the form of ['Alt', 'Ctrl', 'Shift'], or parts thereof, or [].
export const getModifiers =
    event => ['altKey', 'ctrlKey', 'shiftKey'].filter(m => event[m]).map(m => m[0].toUpperCase() + m.slice(1, -3));

// Forgiving* shorthands for element class methods. (*Silently does nothing if $el is undefined)
export const hasClass = (cls, $el) => $el && $el.classList.contains(cls);
export const addClass = (cls, $el) => $el && $el.classList.add(cls);
export const removeClass = (cls, $el) => $el && $el.classList.remove(cls);
export const toggleClass = (cls, $el, force) => $el && $el.classList.toggle(cls, force);

// Element type
export const isButton = $el => $el.tagName === 'BUTTON';
export const isInput = $el => $el.tagName === 'INPUT';

// Add item to groupMap according to groupId.
// The groupMap should be an existing object that maps a groupId to an array of member items.
export function addToGroup(item, groupId, groupMap) {
    if (groupId in groupMap) {
        groupMap[groupId].push(item);
    } else {
        groupMap[groupId] = [item];
    }
}