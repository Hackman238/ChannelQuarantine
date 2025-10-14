const cqWindow = window as typeof window & {
    cqBlockSponsoredTiles?: boolean;
    cqApplySponsoredBlocking?: (root?: ParentNode) => void;
    cqClearSponsoredBlocking?: () => void;
    cqHideShortsShelves?: boolean;
    cqApplyShortsBlocking?: (root?: ParentNode) => void;
    cqClearShortsBlocking?: (root?: ParentNode) => void;
    cqHideRichShelves?: boolean;
    cqApplyRichShelvesBlocking?: (root?: ParentNode) => void;
    cqClearRichShelvesBlocking?: (root?: ParentNode) => void;
    updateRulesCache?: (snapshot: RulesSnapshot) => void;
    scheduleObserverUpdate?: () => void;
};

let activeObserver: Observer[] = [];
let curYTContext: YTContext = YTContext.OTHER;

function getBlockSponsoredTiles(): boolean {
    return cqWindow.cqBlockSponsoredTiles === true;
}

function setBlockSponsoredTiles(value: boolean) {
    cqWindow.cqBlockSponsoredTiles = value;
}

function getHideShortsShelves(): boolean {
    return cqWindow.cqHideShortsShelves === true;
}

function setHideShortsShelves(value: boolean) {
    cqWindow.cqHideShortsShelves = value;
}

function getHideRichShelves(): boolean {
    return cqWindow.cqHideRichShelves === true;
}

function setHideRichShelves(value: boolean) {
    cqWindow.cqHideRichShelves = value;
}

let observerUpdateScheduled = false;
function scheduleObserverUpdate() {
    if (observerUpdateScheduled) return;
    observerUpdateScheduled = true;
    const callback = () => {
        observerUpdateScheduled = false;
        updateObserver();
    };
    if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(callback);
    } else {
        setTimeout(callback, 50);
    }
}
cqWindow.scheduleObserverUpdate = scheduleObserverUpdate;

/**
 * Handles changes in the YouTube context and updates the active observer accordingly.
 *
 * @param {YTContext} context - The new YouTube context to handle. This can be one of the following:
 *   - YTContext.HOME: The homepage (https://www.youtube.com/)
 *   - YTContext.VIDEO: A video page (https://www.youtube.com/watch?v=<ID>)
 *   - YTContext.SEARCH: A search results page (https://www.youtube.com/results?search_query=<INPUT>)
 *   - YTContext.TRENDING: The trending page (https://www.youtube.com/feed/trending)
 *
 * @returns {void}
 */
function handleContextChange(context: YTContext) {
    if (curYTContext === context) return;
    curYTContext = context;

    while (activeObserver.length > 0) {
        activeObserver.pop()?.disconnect();
    }

    resetProcessedState();

    switch (context) {
        case YTContext.HOME:
            //HomePage(https://www.youtube.com/)
            activeObserver = createHomeObserver();
            break;
        case YTContext.VIDEO:
            //VideoPage(https://www.youtube.com/watch?v=<ID>)
            activeObserver = createVideoObserver();
            break;
        case YTContext.SEARCH:
            //SearchPage(https://www.youtube.com/results?search_query=<INPUT>)
            activeObserver = createSearchObserver();
            break;
        case YTContext.TRENDING:
            //TrendingPage(https://www.youtube.com/feed/trending)
            activeObserver = createTrendingObserver();
            break;

        default:
            break;
    }

    if (getBlockSponsoredTiles()) {
        applySponsoredBlocking(document);
    }
    if (getHideShortsShelves()) {
        applyShortsBlocking(document);
    } else {
        clearShortsBlocking(document);
    }
    if (getHideRichShelves()) {
        applyRichShelvesBlocking(document);
    } else {
        clearRichShelvesBlocking(document);
    }
    if (getHideRichShelves()) {
        applyRichShelvesBlocking(document);
    } else {
        clearRichShelvesBlocking(document);
    }
}

// The following functions create the observer for the YouTube pages
// If something is broken, because of an update changing the structure of a page,
// you most likely have to change the structure description here.

/**
 * Creates observer for the video page (i.e.: YTContext.VIDEO: https://www.youtube.com/watch?v=<ID>) and returns them.
 *
 * @returns an array of observer for the video page.
 */
