const cqStorageWindow = window as typeof window & {
    cqApplySponsoredBlocking?: (root?: ParentNode) => void;
    cqClearSponsoredBlocking?: () => void;
    cqBlockSponsoredTiles?: boolean;
    cqApplyShortsBlocking?: (root?: ParentNode) => void;
    cqClearShortsBlocking?: (root?: ParentNode) => void;
    cqHideShortsShelves?: boolean;
    scheduleObserverUpdate?: () => void;
    updateRulesCache?: (snapshot: RulesSnapshot) => void;
};

type RuleCache = {
    blockedChannelsNormalized: Set<string>;
    blockedChannelsRaw: Set<string>;
    excludedChannelsNormalized: Set<string>;
    excludedChannelsRaw: Set<string>;
    blockedChannelRegexes: RegExp[];
    blockedVideoTitleRegexes: RegExp[];
    blockedCommentRegexes: RegExp[];
};

const ruleCache: RuleCache = {
    blockedChannelsNormalized: new Set<string>(),
    blockedChannelsRaw: new Set<string>(),
    excludedChannelsNormalized: new Set<string>(),
    excludedChannelsRaw: new Set<string>(),
    blockedChannelRegexes: [],
    blockedVideoTitleRegexes: [],
    blockedCommentRegexes: [],
};

