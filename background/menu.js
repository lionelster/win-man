import * as Modifier from '../modifier.js';
import * as Metadata from './metadata.js';
import * as WindowTab from './windowtab.js';
let Stash;

const contextTitle = {
    tab:      'Send Tab to &Window',
    link:     'Open Link in &Window',
    bookmark: '&Unstash',
}

const windowsSubmenu = {

    enabledContexts: [],
    usedBy: context => ['tab', 'link'].includes(context),

    init(context) {
        this.enabledContexts.push(context);
        // Add dummy submenu item to avoid parent menu resizing onShown:
        const id = this._menuId(context);
        browser.menus.create({ contexts: [context], parentId: context, id, title: '-' });
    },

    // Update menu's enabled state based on window count.
    updateAvailability() {
        const properties = { enabled: Metadata.windowCount > 1 };
        this.enabledContexts.forEach(context => browser.menus.update(context, properties));
    },

    // Clear and populate `context` menu with other-window menu items, sorted by lastFocsued.
    populate(context, currentWindowId) {
        const properties = { contexts: [context], parentId: context };
        for (const { id: windowId } of Metadata.sorted()) {
            const menuId = this._menuId(context, windowId);
            browser.menus.remove(menuId);
            if (windowId == currentWindowId) continue;
            browser.menus.create({ ...properties, id: menuId, title: Metadata.getName(windowId) });
        }
        browser.menus.remove(this._menuId(context)); // Remove dummy if it exists
        browser.menus.refresh();
    },

    openLink(url, windowId, modifiers) {
        browser.tabs.create({ windowId, url });
        if (modifiers.includes(Modifier.BRING)) WindowTab.switchWindow(windowId);
    },

    async moveTab(tab, windowId, modifiers, originWindowId) {
        const tabs = tab.highlighted ? await WindowTab.getSelectedTabs() : [tab];
        WindowTab.doAction({ action: 'send', windowId, originWindowId, modifiers, tabs });
    },

    _menuId: (context, windowId = '') => `${windowId}-${context}`,

}

// Create a menu item for each given context.
export function init(contextList, StashModule) {
    Stash = StashModule;

    for (const context of contextList) {
        createMenuItem(context);
        if (windowsSubmenu.usedBy(context)) windowsSubmenu.init(context);
    }
    windowsSubmenu.updateAvailability();
    browser.menus.onShown.addListener   (onMenuShow);
    browser.menus.onClicked.addListener (onMenuClick);
}

export function update() {
    windowsSubmenu.updateAvailability();
}

function createMenuItem(context) {
    browser.menus.create({ contexts: [context], id: context, title: contextTitle[context] });
}

async function onMenuShow(info, tab) {
    if (Stash) {
        const nodeId = info.bookmarkId;
        if (nodeId) {
            // Disable menu item if node is root folder or separator
            const enabled = !isRootNode(nodeId) && (await getNode(nodeId)).type !== 'separator';
            browser.menus.update('bookmark', { enabled });
            browser.menus.refresh();
            return;
        }
    }

    // Populate windows submenu if applicable
    const contexts = info.contexts;
    const context =
        contexts.includes('link') ? 'link' :
        contexts.includes('tab') ? 'tab' :
        null;
    if (!context) return;
    if (windowsSubmenu.enabledContexts.includes(context)) {
        windowsSubmenu.populate(context, tab.windowId);
    }
}

function onMenuClick(info, tab) {
    if (Stash) {
        const nodeId = info.bookmarkId;
        if (nodeId) return Stash.unstash(nodeId);
    }

    // Windows submenu item
    const windowId = parseInt(info.menuItemId);
    if (!windowId) return;
    const url = info.linkUrl;
    url ? windowsSubmenu.openLink (url, windowId, info.modifiers)
        : windowsSubmenu.moveTab  (tab, windowId, info.modifiers, tab.windowId);
}

const isRootNode = nodeId => nodeId.endsWith('_____');
const getNode = async nodeId => (await browser.bookmarks.get(nodeId))[0];