function createVideoObserver() {
    return [
        new VideoCreatorObserver(),
        new Observer("div[class='ytp-endscreen-content']", [
            {
                anchorSelector: "a",
                userChannelName: ["span[class='ytp-videowall-still-info-author']"],
                videoTitle: ["span[class='ytp-videowall-still-info-title']"],
                insertBlockBtn: [
                    (element: HTMLElement, userChannelName: HTMLElement, button: HTMLButtonElement) => {
                        // No block button is inserted
                    },
                ],
                transformChannelName: [
                    (userChannelName) => {
                        return userChannelName.split(" • ")[0];
                    },
                ],
            },
        ]),
        new Observer("div#items[class='style-scope ytd-watch-next-secondary-results-renderer']", [
            {
                anchorSelector: "ytd-compact-video-renderer",
                userChannelName: ["yt-formatted-string#text[class='style-scope ytd-channel-name']"],
                videoTitle: ["span#video-title[class=' style-scope ytd-compact-video-renderer style-scope ytd-compact-video-renderer']"],
                insertBlockBtn: [
                    (element: HTMLElement, userChannelName: HTMLElement, button: HTMLButtonElement) => {
                        element.querySelector("ytd-channel-name")?.insertAdjacentElement("beforebegin", button);
                    },
                ],
                embeddedObserver: "ytd-item-section-renderer",
            },
            {
                anchorSelector: "ytd-item-section-renderer",
                embeddedObserver: "div#contents",
            },
        ]),
        // New design (Video suggestions under main video)
        new Observer(
            "#bottom-grid #contents.ytd-rich-grid-renderer",
            [],
            [
                {
                    anchorSelector: "#contents",
                    targetSelector: "ytd-rich-grid-row",
                    observerOptions: [
                        {
                            userChannelName: ["#channel-name a"],
                            videoTitle: ["#video-title"],
                            insertBlockBtn: [
                                (element: HTMLElement, userChannelName: HTMLElement, button: HTMLButtonElement) => {
                                    element.querySelector("ytd-channel-name")?.insertAdjacentElement("beforebegin", button);
                                },
                            ],
                            anchorSelector: "ytd-rich-item-renderer",
                        },
                    ],
                },
            ]
        ),
        // Comments for the old and new design (Comments on the right of the main video)
        new Observer("#comments #contents.ytd-item-section-renderer", [
            {
                anchorSelector: "ytd-comment-thread-renderer",
                userChannelName: ["#author-text", "#text-container"],
                commentContent: ["#content-text"],
                insertBlockBtn: [
                    (element: HTMLElement, userChannelName: HTMLElement, button: HTMLButtonElement) => {
                        element.querySelector("div#header-author")?.insertAdjacentElement("afterbegin", button);
                    },
                    (element: HTMLElement, userChannelName: HTMLElement, button: HTMLButtonElement) => {
                        element.querySelector("span#author-comment-badge")?.insertAdjacentElement("beforebegin", button);
                    },
                ],
                transformChannelName: [
                    (userChannelName) => {
                        return userChannelName.trim().substring(1);
                    },
                    (userChannelName) => {
                        return userChannelName.trim().substring(1);
                    },
                ],
                embeddedObserver: "div#contents",
            },
            {
                anchorSelector: "ytd-comment-view-model",
                userChannelName: ["#author-text", "#text-container"],
                commentContent: ["#content-text"],
                insertBlockBtn: [
                    (element: HTMLElement, userChannelName: HTMLElement, button: HTMLButtonElement) => {
                        element.querySelector("div#header-author")?.insertAdjacentElement("afterbegin", button);
                    },
                    (element: HTMLElement, userChannelName: HTMLElement, button: HTMLButtonElement) => {
                        element.querySelector("span#author-comment-badge")?.insertAdjacentElement("beforebegin", button);
                    },
                ],
                transformChannelName: [
                    (userChannelName) => {
                        return userChannelName.trim().substring(1);
                    },
                    (userChannelName) => {
                        return userChannelName.trim().substring(1);
                    },
                ],
            },
            {
                anchorSelector: "ytd-comment-renderer",
                userChannelName: [
                    "yt-formatted-string[class=' style-scope ytd-comment-renderer style-scope ytd-comment-renderer']",
                    "yt-formatted-string#text[class='style-scope ytd-channel-name']",
                ],
                commentContent: ["yt-formatted-string#content-text"],
                insertBlockBtn: [
                    (element: HTMLElement, userChannelName: HTMLElement, button: HTMLButtonElement) => {
                        element.querySelector("div#header-author")?.insertAdjacentElement("afterbegin", button);
                    },
                    (element: HTMLElement, userChannelName: HTMLElement, button: HTMLButtonElement) => {
                        element.querySelector("span#author-comment-badge")?.insertAdjacentElement("beforebegin", button);
                    },
                ],
                transformChannelName: [
                    (userChannelName) => {
                        return userChannelName.substring(1);
                    },
                    (userChannelName) => {
                        return userChannelName.substring(1);
                    },
                ],
            },
        ]),
    ];
}

