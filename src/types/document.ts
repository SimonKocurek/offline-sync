import Edit from "./edit";
import { clone } from "../util";

/**
 * A shared unit, used for synchronization on both the server and the client
 */
class Document {

    constructor(public room: string, public sessionId: string, public state: object) {
        this.shadow = clone(state);
        this.localCopy = clone(state);
        this.backup = clone(state);
    }

    localVersion: number = 0;
    remoteVersion: number = 0;
    // Backup version is used on the server side only
    backupVersion: number = 0;

    shadow: object;
    localCopy: object;
    // Backup is only used on the server side
    backup: object;

    // List of edits that were sent and not confirmed
    edits: Edit[] = [];

}

export default Document;
