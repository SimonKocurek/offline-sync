class Document {

    constructor(public room: string, public sessionId: string) {}

    localVersion: number = 0;
    serverVersion: number = 0;
    shadow: object = {};
    localCopy: object = {};
    edits = [];

}

export default Document;
