/** Public GraphQL endpoint used by Oryx and Keymapp. */
export const ORYX_GRAPHQL_URL = 'https://oryx.zsa.io/graphql';

const LAYOUT_QUERY = `query getLayout($hashId: String!, $revisionId: String!, $geometry: String) {
  layout(hashId: $hashId, geometry: $geometry, revisionId: $revisionId) {
    hashId
    title
    geometry
    revision { hashId title layers { title position color keys } }
  }
}`;

/** Oryx layout and revision ids are short alphanumeric hashes, e.g. `aOa9o` and `nlzDl9`. */
export function isValidHashId(id: string): boolean {
    return /^[A-Za-z0-9]{1,32}$/.test(id);
}

export function assertValidIds(layoutId: string, revisionId: string): void {
    if (!isValidHashId(layoutId) || !isValidHashId(revisionId)) {
        throw new RangeError(`Invalid Oryx ids: ${JSON.stringify(layoutId)}/${JSON.stringify(revisionId)}`);
    }
}

/** Request body for fetching one revision of a Voyager layout. */
export function buildLayoutRequest(layoutId: string, revisionId: string): string {
    assertValidIds(layoutId, revisionId);
    return JSON.stringify({
        operationName: 'getLayout',
        query: LAYOUT_QUERY,
        variables: { hashId: layoutId, revisionId, geometry: 'voyager' },
    });
}

export class OryxApiError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'OryxApiError';
    }
}

/** Validates a GraphQL response body and returns it parsed, ready for `layoutFromOryxJson`. */
export function parseLayoutResponse(body: string): unknown {
    let json: unknown;
    try {
        json = JSON.parse(body);
    } catch {
        throw new OryxApiError('Oryx returned invalid JSON');
    }

    const response = json as { errors?: { message?: string }[]; data?: { layout?: unknown } };
    if (Array.isArray(response.errors) && response.errors.length > 0) {
        throw new OryxApiError(`Oryx error: ${response.errors.map(e => e.message ?? 'unknown').join('; ')}`);
    }
    if (!response.data?.layout) {
        throw new OryxApiError('Oryx has no such layout revision');
    }
    return json;
}

/** SQL to read one revision from Keymapp's cache; the id is validated, so inlining it is safe. */
export function keymappRevisionQuery(revisionId: string): string {
    if (!isValidHashId(revisionId)) {
        throw new RangeError(`Invalid revision id: ${JSON.stringify(revisionId)}`);
    }
    return `SELECT data FROM revision WHERE revisionId = '${revisionId}' LIMIT 1;`;
}
