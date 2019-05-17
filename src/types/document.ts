import { clone } from "../util/functions";
import Edit from "./edit";

/**
 * A shared unit, used for synchronization on both the server and the client
 */
export class Document {

    constructor(public room: string, public sessionId: string, public state: object) {
        this.localCopy = clone(state);
        this.shadow = clone(state);
        this.backup = clone(state);
    }

    // Version of local changes
    localVersion: number = 0;
    // Last received remote version
    remoteVersion: number = 0;
    // Remote version the backup was based on
    backupVersion: number = 0;

    // Local copy is not a part of document on the server, but rather stored on the room
    localCopy: object | null;
    // Common document between the client and server
    shadow: object;
    // Backup for cases of packet loss
    backup: object;

    // List of edits that were sent and not confirmed
    edits: Edit[] = [];

}
