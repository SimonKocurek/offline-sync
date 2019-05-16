import Edit from "./edit";

export class JoinMessage {

    constructor(public room: string) {}

}

export class SyncMessage {

    constructor(public room: string, public sessionId: string, public lastReceivedVersion: number, public edits: Edit[]) {}

}

export class PingMessage {

    constructor(public room: string, public sessionId: string, public lastReceivedVersion: number) {}

}
