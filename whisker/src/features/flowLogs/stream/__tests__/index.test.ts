import { FlowLog } from '@/types/render';
import { createEventSource } from '@/utils';
import { connectToFlowStream, flowStreamPolicy, parseFlowLog } from '..';

jest.mock('@/utils', () => ({
    createEventSource: jest.fn(),
}));

const flow = (overrides: Partial<FlowLog> = {}): FlowLog => ({
    id: 'x',
    start_time: new Date(1000),
    end_time: new Date(2000),
    action: 'Allow',
    source_name: 'src',
    source_namespace: 'src-ns',
    source_labels: '',
    dest_name: 'dst',
    dest_namespace: 'dst-ns',
    dest_labels: '',
    protocol: 'tcp',
    dest_port: '8080',
    reporter: 'Src',
    packets_in: '1',
    packets_out: '1',
    bytes_in: '1',
    bytes_out: '1',
    policies: {},
    ...overrides,
});

describe('parseFlowLog', () => {
    it('converts times to dates and mints an id', () => {
        const parsed = parseFlowLog(
            JSON.stringify({
                start_time: '2026-07-08T10:00:00Z',
                end_time: '2026-07-08T10:00:30Z',
                action: 'Allow',
                source_name: 'src',
            }),
        );

        expect(parsed.id).toEqual(expect.any(String));
        expect(parsed.start_time).toEqual(new Date('2026-07-08T10:00:00Z'));
        expect(parsed.end_time).toEqual(new Date('2026-07-08T10:00:30Z'));
        expect(parsed.source_name).toEqual('src');
    });

    it('throws on malformed payloads (the stream drops them)', () => {
        expect(() => parseFlowLog('not json')).toThrow();
    });
});

describe('connectToFlowStream', () => {
    const connectedUrl = (): string =>
        jest.mocked(createEventSource).mock.lastCall![0];

    beforeEach(() => {
        jest.mocked(createEventSource).mockClear();
    });

    it('uses the query window when there is no bookmark', () => {
        connectToFlowStream({ filters: 'f', startTimeGte: -60 })(null);

        expect(connectedUrl()).toContain('watch=true');
        expect(connectedUrl()).toContain('filters=f');
        expect(connectedUrl()).toContain('startTimeGte=-60');
    });

    it('omits startTimeGte when the query has no window', () => {
        connectToFlowStream({ filters: 'f' })(null);

        expect(connectedUrl()).not.toContain('startTimeGte');
    });

    it('resumes from a recent bookmark in absolute seconds', () => {
        const bookmark = Date.now() - 5000;
        connectToFlowStream({ filters: 'f', startTimeGte: -60 })(bookmark);

        expect(connectedUrl()).toContain(
            `startTimeGte=${Math.round(bookmark / 1000)}`,
        );
    });

    it('clamps a bookmark older than an hour to a relative hour', () => {
        const bookmark = Date.now() - 2 * 60 * 60 * 1000;
        connectToFlowStream({ filters: 'f' })(bookmark);

        expect(connectedUrl()).toContain('startTimeGte=-3600');
    });
});

describe('flowStreamPolicy', () => {
    it('bookmarks a flow by its end time', () => {
        expect(flowStreamPolicy.bookmark(flow())).toEqual(2000);
    });

    describe('dedupeKey', () => {
        const dedupeKey = flowStreamPolicy.dedupeKey!;

        it('is stable for the same flow regardless of render id', () => {
            expect(dedupeKey(flow({ id: 'a' }))).toEqual(
                dedupeKey(flow({ id: 'b' })),
            );
        });

        it('differs when any identifying field differs', () => {
            expect(dedupeKey(flow())).not.toEqual(
                dedupeKey(flow({ dest_port: '9090' })),
            );
            expect(dedupeKey(flow())).not.toEqual(
                dedupeKey(flow({ start_time: new Date(1001) })),
            );
        });
    });

    it('compares newest-first by start time', () => {
        const older = flow({ start_time: new Date(1000) });
        const newer = flow({ start_time: new Date(2000) });

        expect([older, newer].sort(flowStreamPolicy.compare)).toEqual([
            newer,
            older,
        ]);
    });
});
