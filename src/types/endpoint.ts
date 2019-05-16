class Endpoint {

    /**
     * @param url Url of the endpoint
     * @param process Function that takes in fetched json data and returns a response to be sent
     */
    constructor(public url: string, public process: (requestBody: object) => Promise<object>) {}

}

export default Endpoint;
