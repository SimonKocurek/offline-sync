/**
 * Sends a request to the endpoint
 * @param input endpoint of the request
 * @param body JSON object to send
 */
export async function fetchJson(input: RequestInfo, body: object): Promise<object> {
    let jsonInit = {
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    };

    let response = await fetch(input, jsonInit);
    let data = await response.json();
    return data;
}

/**
 * Waits for a certain ammount of time
 */
export function wait(milliseconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

/**
 * Performs a deep copy
 */
export function clone(object: object): object {
    return JSON.parse(JSON.stringify(object));
}