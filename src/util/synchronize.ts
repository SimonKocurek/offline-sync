import { SyncMessage } from "../types/message";
import Document from "../types/document";
import { clone } from "./util";

/**
 * Remove all edits that were seen by the other side
 */
export function removeConfirmedEdits(payload: SyncMessage, data: Document): void {
    let edits = data.edits;
    while (edits.length > 0 && payload.lastReceivedVersion >= edits[0].basedOnVersion) {
        edits.shift(); // remove the edit
    }
}

/**
 * Rollback using backup
 */
export function performRoolback(data: Document): void {
    // Restore shadow to the same version as on the other side
    data.localVersion = data.backupVersion;
    data.localCopy = clone(data.backup);
    // All edits that were created based on the old shadow need to be removed
    // A new one containing all their diffs can be created
    data.edits = [];
}

/**
 * Saves the current shadow, before changing it
 */
export function pefrormBackup(data: Document): void {
    data.backup = clone(data.shadow);
    data.backupVersion = data.localVersion;
}

