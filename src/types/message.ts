import Edit from "./Edit";

export class JoinMessage {

    constructor(public room: string, public sessionId?: string) {}

}

export class SyncMessage {

    constructor(public room: string, public sessionId: string, public lastReceivedVersion: number, public edits: Edit[]) {}

}
