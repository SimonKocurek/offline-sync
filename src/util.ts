export async function fetchAsync(input: RequestInfo, init?: RequestInit): Promise<object> {
    let response = await fetch(input, init);
    let data = await response.json();
    return data;
}
