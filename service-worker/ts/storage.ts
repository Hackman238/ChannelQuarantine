import { CommunicationRole, MessageType } from "./enums.js";
import { KeyValueMap, StorageObject, OldStorageObject, SettingsStorageObject, RulesSnapshot } from "./interfaces/storage.js";
import {
    AddBlockingRuleMessage,
    IsBlockedMessage,
    RemoveBlockingRuleMessage,
    RequestSettingsMessage,
    SettingsChangedMessage,
    StorageChangedMessage,
    RulesSyncMessage,
} from "./interfaces/interfaces.js";
import { clamp, getConfigTabs, queryTabs } from "./helper.js";

let defaultStorage: StorageObject = {
    version: "0",
    blockedChannels: [],
    blockedChannelsRegExp: {},
    blockedComments: {},
    blockedVideoTitles: {},
    excludedChannels: [],
};

const STORAGE_VERSION = "1.0";

let storageVersion: string | undefined = undefined;
let settings = {
    buttonVisible: true,
    buttonColor: "#FF3333",
    buttonSize: 142,
    animationSpeed: 200,
    blockSponsoredTiles: true,
    hideShortsShelves: true,
    hideRichShelves: true,
};

let blockedChannelsSet = new Set<string>();
let excludedChannels = new Set<string>();

let blockedChannelsRegExp: KeyValueMap = {};
let blockedComments: KeyValueMap = {};
let blockedVideoTitles: KeyValueMap = {};

function cloneKeyValueMap(map: KeyValueMap): KeyValueMap {
    return Object.assign({}, map);
}

export function getRulesSnapshot(): RulesSnapshot {
    return {
        blockedChannels: Array.from(blockedChannelsSet),
        blockedChannelsRegExp: cloneKeyValueMap(blockedChannelsRegExp),
        blockedComments: cloneKeyValueMap(blockedComments),
        blockedVideoTitles: cloneKeyValueMap(blockedVideoTitles),
        excludedChannels: Array.from(excludedChannels),
    };
}

function broadcastRulesSnapshot() {
    const message: RulesSyncMessage = {
        sender: CommunicationRole.SERVICE_WORKER,
        receiver: CommunicationRole.CONTENT_SCRIPT,
        type: MessageType.RULES_SYNC,
        content: getRulesSnapshot(),
    };

    chrome.tabs.query({ url: "*://www.youtube.com/*" }, (tabs) => {
        for (let index = 0; index < tabs.length; index++) {
            const tab = tabs[index];
            if (tab.id !== undefined) {
                chrome.tabs.sendMessage(tab.id, message);
            }
        }
    });
}


