import Edit from "./edit";
import { clone } from "../util/util";

/**
 * A shared unit, used for synchronization on both the server and the client
 */
export class Document {

    constructor(public room: string, public sessionId: string, public state: object) {
        this.shadow = clone(state);
        this.localCopy = clone(state);
        this.backup = clone(state);
    }

    localVersion: number = 0;
    remoteVersion: number = 0;
    backupVersion: number = 0;

    shadow: object;
    localCopy: object;
    backup: object;

    // List of edits that were sent and not confirmed
    edits: Edit[] = [];

}

export class ServerDocument {

    constructor(document: Document) {
        this.room = document.room;
        this.sessionId = document.sessionId;
        this.shadow = document.shadow;
        this.backup = document.backup;
    }

    room: string;
    sessionId: string;

    localVersion: number = 0;
    remoteVersion: number = 0;
    backupVersion: number = 0;

    shadow: object;
    backup: object;

    edits: Edit[] = [];

}

export class ClientDocument {

    constructor(document: Document) {
        this.room = document.room;
        this.sessionId = document.sessionId;
        this.shadow = document.shadow;
        this.localCopy = document.localCopy;
    }

    room: string;
    sessionId: string;

    localVersion: number = 0;
    remoteVersion: number = 0;
    shadow: object;
    localCopy: object;

    edits: Edit[] = [];

}
