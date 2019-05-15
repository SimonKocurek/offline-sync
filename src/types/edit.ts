import { Delta } from "jsondiffpatch";

class Edit {

    constructor(public basedOnVersion: number, public diff: Delta) {}

}

export default Edit;