/**
 * Creates observer for the trending page (i.e.: YTContext.TRENDING: https://www.youtube.com/feed/trending) and returns them.
 *
 * @returns an array of observer for the trending page.
 */
function createTrendingObserver() {
    return [
        new Observer(
            "ytd-page-manager#page-manager",
            [],
            [
                {
                    targetSelector: "ytd-browse",
                    anchorSelector: "div#contents[class='style-scope ytd-section-list-renderer']",
                    subObserver: [
                        {
                            targetSelector: "ytd-item-section-renderer",
                            anchorSelector: "div#grid-container",
                            observerOptions: [
                                {
                                    anchorSelector: "ytd-video-renderer",
                                    userChannelName: ["a[class='yt-simple-endpoint style-scope yt-formatted-string']"],
                                    videoTitle: ["yt-formatted-string[class='style-scope ytd-video-renderer']"],
                                },
                            ],
                        },
                    ],
                },
            ]
        ),
    ];
}

/**
 * Creates observer for the home page (i.e.: YTContext.HOME: https://www.youtube.com/) and returns them.
 *
 * @returns an array of observer for the home page.
 */
function createHomeObserver(): Observer[] {
    const homeVideoObserverOption: ObserverOptions = {
        anchorSelector: "ytd-rich-item-renderer",
        userChannelName: [
            "#channel-name a",
            "yt-content-metadata-view-model a.yt-core-attributed-string__link",
            "ytd-channel-name yt-formatted-string#text",
            "yt-formatted-string#text",
        ],
        videoTitle: [
            "#video-title",
            "a#video-title",
            "a.yt-lockup-metadata-view-model__title",
            "yt-formatted-string#video-title",
        ],
    };

    return [
        new Observer(
            "ytd-browse ytd-rich-grid-renderer #contents.ytd-rich-grid-renderer",
            [homeVideoObserverOption],
            [
                {
                    targetSelector: "ytd-rich-grid-row.ytd-rich-grid-renderer",
                    anchorSelector: "#contents.ytd-rich-grid-row",
                    observerOptions: [homeVideoObserverOption],
                },
                {
                    targetSelector: "ytd-rich-section-renderer",
                    anchorSelector: "#contents",
                    observerOptions: [homeVideoObserverOption],
                },
            ]
        ),
    ];
}

/**
 * Creates observer for the search page (i.e.: YTContext.SEARCH: https://www.youtube.com/results?search_query=<INPUT>) and returns them.
 *
 * @returns an array of observer for the search page.
 */
function createSearchObserver(): Observer[] {
    return [
        new Observer(
            "ytd-search div#contents[class='style-scope ytd-section-list-renderer']",
            [],
            [
                {
                    targetSelector: "ytd-item-section-renderer", //"ytd-shelf-renderer[class='style-scope ytd-item-section-renderer']",
                    anchorSelector: "div#contents[class=' style-scope ytd-item-section-renderer style-scope ytd-item-section-renderer']",
                    observerOptions: [
                        {
                            anchorSelector: "ytd-video-renderer[class='style-scope ytd-item-section-renderer']",
                            userChannelName: ["yt-formatted-string#text[class='style-scope ytd-channel-name']"],
                            videoTitle: ["yt-formatted-string[class='style-scope ytd-video-renderer']"],
                        },
                        {
                            anchorSelector: "ytd-video-renderer[class='style-scope ytd-vertical-list-renderer']",
                            userChannelName: ["yt-formatted-string#text[class='style-scope ytd-channel-name']"],
                            videoTitle: ["yt-formatted-string[class='style-scope ytd-video-renderer']"],
                        },
                        {
                            anchorSelector: "ytd-search-pyv-renderer[class='style-scope ytd-item-section-renderer']",
                            userChannelName: ["a[class='yt-simple-endpoint style-scope yt-formatted-string']"],
                            videoTitle: ["h3#video-title[class='style-scope ytd-promoted-video-renderer']"],
                        },
                        {
                            anchorSelector: "ytd-ad-slot-renderer[class='style-scope ytd-item-section-renderer']",
                            userChannelName: [
                                "div#website-text[class='style-scope ytd-promoted-sparkles-web-renderer yt-simple-endpoint']",
                            ],
                            videoTitle: ["h3#title[class='style-scope ytd-promoted-sparkles-web-renderer yt-simple-endpoint']"],
                        },
                        {
                            anchorSelector: "ytd-playlist-renderer[class='style-scope ytd-item-section-renderer']",
                            userChannelName: ["a[class='yt-simple-endpoint style-scope yt-formatted-string']"],
                            videoTitle: ["span#video-title[class='style-scope ytd-playlist-renderer']"],
                        },
                        {
                            anchorSelector: "ytd-channel-renderer[class='style-scope ytd-item-section-renderer']",
                            userChannelName: ["yt-formatted-string#text[class='style-scope ytd-channel-name']"],
                        },
                        {
                            anchorSelector: "ytd-grid-video-renderer",
                            userChannelName: ["a[class='yt-simple-endpoint style-scope yt-formatted-string']"],
                            videoTitle: ["a#video-title"],
                        },
                    ],
                    subObserver: [
                        {
                            targetSelector: "ytd-shelf-renderer[class='style-scope ytd-item-section-renderer']",
                            anchorSelector: "div#items",
                        },
                        /*
                        {
                            targetSelector: "ytd-shelf-renderer[class='style-scope ytd-item-section-renderer']",
                            anchorSelector: "div#items[class='style-scope yt-horizontal-list-renderer']",
                        },
                        */
                    ],
                },
            ]
        ),
    ];
}

