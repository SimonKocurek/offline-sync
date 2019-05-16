import { ServerDocument } from "../types/document";
import { clone } from "./functions";
import Edit from "../types/edit";

/**
 * Remove all edits that were seen by the other side
 */
export function removeConfirmedEdits(lastReceivedVersion: number, edits: Edit[]): void {
    while (edits.length > 0 && lastReceivedVersion >= edits[0].basedOnVersion) {
        edits.shift(); // remove the edit
    }
}

/**
 * Rollback using backup
 */
export function performRoolback(data: ServerDocument): void {
    // Restore shadow to the same version as on the other side
    data.localVersion = data.backupVersion;
    data.shadow = clone(data.backup);

    // All edits that were created based on the old shadow need to be removed
    // A new one containing all their diffs can be created
    data.edits = [];
}

/**
 * Saves the current shadow, before changing it
 */
export function pefrormBackup(data: ServerDocument): void {
    data.backup = clone(data.shadow);
    data.backupVersion = data.localVersion;
}
