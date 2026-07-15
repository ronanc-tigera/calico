import { createColumnHelper } from '@tanstack/react-table';

export type FlowLog = {
    source: string;
    destination: string;
    protocol: string;
    action: string;
};

export const columnHelper = createColumnHelper<FlowLog>();

export const columns = [
    columnHelper.accessor('source', { header: 'Source' }),
    columnHelper.accessor('destination', { header: 'Destination' }),
    columnHelper.accessor('protocol', { header: 'Protocol', size: 100 }),
    columnHelper.accessor('action', { header: 'Action', size: 100 }),
];

export const data: FlowLog[] = [
    {
        source: 'default/frontend-7d9c8',
        destination: 'default/backend-5f6d4',
        protocol: 'tcp',
        action: 'Allow',
    },
    {
        source: 'default/backend-5f6d4',
        destination: 'kube-system/coredns-8b4a2',
        protocol: 'udp',
        action: 'Allow',
    },
    {
        source: 'default/curl-pod',
        destination: 'default/backend-5f6d4',
        protocol: 'tcp',
        action: 'Deny',
    },
];