/**
 * Updates all active observers by calling their `update` method.
 */
const SHORTS_SHELF_SELECTOR = "ytd-rich-shelf-renderer[is-shorts], ytd-reel-shelf-renderer";
const SHORTS_DATA_ATTRIBUTE = "data-cq-shorts-hidden";
const processedShortsShelves = new WeakSet<Element>();
const RICH_SHELF_SELECTOR = "ytd-rich-shelf-renderer:not([is-shorts])";
const RICH_SHELF_DATA_ATTRIBUTE = "data-cq-rich-shelf-blocked";
const processedRichShelves = new WeakSet<Element>();

const SPONSORED_SCAN_SELECTOR = "div.yt-lockup-view-model, ytd-ad-slot-renderer, ytd-promoted-sparkles-web-renderer, ytd-promoted-sparkles-text-search-renderer, ytd-promoted-video-renderer, ytd-search-pyv-renderer, ytd-display-ad-renderer, ytd-in-feed-ad-layout-renderer, ytd-rich-grid-promoted-item-renderer, ytd-rich-item-renderer";
const processedSponsoredNodes = new WeakSet<Element>();

function applySponsoredBlocking(root: ParentNode = document) {
    if (!getBlockSponsoredTiles()) return;

    const markSponsored = (element: Element) => {
        if (element.getAttribute("data-cq-sponsored-blocked") !== "true") {
            element.setAttribute("data-cq-sponsored-blocked", "true");
        }
        element.classList.add("blocked");
        processedSponsoredNodes.add(element);
    };

    const clearSponsoredMark = (element: Element) => {
        if (element.getAttribute("data-cq-sponsored-blocked") === "true") {
            element.removeAttribute("data-cq-sponsored-blocked");
        }
        element.classList.remove("blocked");
        processedSponsoredNodes.delete(element);
    };

    const evaluateCandidate = (element: Element, forceRecheck: boolean) => {
        if (!element.isConnected) {
            processedSponsoredNodes.delete(element);
            return;
        }
        if (!forceRecheck && processedSponsoredNodes.has(element)) {
            return;
        }

        const sponsored = isSponsoredTile(element);
        if (sponsored) {
            markSponsored(element);
        } else if (forceRecheck) {
            clearSponsoredMark(element);
        }
    };

    if (root instanceof Element) {
        const rootPreviouslyBlocked = root.getAttribute("data-cq-sponsored-blocked") === "true" || processedSponsoredNodes.has(root);
        if (rootPreviouslyBlocked || root.matches(SPONSORED_SCAN_SELECTOR)) {
            evaluateCandidate(root, true);
        }
    }

    if ("querySelectorAll" in root && typeof (root as Document | Element).querySelectorAll === "function") {
        const nodeList = (root as Document | Element).querySelectorAll(SPONSORED_SCAN_SELECTOR);
        for (let index = 0; index < nodeList.length; index++) {
            const candidate = nodeList[index] as Element;
            const wasMarked = candidate.getAttribute("data-cq-sponsored-blocked") === "true" || processedSponsoredNodes.has(candidate);
            evaluateCandidate(candidate, wasMarked);
        }
    }
}

