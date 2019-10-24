'use strict';

var Metadata = {

    focusedWindowId: 0,

    lastWindowNumber: 0,

    windows: {},

    async add(windowObject) {
        const windowId = windowObject.id;
        const tabCount = windowObject.tabs ? windowObject.tabs.length : (await browser.tabs.query({ windowId })).length;
        const number = ++this.lastWindowNumber;
        this.windows[windowId] = {
            id: windowId,
            tabCount,
            number,
            lastFocused: Date.now(),
            defaultName: `Window ${number} / id ${windowId}`,
            givenName: ``,
            textColor: '#fff',
            backColor: '#00f',
        };
    },

    remove(windowId) {
        delete this.windows[windowId];
    },

    async init(callbacks) {
        const allWindows = await browser.windows.getAll({ populate: true });
        for (const windowObject of allWindows) {
            await this.add(windowObject);
            const windowId = windowObject.id;
            for (const callback of callbacks) callback(windowId);
        }
    },

    getName(windowId) {
        const data = this.windows[windowId];
        return data.givenName || data.defaultName;
    },

    setName(windowId, name) {
        this.windows[windowId].givenName = name;
    },
    },

}