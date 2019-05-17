import { clone } from "./functions";
import Edit from "../types/edit";
import { Document } from "../types/document";
import { SyncMessage } from "../types/message";
import { DiffPatcher } from "jsondiffpatch";


/**
 * Remove all edits that were seen by the other side
 */
export function removeConfirmedEdits(lastReceivedVersion: number, edits: Edit[]): void {
    while (edits.length > 0 && lastReceivedVersion >= edits[0].basedOnVersion) {
        edits.shift(); // remove the edit
    }
}

/**
 * check the version numbers for lost packets
 */
export function checkVersionNumbers(lastReceivedVersion: number, data: Document): void {
    if (lastReceivedVersion !== data.localVersion) {
        // Something has gone wrong, try performing a rollback
        if (lastReceivedVersion === data.backupVersion) {
            performRoolback(data);
        } else {
            throw new Error(`Sync message versions invalid lastReceived: ${lastReceivedVersion}, backup: ${data.backupVersion}`);
        }
    }
}

/**
 * Rollback using backup
 */
function performRoolback(data: Document): void {
    // Restore shadow to the same version as on the other side
    data.localVersion = data.backupVersion;
    data.shadow = clone(data.backup);

    // All edits that were created based on the old shadow need to be removed
    // A new one containing all their diffs can be created
    data.edits = [];
}

/**
 * Updates the document with the newest version of the edit
 */
export function applyEdit(localData: object, data: Document, edit: Edit, diffPatcher: DiffPatcher): void {
    if (edit.basedOnVersion !== data.remoteVersion) {
        console.warn(`Edit ${edit} ignored due to bad basedOnVersion, expected ${data.remoteVersion}`);
        return;
    }

    diffPatcher.patch(data.shadow, clone(edit.diff));
    diffPatcher.patch(localData, clone(edit.diff));

    // Mark the edit version as the current one
    data.remoteVersion = edit.basedOnVersion;

    pefrormBackup(data);
}

/**
 * Saves the current shadow, before changing it
 */
function pefrormBackup(data: Document): void {
    data.backup = clone(data.shadow);
    data.backupVersion = data.remoteVersion;
}

/**
 * Create a syncMessage to update state
 */
export function createSyncMessage(localData: object, data: Document, diffPatcher: DiffPatcher): SyncMessage {
    let diff = diffPatcher.diff(data.shadow, localData);
    let basedOnVersion = data.localVersion;

    // add the difference to the edit stack
    if (diff) {
        data.edits.push(new Edit(basedOnVersion, diff));
        data.localVersion++;

        diffPatcher.patch(data.shadow, clone(diff));
    }

    return new SyncMessage(data.room, data.sessionId, data.remoteVersion, data.edits);
}
