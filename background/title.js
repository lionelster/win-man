import { windows as metaWindows } from './metadata.js';

export function init() {}

export function update(windowId) {
    browser.windows.update(windowId, { titlePreface: windowTitle(windowId) });
}
export { update as create };

function windowTitle(windowId) {
    return `${metaWindows[windowId].displayName} - `;
}