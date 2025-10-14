const cqObserverWindow = window as typeof window & { cqBlockSponsoredTiles?: boolean };
function shouldBlockSponsored(): boolean {
    return cqObserverWindow.cqBlockSponsoredTiles === true;
}


const SPONSORED_KEYWORDS = ["sponsored", "gesponsert", "anzeige", "ad", "ads", "advertisement", "advertorial", "promoted", "promotion", "promocion", "publicidad", "pubblicita", "publicite", "annonce", "reklame", "reklama"];

function isSponsoredTile(element: Element): boolean {
    if (
        element.matches("ytd-ad-slot-renderer, ytd-promoted-sparkles-web-renderer, ytd-search-pyv-renderer") ||
        element.querySelector("ad-badge-view-model, feed-ad-metadata-view-model, ytd-ad-slot-renderer, ytd-promoted-sparkles-web-renderer, ytd-search-pyv-renderer") !== null
    ) {
        return true;
    }

    if (element.querySelector("a[href*=\"googleadservices.com\"], a[href*=\"doubleclick.net\"]")) {
        return true;
    }


    const badgeElements = element.querySelectorAll(".yt-badge-shape__text, .yt-core-attributed-string, .badge-style-type-ads-label-text");
    for (let i = 0; i < badgeElements.length; i++) {
        const text = badgeElements[i].textContent?.trim().toLowerCase();
        if (!text) continue;
        const normalizedText = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const comparisonText = normalizedText || text;
        for (let j = 0; j < SPONSORED_KEYWORDS.length; j++) {
            const keyword = SPONSORED_KEYWORDS[j];
            if (comparisonText === keyword || comparisonText.includes(keyword)) {
                return true;
            }
        }
    }

    return false;
}

class Observer {
    private target: string | Element;

    private observerOptions: ObserverOptions[];
    private subObserver: SubObserverOptions[];

    protected activeMutationObserver: MutationObserver[] = [];
    private isBlockedValidators: Function[] = [];

    constructor(targetSelector: string | Element, observerOptions: ObserverOptions[], subObserver?: SubObserverOptions[]) {
        this.target = targetSelector;
        this.observerOptions = observerOptions;
        this.subObserver = subObserver ?? [];

        this.addObserver();
    }

    public disconnect() {
        while (this.activeMutationObserver.length > 0) {
            this.activeMutationObserver.pop()?.disconnect();
        }
    }

    public update() {
        for (let index = 0; index < this.isBlockedValidators.length; index++) {
            this.isBlockedValidators[index]();
        }
    }

    protected async addObserver() {
        const element: Element = typeof this.target === "string" ? await getElement(this.target) : this.target;

        for (let index = 0; index < element.children.length; index++) {
            this.handleChild(element.children[index]);
        }

        const mainMutationObserver = new MutationObserver((mutationRecords: MutationRecord[]) => {
            for (let index = 0; index < mutationRecords.length; index++) {
                const mutationRecord = mutationRecords[index];
                if (mutationRecord.type === "childList") {
                    for (let index = 0; index < mutationRecord.addedNodes.length; index++) {
                        this.handleChild(mutationRecord.addedNodes[index] as Element);
                    }
                }
            }
        });

        mainMutationObserver.observe(element, { childList: true });
        this.activeMutationObserver.push(mainMutationObserver);
    }

    private handleChild(child: Element) {
        // Check for sub observer
        for (let index = 0; index < this.subObserver.length; index++) {
            const subObserver = this.subObserver[index];
            if (child.matches(subObserver.targetSelector)) {
                getElement(subObserver.anchorSelector, child).then((target: Element) => {
                    activeObserver.push(new Observer(target, subObserver.observerOptions ?? this.observerOptions, subObserver.subObserver));
                });
            }
        }

        for (let index = 0; index < this.observerOptions.length; index++) {
            const observerOption = this.observerOptions[index];
            if (child.matches(observerOption.anchorSelector)) {
                this.addCharacterDataSelector(child, observerOption);
            }
        }
    }