function clearSponsoredBlocking() {
    const sponsoredNodes = document.querySelectorAll("[data-cq-sponsored-blocked=\"true\"]");
    sponsoredNodes.forEach((node) => {
        node.removeAttribute("data-cq-sponsored-blocked");
        node.classList.remove("blocked");
    });
}

function applyShortsBlocking(root: ParentNode = document) {
    if (!getHideShortsShelves()) return;

    const candidates = new Set<Element>();

    const collectCandidate = (element: Element) => {
        if (!element.isConnected) {
            processedShortsShelves.delete(element);
            return;
        }
        if (element.matches(SHORTS_SHELF_SELECTOR) || element.getAttribute(SHORTS_DATA_ATTRIBUTE) === "true") {
            candidates.add(element);
        }
    };

    if (root instanceof Element) {
        collectCandidate(root);
    }

    if ("querySelectorAll" in root && typeof (root as Document | Element).querySelectorAll === "function") {
        const selector = `${SHORTS_SHELF_SELECTOR}, [${SHORTS_DATA_ATTRIBUTE}="true"]`;
        const nodeList = (root as Document | Element).querySelectorAll(selector);
        for (let index = 0; index < nodeList.length; index++) {
            collectCandidate(nodeList[index] as Element);
        }
    }

    candidates.forEach((shelf) => {
        if (shelf.getAttribute(SHORTS_DATA_ATTRIBUTE) !== "true") {
            shelf.setAttribute(SHORTS_DATA_ATTRIBUTE, "true");
        }
        shelf.classList.add("blocked");
        processedShortsShelves.add(shelf);
    });
}

function clearShortsBlocking(root: ParentNode = document) {
    const toClear = new Set<Element>();

    const collectMarked = (element: Element) => {
        if (element.getAttribute(SHORTS_DATA_ATTRIBUTE) === "true") {
            toClear.add(element);
        }
    };

    if (root instanceof Element) {
        collectMarked(root);
    }

    if ("querySelectorAll" in root && typeof (root as Document | Element).querySelectorAll === "function") {
        const nodeList = (root as Document | Element).querySelectorAll(`[${SHORTS_DATA_ATTRIBUTE}="true"]`);
        for (let index = 0; index < nodeList.length; index++) {
            collectMarked(nodeList[index] as Element);
        }
    }

    toClear.forEach((shelf) => {
        shelf.removeAttribute(SHORTS_DATA_ATTRIBUTE);
        shelf.classList.remove("blocked");
        processedShortsShelves.delete(shelf);
    });
}

function applyRichShelvesBlocking(root: ParentNode = document) {
    if (!getHideRichShelves()) return;

    const candidates = new Set<Element>();

    const collectCandidate = (element: Element) => {
        if (!element.isConnected) {
            processedRichShelves.delete(element);
            return;
        }
        if (element.matches(RICH_SHELF_SELECTOR) || element.getAttribute(RICH_SHELF_DATA_ATTRIBUTE) === "true") {
            candidates.add(element);
        }
    };

    if (root instanceof Element) {
        collectCandidate(root);
    }

    if ("querySelectorAll" in root && typeof (root as Document | Element).querySelectorAll === "function") {
        const selector = `${RICH_SHELF_SELECTOR}, [${RICH_SHELF_DATA_ATTRIBUTE}="true"]`;
        const nodeList = (root as Document | Element).querySelectorAll(selector);
        for (let index = 0; index < nodeList.length; index++) {
            collectCandidate(nodeList[index] as Element);
        }
    }

    candidates.forEach((shelf) => {
        if (shelf.getAttribute(RICH_SHELF_DATA_ATTRIBUTE) !== "true") {
            shelf.setAttribute(RICH_SHELF_DATA_ATTRIBUTE, "true");
        }
        shelf.classList.add("blocked");
        processedRichShelves.add(shelf);
    });
}

function clearRichShelvesBlocking(root: ParentNode = document) {
    const toClear = new Set<Element>();

    const collectMarked = (element: Element) => {
        if (element.getAttribute(RICH_SHELF_DATA_ATTRIBUTE) === "true") {
            toClear.add(element);
        }
    };

    if (root instanceof Element) {
        collectMarked(root);
    }

    if ("querySelectorAll" in root && typeof (root as Document | Element).querySelectorAll === "function") {
        const nodeList = (root as Document | Element).querySelectorAll(`[${RICH_SHELF_DATA_ATTRIBUTE}="true"]`);
        for (let index = 0; index < nodeList.length; index++) {
            collectMarked(nodeList[index] as Element);
        }
    }

    toClear.forEach((shelf) => {
        shelf.removeAttribute(RICH_SHELF_DATA_ATTRIBUTE);
        shelf.classList.remove("blocked");
        processedRichShelves.delete(shelf);
    });
}

