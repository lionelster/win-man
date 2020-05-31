/*
- Data created and used by this webextension pertaining to a window are 'metadata' and an object collecting them is a
  'metawindow'. The metawindows live in Metadata.windowMap as the webextension's source-of-truth.
- Window objects returned by the WebExtensions API are named windowObject to avoid confusion with the global window object.
*/

import * as Settings from './settings.js';
import * as Metadata from './metadata.js';
import * as WindowTab from './windowtab.js';

import * as Badge from './badge.js';
import * as Menu from './menu.js';
import * as Title from './title.js';
const WindowParts = [Badge, Menu, Title];

// Object.assign(window, { WindowTab }); // for debugging

init();
setIconTitle();
browser.runtime.onInstalled.addListener(onExtInstalled);
browser.windows.onCreated.addListener(onWindowCreated);
browser.windows.onRemoved.addListener(onWindowRemoved);
browser.windows.onFocusChanged.addListener(onWindowFocused);
browser.tabs.onDetached.addListener(onTabDetached);
browser.runtime.onMessage.addListener(onRequest);

async function init() {
    const [windowObjects,] = await Promise.all([browser.windows.getAll(), Settings.retrieve()]);
    WindowParts.forEach(part => part.init());
    await Metadata.init(windowObjects);
    windowObjects.forEach(windowObject => onWindowCreated(windowObject, true));
}

async function setIconTitle() {
    const { name } = browser.runtime.getManifest();
    const [{ shortcut }] = await browser.commands.getAll();
    browser.browserAction.setTitle({ title: `${name} (${shortcut})` });
}

function onExtInstalled(details) {
    if (details.reason === 'install') WindowTab.openHelp();
}

async function onWindowCreated(windowObject, isInit) {
    if (!isInit) await Metadata.add(windowObject);
    const windowId = windowObject.id;
    WindowParts.forEach(part => part.create(windowId));
    WindowTab.maximizeTearOffWindow(windowId);
    if (windowObject.focused) onWindowFocused(windowId);
}

function onWindowRemoved(windowId) {
    Metadata.remove(windowId);
    Menu.remove(windowId);
}

function onWindowFocused(windowId) {
    if (isWindowBeingCreated(windowId)) return;
    Metadata.windowMap[windowId].lastFocused = Date.now();
    Menu.show(Metadata.focusedWindow.id);
    Metadata.focusedWindow.id = windowId;
    Menu.hide(windowId);
}

function isWindowBeingCreated(windowId) {
    return !(windowId in Metadata.windowMap);
}

function onTabDetached(tabId, { oldWindowId }) {
    Metadata.lastDetach.set(tabId, oldWindowId);
}

async function onRequest(request) {

    // From popup/popup.js
    if (request.popup) {
        return {
            SETTINGS:         Settings.SETTINGS,
            metaWindows:      Object.values(Metadata.windowMap),
            currentWindowId:  Metadata.focusedWindow.id,
            selectedTabCount: (await WindowTab.getSelectedTabs()).length,
        };
    }
    if (request.action) return WindowTab.doAction(request);
    if (request.help) return WindowTab.openHelp();

    // From popup/editmode.js
    if (request.giveName) {
        const windowId = request.windowId;
        const error = await Metadata.giveName(windowId, request.name);
        if (!error) WindowParts.forEach(part => part.update(windowId));
        return error;
    }
}