import { Flex, Text } from '@chakra-ui/react';
import { keyframes } from '@emotion/react';
import type { Story, StoryDefault } from '@ladle/react';
import { getSortedRowModel, type Row as RowType } from '@tanstack/react-table';
import * as React from 'react';

import DataTable, { useDataTable } from './index';
import { columns, type FlowLog } from './stories.fixtures';

export default {
    title: 'Common / NewTable',
} satisfies StoryDefault;

// The entrance played by newly streamed rows — the same motion the old
// DataTable gave incoming flow logs: a quick slide in from the right under a
// slower fade, staggered down the batch. `backwards` fill holds the hidden
// state through the stagger delay so a row doesn't flash before its turn.
const slideIn = keyframes`
    from { transform: translateX(200px); }
    to   { transform: translateX(0); }
`;

const fadeIn = keyframes`
    from { opacity: 0; }
    to   { opacity: 1; }
`;

const entranceAnimation = (batchPosition: number) => {
    const delay = batchPosition * 0.1 + 0.5;

    return `${slideIn} 0.3s ease-out ${delay}s backwards, ${fadeIn} 0.8s ease-out ${delay}s backwards`;
};

// Decides which rows animate: time, not per-row bookkeeping. Each batch is
// stamped with its client arrival time as it's prepended (a WeakMap off to
// the side, so the row data stays untouched and stamps are GC'd with their
// rows), and a row plays the entrance only while it's still inside the
// window the animation itself occupies. Expiry stands in for consumption
// state: the virtualizer remounting a row after the window (scrolling away
// and back) renders it statically, and a batch that landed while scrolled
// out of view animates only if reached within the window — the old table's
// max-elapsed-time behaviour. The initial data set is never stamped, so the
// first load doesn't animate.

// The full animation envelope: 0.5s base delay + up to 0.4s of stagger + the
// 0.8s fade.
const ENTRANCE_WINDOW_MS = 1_000;

const arrivals = new WeakMap<
    FlowLog,
    { arrivedAt: number; batchPosition: number }
>();

const stampBatch = (batch: FlowLog[]) => {
    const arrivedAt = Date.now();
    batch.forEach((flow, batchPosition) =>
        arrivals.set(flow, { arrivedAt, batchPosition }),
    );
};

const entranceFor = (flow: FlowLog) => {
    const arrival = arrivals.get(flow);

    return arrival && Date.now() - arrival.arrivedAt < ENTRANCE_WINDOW_MS
        ? entranceAnimation(arrival.batchPosition)
        : undefined;
};

type AnimatedRowProps = {
    row: RowType<FlowLog>;
    // Forwarded to DataTable.Row for VirtualBody's row measurement.
    measureRef?: React.Ref<HTMLTableRowElement>;
    'data-index'?: number;
};

const AnimatedRow = ({ row, ...measureProps }: AnimatedRowProps) => {
    // Decide once, on first render, and keep the result for the life of the
    // mount: the animation must not vanish from props mid-play when the
    // window expires under a later re-render.
    const [animation] = React.useState(() => entranceFor(row.original));

    return <DataTable.Row row={row} animation={animation} {...measureProps} />;
};

const rowKey = (flow: FlowLog) => flow.source;

// The virtualized flavour: VirtualBody must own which rows exist (the window),
// so composition is a render prop — called per visible row — instead of
// pre-rendered children. The render prop is also where per-row concerns hook
// in: a fake stream prepends a batch of 5 flows every 15 seconds, and each
// row mounts through AnimatedRow, which plays the old table's entrance
// animation for rows still inside their arrival window.
export const PlayBookAnimatedRows: Story = () => {
    const [rows, setRows] = React.useState<FlowLog[]>(() =>
        Array.from({ length: 100 }, (_, i) => ({
            source: `default/frontend-${i}`,
            destination: `default/backend-${i % 25}`,
            protocol: i % 2 === 0 ? 'tcp' : 'udp',
            action: i % 3 === 0 ? 'Deny' : 'Allow',
        })),
    );

    React.useEffect(() => {
        let streamed = 0;
        const interval = setInterval(() => {
            const batch = Array.from({ length: 20 }, () => {
                const n = streamed++;

                return {
                    source: `default/streamed-${n}`,
                    destination: `default/backend-${n % 25}`,
                    protocol: n % 2 === 0 ? 'tcp' : 'udp',
                    action: n % 3 === 0 ? 'Deny' : 'Allow',
                };
            });
            stampBatch(batch);
            setRows((current) => [...batch, ...current]);
        }, 15_000);

        return () => clearInterval(interval);
    }, []);

    const table = useDataTable({
        data: rows,
        columns,
        getSortedRowModel: getSortedRowModel(),
        getRowId: rowKey,
    });

    return (
        <Flex direction='column' gap={4}>
            <Text>
                {rows.length} rows, virtualized, sortable, consumer-rendered — 5
                new flows stream in every 15 seconds and animate in
            </Text>

            <DataTable.Root
                table={table}
                containerProps={{
                    maxH: '400px',
                    overflowX: 'clip',
                }}
            >
                <DataTable.Header />
                <DataTable.VirtualBody<FlowLog>>
                    {(row) => <AnimatedRow row={row} />}
                </DataTable.VirtualBody>
            </DataTable.Root>

            <pre>
                <code>{`
const AnimatedRow = ({ row, ...measureProps }: AnimatedRowProps) => {
    const [animation] = React.useState(() => entranceFor(row.original));

    return <DataTable.Row row={row} animation={animation} {...measureProps} />;
};

export const Example = ({rows}) => {

    const table = useDataTable({
        data: rows,
        columns,
        getSortedRowModel: getSortedRowModel(),
        getRowId: rowKey,
    });

    return (
            <DataTable.Root
                table={table}
                containerProps={{
                    maxH: '400px',
                    overflowX: 'clip',
                }}
            >
                <DataTable.Header />
                <DataTable.VirtualBody<FlowLog>>
                    {(row) => <AnimatedRow row={row} />}
                </DataTable.VirtualBody>
            </DataTable.Root>
    );
}
`}</code>
            </pre>
        </Flex>
    );
};
