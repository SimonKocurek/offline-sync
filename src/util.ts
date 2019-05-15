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