function normalizeChannelName(channel?: string): string | undefined {
    if (channel === undefined) return undefined;
    const trimmed = channel.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function storageGet<T>(query: any): Promise<T> {
    return new Promise((resolve) => {
        chrome.storage.local.get(query, (result) => {
            resolve((result ?? {}) as T);
        });
    });
}

function storageSet(items: Record<string, any>): Promise<void> {
    return new Promise((resolve) => {
        chrome.storage.local.set(items, () => {
            resolve();
        });
    });
}

export async function loadDataIfNecessary() {
    if (storageVersion != STORAGE_VERSION) {
        await loadDataFromStorage();

        console.log("Reload data");

        sendStorageChangedMessage();
        sendSettingsChangedMessage();
    }
}

/**
 * Load the blocking rules and settings.
 */
export async function loadDataFromStorage() {
    const result = await storageGet<Record<string, any>>({ ...defaultStorage, settings });

    let storageObject = result as StorageObject | undefined;
    if (storageObject === undefined || storageObject.version === undefined) {
        storageObject = { ...defaultStorage };
    }
    console.log("Loaded stored data", storageObject);

    blockedChannelsSet.clear();
    excludedChannels.clear();

    if (storageObject.version === "0") {
        await convertOldStorage();
    } else {
        let needsBlockedChannelUpdate = false;
        for (let index = 0; index < storageObject.blockedChannels.length; index++) {
            const channel = storageObject.blockedChannels[index];
            const normalizedChannel = normalizeChannelName(channel);
            if (normalizedChannel !== undefined) {
                blockedChannelsSet.add(normalizedChannel);
                if (normalizedChannel !== channel) {
                    needsBlockedChannelUpdate = true;
                }
            }
        }
        if (needsBlockedChannelUpdate) {
            await storageSet({ blockedChannels: Array.from(blockedChannelsSet) });
        }

        let needsExcludedChannelUpdate = false;
        for (let index = 0; index < storageObject.excludedChannels.length; index++) {
            const channel = storageObject.excludedChannels[index];
            const normalizedChannel = normalizeChannelName(channel);
            if (normalizedChannel !== undefined) {
                excludedChannels.add(normalizedChannel);
                if (normalizedChannel !== channel) {
                    needsExcludedChannelUpdate = true;
                }
            }
        }
        if (needsExcludedChannelUpdate) {
            await storageSet({ excludedChannels: Array.from(excludedChannels) });
        }

        blockedChannelsRegExp = storageObject.blockedChannelsRegExp;
        blockedComments = storageObject.blockedComments;
        blockedVideoTitles = storageObject.blockedVideoTitles;
    }

    const storedSettings = (result as { settings?: typeof settings }).settings ?? settings;
    let needsSettingsUpdate = false;
    settings.buttonVisible = storedSettings.buttonVisible;
    settings.buttonColor = storedSettings.buttonColor;
    settings.buttonSize = storedSettings.buttonSize;
    settings.animationSpeed = storedSettings.animationSpeed;
    if (storedSettings.blockSponsoredTiles === undefined) {
        needsSettingsUpdate = true;
    }
    settings.blockSponsoredTiles = storedSettings.blockSponsoredTiles ?? false;
    if (storedSettings.hideShortsShelves === undefined) {
        needsSettingsUpdate = true;
    }
    settings.hideShortsShelves = storedSettings.hideShortsShelves ?? false;
    if (storedSettings.hideRichShelves === undefined) {
        needsSettingsUpdate = true;
    }
    settings.hideRichShelves = storedSettings.hideRichShelves ?? false;
    if (needsSettingsUpdate) {
        await storageSet({ settings });
    }
    storageVersion = STORAGE_VERSION;
    broadcastRulesSnapshot();
}

/**
 * Add a blocking rule to the storage and send a storage changed message to all tabs running YouTube.
 * @param message The message containing the blocking rule to add.
 */
export function handleAddBlockingRuleMessage(message: AddBlockingRuleMessage) {
    if (message.content.blockedChannel !== undefined) {
        const normalizedChannel = normalizeChannelName(message.content.blockedChannel);
        if (normalizedChannel !== undefined) {
            blockedChannelsSet.add(normalizedChannel);
            storageSet({ blockedChannels: Array.from(blockedChannelsSet) });
        }
    }
    if (message.content.blockingChannelRegExp !== undefined) {
        blockedChannelsRegExp[message.content.blockingChannelRegExp] = message.content.caseInsensitive ? "i" : "";
        storageSet({ blockedChannelsRegExp });
    }
    if (message.content.blockingCommentRegExp !== undefined) {
        blockedComments[message.content.blockingCommentRegExp] = message.content.caseInsensitive ? "i" : "";
        storageSet({ blockedComments });
    }
    if (message.content.blockingVideoTitleRegExp !== undefined) {
        blockedVideoTitles[message.content.blockingVideoTitleRegExp] = message.content.caseInsensitive ? "i" : "";
        storageSet({ blockedVideoTitles });
    }
    if (message.content.excludedChannel !== undefined) {
        const normalizedChannel = normalizeChannelName(message.content.excludedChannel);
        if (normalizedChannel !== undefined) {
            excludedChannels.add(normalizedChannel);
            storageSet({ excludedChannels: Array.from(excludedChannels) });
        }
    }

    sendStorageChangedMessage();
}

/**
 * Remove a blocking rule from the storage and send a storage changed message to all tabs running YouTube.
 * @param message The message containing the blocking rule to remove.
 */
export function handleRemoveBlockingRuleMessage(message: RemoveBlockingRuleMessage) {
    if (message.content.blockedChannel !== undefined) {
        for (let index = 0; index < message.content.blockedChannel.length; index++) {
            const channel = message.content.blockedChannel[index];
            const normalizedChannel = normalizeChannelName(channel);
            if (channel !== undefined) {
                blockedChannelsSet.delete(channel);
            }
            if (normalizedChannel !== undefined) {
                blockedChannelsSet.delete(normalizedChannel);
            }
        }
        storageSet({ blockedChannels: Array.from(blockedChannelsSet) });
    }
    if (message.content.blockingChannelRegExp !== undefined) {
        for (let index = 0; index < message.content.blockingChannelRegExp.length; index++) {
            delete blockedChannelsRegExp[message.content.blockingChannelRegExp[index]];
        }
        storageSet({ blockedChannelsRegExp });
    }
    if (message.content.blockingCommentRegExp !== undefined) {
        for (let index = 0; index < message.content.blockingCommentRegExp.length; index++) {
            delete blockedComments[message.content.blockingCommentRegExp[index]];
        }
        storageSet({ blockedComments });
    }
    if (message.content.blockingVideoTitleRegExp !== undefined) {
        for (let index = 0; index < message.content.blockingVideoTitleRegExp.length; index++) {
            delete blockedVideoTitles[message.content.blockingVideoTitleRegExp[index]];
        }
        storageSet({ blockedVideoTitles });
    }
    if (message.content.excludedChannel !== undefined) {
        for (let index = 0; index < message.content.excludedChannel.length; index++) {
            const channel = message.content.excludedChannel[index];
            const normalizedChannel = normalizeChannelName(channel);
            if (channel !== undefined) {
                excludedChannels.delete(channel);
            }
            if (normalizedChannel !== undefined) {
                excludedChannels.delete(normalizedChannel);
            }
        }
        storageSet({ excludedChannels: Array.from(excludedChannels) });
    }

    sendStorageChangedMessage();
}

/**
 * Checks if the given userChannelName, videoTitle or commentContent matches any of the blocking rules.
 * @param message The message containing userChannelName, videoTitle or commentContent.
 * @returns
 */
export function handleIsBlockedMessage(message: IsBlockedMessage): boolean {
    if (message.content.userChannelName !== undefined) {
        const normalizedChannel = normalizeChannelName(message.content.userChannelName);
        if (normalizedChannel !== undefined && excludedChannels.has(normalizedChannel)) return false;
        if (excludedChannels.has(message.content.userChannelName)) return false;
        if (normalizedChannel !== undefined && blockedChannelsSet.has(normalizedChannel)) return true;
        if (blockedChannelsSet.has(message.content.userChannelName)) return true;
        for (const key in blockedChannelsRegExp) {
            if (Object.prototype.hasOwnProperty.call(blockedChannelsRegExp, key)) {
                const regEgx = new RegExp(key, blockedChannelsRegExp[key]);
                if (
                    regEgx.test(message.content.userChannelName) ||
                    (normalizedChannel !== undefined && regEgx.test(normalizedChannel))
                )
                    return true;
            }
        }
    }
    if (message.content.videoTitle !== undefined) {
        for (const key in blockedVideoTitles) {
            if (Object.prototype.hasOwnProperty.call(blockedVideoTitles, key)) {
                const regEgx = new RegExp(key, blockedVideoTitles[key]);
                if (regEgx.test(message.content.videoTitle)) return true;
            }
        }
    }
    if (message.content.commentContent !== undefined) {
        for (const key in blockedComments) {
            if (Object.prototype.hasOwnProperty.call(blockedComments, key)) {
                const regEgx = new RegExp(key, blockedComments[key]);
                if (regEgx.test(message.content.commentContent)) return true;
            }
        }
    }
    return false;
}

/**
 * Reloads the storage and settings and sends a storage changed message to all tabs running YouTube.
 * @param message The StorageChangedMessage.
 */
export async function handleStorageChangedMessage(message: StorageChangedMessage) {
    await loadDataFromStorage();
    sendStorageChangedMessage();
    sendSettingsChangedMessage();
}

/**
 * Returns the settings.
 * @param message The RequestSettingsMessage.
 * @returns The settings.
 */
export function handleRequestSettings(message: RequestSettingsMessage): {
    buttonVisible: boolean;
    buttonColor: string;
    buttonSize: number;
    animationSpeed: number;
    blockSponsoredTiles: boolean;
    hideShortsShelves: boolean;
    hideRichShelves: boolean;
} {
    return settings;
}

/**
 * Sends a storage changed message to all tabs that have YouTube open and the config tab if an tab id is available.
 */
async function sendStorageChangedMessage() {
    const storageChangedMessage: StorageChangedMessage = {
        sender: CommunicationRole.SERVICE_WORKER,
        receiver: CommunicationRole.CONTENT_SCRIPT,
        type: MessageType.STORAGE_CHANGED,
        content: undefined,
    };

    const youtubeTabs = await queryTabs({});
    for (let index = 0; index < youtubeTabs.length; index++) {
        const tab = youtubeTabs[index];
        if (tab.id !== undefined && tab.url !== undefined && tab.url.includes("youtube.com")) {
            chrome.tabs.sendMessage(tab.id, storageChangedMessage);
        }
    }

    const configTabs = await getConfigTabs();
    for (let index = 0; index < configTabs.length; index++) {
        const tab = configTabs[index];
        const storageChangedMessageForSettings = {
            sender: CommunicationRole.SERVICE_WORKER,
            receiver: CommunicationRole.SETTINGS,
            type: MessageType.STORAGE_CHANGED,
            content: undefined,
        };
        chrome.tabs.sendMessage(tab.id, storageChangedMessageForSettings);
    }

    broadcastRulesSnapshot();
}

/**
 * Sends a settings changed message to all tabs that have YouTube open.
 * If is gets a settings changed message it changes the receiver to CONTENT_SCRIPT.
 * @param message The settings changed message.
 */
export async function sendSettingsChangedMessage(
    message: SettingsChangedMessage = {
        sender: CommunicationRole.SETTINGS,
        receiver: CommunicationRole.CONTENT_SCRIPT,
        type: MessageType.SETTINGS_CHANGED,
        content: settings,
    }
) {
    message.receiver = CommunicationRole.CONTENT_SCRIPT;
    settings = { ...settings, ...message.content };
    await storageSet({ settings });

    const youtubeTabs = await queryTabs({});
    for (let index = 0; index < youtubeTabs.length; index++) {
        const tab = youtubeTabs[index];
        if (tab.id !== undefined && tab.url !== undefined && tab.url.includes("youtube.com")) {
            chrome.tabs.sendMessage(tab.id, message);
        }
    }
}

/**
 * Loads the old storage data and converts it to the new format.
 * It stores the new data and removes the old.
 */
async function convertOldStorage() {
    const defaultOldStorage: OldStorageObject = {
        "0": {},
        "1": {},
        "2": {},
        "3": {},
        "4": {},
        content_ui: {
            "0": true,
            "1": "#717171",
            "2": 106,
            "3": 200,
        },
        settings_ui: {
            0: -1,
            1: false,
            2: false,
        },
    };
    const result = await storageGet<OldStorageObject>(defaultOldStorage);
    const storageObject = result as OldStorageObject;
    console.log("Loaded stored data", storageObject);

    if (
        storageObject[0] === undefined ||
        storageObject[1] === undefined ||
        storageObject[2] === undefined ||
        storageObject[3] === undefined ||
        storageObject[4] === undefined
    ) {
        return;
    }

    // Add blocked channels
    for (const key in storageObject[0]) {
        if (Object.prototype.hasOwnProperty.call(storageObject[0], key)) {
            const normalizedChannel = normalizeChannelName(key);
            if (normalizedChannel !== undefined) {
                blockedChannelsSet.add(normalizedChannel);
            }
        }
    }

    // Add blocked blockedVideoTitles
    for (const key in storageObject[1]) {
        if (Object.prototype.hasOwnProperty.call(storageObject[1], key)) {
            blockedVideoTitles[key] = storageObject[1][key] === 0 ? "i" : "";
        }
    }

    // Add blocked blockedChannelsRegExp
    for (const key in storageObject[2]) {
        if (Object.prototype.hasOwnProperty.call(storageObject[2], key)) {
            blockedChannelsRegExp[key] = storageObject[2][key] === 0 ? "i" : "";
        }
    }

    // Add blocked blockedComments
    for (const key in storageObject[3]) {
        if (Object.prototype.hasOwnProperty.call(storageObject[3], key)) {
            blockedComments[key] = storageObject[3][key] === 0 ? "i" : "";
        }
    }

    // Add excluded channels
    for (const key in storageObject[4]) {
        if (Object.prototype.hasOwnProperty.call(storageObject[4], key)) {
            const normalizedChannel = normalizeChannelName(key);
            if (normalizedChannel !== undefined) {
                excludedChannels.add(normalizedChannel);
            }
        }
    }

    // Add settings
    let settingsStorageObject: SettingsStorageObject = {
        version: STORAGE_VERSION,
        settings: {
            // The old format only had two designs. Dark: 0 and Light: 1.
            // Currently Device: 0 is the default, therefore adding 1 adjusts this.
            design: clamp(0, 2, storageObject.settings_ui[0] + 1),
            // No longer in use
            advancedView: storageObject.settings_ui[1],
            buttonVisible: storageObject.content_ui[0],
            buttonColor: storageObject.content_ui[1],
            // The old default was 106, but in the new implementation this is pretty small so add 36 to adjust.
            // Also clamp the value between 100 and 200.
            buttonSize: clamp(100, 200, storageObject.content_ui[2] + 36),
            animationSpeed: clamp(100, 200, storageObject.content_ui[3]),
            blockSponsoredTiles: false,
            hideShortsShelves: false,
            hideRichShelves: false,
        },
    };

    // Write data to storage
    await storageSet({
        version: STORAGE_VERSION,
        blockedChannels: Array.from(blockedChannelsSet),
        blockedChannelsRegExp,
        blockedComments,
        blockedVideoTitles,
        excludedChannels: Array.from(excludedChannels),
        settings: settingsStorageObject.settings,
    });
    chrome.storage.local.remove(["0", "1", "2", "3", "4", "content_ui", "settings_ui"]);
}







