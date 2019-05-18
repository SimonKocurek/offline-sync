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

/**
 * Returns number of miliseconds that passed since timestamp, can be negative number
 */
export function timeSince(timestamp: number): number {
    return Date.now() - timestamp;
}

/**
 * Object exists and is not empty
 */
export function isEmpty(obj: object | Array<any> | null): boolean {
    return !obj || Object.keys(obj).length === 0;
}
