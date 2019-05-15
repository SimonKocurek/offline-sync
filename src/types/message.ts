import Edit from "./Edit";

export class JoinMessage {

    constructor(public room: string, public sessionId?: string) {}

}

export class SyncMessage {

    room: string;
    sessionId: string;
    localVersion: number;
    serverVersion: number;
    edits: Edit[];

}