    private async addCharacterDataSelector(element: Element, observerOption: ObserverOptions) {
        const hostElement = element as HTMLElement;
        if (hostElement.dataset.cqProcessed === "true") {
            return;
        }
        hostElement.dataset.cqProcessed = "true";

        let userChannelName: string | undefined;
        let videoTitle: string | undefined;
        let commentContent: string | undefined;

        const checkIfElementIsBlocked = async () => {
            const blockSponsored = shouldBlockSponsored();
            if (blockSponsored && isSponsoredTile(element)) {
                element.setAttribute("data-cq-sponsored-blocked", "true");
                element.classList.add("blocked");
                return;
            }

            if (element.getAttribute("data-cq-sponsored-blocked") === "true") {
                element.removeAttribute("data-cq-sponsored-blocked");
            }

            const blocked = await isBlocked({ userChannelName, videoTitle, commentContent });
            element.classList.toggle("blocked", blocked);
        };
        this.isBlockedValidators.push(checkIfElementIsBlocked);

        const sponsoredMutationObserver = new MutationObserver(() => {
            if (shouldBlockSponsored()) {
                checkIfElementIsBlocked();
            }
        });
        sponsoredMutationObserver.observe(element, { childList: true, subtree: true });
        this.activeMutationObserver.push(sponsoredMutationObserver);

        element.querySelectorAll("button[class='cb_block_button']").forEach((blockButton) => {
            blockButton.remove();
        });

        if (observerOption.userChannelName !== undefined) {
            const elementAndIndex = await getElementFromList(observerOption.userChannelName, element);
            const userChannelNameElement = elementAndIndex.element;
            let button = createBlockBtnElement("");
            button.addEventListener("click", (mouseEvent) => {
                mouseEvent.preventDefault();
                mouseEvent.stopPropagation();

                if (userChannelName !== undefined) {
                    blockUserChannel(userChannelName);
                }
            });

            if (observerOption.insertBlockBtn) {
                observerOption.insertBlockBtn[elementAndIndex.index](element as HTMLElement, userChannelNameElement as HTMLElement, button);
            } else {
                userChannelNameElement.insertAdjacentElement("beforebegin", button);
            }

            const handleUserChannelName = () => {
                const rawChannelName = userChannelNameElement.textContent ?? "";
                userChannelName = rawChannelName.trim() || undefined;
                if (
                    userChannelName !== undefined &&
                    observerOption.transformChannelName !== undefined &&
                    observerOption.transformChannelName[elementAndIndex.index] !== undefined
                ) {
                    userChannelName = observerOption.transformChannelName[elementAndIndex.index](userChannelName);
                    if (userChannelName !== undefined) {
                        userChannelName = userChannelName.trim() || undefined;
                    }
                }
                const titleChannelName = userChannelName ?? rawChannelName.trim();
                button.setAttribute("title", "Block '" + titleChannelName + "' (ChannelQuarantine)");
                checkIfElementIsBlocked();
            };
            const mutationObserver = new MutationObserver(handleUserChannelName);
            mutationObserver.observe(userChannelNameElement, { childList: true, subtree: true, characterData: true });
            this.activeMutationObserver.push(mutationObserver);
            handleUserChannelName();
        }

        if (observerOption.videoTitle !== undefined) {
            const elementAndIndex = await getElementFromList(observerOption.videoTitle, element);
            const videoTitleElement = elementAndIndex.element;
            const handleVideoTitle = () => {
                const rawVideoTitle = videoTitleElement.textContent ?? "";
                videoTitle = rawVideoTitle.trim() || undefined;
                checkIfElementIsBlocked();
            };
            const mutationObserver = new MutationObserver(handleVideoTitle);
            mutationObserver.observe(videoTitleElement, { childList: true, subtree: true, characterData: true });
            this.activeMutationObserver.push(mutationObserver);
            handleVideoTitle();
        }

        if (observerOption.commentContent !== undefined) {
            const elementAndIndex = await getElementFromList(observerOption.commentContent, element);
            const commentContentElement = elementAndIndex.element;
            const handleCommentContent = () => {
                const rawCommentContent = commentContentElement.textContent ?? "";
                commentContent = rawCommentContent.trim() || undefined;
                checkIfElementIsBlocked();
            };
            const mutationObserver = new MutationObserver(handleCommentContent);
            mutationObserver.observe(commentContentElement, { childList: true, subtree: true, characterData: true });
            this.activeMutationObserver.push(mutationObserver);
            handleCommentContent();
        }

        checkIfElementIsBlocked();

        if (observerOption.embeddedObserver !== undefined) {
            const target = element.querySelector(observerOption.embeddedObserver);
            if (target !== null) {
                activeObserver.push(new Observer(target, this.observerOptions, this.subObserver));
            }
        }
    }
}













