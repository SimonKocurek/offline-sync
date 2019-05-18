import { clone, isEmpty } from "./functions";
import Edit from "../types/edit";
import { Document } from "../types/document";
import { SyncMessage } from "../types/message";
import { DiffPatcher } from "jsondiffpatch";


/**
 * Remove all edits that were seen by the other side
 */
export function removeConfirmedEdits(lastReceivedVersion: number, edits: Edit[]): void {
    while (edits.length > 0 && lastReceivedVersion > edits[0].basedOnVersion) {
        edits.shift(); // remove the edit
    }
}

/**
 * check the version numbers for lost packets
 */
export function checkVersionNumbers(lastReceivedVersion: number, receivedEdits: Edit[], data: Document): void {
    if (receivedEdits.length === 0) {
        return;
    }

    let firstEdit = receivedEdits[0];
    if (lastReceivedVersion !== data.localVersion || firstEdit.basedOnVersion !== data.remoteVersion) {
        // Something has gone wrong, try performing a rollback
        if (lastReceivedVersion === data.backupVersion) {
            performRollback(data);
        } else {
            throw new Error(`Sync message versions invalid lastReceived: ${lastReceivedVersion}, backup: ${data.backupVersion}`);
        }
    }
}

/**
 * Rollback using backup
 */
function performRollback(data: Document): void {
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
    if (edit.basedOnVersion < data.remoteVersion) {
        // Skip already applied edits
        return;
    }
    if (edit.basedOnVersion > data.remoteVersion) {
        throw new Error(`Edit ${edit} has bad basedOnVersion, expected ${data.remoteVersion}`);
    }

    diffPatcher.patch(data.shadow, edit.diff);
    diffPatcher.patch(localData, edit.diff);

    // Mark the edit version as the current one
    data.remoteVersion = edit.basedOnVersion + 1;

    performBackup(data);
}

/**
 * Saves the current shadow, before changing it
 */
function performBackup(data: Document): void {
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
    if (diff && !isEmpty(diff)) {
        data.edits.push(new Edit(basedOnVersion, diff));
        data.localVersion++;

        diffPatcher.patch(data.shadow, diff);
    }

    return new SyncMessage(data.room, data.sessionId, data.remoteVersion, data.edits);
}
