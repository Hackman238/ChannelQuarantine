import { CommunicationRole, MessageType, SettingsDesign } from "./enums.js";
import { SettingsChangedMessage } from "./interfaces/interfaces.js";
import { SettingsStorageObject } from "./interfaces/storage.js";

const modeDropdown = document.getElementById("mode-dropdown") as HTMLSelectElement;
const btnColorInput = document.getElementById("block-btn-color-picker") as HTMLInputElement;
const btnSizeSlider = document.getElementById("btn-size-slider") as HTMLInputElement;
const showBtnCheckbox = document.getElementById("show-btn-checkbox") as HTMLInputElement;
const blockSponsoredCheckbox = document.getElementById("block-sponsored-checkbox") as HTMLInputElement | null;
const hideShortsCheckbox = document.getElementById("hide-shorts-checkbox") as HTMLInputElement | null;
const hideRichShelvesCheckbox = document.getElementById("hide-rich-shelves-checkbox") as HTMLInputElement | null;
const animationSpeedSlider = document.getElementById("animation-speed-slider") as HTMLInputElement;
const resetBtn = document.getElementById("reset-appearance-btn") as HTMLButtonElement;

let defaultStorage: SettingsStorageObject = {
    version: "0",
    settings: {
        design: SettingsDesign.DETECT,
        advancedView: false,
        buttonVisible: true,
        buttonColor: "#FF3333",
        buttonSize: 142,
        animationSpeed: 200,
        blockSponsoredTiles: true,
        hideShortsShelves: true,
        hideRichShelves: true,
    },
};
let settings = { ...defaultStorage.settings };

function storageGet<T>(query: any): Promise<T> {
    return new Promise((resolve) => {
        chrome.storage.local.get(query, (result) => {
            resolve((result ?? {}) as T);
        });
    });
}

function storageSet(items: Record<string, any>): Promise<void> {
    return new Promise((resolve) => {
        chrome.storage.local.set(items, () => resolve());
    });
}

loadSettingsDataFromStorage();

export function loadSettingsDataFromStorage() {
    storageGet<SettingsStorageObject>(defaultStorage).then((result) => {
        const storageObject = { ...defaultStorage, ...result };
        console.log("Loaded stored data", storageObject);

        if (storageObject.version === "0") {
            // Should not be possible because the service worker converts / fill the storage
        } else {
            settings = { ...defaultStorage.settings, ...storageObject.settings };
        }
        updateUI();
    });
}

function updateUI() {
    updateColorScheme();
    updateBtnColor();
    updateBtnSize();
    updateShowBtn();
    updateBlockSponsored();
    updateHideShorts();
    updateHideRichShelves();
    updateAnimationSpeed();
}

function updateColorScheme() {
    document.body.classList.toggle("detect-scheme", settings.design === SettingsDesign.DETECT);
    document.body.classList.toggle("dark-scheme", settings.design === SettingsDesign.DARK);
    modeDropdown.value = `${settings.design}`;
}

function updateBtnColor() {
    btnColorInput.value = settings.buttonColor;
}

function updateBtnSize() {
    btnSizeSlider.value = `${settings.buttonSize}`;
}


function updateShowBtn() {
    showBtnCheckbox.checked = settings.buttonVisible;
}

function updateBlockSponsored() {
    if (blockSponsoredCheckbox) {
        blockSponsoredCheckbox.checked = settings.blockSponsoredTiles;
    }
}

function updateHideShorts() {
    if (hideShortsCheckbox) {
        hideShortsCheckbox.checked = settings.hideShortsShelves;
    }
}

function updateHideRichShelves() {
    if (hideRichShelvesCheckbox) {
        hideRichShelvesCheckbox.checked = settings.hideRichShelves;
    }
}
function updateAnimationSpeed() {
    animationSpeedSlider.value = `${settings.animationSpeed}`;
}

export function initAppearanceUI() {
    modeDropdown.addEventListener("change", () => {
        settings.design = Number(modeDropdown.value);
        storageSet({ settings });
        updateColorScheme();
    });

    btnColorInput.addEventListener("change", () => {
        settings.buttonColor = btnColorInput.value;
        storageSet({ settings });
        updateBtnColor();
        sendSettingChangedMessage();
    });

    btnSizeSlider.addEventListener("change", () => {
        settings.buttonSize = Number(btnSizeSlider.value);
        storageSet({ settings });
        updateBtnSize();
        sendSettingChangedMessage();
    });


    showBtnCheckbox.addEventListener("change", () => {
        settings.buttonVisible = showBtnCheckbox.checked;
        storageSet({ settings });
        updateShowBtn();
        sendSettingChangedMessage();
    });

    blockSponsoredCheckbox?.addEventListener("change", () => {
        if (!blockSponsoredCheckbox) return;
        settings.blockSponsoredTiles = blockSponsoredCheckbox.checked;
        storageSet({ settings });
        updateBlockSponsored();
        sendSettingChangedMessage();
    });

    hideShortsCheckbox?.addEventListener("change", () => {
        if (!hideShortsCheckbox) return;
        settings.hideShortsShelves = hideShortsCheckbox.checked;
        storageSet({ settings });
        updateHideShorts();
        sendSettingChangedMessage();
    });

    hideRichShelvesCheckbox?.addEventListener("change", () => {
        settings.hideRichShelves = hideRichShelvesCheckbox.checked;
        storageSet({ settings });
        updateHideRichShelves();
        sendSettingChangedMessage();
    });

    animationSpeedSlider.addEventListener("change", () => {
        settings.animationSpeed = Number(animationSpeedSlider.value);
        storageSet({ settings });
        updateAnimationSpeed();
        sendSettingChangedMessage();
    });

    resetBtn.addEventListener("click", () => {
        settings = { ...defaultStorage.settings };
        storageSet({ settings });
        updateUI();
        sendSettingChangedMessage();
    });
}

function sendSettingChangedMessage() {
    const message: SettingsChangedMessage = {
        sender: CommunicationRole.SETTINGS,
        receiver: CommunicationRole.SERVICE_WORKER,
        type: MessageType.SETTINGS_CHANGED,
        content: {
            buttonVisible: settings.buttonVisible,
            buttonColor: settings.buttonColor,
            buttonSize: settings.buttonSize,
            animationSpeed: settings.animationSpeed,
            blockSponsoredTiles: settings.blockSponsoredTiles,
            hideShortsShelves: settings.hideShortsShelves,
            hideRichShelves: settings.hideRichShelves,
        },
    };
    chrome.runtime.sendMessage(message);
}



