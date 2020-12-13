import * as Name from './name.js';
import * as Metadata from './metadata.js';
import { SETTINGS } from './settings.js';

let HOME_ID;

const isBookmark = node => node.type === 'bookmark';

const unstashPagePath = browser.runtime.getURL('../stash/tab');
const createUnstashPageUrl = ({ url, title }) => `${unstashPagePath}?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`;
const isUnstashPageUrl = url => url.startsWith(unstashPagePath);
const getUrlFromUnstashPageUrl = url => decodeURIComponent((new URL(url)).searchParams.get('url'));

export async function init() {
    HOME_ID = await getHomeId();
}

// Identify the stash home's folder id based on settings.
async function getHomeId() {
    let id = SETTINGS.stash_home; // Id of a root folder; if followed by a '/', indicates that the home is a subfolder
    if (id.endsWith('/')) {
        id = id.slice(0, -1); // Strip '/'
        const title = SETTINGS.stash_home_name;
        const folder = await findFolderByTitle(title, id);
        id = folder ? folder.id : (await browser.bookmarks.create({ title, parentId: id })).id; // If subfolder not found, create it
    }
    return id;
}

async function findFolderByTitle(title, parentId) {
    const nodes = await browser.bookmarks.getChildren(parentId);
    return nodes.find(node => node.title === title && node.type === 'folder');
}


/* --- LIST (& FIX) FOLDERS --- */

// List of stashed-window folders, to be populated/cleared when popup opens/closes.
// This arragement keeps getAndFixFolders() data available in this module throughout the popup's duration.
export const list = [];

list.populate = async () => {
    list.push(...await getAndFixFolders());
    return list;
}

list.clear = () => list.length = 0;

// Return array of simplified folder objects { id, title, bookmarkCount } with unique names, representing stashed-windows.
// Side-effect: Rename any folders with invalid names.
async function getAndFixFolders() {
    const nodes = (await browser.bookmarks.getSubTree(HOME_ID))[0].children;
    const folders = [];
    const names = new Set();
    for (let i = nodes.length; i--;) { // Reverse loop
        const node = nodes[i];
        const type = node.type;
        if (type === 'separator') break; // Stop at first separator from the end
        if (type === 'folder') {
            const id = node.id;
            const title = fixFolderName(id, node.title);
            if (names.has(title)) continue; // Ignore folder if name seen before
            const bookmarkCount = node.children.filter(isBookmark).length;
            folders.push({ id, title, bookmarkCount });
            names.add(title);
        }
    }
    return folders;
}

// Rename folder if its name is invalid. Return name.
function fixFolderName(id, name) {
    const fixedName = Name.validify(name);
    if (fixedName !== name) browser.bookmarks.update(id, { title: fixedName });
    return fixedName;
}


/* --- STASH WINDOW --- */

// Turn window/tabs into folder/bookmarks.
// Create folder if nonexistent, save tabs as bookmarks in folder, and close window.
export async function stash(windowId) {
    const name = Metadata.getName(windowId);
    const [tabs, folder] = await Promise.all([ browser.tabs.query({ windowId }), getStashFolder(name) ]);
    const parentId = folder.id;
    for (let { title, url } of tabs) {
        if (isUnstashPageUrl(url)) url = getUrlFromUnstashPageUrl(url);
        await browser.bookmarks.create({ title, url, parentId }); // Serial await necessary for bookmarks to be in order
    }
    browser.windows.remove(windowId);
    return folder;
}

//For a given name (title), return matching folder or create folder and return its promise.
async function getStashFolder(title) {
    const folders = list.length ? list : await getAndFixFolders();
    let sameNameFolder, createFolderPromise;

    // Name conflict check
    while (true) {
        sameNameFolder = folders.find(folder => folder.title === title);
        if (!sameNameFolder) {
            // No conflict; create new folder and proceed
            createFolderPromise = browser.bookmarks.create({ title, parentId: HOME_ID });
            break;
        }
        if (!sameNameFolder.bookmarkCount) break; // Existing folder has no bookmarks; proceed
        title = Name.applyNumberPostfix(title); // Uniquify name and repeat check
    }
    return createFolderPromise || sameNameFolder;
}


/* --- UNSTASH WINDOW --- */

// Turn folder/bookmarks into window/tabs.
// If folder, create and populate window. Bookmarks and empty folder are removed.
export async function unstash(nodeId) {
    const node = (await browser.bookmarks.get(nodeId))[0];
    switch (node.type) {
        case 'bookmark':
            const currentWindow = await browser.windows.getLastFocused();
            turnBookmarkIntoTab(node, currentWindow.id, true);
            break;
        case 'folder':
            unstash.info = unstash.createWindow(node);
    }
}

// Create window and let onWindowCreated() in background.js trigger the rest of the unstash process.
unstash.createWindow = async folder => {
    const window = await browser.windows.create();
    return {
        windowId:   window.id,
        blankTabId: window.tabs[0].id,
        folderId:   folder.id,
        name:       folder.title,
    };
}

unstash.onWindowCreated = async windowId => {
    const info = await unstash.info;
    if (windowId !== info?.windowId) return;
    delete unstash.info;

    const name = Name.uniquify(info.name, windowId);
    Metadata.giveName(windowId, name);

    const bookmarks = (await browser.bookmarks.getChildren(info.folderId)).filter(isBookmark);
    if (bookmarks.length) {
        await Promise.all( bookmarks.map(b => turnBookmarkIntoTab(b, windowId)) ); // Populate window
        browser.tabs.remove(info.blankTabId); // Remove initial blank tab
    }
    browser.bookmarks.remove(info.folderId).catch(() => null); // Remove folder if empty
}

async function turnBookmarkIntoTab({ url, title, id }, windowId, active) {
    const properties = (url === 'about:newtab')
        ? { windowId, active }
        : { windowId, active, discarded: !active, title: (active ? null : title), url }; // Only discarded tab can be given title
    const creating = browser.tabs.create(properties).catch(() => openUnstashPage(properties));
    const removing = browser.bookmarks.remove(id);
    const [tab,] = await Promise.all([ creating, removing ]);
    return tab;
}

function openUnstashPage(properties) {
    properties.url = createUnstashPageUrl(properties);
    browser.tabs.create(properties);
}
