import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';
import Gio from '../lib/gio.js';
import { buildLayoutRequest, OryxApiError, ORYX_GRAPHQL_URL, parseLayoutResponse } from '../core/layout/oryx-query.js';

Gio._promisify(Soup.Session.prototype, 'send_and_read_async', 'send_and_read_finish');

const TIMEOUT_SECONDS = 10;

/** Fetches layout revisions from the public Oryx GraphQL API. */
export class OryxApiClient {
    private readonly session: Soup.Session;

    constructor(
        private readonly url = ORYX_GRAPHQL_URL,
        userAgent = 'zsa-helper',
    ) {
        this.session = new Soup.Session({ timeout: TIMEOUT_SECONDS, user_agent: userAgent });
    }

    /** Returns the raw GraphQL response for a revision, validated but not normalised. */
    async fetchRevision(layoutId: string, revisionId: string, cancellable: Gio.Cancellable | null): Promise<unknown> {
        const message = Soup.Message.new('POST', this.url);
        if (!message) {
            throw new OryxApiError(`Invalid Oryx URL: ${this.url}`);
        }
        const body = new TextEncoder().encode(buildLayoutRequest(layoutId, revisionId));
        message.set_request_body_from_bytes('application/json', new GLib.Bytes(body));

        const bytes = await this.session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, cancellable);
        const status = message.get_status();
        if (status !== Soup.Status.OK) {
            throw new OryxApiError(`Oryx responded with HTTP ${status}`);
        }
        return parseLayoutResponse(new TextDecoder().decode(bytes.toArray()));
    }

    destroy(): void {
        this.session.abort();
    }
}