cqWindow.cqApplySponsoredBlocking = applySponsoredBlocking;
cqWindow.cqClearSponsoredBlocking = clearSponsoredBlocking;
cqWindow.cqApplyShortsBlocking = applyShortsBlocking;
cqWindow.cqClearShortsBlocking = clearShortsBlocking;
if (cqWindow.cqBlockSponsoredTiles === undefined) {
    cqWindow.cqBlockSponsoredTiles = false;
}
if (cqWindow.cqHideShortsShelves === undefined) {
    cqWindow.cqHideShortsShelves = false;
}

function updateObserver() {
    for (let index = 0; index < activeObserver.length; index++) {
        activeObserver[index].update();
    }
}

function resetProcessedState() {
    const processedElements = document.querySelectorAll<HTMLElement>("[data-cq-processed=\"true\"]");
    processedElements.forEach((element) => {
        element.removeAttribute("data-cq-processed");
    });
}

let buttonVisible: boolean = true;
let buttonColor: string = "#717171";
let buttonSize: number = 142;
let animationSpeed: number = 200;

/**
 * Updates the settings for the button appearance and behavior based on the provided message.
 *
 * @param {SettingsChangedMessage} message - The message containing the new settings.
 */
function updateSettings(message: SettingsChangedMessage) {
    buttonVisible = message.content.buttonVisible;
    buttonColor = message.content.buttonColor;
    buttonSize = message.content.buttonSize;
    animationSpeed = message.content.animationSpeed;
    setBlockSponsoredTiles(message.content.blockSponsoredTiles);
    setHideShortsShelves(message.content.hideShortsShelves);
    setHideRichShelves(message.content.hideRichShelves);

    updateBlockBtnCSS();
    if (getBlockSponsoredTiles()) {
        applySponsoredBlocking(document);
    } else {
        clearSponsoredBlocking();
    }
    if (getHideShortsShelves()) {
        applyShortsBlocking(document);
    } else {
        clearShortsBlocking(document);
    }
    if (getHideRichShelves()) {
        applyRichShelvesBlocking(document);
    } else {
        clearRichShelvesBlocking(document);
    }
    scheduleObserverUpdate();
}

const globalSponsoredObserver = new MutationObserver((mutations) => {
    if (!getBlockSponsoredTiles()) return;
    for (let i = 0; i < mutations.length; i++) {
        const mutation = mutations[i];
        for (let j = 0; j < mutation.addedNodes.length; j++) {
            const node = mutation.addedNodes[j];
            if (node instanceof Element) {
                applySponsoredBlocking(node);
            } else if (node instanceof DocumentFragment) {
                node.childNodes.forEach((child) => {
                    if (child instanceof Element) {
                        applySponsoredBlocking(child);
                    }
                });
            }
        }
    }
});

globalSponsoredObserver.observe(document, { childList: true, subtree: true });

const globalShortsObserver = new MutationObserver((mutations) => {
    if (!getHideShortsShelves()) return;
    for (let i = 0; i < mutations.length; i++) {
        const mutation = mutations[i];
        for (let j = 0; j < mutation.addedNodes.length; j++) {
            const node = mutation.addedNodes[j];
            if (node instanceof Element) {
                applyShortsBlocking(node);
            } else if (node instanceof DocumentFragment) {
                node.childNodes.forEach((child) => {
                    if (child instanceof Element) {
                        applyShortsBlocking(child);
                    }
                });
            }
        }
    }
});

globalShortsObserver.observe(document, { childList: true, subtree: true });

chrome.runtime.onMessage.addListener((message: Message, sender: chrome.runtime.MessageSender) => {
    if (message.receiver !== CommunicationRole.CONTENT_SCRIPT) return;

    switch (message.type) {
        case MessageType.STORAGE_CHANGED:
            scheduleObserverUpdate();
            break;

        case MessageType.SETTINGS_CHANGED:
            updateSettings(message);
            break;

        case MessageType.RULES_SYNC:
            cqWindow.updateRulesCache?.(message.content as RulesSnapshot);
            break;

        default:
            break;
    }
});











scheduleObserverUpdate();











