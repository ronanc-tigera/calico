// The ComposedVirtualRows story doubles as the reference implementation for
// streaming rows into a virtualized table with the entrance animation; this
// pins the behaviour it demonstrates: batches prepend on the stream interval,
// only rows inside their arrival window animate (staggered), pre-existing
// rows don't, and a batch first reached after the window renders statically.
import { render, screen, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

import { ComposedVirtualRows } from '../Composition.stories';

const CONTAINER_HEIGHT = 400;
const ROW_HEIGHT = 35;

const heightFor = (el: Element) =>
    el.getAttribute('data-slot') === 'table-container'
        ? CONTAINER_HEIGHT
        : ROW_HEIGHT;

let originalRect: typeof HTMLElement.prototype.getBoundingClientRect;
let originalOffsetHeight: PropertyDescriptor | undefined;

beforeAll(() => {
    class MockResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    }
    (global as unknown as { ResizeObserver: unknown }).ResizeObserver =
        MockResizeObserver;
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver =
        MockResizeObserver;

    originalRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function () {
        const height = heightFor(this);
        return {
            width: 500,
            height,
            top: 0,
            left: 0,
            right: 500,
            bottom: height,
            x: 0,
            y: 0,
            toJSON: () => {},
        } as DOMRect;
    };

    originalOffsetHeight = Object.getOwnPropertyDescriptor(
        HTMLElement.prototype,
        'offsetHeight',
    );
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
        configurable: true,
        get() {
            return heightFor(this);
        },
    });
});

afterAll(() => {
    HTMLElement.prototype.getBoundingClientRect = originalRect;
    if (originalOffsetHeight) {
        Object.defineProperty(
            HTMLElement.prototype,
            'offsetHeight',
            originalOffsetHeight,
        );
    }
});

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const rowFor = (source: string) =>
    screen.getByText(source).closest('[data-slot="table-row"]') as HTMLElement;

// All emotion-injected CSS rules (emotion inserts via CSSOM, so read the
// stylesheets, not <style> textContent).
const sheetText = () =>
    Array.from(document.styleSheets)
        .map((s) => {
            try {
                return Array.from((s as CSSStyleSheet).cssRules)
                    .map((r) => r.cssText)
                    .join('\n');
            } catch {
                return '';
            }
        })
        .join('\n');

// The CSS rules that apply to the classes on an element.
const cssFor = (el: HTMLElement) => {
    const rules = sheetText().split('\n');
    return Array.from(el.classList)
        .flatMap((cls) => rules.filter((rule) => rule.includes(`.${cls} `)))
        .join('\n');
};

it('streams 5 animated rows on top every 15s; initial rows do not animate', () => {
    render(<ComposedVirtualRows />);

    // Initial load: first row of the base data set, no streamed rows yet.
    expect(screen.getByText('default/frontend-0')).toBeInTheDocument();
    expect(screen.queryByText('default/streamed-0')).not.toBeInTheDocument();

    act(() => {
        jest.advanceTimersByTime(15_000);
    });

    // The batch of 5 arrives, prepended above the base rows.
    for (let i = 0; i < 5; i++) {
        expect(screen.getByText(`default/streamed-${i}`)).toBeInTheDocument();
    }
    expect(screen.queryByText('default/streamed-5')).not.toBeInTheDocument();

    const allRows = document.querySelectorAll('[data-slot="table-row"]');
    expect(allRows[0]).toBe(rowFor('default/streamed-0'));

    // Streamed rows carry the entrance animation (emotion injects it as a
    // class + @keyframes); pre-existing rows do not.
    const streamedCss = cssFor(rowFor('default/streamed-0'));
    expect(streamedCss).toMatch(/animation:.*animation-/s);
    expect(cssFor(rowFor('default/frontend-0'))).not.toMatch(
        /animation:.*animation-/s,
    );

    // The keyframes definitions themselves were injected.
    expect(sheetText()).toContain('@keyframes');
    expect(sheetText()).toContain('translateX(200px)');

    // The slide starts beyond the container's right edge; the container
    // clips that axis so no horizontal scrollbar appears mid-animation.
    const container = document.querySelector(
        '[data-slot="table-container"]',
    ) as HTMLElement;
    expect(cssFor(container)).toContain('overflow-x: clip');

    // Stagger: later rows in the batch start later.
    expect(cssFor(rowFor('default/streamed-0'))).toContain('0.5s');
    expect(cssFor(rowFor('default/streamed-4'))).toContain('0.9s');

    // A second batch animates too; the first batch keeps its row content.
    act(() => {
        jest.advanceTimersByTime(15_000);
    });
    expect(screen.getByText('default/streamed-9')).toBeInTheDocument();
    expect(cssFor(rowFor('default/streamed-9'))).toMatch(
        /animation:.*animation-/s,
    );
    expect(document.querySelectorAll('[data-slot="table-row"]')[0]).toBe(
        rowFor('default/streamed-5'),
    );
});

it('sorts via the column headers while streaming', () => {
    render(<ComposedVirtualRows />);

    act(() => {
        jest.advanceTimersByTime(15_000);
    });

    // Unsorted: the streamed batch sits on top in arrival order.
    expect(document.querySelectorAll('[data-slot="table-row"]')[0]).toBe(
        rowFor('default/streamed-0'),
    );

    const sourceToggle = screen.getByRole('button', { name: 'Source' });
    fireEvent.click(sourceToggle); // ascending

    // Ascending by source: the base flows ('frontend-…') sort before the
    // streamed ones ('streamed-…').
    expect(document.querySelectorAll('[data-slot="table-row"]')[0]).toBe(
        rowFor('default/frontend-0'),
    );

    fireEvent.click(sourceToggle); // descending

    expect(document.querySelectorAll('[data-slot="table-row"]')[0]).toBe(
        rowFor('default/streamed-4'),
    );
});

it('does not animate a batch first reached after its arrival window expired', () => {
    render(<ComposedVirtualRows />);

    const container = document.querySelector(
        '[data-slot="table-container"]',
    ) as HTMLElement;

    // Scroll well away from the top, so the incoming batch mounts nothing.
    act(() => {
        container.scrollTop = 5_000;
        container.dispatchEvent(new Event('scroll'));
    });
    expect(screen.queryByText('default/frontend-0')).not.toBeInTheDocument();

    // A batch lands while scrolled away: stamped, but no rows mount.
    act(() => {
        jest.advanceTimersByTime(15_000);
    });
    expect(screen.queryByText('default/streamed-0')).not.toBeInTheDocument();

    // Let the arrival window expire, then scroll back to the top.
    act(() => {
        jest.advanceTimersByTime(3_000);
    });
    act(() => {
        container.scrollTop = 0;
        container.dispatchEvent(new Event('scroll'));
    });

    // The streamed rows mount for the first time — past their window, so
    // they render statically.
    expect(cssFor(rowFor('default/streamed-0'))).not.toMatch(
        /animation:.*animation-/s,
    );
});