function normalizeChannelName(channel?: string): string | undefined {
    if (channel === undefined) return undefined;
    const trimmed = channel.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function sanitizeRegexFlags(flags?: string): string {
    if (!flags) return "";
    return flags.replace(/g|y| /gi, "");
}

function compileRegexMap(map: KeyValueMap): RegExp[] {
    const regexes: RegExp[] = [];
    for (const pattern in map) {
        if (Object.prototype.hasOwnProperty.call(map, pattern)) {
            const flags = sanitizeRegexFlags(map[pattern]);
            try {
                regexes.push(new RegExp(pattern, flags));
            } catch (error) {
                console.warn("ChannelQuarantine: Failed to compile regex", pattern, error);
            }
        }
    }
    return regexes;
}

function updateRulesCache(snapshot: RulesSnapshot) {
    ruleCache.blockedChannelsNormalized = new Set<string>();
    ruleCache.blockedChannelsRaw = new Set<string>();
    for (let index = 0; index < snapshot.blockedChannels.length; index++) {
        const channel = snapshot.blockedChannels[index];
        ruleCache.blockedChannelsRaw.add(channel);
        const normalized = normalizeChannelName(channel);
        if (normalized !== undefined) {
            ruleCache.blockedChannelsNormalized.add(normalized);
        }
    }

    ruleCache.excludedChannelsNormalized = new Set<string>();
    ruleCache.excludedChannelsRaw = new Set<string>();
    for (let index = 0; index < snapshot.excludedChannels.length; index++) {
        const channel = snapshot.excludedChannels[index];
        ruleCache.excludedChannelsRaw.add(channel);
        const normalized = normalizeChannelName(channel);
        if (normalized !== undefined) {
            ruleCache.excludedChannelsNormalized.add(normalized);
        }
    }

    ruleCache.blockedChannelRegexes = compileRegexMap(snapshot.blockedChannelsRegExp);
    ruleCache.blockedVideoTitleRegexes = compileRegexMap(snapshot.blockedVideoTitles);
    ruleCache.blockedCommentRegexes = compileRegexMap(snapshot.blockedComments);

    cqStorageWindow.scheduleObserverUpdate?.();
}

cqStorageWindow.updateRulesCache = updateRulesCache;

function regexTest(regex: RegExp, value: string): boolean {
    if (regex.global || (regex as any).sticky) {
        regex.lastIndex = 0;
    }
    return regex.test(value);
}

function isBlockedLocally(content: { videoTitle?: string; userChannelName?: string; commentContent?: string }): boolean {
    const { userChannelName, videoTitle, commentContent } = content;

    if (userChannelName !== undefined) {
        const normalized = normalizeChannelName(userChannelName);
        if (normalized !== undefined && ruleCache.excludedChannelsNormalized.has(normalized)) {
            return false;
        }
        if (ruleCache.excludedChannelsRaw.has(userChannelName)) {
            return false;
        }
        if (normalized !== undefined && ruleCache.blockedChannelsNormalized.has(normalized)) {
            return true;
        }
        if (ruleCache.blockedChannelsRaw.has(userChannelName)) {
            return true;
        }
        for (let index = 0; index < ruleCache.blockedChannelRegexes.length; index++) {
            const regex = ruleCache.blockedChannelRegexes[index];
            if (regexTest(regex, userChannelName)) {
                return true;
            }
            if (normalized !== undefined && regexTest(regex, normalized)) {
                return true;
            }
        }
    }

    if (videoTitle !== undefined) {
        for (let index = 0; index < ruleCache.blockedVideoTitleRegexes.length; index++) {
            if (regexTest(ruleCache.blockedVideoTitleRegexes[index], videoTitle)) {
                return true;
            }
        }
    }

    if (commentContent !== undefined) {
        for (let index = 0; index < ruleCache.blockedCommentRegexes.length; index++) {
            if (regexTest(ruleCache.blockedCommentRegexes[index], commentContent)) {
                return true;
            }
        }
    }

    return false;
}

async function isBlocked(content: { videoTitle?: string; userChannelName?: string; commentContent?: string }): Promise<boolean> {
    return isBlockedLocally(content);
}

async function blockUserChannel(userChannelName: string) {
    const message: AddBlockingRuleMessage = {
        sender: CommunicationRole.CONTENT_SCRIPT,
        receiver: CommunicationRole.SERVICE_WORKER,
        type: MessageType.ADD_BLOCKING_RULE,
        content: {
            blockedChannel: userChannelName,
        },
    };
    await sendMessage(message);
}

(async function getSettings() {
    const message: RequestSettingsMessage = {
        sender: CommunicationRole.CONTENT_SCRIPT,
        receiver: CommunicationRole.SERVICE_WORKER,
        type: MessageType.REQUEST_SETTINGS,
        content: undefined,
    };
    const response = (await sendMessage(message)) as {
        buttonVisible: boolean;
        buttonColor: string;
        buttonSize: number;
        animationSpeed: number;
        blockSponsoredTiles: boolean;
        hideShortsShelves: boolean;
    };

    buttonVisible = response.buttonVisible;
    buttonColor = response.buttonColor;
    buttonSize = response.buttonSize;
    animationSpeed = response.animationSpeed;
    cqStorageWindow.cqBlockSponsoredTiles = response.blockSponsoredTiles;
    if (cqStorageWindow.cqBlockSponsoredTiles) {
        cqStorageWindow.cqApplySponsoredBlocking?.(document);
    } else {
        cqStorageWindow.cqClearSponsoredBlocking?.();
    }
    cqStorageWindow.cqHideShortsShelves = response.hideShortsShelves;
    if (cqStorageWindow.cqHideShortsShelves) {
        cqStorageWindow.cqApplyShortsBlocking?.(document);
    } else {
        cqStorageWindow.cqClearShortsBlocking?.(document);
    }

    updateBlockBtnCSS();
    cqStorageWindow.scheduleObserverUpdate?.();
})();

(async function initRulesCache() {
    const message: RequestRulesMessage = {
        sender: CommunicationRole.CONTENT_SCRIPT,
        receiver: CommunicationRole.SERVICE_WORKER,
        type: MessageType.REQUEST_RULES,
        content: undefined,
    };

    try {
        const snapshot = (await sendMessage(message)) as RulesSnapshot;
        updateRulesCache(snapshot);
    } catch (error) {
        console.error("ChannelQuarantine: Failed to load rules", error);
    }
})();

async function sendMessage(message: Message) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response) => {
            const lastError = chrome.runtime.lastError;
            if (lastError) {
                reject(lastError);
            } else {
                resolve(response);
            }
        });
    });
}

