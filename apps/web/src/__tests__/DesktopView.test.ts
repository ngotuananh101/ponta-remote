import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import DesktopView from '@/components/desktop/DesktopView.vue';
import { useTerminalStore } from '@/stores/terminal';
import type { TabItem } from '@/stores/terminal';

function desktopTab(overrides: Partial<TabItem> = {}): TabItem {
  return {
    id: 'tab-1',
    agentId: 'ag-1',
    kind: 'desktop',
    terminalId: '',
    title: 'Host 1',
    status: 'active',
    ...overrides,
  };
}

describe('DesktopView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders a video element with no controls (view-only)', () => {
    const wrapper = mount(DesktopView, { props: { tab: desktopTab() } });
    const video = wrapper.find('video');
    expect(video.exists()).toBe(true);
    expect(video.attributes('controls')).toBeUndefined();
    expect(video.attributes('muted')).toBeDefined();
    expect(video.attributes('autoplay')).toBeDefined();
  });

  it('shows the error overlay and a Retry button when the tab errored', async () => {
    const store = useTerminalStore();
    const retry = vi.spyOn(store, 'retryTab').mockResolvedValue();
    const wrapper = mount(DesktopView, {
      props: { tab: desktopTab({ status: 'error', error: 'no route' }) },
    });
    expect(wrapper.text()).toContain('no route');
    await wrapper.find('[data-test="retry-desktop-tab-1"]').trigger('click');
    expect(retry).toHaveBeenCalledWith('tab-1');
  });

  it('attaches the stream to the video element on mount', () => {
    const stream = { track: { kind: 'video' }, streams: [] };
    const wrapper = mount(DesktopView, {
      props: {
        tab: desktopTab({ desktopStream: stream as never }),
      },
    });
    const video = wrapper.find('video').element as HTMLVideoElement;
    // The element must carry the stream at mount, not only after the reactive
    // watcher fires — a remount with the stream already present is the case the
    // watcher misses, and it is the case this asserts.
    expect(video.srcObject).not.toBeNull();
  });

  it('clears srcObject on unmount', () => {
    const wrapper = mount(DesktopView, {
      props: {
        tab: desktopTab({
          desktopStream: { track: { kind: 'video' }, streams: [] } as never,
        }),
      },
    });
    const video = wrapper.find('video').element as HTMLVideoElement;
    wrapper.unmount();
    expect(video.srcObject).toBeNull();
  });

  const twoSources = [
    {
      id: 'monitor:1',
      kind: 'monitor' as const,
      name: 'eDP-1',
      width: 1920,
      height: 1080,
      x: 0,
      y: 0,
      scaleFactor: 1,
      rotation: 0,
      isPrimary: true,
      default: true,
    },
    {
      id: 'window:9',
      kind: 'window' as const,
      name: 'Editor',
      width: 800,
      height: 600,
      x: 100,
      y: 100,
      scaleFactor: 1,
      rotation: 0,
      isPrimary: false,
      default: false,
    },
  ];

  it('renders the source picker only when sources are present', async () => {
    const withoutSources = mount(DesktopView, {
      props: { tab: desktopTab() },
    });
    expect(
      withoutSources.find('[data-test="desktop-source-picker"]').exists(),
    ).toBe(false);

    const withSources = mount(DesktopView, {
      props: {
        tab: desktopTab({
          desktopSources: twoSources,
          desktopSourceId: 'monitor:1',
        }),
      },
    });
    const picker = withSources.find('[data-test="desktop-source-picker"]');
    expect(picker.exists()).toBe(true);
    expect(picker.findAll('option')).toHaveLength(2);
  });

  it('calls selectDesktopSource when the picker changes', async () => {
    const store = useTerminalStore();
    const select = vi
      .spyOn(store, 'selectDesktopSource')
      .mockImplementation(() => {});
    const wrapper = mount(DesktopView, {
      props: {
        tab: desktopTab({
          desktopSources: twoSources,
          desktopSourceId: 'monitor:1',
        }),
      },
    });

    await wrapper
      .find('[data-test="desktop-source-picker"]')
      .setValue('window:9');

    expect(select).toHaveBeenCalledWith('tab-1', 'window:9');
  });

  it('renders the stats line and appends a status note when present', () => {
    const wrapper = mount(DesktopView, {
      props: {
        tab: desktopTab({
          desktopStats: {
            width: 1280,
            height: 720,
            fps: 30,
            targetBitrateBps: 4_000_000,
            status: {
              kind: 'quality-downgraded',
              detail: '720p (quality downgraded)',
            },
          },
        }),
      },
    });
    expect(wrapper.find('[data-test="desktop-stats"]').text()).toContain(
      '1280×720',
    );
    expect(wrapper.find('[data-test="desktop-stats"]').text()).toContain(
      '30 fps',
    );
    expect(wrapper.find('[data-test="desktop-stats"]').text()).toContain(
      'quality downgraded',
    );
  });

  it('calls setDesktopBitrate from the bitrate control', async () => {
    const store = useTerminalStore();
    const setBitrate = vi
      .spyOn(store, 'setDesktopBitrate')
      .mockImplementation(() => {});
    const wrapper = mount(DesktopView, {
      props: {
        tab: desktopTab({
          desktopStats: {
            width: 1920,
            height: 1080,
            fps: 30,
            targetBitrateBps: 6_000_000,
          },
        }),
      },
    });

    await wrapper.find('[data-test="desktop-bitrate"]').setValue('3000000');

    expect(setBitrate).toHaveBeenCalledWith('tab-1', 3_000_000);
  });

  it('keeps the video view-only: no controls, no input handlers', () => {
    const wrapper = mount(DesktopView, {
      props: {
        tab: desktopTab({
          desktopSources: twoSources,
          desktopSourceId: 'monitor:1',
        }),
      },
    });
    const video = wrapper.find('video');
    // Review Focus #3: control chrome must not turn the video interactive.
    expect(video.attributes('controls')).toBeUndefined();
    expect(video.attributes('onmousedown')).toBeUndefined();
    expect(video.attributes('onkeydown')).toBeUndefined();
  });
});
